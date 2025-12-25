import { Hono } from 'hono';
import { Bindings } from '../types';
import { DASHBOARD_HTML } from '../dashboard_html';
import { getDashboardData } from '../db';
import { UI_HTML } from '../ui_html';

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



export default app;
