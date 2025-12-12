import { Hono } from 'hono';
import { fetchEarnings } from './alpha_vantage';

import { fetchYahooEstimates, fetchYahooPrices } from './yahoo';
import { QQQ_TICKERS } from './tickers';
import { UI_HTML } from './ui_html';

type Bindings = {
    DB: D1Database;
    ALPHA_VANTAGE_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Serve data
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
app.get('/api/forward-peg', async (c) => {
    const symbol = c.req.query('symbol')?.toUpperCase();
    if (!symbol) return c.json({ error: 'Missing symbol parameter' }, 400);

    try {
        const pegData = await calculateForwardPEG(c.env, symbol);
        return c.json(pegData);
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

// Serve UI
app.get('/', (c) => {
    return c.html(UI_HTML);
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



// ES Module format export (required for D1)
export default app;

// Scheduled handler
export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log('Scheduled event triggered');
    const shuffled = [...QQQ_TICKERS].sort(() => 0.5 - Math.random());
    const batch = shuffled.slice(0, 5);

    for (const ticker of batch) {
        ctx.waitUntil(updateTicker(env, ticker));
    }
}

async function updatePrices(env: Bindings, symbol: string) {
    // Check for existing data based on Market Hours (NY Time)
    const { maxDate } = await env.DB.prepare(
        `SELECT max(date) as maxDate FROM stock_prices WHERE symbol = ?`
    ).bind(symbol).first() as { maxDate: string };

    if (maxDate) {
        // Get NY Time
        const now = new Date();
        const nyStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
        const nyTime = new Date(nyStr);

        const day = nyTime.getDay(); // 0=Sun, 6=Sat
        const hour = nyTime.getHours(); // 0-23

        let lastTradingDate = new Date(nyTime);

        // 1. If today is Saturday (6), last trade was Friday (-1 day)
        if (day === 6) {
            lastTradingDate.setDate(lastTradingDate.getDate() - 1);
        }
        // 2. If today is Sunday (0), last trade was Friday (-2 days)
        else if (day === 0) {
            lastTradingDate.setDate(lastTradingDate.getDate() - 2);
        }
        // 3. If Weekday (1-5)
        else {
            // If before 5:00 PM (17:00), market likely hasn't closed/updated yet for today.
            // We expect Yesterday's close.
            if (hour < 17) {
                lastTradingDate.setDate(lastTradingDate.getDate() - 1);
                // If that made it Sunday (yesterday was Sun, today Mon), go back to Friday
                if (lastTradingDate.getDay() === 0) {
                    lastTradingDate.setDate(lastTradingDate.getDate() - 2);
                }
            }
        }

        const targetDate = lastTradingDate.toISOString().split('T')[0];

        // If our DB has data >= targetDate, we are good.
        // We use >= just in case of weird forward dates, but == is typical.
        if (maxDate >= targetDate) {
            return { count: 0, message: `Prices up to date (${maxDate})` };
        }
    }

    // Switch to Yahoo Finance for prices
    const prices = await fetchYahooPrices(symbol);

    if (!prices) {
        return { count: 0, message: "Yahoo Price Fetch Failed" };
    }

    const stmt = env.DB.prepare(`
        INSERT OR REPLACE INTO stock_prices 
        (symbol, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const batch = [];
    for (const price of prices) {
        batch.push(stmt.bind(
            symbol,
            price.date,
            price.open || null,
            price.high || null,
            price.low || null,
            price.close || null,
            price.volume || null
        ));
    }

    if (batch.length > 0) {
        const CHUNK_SIZE = 50;
        for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
            const chunk = batch.slice(i, i + CHUNK_SIZE);
            await env.DB.batch(chunk);
        }
        return { count: batch.length, message: "Success" };
    }

    return { count: 0, message: "No data to insert" };
}

async function calculateForwardPEG(env: Bindings, symbol: string) {
    // Get earnings estimates (fetching reported_eps as well)
    const { results: rawEarnings } = await env.DB.prepare(
        `SELECT fiscal_date_ending, estimated_eps, reported_eps FROM earnings_estimates 
         WHERE symbol = ? 
         ORDER BY fiscal_date_ending ASC`
    ).bind(symbol).all();

    // Get price data
    const { results: prices } = await env.DB.prepare(
        `SELECT date, close FROM stock_prices 
         WHERE symbol = ? 
         ORDER BY date DESC LIMIT 2500`
    ).bind(symbol).all();

    if (!rawEarnings || rawEarnings.length === 0) {
        throw new Error('No earnings data found');
    }
    if (!prices || prices.length === 0) {
        throw new Error('No price data found');
    }

    // Cast and assist typescript
    const earnings = rawEarnings as {
        fiscal_date_ending: string,
        estimated_eps: number,
        reported_eps: number | null
    }[];

    // Build time series data
    const pegTimeSeries = [];

    for (let i = 0; i < prices.length; i++) {
        const priceRow: any = prices[i];
        const date = priceRow.date;
        const close = priceRow.close;

        // Blended Forward EPS Logic: "Last 3 Reported + Next 1 Estimated"

        // 1. Identify the "Next Quarter" (first fiscal ending > date)
        // This represents the "Current/Next" quarter being estimated.
        const nextQuarterIndex = earnings.findIndex(e => e.fiscal_date_ending > date);

        let forwardEPS = null;
        let trailingEPS = null;
        let forwardPE = null;
        let growthRate = null;
        let peg = null;

        if (nextQuarterIndex !== -1) {
            const nextQuarter = earnings[nextQuarterIndex];

            // 2. Identify "Last 3 Quarters" (immediately preceding nextQuarter)
            // Safety check: ensure we have 3 previous records
            if (nextQuarterIndex >= 3) {
                const past3 = earnings.slice(nextQuarterIndex - 3, nextQuarterIndex);

                // Calculate Forward Sum: Est(Next) + Reported(Past 3)
                // Fallback: If reported_eps is missing (e.g. data hole), use estimated_eps
                const estNext = nextQuarter.estimated_eps || 0;
                const sumPastReported = past3.reduce((sum, q) => sum + (q.reported_eps !== null ? q.reported_eps : (q.estimated_eps || 0)), 0);

                forwardEPS = estNext + sumPastReported;
            }
        }

        // Previous Year TTM Logic: Sum of quarters -8 to -5
        // This compares Forward EPS (approx current year) vs Prior Year Actuals for YoY Growth
        const pastEarnings = earnings.filter(e => e.fiscal_date_ending <= date);
        if (pastEarnings.length >= 8) {
            const previousYearTTM = pastEarnings.slice(-8, -4);
            trailingEPS = previousYearTTM.reduce((sum, q) => sum + (q.reported_eps !== null ? q.reported_eps : (q.estimated_eps || 0)), 0);
        }

        if (forwardEPS !== null && forwardEPS !== 0) {
            forwardPE = close / forwardEPS;

            // Calculate Growth
            if (trailingEPS !== null && trailingEPS !== 0) {
                growthRate = (forwardEPS / trailingEPS) - 1;

                // Calculate PEG
                if (growthRate !== null && Math.abs(growthRate) > 0.001) {
                    peg = forwardPE / (growthRate * 100);
                }
            }
        }

        pegTimeSeries.push({
            date,
            price: close,
            forwardEPS: forwardEPS ? forwardEPS.toFixed(2) : null,
            forwardPE: forwardPE ? forwardPE.toFixed(2) : null,
            growthRate: growthRate ? (growthRate * 100).toFixed(2) : null,
            peg: peg ? peg.toFixed(2) : null
        });
    }

    // Determine current/latest values for specific return fields if needed
    const latestValid = pegTimeSeries.find(d => d.forwardEPS !== null);

    return {
        symbol,
        currentForwardEPS: latestValid ? latestValid.forwardEPS : "N/A",
        timeSeries: pegTimeSeries.reverse() // Oldest to newest for charting
    };
}

async function updateTicker(env: Bindings, symbol: string) {
    const apiKey = env.ALPHA_VANTAGE_KEY;
    if (!apiKey) {
        console.error("No API KEY set");
        return { count: 0, message: "No API Key" };
    }

    let avCount = 0;
    let avMsg = "Skipped (Yahoo Only)";
    const FETCH_AV_HISTORY = false; // Set to true for batch history updates

    if (FETCH_AV_HISTORY) {
        const data = await fetchEarnings(symbol, apiKey);

        if (data && !('error' in data)) {
            const stmt = env.DB.prepare(`
                INSERT OR REPLACE INTO earnings_estimates 
                (symbol, fiscal_date_ending, estimated_eps, reported_eps, surprise, surprise_percentage, report_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            // Batch execute
            const batch = [];
            for (const q of data.quarterlyEarnings) {
                // Simple filter for 2018+
                if (q.fiscalDateEnding < '2018-01-01') continue;

                batch.push(stmt.bind(
                    data.symbol,
                    q.fiscalDateEnding,
                    parseFloat(q.estimatedEPS) || null,
                    parseFloat(q.reportedEPS) || null,
                    parseFloat(q.surprise) || null,
                    parseFloat(q.surprisePercentage) || null,
                    q.reportedDate
                ));
            }

            if (batch.length > 0) {
                await env.DB.batch(batch);
                console.log(`Updated ${batch.length} records for ${symbol}`);
                avCount = batch.length;
                avMsg = `Updated ${batch.length} AV records`;
            } else {
                avMsg = "No recent AV data";
            }
        } else if (data && 'error' in data) {
            console.warn(`Alpha Vantage Warning: ${data.error}`);
            avMsg = `AV Error: ${data.error}`;
        }
    }

    let yahooMsg = "Skipped";

    // --- YAHOO FINANCE INTEGRATION ---
    // Fetch latest estimate gap-fill from Yahoo (Run ALWAYS)
    try {
        const yahooData = await fetchYahooEstimates(symbol);
        if (yahooData) {
            // Determine target date for gap filling
            // Yahoo "Current Quarter" applies to the quarter we are IN.
            // We need to map it to the simulated "Current Quarter Ending Date".

            // Get most recent price date (proxy for "Today")
            const { maxDate } = await env.DB.prepare(
                `SELECT max(date) as maxDate FROM stock_prices WHERE symbol = ?`
            ).bind(symbol).first() as { maxDate: string };

            let targetDate = yahooData.fiscal_date_ending; // Default

            if (maxDate) {
                const today = new Date(maxDate);
                const year = today.getFullYear();
                const month = today.getMonth(); // 0-11

                // Find CURRENT quarter ending month (Mar=2, Jun=5, Sep=8, Dec=11)
                // Q1: 0,1,2 -> 2
                // Q2: 3,4,5 -> 5
                // Q3: 6,7,8 -> 8
                // Q4: 9,10,11 -> 11
                const quarterEndMonth = 2 + (Math.floor(month / 3) * 3);

                // Construct Date: Last day of that quarterEndMonth
                // new Date(year, monthIndex + 1, 0) gives last day of monthIndex
                const d = new Date(year, quarterEndMonth + 1, 0);
                const isoDate = d.toISOString().split('T')[0];

                // If Yahoo's date is "older" than our current simulated date, OVERRIDE it.
                if (yahooData.fiscal_date_ending < maxDate) {
                    console.log(`Mapping Yahoo Estimate (dated ${yahooData.fiscal_date_ending}) to Simulated Target: ${isoDate}`);
                    targetDate = isoDate;
                }
            }

            console.log(`Filing gap with Yahoo Estimate for ${symbol}: ${targetDate} = ${yahooData.estimated_eps}`);
            await env.DB.prepare(`
                INSERT OR REPLACE INTO earnings_estimates 
                (symbol, fiscal_date_ending, estimated_eps, report_date)
                VALUES (?, ?, ?, ?)
            `).bind(
                symbol,
                targetDate,
                yahooData.estimated_eps,
                null
            ).run();
            yahooMsg = `Inserted ${targetDate}`;
        } else {
            yahooMsg = "No Data Found";
        }
    } catch (err: any) {
        console.error("Yahoo Gap Fill Failed:", err);
        yahooMsg = `Error: ${err.message}`;
    }

    return { count: avCount, message: `AV: ${avMsg} | Yahoo: ${yahooMsg}` };
}

