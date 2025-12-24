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

// Get Cron Summary Stats (Daily)
app.get('/api/cron-summary', async (c) => {
    try {
        // Get today's date in EST
        const { getESTDate } = await import('../db');
        const todayStr = getESTDate();
        const cutoffTime = `${todayStr} 00:00:00`;

        // 1. Quotes Updated Today
        const quotesQuery = await c.env.DB.prepare(
            `SELECT count(*) as count FROM stock_quotes WHERE updated_at > ?`
        ).bind(cutoffTime).first() as { count: number };

        // 2. Stats Updated Today
        const statsQuery = await c.env.DB.prepare(
            `SELECT count(*) as count FROM stock_stats WHERE updated_at > ?`
        ).bind(cutoffTime).first() as { count: number };

        // 3. Cron Success Rate (Last 24h basically covers "today" for relevant logs)
        // Actually let's look at logs since cutoffTime
        const logs = await c.env.DB.prepare(
            `SELECT status FROM cron_logs WHERE timestamp > ?`
        ).bind(cutoffTime).all();

        // Count WARNING as "not fully successful" (User Feedback: 100% seems wrong if failures occur)
        const totalRuns = logs.results.length;
        // Count WARNING as "not fully successful" (User Feedback: 100% seems wrong if failures occur)
        const failedRuns = logs.results.filter((r: any) => r.status === 'FAILED' || r.status === 'WARNING').length;
        const successRate = totalRuns > 0 ? ((totalRuns - failedRuns) / totalRuns * 100).toFixed(0) : 100;

        // 4. Completion Time
        // Find the first "SKIPPED" or "SUCCESS" with 0 pending log after the last "STARTED" with >0 pending?
        // Simpler: Find the most recent log where message contains "0 failed" or "All ... updated"
        const lastSuccess = await c.env.DB.prepare(
            `SELECT timestamp FROM cron_logs WHERE status = 'SUCCESS' OR status = 'SKIPPED' ORDER BY id DESC LIMIT 1`
        ).first() as { timestamp: string };

        // 5. Total Tracked Symbols (for context "23/165")
        const membersRows = await c.env.DB.prepare("SELECT DISTINCT symbol FROM group_members").all();
        const uniqueSymbols = new Set((membersRows.results || []).map((r: any) => r.symbol));
        uniqueSymbols.add('SPY');
        const totalTracked = uniqueSymbols.size;

        return c.json({
            quotesUpdated: quotesQuery.count || 0,
            statsProcessed: statsQuery.count || 0,
            totalTracked: totalTracked,
            successRate: successRate,
            lastCompletion: lastSuccess?.timestamp?.split(' ')[1] || '-' // HH:MM:SS
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
