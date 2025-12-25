import { Hono } from 'hono';
import { Bindings } from '../types';
import { DASHBOARD_HTML } from '../dashboard_html';
import { getDashboardData } from '../db';
import { UI_HTML } from '../ui_html';
import { FAVICON_BASE64 } from '../favicon';

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
    const { SETTINGS_HTML } = await import('../settings_html');
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



// Stocks Details API
app.get('/api/stock-details/:symbol', async (c) => {
    try {
        const symbol = c.req.param('symbol').toUpperCase();

        // 1. Get Quote & Metrics
        const quote = await c.env.DB.prepare('SELECT * FROM stock_quotes WHERE symbol = ?').bind(symbol).first();

        if (!quote) {
            return c.json({ error: 'Stock not found' }, 404);
        }

        // 2. Get Price History (Last 370 days for full year chart)
        // Get date 1 year ago
        const d = new Date();
        d.setDate(d.getDate() - 370);
        const startDate = d.toISOString().split('T')[0];

        const { results: history } = await c.env.DB.prepare(
            'SELECT date, close FROM stock_prices WHERE symbol = ? AND date >= ? ORDER BY date ASC'
        ).bind(symbol, startDate).all();

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
            quote,
            history: history || [],
            earnings: earnings || [],
            holdings: holdings || []
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});


export default app;
