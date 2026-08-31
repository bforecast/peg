import { Hono } from 'hono';
import { Bindings } from '../types';
import { DASHBOARD_HTML } from '../dashboard_html';
import { getDashboardData } from '../db';
import { UI_HTML } from '../ui_html';
import { FAVICON_BASE64 } from '../favicon';
import { AccuratePortfolioHealthMonitor } from '../market_entropy';
import { PriceData } from '../types';
import { calculatePortfolioPerformance } from '../portfolio';

const app = new Hono<{ Bindings: Bindings }>();

// Serve Dashboard UI (Main Page)
app.get('/', (c) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return c.html(DASHBOARD_HTML);
});

// Serve PEG Tool UI (Legacy)
app.get('/peg', (c) => {
    return c.html(UI_HTML);
});

// Serve System Settings UI
app.get('/status', async (c) => {
    // Import on demand to avoid circular dependencies if any
    const { SETTINGS_HTML } = await import('../status_html');
    return c.html(SETTINGS_HTML);
});

// Serve Portfolio View (sublink for direct access)
app.get('/portfolio/:id', (c) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return c.html(DASHBOARD_HTML);
});

// Serve Stock Analysis Page (skeleton)
app.get('/stock/:symbol', async (c) => {
    const { STOCK_HTML } = await import('../stock_html');
    return c.html(STOCK_HTML);
});

app.get('/test-html', async (c) => {
    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Test</title></head><body><h1>Test Page</h1></body></html>';
    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.text(html);
});

app.get('/favicon.ico', (c) => {
    const binary = Uint8Array.from(atob(FAVICON_BASE64), char => char.charCodeAt(0));
    return c.body(binary.buffer, 200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
    });
});

// Calculate and return Forward PEG data
app.get('/api/dashboard-data', async (c) => {
    try {
        const groupId = c.req.query('groupId');
        const data = await getDashboardData(c.env, groupId);

        // Get last updated date from stock_quotes
        const lastUpdatedRow: any = await c.env.DB.prepare(
            'SELECT MAX(updated_at) as lastTime FROM stock_quotes'
        ).first();
        const lastUpdated = lastUpdatedRow?.lastTime || null;

        // Add Caching (1 min fresh, 10 min stale-while-revalidate)
        c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
        return c.json({ lastUpdated, data });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Portfolio Performance & Trend API (2025~Present with QQQ Benchmark)
app.get('/api/portfolio-performance/:id', async (c) => {
    try {
        const idParam = c.req.param('id');
        const groupId = parseInt(idParam, 10);
        if (isNaN(groupId)) {
            return c.json({ error: 'Invalid group ID' }, 400);
        }

        const benchmark = c.req.query('benchmark') || 'QQQ';
        const startDate = c.req.query('startDate') || '2025-01-01';
        const period = c.req.query('period') || '2025';

        const performanceData = await calculatePortfolioPerformance(c.env, groupId, {
            benchmark,
            startDate,
            period
        });

        if (!performanceData) {
            return c.json({ error: 'Failed to calculate portfolio performance or insufficient data' }, 404);
        }

        c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return c.json(performanceData);
    } catch (e: any) {
        console.error('[API /api/portfolio-performance] Error:', e);
        return c.json({ error: e.message }, 500);
    }
});



// Stocks Details API
app.get('/api/stock-details/:symbol', async (c) => {
    try {
        const symbol = c.req.param('symbol').toUpperCase();

        // 1. Get Quote & Metrics
        const quote = await c.env.DB.prepare('SELECT * FROM stock_quotes WHERE symbol = ?').bind(symbol).first();
        const stats = await c.env.DB.prepare('SELECT * FROM stock_stats WHERE symbol = ?').bind(symbol).first();

        if (!quote) {
            return c.json({ error: 'Stock not found' }, 404);
        }

        // Merge stats into quote for frontend convenience
        const mergedQuote = { ...quote, ...stats };

        // 2. Get Price History (Pull all data to support 5Y and All period shortcuts)
        const { results: history } = await c.env.DB.prepare(
            'SELECT date, open, high, low, close, volume FROM stock_prices WHERE symbol = ? ORDER BY date ASC'
        ).bind(symbol).all();

        // 3. Get Earnings Estimates/History
        const { results: earnings } = await c.env.DB.prepare(
            'SELECT * FROM earnings_estimates WHERE symbol = ? ORDER BY fiscal_date_ending DESC LIMIT 8'
        ).bind(symbol).all();

        // 4. Get Portfolio Holdings
        const { results: holdings } = await c.env.DB.prepare(`
            SELECT g.id, g.name, gm.allocation 
            FROM group_members gm 
            JOIN groups g ON gm.group_id = g.id 
            WHERE gm.symbol = ? 
            ORDER BY gm.allocation DESC
        `).bind(symbol).all();

        return c.json({
            quote: mergedQuote,
            history: history || [],
            earnings: earnings || [],
            holdings: holdings || []
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Portfolio Health Index API
app.get('/api/portfolio-health', async (c) => {
    try {
        const tickersParam = c.req.query('tickers');
        const windowParam = c.req.query('window');

        if (!tickersParam) {
            return c.json({ error: 'tickers parameter is required' }, 400);
        }

        const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase());
        const window = windowParam ? parseInt(windowParam, 10) : 30;

        // Get price data for all tickers (last 2 years)
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const startDate = twoYearsAgo.toISOString().split('T')[0];

        const priceDataMap: { [ticker: string]: PriceData[] } = {};

        // Batch fetch price data for all tickers in a single query
        const placeholders = tickers.map(() => '?').join(',');
        const query = `
            SELECT symbol, date, open, high, low, close, volume 
            FROM stock_prices 
            WHERE symbol IN (${placeholders}) AND date >= ? 
            ORDER BY symbol ASC, date ASC
        `;

        const { results: allPrices } = await c.env.DB.prepare(query)
            .bind(...tickers, startDate)
            .all();

        // Initialize arrays in map
        for (const ticker of tickers) {
            priceDataMap[ticker] = [];
        }

        if (allPrices && allPrices.length > 0) {
            for (const p of allPrices) {
                const row = p as any;
                const ticker = row.symbol;
                if (priceDataMap[ticker]) {
                    priceDataMap[ticker].push({
                        date: String(row.date),
                        open: Number(row.open || 0),
                        high: Number(row.high || 0),
                        low: Number(row.low || 0),
                        close: Number(row.close || 0),
                        volume: Number(row.volume || 0)
                    });
                }
            }
        }

        // Clean up tickers that have no price data
        for (const ticker of Object.keys(priceDataMap)) {
            if (priceDataMap[ticker].length === 0) {
                delete priceDataMap[ticker];
            }
        }

        // If no data found for any tickers
        if (Object.keys(priceDataMap).length === 0) {
            return c.json({ error: 'No price data found for specified tickers' }, 404);
        }

        // Create monitor and run analysis
        const monitor = new AccuratePortfolioHealthMonitor(Object.keys(priceDataMap), window);
        const result = monitor.runAnalysis(priceDataMap);

        return c.json(result);

    } catch (e: any) {
        console.error('Error in portfolio health API:', e);
        return c.json({ error: e.message }, 500);
    }
});


export default app;
