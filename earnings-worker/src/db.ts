import { Bindings, StockPrice, StockQuote, EarningsEstimate, GroupMember } from './types';
import { fetchEarnings } from './alpha_vantage';
import { fetchQuotes, YahooQuote, fetchPriceHistory as fetchYahooHistory } from './yahoo_finance';
import { fetchYahooEstimates, fetchYahooPrices } from './yahoo';
import { AI_TICKERS } from './tickers';

// Helper for EST Date (YYYY-MM-DD)
export function getESTDate(): string {
    const now = new Date();
    // 'en-CA' gives YYYY-MM-DD format
    return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// Helper for EST Timestamp (YYYY-MM-DD HH:MM:SS)
export function getESTTimestamp(): string {
    const now = new Date();
    const nyStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false });
    const d = new Date(nyStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function logCronStatus(env: Bindings, status: string, message: string, details: string = '') {
    try {
        const timestamp = getESTTimestamp();
        await env.DB.prepare('INSERT INTO cron_logs (timestamp, status, message, details) VALUES (?, ?, ?, ?)').bind(timestamp, status, message, details).run();
    } catch (e) {
        console.error('Failed to log cron status', e);
    }
}

export async function updatePrices(env: Bindings, symbol: string) {
    const { maxDate } = await env.DB.prepare(
        `SELECT max(date) as maxDate FROM stock_prices WHERE symbol = ?`
    ).bind(symbol).first() as { maxDate: string };

    if (maxDate) {
        const now = new Date();
        const nyStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
        const nyTime = new Date(nyStr);
        const day = nyTime.getDay();
        const hour = nyTime.getHours();

        let lastTradingDate = new Date(nyTime);
        if (day === 6) lastTradingDate.setDate(lastTradingDate.getDate() - 1);
        else if (day === 0) lastTradingDate.setDate(lastTradingDate.getDate() - 2);
        else {
            if (hour < 17) {
                lastTradingDate.setDate(lastTradingDate.getDate() - 1);
                if (lastTradingDate.getDay() === 0) lastTradingDate.setDate(lastTradingDate.getDate() - 2);
            }
        }
        const targetDate = lastTradingDate.toISOString().split('T')[0];
        if (maxDate > targetDate) return { count: 0, message: `Prices up to date (${maxDate})` };
    }

    const prices = await fetchYahooPrices(symbol);
    if (!prices) return { count: 0, message: "Yahoo Price Fetch Failed" };

    const updatedAt = getESTTimestamp();
    const stmt = env.DB.prepare(`
        INSERT OR REPLACE INTO stock_prices (symbol, date, open, high, low, close, volume, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batch = [];
    for (const price of prices) {
        batch.push(stmt.bind(symbol, price.date, price.open || null, price.high || null, price.low || null, price.close || null, price.volume || null, updatedAt));
    }

    if (batch.length > 0) {
        const CHUNK_SIZE = 50;
        for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
            await env.DB.batch(batch.slice(i, i + CHUNK_SIZE));
        }
        return { count: batch.length, message: "Success" };
    }
    return { count: 0, message: "No data" };
}

export async function calculateForwardPEG(env: Bindings, symbol: string) {
    const { results: rawEarnings } = await env.DB.prepare(
        `SELECT fiscal_date_ending, estimated_eps, reported_eps FROM earnings_estimates WHERE symbol = ? ORDER BY fiscal_date_ending ASC`
    ).bind(symbol).all();

    const { results: prices } = await env.DB.prepare(
        `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 2500`
    ).bind(symbol).all();

    if (!rawEarnings?.length) throw new Error('No earnings data found');
    if (!prices?.length) throw new Error('No price data found');

    const earnings = rawEarnings as unknown as EarningsEstimate[];
    const pegTimeSeries = [];

    for (let i = 0; i < prices.length; i++) {
        const priceRow = prices[i] as unknown as StockPrice;
        const date = priceRow.date;
        const close = priceRow.close || 0;
        const nextQuarterIndex = earnings.findIndex(e => e.fiscal_date_ending > date);
        let forwardEPS = null, trailingEPS = null, forwardPE = null, growthRate = null, peg = null;

        if (nextQuarterIndex !== -1 && nextQuarterIndex >= 3) {
            const nextQuarter = earnings[nextQuarterIndex];
            const past3 = earnings.slice(nextQuarterIndex - 3, nextQuarterIndex);
            const estNext = nextQuarter.estimated_eps || 0;
            const sumPastReported = past3.reduce((sum, q) => sum + (q.reported_eps ?? (q.estimated_eps || 0)), 0);
            forwardEPS = estNext + sumPastReported;
        }

        const pastEarnings = earnings.filter(e => e.fiscal_date_ending <= date);
        if (pastEarnings.length >= 8) {
            const previousYearTTM = pastEarnings.slice(-8, -4);
            trailingEPS = previousYearTTM.reduce((sum, q) => sum + (q.reported_eps ?? (q.estimated_eps || 0)), 0);
        }

        if (forwardEPS && forwardEPS !== 0) {
            forwardPE = close / forwardEPS;
            if (trailingEPS && trailingEPS !== 0) {
                growthRate = (forwardEPS / trailingEPS) - 1;
                if (Math.abs(growthRate) > 0.001) peg = forwardPE / (growthRate * 100);
            }
        }
        pegTimeSeries.push({ date, price: close, forwardEPS: forwardEPS?.toFixed(2), forwardPE: forwardPE?.toFixed(2), growthRate: growthRate ? (growthRate * 100).toFixed(2) : null, peg: peg?.toFixed(2) });
    }
    const latestValid = pegTimeSeries.find(d => d.forwardEPS !== null);
    return { symbol, currentForwardEPS: latestValid ? latestValid.forwardEPS : "N/A", timeSeries: pegTimeSeries.reverse() };
}

export async function updateTicker(env: Bindings, symbol: string) {
    const apiKey = env.ALPHA_VANTAGE_KEY;
    if (!apiKey) return { count: 0, message: "No API Key" };
    let avCount = 0, avMsg = "Skipped";

    const FETCH_AV_HISTORY = false;
    if (FETCH_AV_HISTORY) {
        const data = await fetchEarnings(symbol, apiKey);
        if (data && !('error' in data)) {
            const updatedAt = getESTTimestamp();
            const stmt = env.DB.prepare(`INSERT OR REPLACE INTO earnings_estimates (symbol, fiscal_date_ending, estimated_eps, reported_eps, surprise, surprise_percentage, report_date, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            const batch = [];
            for (const q of data.quarterlyEarnings) {
                if (q.fiscalDateEnding < '2018-01-01') continue;
                batch.push(stmt.bind(data.symbol, q.fiscalDateEnding, parseFloat(q.estimatedEPS) || null, parseFloat(q.reportedEPS) || null, parseFloat(q.surprise) || null, parseFloat(q.surprisePercentage) || null, q.reportedDate, updatedAt));
            }
            if (batch.length > 0) {
                await env.DB.batch(batch);
                avCount = batch.length;
                avMsg = `Updated ${batch.length}`;
            }
        }
    }

    try {
        const yahooData = await fetchYahooEstimates(symbol);
        if (yahooData) {
            const { maxDate } = await env.DB.prepare(`SELECT max(date) as maxDate FROM stock_prices WHERE symbol = ?`).bind(symbol).first() as { maxDate: string };
            let targetDate = yahooData.fiscal_date_ending;
            if (maxDate) {
                const today = new Date(maxDate);
                const year = today.getFullYear();
                const month = today.getMonth();
                const qEndMonth = 2 + (Math.floor(month / 3) * 3);
                const d = new Date(year, qEndMonth + 1, 0);
                const isoDate = d.toISOString().split('T')[0];
                if (yahooData.fiscal_date_ending < maxDate) targetDate = isoDate;
            }
            const updatedAt = getESTTimestamp();
            await env.DB.prepare(`INSERT OR REPLACE INTO earnings_estimates (symbol, fiscal_date_ending, estimated_eps, report_date, updated_at) VALUES (?, ?, ?, ?, ?)`).bind(symbol, targetDate, yahooData.estimated_eps, null, updatedAt).run();
        }
    } catch (e) { }
    return { count: avCount, message: avMsg };
}

export async function saveQuotesToDB(env: Bindings, quotes: YahooQuote[]) {
    const dateStr = getESTDate();
    const updatedAt = getESTTimestamp();

    const stmt = env.DB.prepare(`
        INSERT OR REPLACE INTO stock_quotes (
            symbol, date, price, market_cap, pe_ratio, forward_pe, ps_ratio,
            fifty_two_week_high, fifty_two_week_high_change_percent, change_percent,
            eps_current_year, eps_next_year, dividend_yield, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batch = quotes.map(q => stmt.bind(
        q.symbol,
        dateStr,
        q.regularMarketPrice,
        q.marketCap,
        q.trailingPE,
        q.forwardPE,
        q.priceToSalesTrailing12Months,
        q.fiftyTwoWeekHigh,
        q.fiftyTwoWeekHighChangePercent,
        q.regularMarketChangePercent,
        q.epsCurrentYear || null,
        q.epsNextYear || null,
        q.dividendYield || null,
        updatedAt
    ));

    if (batch.length > 0) {
        await env.DB.batch(batch);
    }
}

export async function getLatestQuotes(env: Bindings, symbols: string[]): Promise<YahooQuote[]> {
    const results: YahooQuote[] = [];
    const missing: string[] = [];

    const CHUNK = 10;
    for (let i = 0; i < symbols.length; i += CHUNK) {
        const batch = symbols.slice(i, i + CHUNK);
        await Promise.all(batch.map(async (symbol) => {
            try {
                const row = await env.DB.prepare(
                    'SELECT * FROM stock_quotes WHERE symbol = ? ORDER BY date DESC LIMIT 1'
                ).bind(symbol).first() as unknown as StockQuote | null;

                if (row) {
                    results.push(mapToYahooQuote(row));
                } else {
                    missing.push(symbol);
                }
            } catch (e) {
                missing.push(symbol);
            }
        }));
    }

    if (missing.length > 0) {
        try {
            const liveQuotes = await fetchQuotes(missing);
            if (liveQuotes && liveQuotes.length > 0) {
                await saveQuotesToDB(env, liveQuotes);
                results.push(...liveQuotes);
            }
        } catch (e) {
            console.error("Error fetching missing quotes", e);
        }
    }

    return results;
}

export function mapToYahooQuote(row: StockQuote): YahooQuote {
    return {
        symbol: row.symbol,
        shortName: row.symbol,
        regularMarketPrice: row.price,
        marketCap: row.market_cap,
        priceToSalesTrailing12Months: row.ps_ratio || undefined,
        trailingPE: row.pe_ratio || undefined,
        forwardPE: row.forward_pe || undefined,
        fiftyTwoWeekHigh: row.fifty_two_week_high || undefined,
        fiftyTwoWeekHighChangePercent: row.fifty_two_week_high_change_percent || undefined,
        regularMarketChangePercent: row.change_percent || undefined,
        epsCurrentYear: row.eps_current_year || undefined,
        epsNextYear: row.eps_next_year || undefined,
        dividendYield: row.dividend_yield || undefined
    };
}

export async function backfillHistory(env: Bindings, symbol: string) {
    try {
        console.log(`[Backfill] Fetching history for ${symbol}`);
        const prices = await fetchYahooHistory(symbol);

        if (prices && prices.length > 0) {
            const stmt = env.DB.prepare(`INSERT OR REPLACE INTO stock_prices (symbol, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            const batch = [];
            const updatedAt = getESTTimestamp();

            for (const p of prices) {
                batch.push(stmt.bind(symbol, p.date, p.open, p.high, p.low, p.close, p.volume, updatedAt));
            }

            const CHUNK = 50;
            for (let k = 0; k < batch.length; k += CHUNK) {
                await env.DB.batch(batch.slice(k, k + CHUNK));
            }
            console.log(`[Backfill] Saved ${prices.length} days for ${symbol}`);
        } else {
            console.log(`[Backfill] No history found for ${symbol}`);
        }
    } catch (e) {
        console.error(`[Backfill] Failed for ${symbol}`, e);
    }
}

// Helper to gather all dashboard data
export async function getDashboardData(env: Bindings, groupId?: string) {
    let tickers: string[] = AI_TICKERS;

    // Filter by Group if requested
    const allocationMap = new Map<string, number>();
    if (groupId) {
        try {
            // Ensure numeric ID
            const gid = parseInt(groupId);
            if (!isNaN(gid)) {
                // console.log(`[API] Fetching members for group ID: ${gid}`);
                const { results } = await env.DB.prepare('SELECT symbol, allocation as allocated_pct FROM group_members WHERE group_id = ?').bind(gid).all();
                if (results && results.length > 0) {
                    console.log('[API] Group Members Sample:', JSON.stringify(results[0]));
                    tickers = results.map((r: any) => {
                        const member = r as { symbol: string, allocated_pct: number };
                        const alloc = Number(member.allocated_pct);
                        allocationMap.set(member.symbol, !isNaN(alloc) ? alloc : 0);
                        return member.symbol;
                    });
                } else {
                    // console.log(`[API] Group ${gid} is empty or not found. Returning empty list.`);
                    return [];
                }
            } else {
                console.warn(`[API] Invalid groupId format: ${groupId}`); // Keep warning
            }
        } catch (e) {
            console.error('Group Fetch Error', e);
            return [];
        }
    }

    // 1. Fetch Quotes (From DB with Live Fallback)
    const quotes = await getLatestQuotes(env, tickers);

    // 2. Fetch History from Database (Much Faster)
    const historyMap = new Map<string, { symbol: string, prices: any[] }>();
    const missingSymbols: string[] = [];

    // Step A: Try DB first (Fast Path)
    await Promise.all(tickers.map(async (symbol) => {
        try {
            const { results } = await env.DB.prepare(
                `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 400`
            ).bind(symbol).all();

            if (results && results.length > 20) {
                const prices = results.reverse().map((r: any) => {
                    const p = r as StockPrice;
                    return {
                        date: p.date,
                        close: p.close || 0
                    };
                });
                historyMap.set(symbol, { symbol, prices });
            } else {
                missingSymbols.push(symbol);
            }
        } catch (e) {
            console.error(`DB Fetch error for ${symbol}`, e);
            missingSymbols.push(symbol);
        }
    }));

    // Lazy fetch removed as per cleanup

    // 3. Combine Data 
    const stocks = tickers.map(symbol => {
        const quote = quotes.find(q => q.symbol === symbol);
        const historyData = historyMap.get(symbol);
        const prices = historyData ? historyData.prices : [];
        const closePrices = prices.map(p => p.close);
        const currentPrice = quote?.regularMarketPrice || (closePrices.length ? closePrices[closePrices.length - 1] : 0);

        return {
            symbol,
            quote,
            prices, // Pass full price history (with dates)
            closePrices,
            currentPrice,
            allocation: allocationMap.get(symbol) || 0,
            rsRankHistory: [] as number[]
        };
    });

    const LOOKBACK_DAYS = 22; // Bars to show

    // Calculate Static Normalization for the displayed window
    stocks.forEach(s => {
        const len = s.closePrices.length;
        if (len < 5) { // Need at least some data
            s.rsRankHistory = [];
            return;
        }

        // Get the specific window of prices we want to display
        const startIdx = Math.max(0, len - LOOKBACK_DAYS);
        const displayPrices = s.closePrices.slice(startIdx);

        if (displayPrices.length > 0) {
            const min = Math.min(...displayPrices);
            const max = Math.max(...displayPrices);

            s.rsRankHistory = displayPrices.map(price => {
                if (max === min) return 50; // Flat
                // Normalize 0-99
                return Math.round(((price - min) / (max - min)) * 99);
            });
        }
    });

    // Final Map
    return stocks.map(s => {
        const { symbol, quote, prices, closePrices, currentPrice, rsRankHistory, allocation } = s;
        const oneYearPrices = closePrices.slice(-252);

        let sma20 = false, sma50 = false, sma200 = false;
        if (closePrices.length > 0) {
            const p = currentPrice;
            const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
            if (closePrices.length >= 20) sma20 = p > avg(closePrices.slice(-20));
            if (closePrices.length >= 50) sma50 = p > avg(closePrices.slice(-50));
            if (closePrices.length >= 200) sma200 = p > avg(closePrices.slice(-200));
        }

        let change1Y = 0;
        let changeYTD = 0;

        if (prices.length > 0) {
            // 1 Year Change
            const price1yAgo = prices[Math.max(0, prices.length - 253)]; // approx 252 trading days
            const p1y = price1yAgo ? price1yAgo.close : prices[0].close;
            change1Y = ((currentPrice - p1y) / p1y) * 100;

            // YTD Change
            // Find last close of previous year
            const currentYear = parseInt(getESTDate().substring(0, 4));
            const prevYear = (currentYear - 1).toString();

            let startPrice = 0;
            for (let i = prices.length - 1; i >= 0; i--) {
                if (prices[i].date.startsWith(prevYear)) {
                    startPrice = prices[i].close;
                    break;
                }
            }
            // Fallback if no prev year data (e.g. IPO this year): use first avail
            if (!startPrice) startPrice = prices[0].close;

            changeYTD = ((currentPrice - startPrice) / startPrice) * 100;
        }

        return {
            symbol,
            quote,
            allocation,
            name: quote?.shortName || symbol,
            price: currentPrice,
            marketCap: quote?.marketCap || 0,
            dividendYield: quote?.dividendYield || 0,
            ps: quote?.priceToSalesTrailing12Months || null,
            pe: quote?.trailingPE || null,
            peg: (() => {
                if (quote?.epsCurrentYear && quote?.epsNextYear && quote?.epsCurrentYear !== 0 && quote?.trailingPE) {
                    const growth = ((quote.epsNextYear - quote.epsCurrentYear) / quote.epsCurrentYear) * 100;
                    if (growth > 0) return quote.trailingPE / growth;
                }
                return null;
            })(),
            changeYTD,
            change1Y,
            history: oneYearPrices,
            delta52wHigh: quote?.fiftyTwoWeekHighChangePercent ? quote.fiftyTwoWeekHighChangePercent * 100 : 0,
            sma20, sma50, sma200,
            rsRankHistory
        };
    });
}
