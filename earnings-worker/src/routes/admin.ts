import { Hono } from 'hono';
import { Bindings } from '../types';
import { updatePrices, updateTicker } from '../db';
import { getSuperinvestors, getPortfolio } from '../dataroma';
import { fetchQuotes } from '../yahoo_finance';

const app = new Hono<{ Bindings: Bindings }>();

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

// Get Cron Logs
app.get('/api/cron-logs', async (c) => {
    try {
        const { results } = await c.env.DB.prepare('SELECT * FROM cron_logs ORDER BY id DESC LIMIT 50').all();
        return c.json({ logs: results });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Cron Summary Stats (Status Page)
app.get('/api/cron-summary', async (c) => {
    try {
        c.header('Cache-Control', 'no-cache, no-store, must-revalidate');

        const now = new Date();
        const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Dynamic Cutoff for EST
        const options: Intl.DateTimeFormatOptions = {
            timeZone: "America/New_York",
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(past24h);
        const p = (type: string) => parts.find(x => x.type === type)?.value || '00';
        const cutoff = `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}:${p('second')}`;

        // 1. Total Tracked (Match Cron Logic: Portfolio + SPY)
        const { results } = await c.env.DB.prepare('SELECT DISTINCT symbol FROM group_members').all();
        const trackedSet = new Set([...results.map((r: any) => r.symbol), 'SPY']);
        const total = trackedSet.size;

        // 2. Updated in last 24h
        const { count: quotes } = await c.env.DB.prepare('SELECT count(*) as count FROM stock_quotes WHERE updated_at >= ?').bind(cutoff).first() as any;
        const { count: stats } = await c.env.DB.prepare('SELECT count(*) as count FROM stock_stats WHERE updated_at >= ?').bind(cutoff).first() as any;

        // 3. Last Success
        const lastSuccess = await c.env.DB.prepare("SELECT timestamp, message FROM cron_logs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").first() as any;

        // 4. Success Rate
        const logs = await c.env.DB.prepare("SELECT status FROM cron_logs WHERE timestamp >= ?").bind(cutoff).all();
        const logResults = logs.results as any[];
        const totalRuns = logResults.length;
        const successRuns = logResults.filter(l => l.status === 'SUCCESS' || l.status === 'SKIPPED').length;
        const rate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 100;

        return c.json({
            totalTracked: total,
            quotesUpdated: quotes,
            statsProcessed: stats,
            successRate: rate,
            lastCompletion: lastSuccess ? lastSuccess.timestamp : 'Never',
            cutoffTime: cutoff
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Health Check
app.get('/api/health', async (c) => {
    const deep = c.req.query('deep') === 'true';
    const status: any = { status: 'healthy', checks: {} };

    // 1. Basic DB Check (Connectivity)
    try {
        await c.env.DB.prepare('SELECT 1').first();
        status.checks.db = 'ok';
    } catch (e: any) {
        status.status = 'unhealthy';
        status.checks.db = 'failed: ' + e.message;
    }

    // 2. Env Check
    status.checks.env = {
        ALPHA_VANTAGE: c.env.ALPHA_VANTAGE_KEY ? 'set' : 'missing'
    };
    if (!c.env.ALPHA_VANTAGE_KEY) status.status = 'degraded';

    // 3. Cron Last Run
    try {
        const row = await c.env.DB.prepare('SELECT timestamp FROM cron_logs ORDER BY id DESC LIMIT 1').first() as unknown as { timestamp: string };
        status.checks.cron = row ? `${row.timestamp}` : 'Never ran';
    } catch (e) {
        status.checks.cron = 'Check failed';
    }

    // 4. Deep Checks (Optional)
    if (deep) {
        status.checks.deep = {};

        // A. Freshness: Check most recent price date
        try {
            const row = await c.env.DB.prepare('SELECT MAX(date) as last_date FROM stock_prices').first() as unknown as { last_date: string };
            const lastDate = row?.last_date;

            // Simple check: Is it within last 4 days? (Allow for long weekends)
            if (lastDate) {
                const diff = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24);
                status.checks.deep.freshness = diff < 4 ? 'ok' : `stale (${lastDate})`;
                if (diff >= 4) status.status = 'degraded'; // Stale data isn't fatal but bad
            } else {
                status.checks.deep.freshness = 'no data';
            }
        } catch (e: any) { status.checks.deep.freshness = 'error: ' + e.message; }

        // B. Critical Symbols (Regression Test)
        try {
            const syms = ['BRK-B', 'GOOG', 'MSFT'];
            const placeholders = syms.map(() => '?').join(',');
            const { results } = await c.env.DB.prepare(`SELECT symbol FROM stock_quotes WHERE symbol IN (${placeholders})`).bind(...syms).all();
            const found = (results || []).map((r: any) => r.symbol);
            const missing = syms.filter(s => !found.includes(s));

            status.checks.deep.critical_symbols = missing.length === 0 ? 'ok' : `missing: ${missing.join(', ')}`;
            // Special check for BRK.B format issues
            if (missing.includes('BRK-B')) status.status = 'issue_detected';
        } catch (e: any) { status.checks.deep.critical_symbols = 'error: ' + e.message; }

        // C. Data Integrity (Zero Prices)
        try {
            const row = await c.env.DB.prepare('SELECT count(*) as count FROM stock_quotes WHERE price = 0 OR price IS NULL').first() as unknown as { count: number };
            const zeroCount = row?.count || 0;
            status.checks.deep.integrity = zeroCount === 0 ? 'ok' : `warn: ${zeroCount} stocks with 0 price`;
            if (zeroCount > 0) status.checks.deep.integrity_details = 'Run SELECT * FROM stock_quotes WHERE price=0';
        } catch (e: any) { status.checks.deep.integrity = 'error: ' + e.message; }
    }

    return c.json(status);
});

// --- SUPERINVESTOR MANAGEMENT ---
app.get('/api/superinvestors', async (c) => {
    try {
        const managers = await getSuperinvestors();
        return c.json(managers);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/import-superinvestor', async (c) => {
    try {
        const body = await c.req.json();
        const { code, nameOverride, limit } = body;
        if (!code) return c.json({ error: 'Manager code required' }, 400);

        const portfolio = await getPortfolio(code);

        if (portfolio.holdings && portfolio.holdings.length > 0) {
            portfolio.holdings.sort((a, b) => b.allocation - a.allocation);
            if (limit && typeof limit === 'number' && limit > 0) {
                portfolio.holdings = portfolio.holdings.slice(0, limit);
            }
        }

        const groupName = nameOverride || portfolio.manager;
        const description = `Imported from DataRoma\nDate: ${portfolio.date}\nPeriod: ${portfolio.period}\nValue: ${portfolio.value}`;

        const { meta } = await c.env.DB.prepare(
            'INSERT INTO groups (name, description) VALUES (?, ?)'
        ).bind(groupName, description).run();

        const groupId = meta.last_row_id;

        if (portfolio.holdings.length > 0) {
            const stmt = c.env.DB.prepare('INSERT INTO group_members (group_id, symbol, allocation) VALUES (?, ?, ?)');
            const batch = portfolio.holdings.map(h => stmt.bind(groupId, h.symbol, h.allocation));
            await c.env.DB.batch(batch);
        }

        return c.json({
            success: true,
            id: groupId,
            name: groupName,
            memberCount: portfolio.holdings.length,
            holdings: portfolio.holdings
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- GROUP MANAGEMENT ---

// List Groups with Stats (Portfolios Board Data)
// List Groups with Stats (Portfolios Board Data)
app.get('/api/portfolios', async (c) => {
    try {
        // Join groups with portfolio_stats
        // Also get member count for display
        // SQLite doesn't support complex joins easily in D1 raw queries sometimes, but LEFT JOIN works.
        // Explicitly prevent caching to ensure metrics appear
        c.header('Cache-Control', 'no-cache, no-store, must-revalidate');

        const { results } = await c.env.DB.prepare(`
            SELECT 
                g.id, g.name, g.description, g.created_at,
                ps.cagr, ps.std_dev, ps.max_drawdown, ps.sharpe, ps.sortino, ps.correlation_spy, ps.change_1d, ps.updated_at as stats_updated_at,
                (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count
            FROM groups g
            LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
            ORDER BY g.created_at DESC
        `).all();

        return c.json(results || []);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/debug-db', async (c) => {
    try {
        c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        const { results } = await c.env.DB.prepare('SELECT * FROM groups LIMIT 20').all();
        return c.json({ count: results.length, rows: results });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Recalculate Portfolio Stats (Admin)
app.post('/api/admin/recalc-portfolio', async (c) => {
    try {
        const { calculatePortfolioStats } = await import('../portfolio');
        const groupId = c.req.query('id'); // Optional: calculate for specific group

        let targetGroups = [];
        if (groupId) {
            targetGroups.push({ id: parseInt(groupId) });
        } else {
            const { results } = await c.env.DB.prepare("SELECT id FROM groups").all();
            targetGroups = results as { id: number }[];
        }


        const statsResults: any[] = [];
        for (const g of targetGroups) {
            try {
                const res = await calculatePortfolioStats(c.env, g.id);
                statsResults.push({ id: g.id, status: res ? 'ok' : 'failed', stats: res });
            } catch (e: any) {
                statsResults.push({ id: g.id, status: 'error', error: e.message });
            }
        }

        return c.json({ success: true, results: statsResults });
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
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Force Run Cron (Debugging/Manual Fix)
app.post('/api/admin/force-run-cron', async (c) => {
    try {
        const { scheduled } = await import('../cron');
        // Mock event/ctx
        const event: any = { cron: 'MANUAL', type: 'scheduled', scheduledTime: Date.now() };
        const ctx: any = {
            waitUntil: (promise: Promise<any>) => {
                // We want to wait for it here to report result
                return promise;
            }
        };

        // We can't await ctx.waitUntil inside scheduled easily without changing signature
        // But scheduled calls ctx.waitUntil with the meaningful work.
        // We can capture the promise passed to ctx.waitUntil.
        let workerPromise: Promise<void> | null = null;
        const captureCtx: any = {
            waitUntil: (p: Promise<void>) => { workerPromise = p; }
        };

        await scheduled(event, c.env, captureCtx);

        if (workerPromise) {
            // DO NOT AWAIT. Pass to real executionCtx to keep alive.
            c.executionCtx.waitUntil(workerPromise);
            return c.json({ success: true, message: 'Cron job started in background.' });
        } else {
            return c.json({ success: false, message: 'Cron job started but no work promise captured.' });
        }

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Update Group (Batch)
app.put('/api/groups/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const { name, description, members } = body;

        const statements: D1PreparedStatement[] = [];

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

        if (Array.isArray(members)) {
            statements.push(c.env.DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(id));

            const insertStmt = c.env.DB.prepare('INSERT INTO group_members (group_id, symbol, allocation) VALUES (?, ?, ?)');
            const seen = new Set();
            for (const mem of members) {
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

// New Endpoint for Client-Side Driven Updates
app.post('/api/refresh/:symbol', async (c) => {
    const symbol = c.req.param('symbol');
    try {
        const pRes = await updatePrices(c.env, symbol);
        const tRes = await updateTicker(c.env, symbol);

        // Force update stock_quotes (Market Cap, DY, PE)
        const qRes = await fetchQuotes([symbol]);
        if (qRes && qRes.length > 0) {
            const { saveQuotesToDB } = await import('../db');
            await saveQuotesToDB(c.env, qRes);
        }

        return c.json({ prices: pRes, ticker: tRes, quote: qRes ? 'Updated' : 'Failed' });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Batch Refresh (All Tickers or List)
app.post('/api/refresh-batch', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({}));
        let symbols = body.symbols;
        const updateAll = body.all === true;

        if (updateAll) {
            const { results } = await c.env.DB.prepare('SELECT DISTINCT symbol FROM group_members').all();
            symbols = results.map((r: any) => r.symbol);
        }

        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            // Default to AI_TICKERS if no list provided and not updating all
            const { AI_TICKERS } = await import('../tickers');
            symbols = AI_TICKERS;
        }

        const { fetchQuotes } = await import('../yahoo_finance');
        const { saveQuotesToDB } = await import('../db');

        // Fetch in chunks of 50 (since fetchQuotes handles internal batching of 5, we can pass larger chunks)
        const CHUNK_SIZE = 50;
        const results: string[] = [];
        const failed: string[] = [];

        for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
            const batch = symbols.slice(i, i + CHUNK_SIZE);
            const quotes = await fetchQuotes(batch);

            if (quotes.length > 0) {
                await saveQuotesToDB(c.env, quotes);

                const batchSuccess = quotes.map(q => q.symbol);
                results.push(...batchSuccess);

                // Track failures
                const batchFailed = batch.filter(s => !batchSuccess.includes(s));
                failed.push(...batchFailed);
            } else {
                failed.push(...batch);
            }

            // Throttle between large chunks
            if (i + CHUNK_SIZE < symbols.length) await new Promise(r => setTimeout(r, 1000));
        }

        return c.json({
            success: true,
            total: symbols.length,
            updatedCount: results.length,
            failedCount: failed.length,
            updated: results,
            failed: failed
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Backfill Stats for ALL symbols (Internal Tool)
app.post('/api/admin/backfill-stats', async (c) => {
    try {
        const { regenerateStats } = await import('../db');

        // 1. Get all distinct symbols from stock_prices (so we only backfill where we have data)
        const { results } = await c.env.DB.prepare('SELECT DISTINCT symbol FROM stock_prices').all();
        const symbols = results.map((r: any) => r.symbol);

        console.log(`[Backfill] Found ${symbols.length} symbols`);

        let updated = 0;
        let failed = 0;

        // Process in chunks to avoid timeout if list is huge (though distinct symbols shouldn't be too many yet)
        // Cloudflare Workers have CPU time limits, but IO wait time is more flexible.
        // We'll process sequentially for safety.
        for (const sym of symbols) {
            try {
                const success = await regenerateStats(c.env, sym);
                if (success) updated++;
                else failed++;
            } catch (e) {
                console.error(`Failed stats for ${sym}`, e);
                failed++;
            }
        }

        return c.json({
            success: true,
            total: symbols.length,
            updated,
            failed,
            message: `Regenerated stats for ${updated} symbols`
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});



export default app;
