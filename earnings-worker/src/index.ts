
import { Hono } from 'hono';
import { fetchEarnings } from './alpha_vantage';
import { fetchPriceHistory, PriceData } from './price_fetcher';
import { fetchQuotes } from './yahoo_finance';
import { fetchYahooEstimates } from './yahoo';
import { QQQ_TICKERS, AI_TICKERS } from './tickers';
import { UI_HTML } from './ui_html';
import { DASHBOARD_HTML } from './dashboard_html';

type Bindings = {
    DB: D1Database;
    ALPHA_VANTAGE_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// --- DASHBOARD ROUTES ---

// Serve Dashboard UI (Main Page)
app.get('/', (c) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return c.html(DASHBOARD_HTML);
});

// Serve PEG Tool UI (Legacy)
app.get('/peg', (c) => {
    return c.html(UI_HTML);
});


// --- EXISTING ROUTES ---
app.get('/api/earnings', async (c) => {
    const symbol = c.req.query('symbol')?.toUpperCase();
    if (!symbol) return c.json({ error: 'Missing symbol parameter' }, 400);

    const { results } = await c.env.DB.prepare(
        `SELECT * FROM earnings_estimates WHERE symbol = ? ORDER BY fiscal_date_ending DESC`
    ).bind(symbol).all();

    return c.json({ results });
});

// Get price history for a symbol
app.get('/api/prices', async (c) => {
    const symbol = c.req.query('symbol')?.toUpperCase();
    if (!symbol) return c.json({ error: 'Missing symbol parameter' }, 400);

    const { results } = await c.env.DB.prepare(
        `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 2500`
    ).bind(symbol).all();

    return c.json({ results });
});

// Calculate and return Forward PEG data
app.get('/api/dashboard-data', async (c) => {
    try {
        const groupId = c.req.query('groupId');
        const data = await getDashboardData(c.env, groupId);
        return c.json(data);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Trigger price update for a symbol
app.post('/api/update-prices', async (c) => {
    const symbol = c.req.query('symbol')?.toUpperCase();
    if (!symbol) return c.json({ error: 'Symbol required' }, 400);

    try {
        const result = await updatePrices(c.env, symbol);
        return c.json({ status: 'ok', symbol, ...result });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Manual Trigger for updates
app.post('/api/update', async (c) => {
    const symbol = c.req.query('symbol')?.toUpperCase();
    if (!symbol) return c.json({ error: 'Symbol required' }, 400);

    if (!c.env.ALPHA_VANTAGE_KEY) {
        return c.json({ error: 'ALPHA_VANTAGE_KEY not set in secrets' }, 500);
    }

    try {
        const result = await updateTicker(c.env, symbol);
        return c.json({ status: 'ok', symbol, ...result });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- GROUP MANAGEMENT ROUTES ---

// List Groups
app.get('/api/groups', async (c) => {
    try {
        const { results } = await c.env.DB.prepare('SELECT * FROM groups ORDER BY created_at DESC').all();
        return c.json(results || []);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Create Group
app.post('/api/groups', async (c) => {
    try {
        const body = await c.req.json();
        const { name, description } = body;
        if (!name) return c.json({ error: 'Name is required' }, 400);

        const { meta } = await c.env.DB.prepare(
            'INSERT INTO groups (name, description) VALUES (?, ?)'
        ).bind(name, description || null).run();

        return c.json({ id: meta.last_row_id, name, description });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Delete Group
app.delete('/api/groups/:id', async (c) => {
    try {
        const id = c.req.param('id');
        await c.env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(id).run();
        // Members deleted via CASCADE
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Update Group
// Update Group (Batch)
app.put('/api/groups/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const { name, description, members } = body;

        const statements: D1PreparedStatement[] = [];

        // 1. Update Group Metadata
        let query = 'UPDATE groups SET updated_at = CURRENT_TIMESTAMP';
        const params: any[] = [];

        if (name) {
            query += ', name = ?';
            params.push(name);
        }
        if (description !== undefined) {
            query += ', description = ?';
            params.push(description);
        }
        query += ' WHERE id = ?';
        params.push(id);

        statements.push(c.env.DB.prepare(query).bind(...params));

        // 2. Update Members (if provided)
        if (Array.isArray(members)) {
            // Delete existing
            statements.push(c.env.DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(id));

            // Insert new
            const insertStmt = c.env.DB.prepare('INSERT INTO group_members (group_id, symbol, allocation) VALUES (?, ?, ?)');
            // Dedup symbols just in case
            // Members array should be objects { symbol: 'X', allocation: 10 }
            const seen = new Set();
            for (const mem of members) {
                // Handle both old format (string) and new format (object) for backward compat while transitioning
                const symbol = typeof mem === 'string' ? mem : mem.symbol;
                const allocation = (typeof mem === 'object' && mem.allocation) ? mem.allocation : 0;

                if (!seen.has(symbol)) {
                    statements.push(insertStmt.bind(id, symbol, allocation));
                    seen.add(symbol);
                }
            }
        }

        await c.env.DB.batch(statements);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Get Group Members
app.get('/api/groups/:id/members', async (c) => {
    try {
        const id = c.req.param('id');
        const { results } = await c.env.DB.prepare(
            'SELECT symbol, allocation FROM group_members WHERE group_id = ?'
        ).bind(id).all();
        return c.json(results || []);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Validate Symbol
app.get('/api/validate/:symbol', async (c) => {
    try {
        const symbol = c.req.param('symbol')?.toUpperCase();
        if (!symbol) return c.json({ valid: false });

        const quotes = await fetchQuotes([symbol]);
        if (quotes && quotes.length > 0 && quotes[0]) {
            return c.json({ valid: true, symbol: quotes[0].symbol, name: quotes[0].shortName });
        }
        return c.json({ valid: false });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Add Member
app.post('/api/groups/:id/members', async (c) => {
    try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const { symbol } = body;
        if (!symbol) return c.json({ error: 'Symbol is required' }, 400);

        await c.env.DB.prepare(
            'INSERT OR IGNORE INTO group_members (group_id, symbol) VALUES (?, ?)'
        ).bind(id, symbol.toUpperCase()).run();

        return c.json({ success: true, symbol });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Remove Member
app.delete('/api/groups/:id/members/:symbol', async (c) => {
    try {
        const id = c.req.param('id');
        const symbol = c.req.param('symbol');
        await c.env.DB.prepare(
            'DELETE FROM group_members WHERE group_id = ? AND symbol = ?'
        ).bind(id, symbol).run();
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;

// Helper to gather all dashboard data
async function getDashboardData(env: Bindings, groupId?: string) {
    let tickers: string[] = AI_TICKERS;

    // Filter by Group if requested
    if (groupId) {
        try {
            // Ensure numeric ID
            const gid = parseInt(groupId);
            if (!isNaN(gid)) {
                // console.log(`[API] Fetching members for group ID: ${gid}`);
                const { results } = await env.DB.prepare('SELECT symbol FROM group_members WHERE group_id = ?').bind(gid).all();

                if (results && results.length > 0) {
                    tickers = results.map((r: any) => r.symbol);
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

    // 1. Fetch Quotes (Batch)
    // console.log(`[API] Fetching data for ${tickers.length} tickers: ${tickers.join(',')}`);
    const quotes = await fetchQuotes(tickers);

    // 2. Fetch History (Parallel) for Sparklines & SMAs
    const historyPromises = tickers.map(symbol => fetchPriceHistory(symbol));
    const histories = await Promise.all(historyPromises);
    const historyMap = new Map<string, PriceData>();

    histories.forEach(h => {
        if (h && !('error' in h)) {
            historyMap.set(h.symbol, h as PriceData);
        }
    });

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
            rsRankHistory: [] as number[]
        };
    });

    const LOOKBACK_DAYS = 22; // Bars to show

    // Calculate Static Normalization for the displayed window
    // We want the last 22 days normalized 0-100 relative to LAST 22 DAYS range.

    stocks.forEach(s => {
        const len = s.closePrices.length;
        if (len < 5) { // Need at least some data
            s.rsRankHistory = [];
            return;
        }

        // Get the specific window of prices we want to display
        // Use Math.min to handle short history < 22
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
        const { symbol, quote, prices, closePrices, currentPrice, rsRankHistory } = s;
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
            const currentYear = new Date().getFullYear();
            const prevYear = (currentYear - 1).toString();

            // Find the last entry that starts with prevYear
            // prices is "YYYY-MM-DD"
            // Iterate backwards
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
            name: quote?.shortName || symbol,
            price: currentPrice,
            marketCap: quote?.marketCap || 0,
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

// Scheduled Handler
export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log('Scheduled event triggered');
    const shuffled = [...QQQ_TICKERS].sort(() => 0.5 - Math.random());
    const batch = shuffled.slice(0, 5);

    for (const ticker of batch) {
        ctx.waitUntil(updateTicker(env, ticker));
    }
}

async function updatePrices(env: Bindings, symbol: string) {
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
        if (maxDate >= targetDate) return { count: 0, message: `Prices up to date (${maxDate})` };
    }

    const { fetchYahooPrices } = require('./yahoo');

    const prices = await fetchYahooPrices(symbol);
    if (!prices) return { count: 0, message: "Yahoo Price Fetch Failed" };

    const stmt = env.DB.prepare(`
        INSERT OR REPLACE INTO stock_prices (symbol, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const batch = [];
    for (const price of prices) {
        batch.push(stmt.bind(symbol, price.date, price.open || null, price.high || null, price.low || null, price.close || null, price.volume || null));
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

async function calculateForwardPEG(env: Bindings, symbol: string) {
    const { results: rawEarnings } = await env.DB.prepare(
        `SELECT fiscal_date_ending, estimated_eps, reported_eps FROM earnings_estimates WHERE symbol = ? ORDER BY fiscal_date_ending ASC`
    ).bind(symbol).all();

    const { results: prices } = await env.DB.prepare(
        `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 2500`
    ).bind(symbol).all();

    if (!rawEarnings?.length) throw new Error('No earnings data found');
    if (!prices?.length) throw new Error('No price data found');

    const earnings = rawEarnings as { fiscal_date_ending: string, estimated_eps: number, reported_eps: number | null }[];
    const pegTimeSeries = [];

    for (let i = 0; i < prices.length; i++) {
        const priceRow: any = prices[i];
        const date = priceRow.date;
        const close = priceRow.close;
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

async function updateTicker(env: Bindings, symbol: string) {
    const apiKey = env.ALPHA_VANTAGE_KEY;
    if (!apiKey) return { count: 0, message: "No API Key" };
    let avCount = 0, avMsg = "Skipped";

    const FETCH_AV_HISTORY = false;
    if (FETCH_AV_HISTORY) {
        const data = await fetchEarnings(symbol, apiKey);
        if (data && !('error' in data)) {
            const stmt = env.DB.prepare(`INSERT OR REPLACE INTO earnings_estimates (symbol, fiscal_date_ending, estimated_eps, reported_eps, surprise, surprise_percentage, report_date) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            const batch = [];
            for (const q of data.quarterlyEarnings) {
                if (q.fiscalDateEnding < '2018-01-01') continue;
                batch.push(stmt.bind(data.symbol, q.fiscalDateEnding, parseFloat(q.estimatedEPS) || null, parseFloat(q.reportedEPS) || null, parseFloat(q.surprise) || null, parseFloat(q.surprisePercentage) || null, q.reportedDate));
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
            await env.DB.prepare(`INSERT OR REPLACE INTO earnings_estimates (symbol, fiscal_date_ending, estimated_eps, report_date) VALUES (?, ?, ?, ?)`).bind(symbol, targetDate, yahooData.estimated_eps, null).run();
        }
    } catch (e) { }
    return { count: avCount, message: avMsg };
}
