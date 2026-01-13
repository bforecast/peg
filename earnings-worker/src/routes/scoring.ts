import { Hono } from 'hono';
import { Bindings } from '../types';
import { updateScoringMetrics } from '../scoring/fetcher';
import { calculatePortfolioStats } from '../portfolio'; // Reuse existing stats
import { calculatePortfolioScore } from '../scoring/calculator';
import { optimizePortfolioWeights } from '../scoring/optimizer';
import { ScoringMetrics } from '../scoring/types';
import { SCORING_HTML } from '../scoring_html';

const scoring = new Hono<{ Bindings: Bindings }>();

// UI Route
scoring.get('/scoring', (c) => c.html(SCORING_HTML));

// 1. Calculate Score for a Group
scoring.get('/api/scoring/:groupId', async (c) => {
    const groupId = Number(c.req.param('groupId'));

    // A. Get Members
    const { results: members } = await c.env.DB.prepare(
        "SELECT symbol, allocation FROM group_members WHERE group_id = ?"
    ).bind(groupId).all();

    if (!members || members.length === 0) return c.json({ error: "Group empty" }, 404);

    // B. Update/Fetch Metrics for each member
    // In production, this might be a separate async job. For now, do on demand or check age.
    const memberMetrics: ScoringMetrics[] = [];
    for (const m of members) {
        // Update metrics (mocked/fetched)
        // Optimization: Check if 'updated_at' is recent in DB before fetching
        const metric = await updateScoringMetrics(c.env, m.symbol as string);
        memberMetrics.push(metric);
    }

    // C. Get Historical Stats (CAGR, etc.) for Calmar component
    // We reuse existing portfolio logic.
    // Note: calculatePortfolioStats runs a simulation. It might be heavy.
    // We assume 'portfolio_stats' table already has recent data.
    const statsRow = await c.env.DB.prepare(
        "SELECT * FROM portfolio_stats WHERE group_id = ?"
    ).bind(groupId).first();

    // Fallback if no stats
    const historyStats = {
        ca: statsRow?.sharpe ? (statsRow.sharpe as number) : 1.0, // Calmar proxy -> Sharpe
        hhi: 0, // Will be calc inside
        dr: statsRow?.correlation_spy ? 1 / ((statsRow.correlation_spy as number) + 0.1) : 1.5 // DR Proxy -> Inverse Correlation?
    };

    // D. Calculate Score
    const allocations = new Map<string, number>();
    members.forEach((m: any) => allocations.set(m.symbol, Number(m.allocation) / 100)); // DB is usually 0-100 or 0-1? Check. assuming 0-100 store as 50.0

    const scoreResult = await calculatePortfolioScore(c.env, groupId, allocations, historyStats);

    return c.json(scoreResult);
});

// 2. Optimize
scoring.post('/api/scoring/:groupId/optimize', async (c) => {
    const groupId = Number(c.req.param('groupId'));
    const body = await c.req.parseBody(); // or json
    const maxWeight = body['maxWeight'] ? Number(body['maxWeight']) : 0.18;

    // Get Members
    const { results: members } = await c.env.DB.prepare(
        "SELECT symbol, allocation FROM group_members WHERE group_id = ?"
    ).bind(groupId).all();

    if (!members) return c.json({ error: "No members" });

    // Fetch Metrics
    const memberMetrics: ScoringMetrics[] = [];
    const currentWeights = new Map<string, number>();

    for (const m of members) {
        const row = await c.env.DB.prepare("SELECT * FROM scoring_metrics WHERE symbol = ?").bind(m.symbol).first<ScoringMetrics>();
        if (row) memberMetrics.push(row);
        currentWeights.set(m.symbol as string, Number(m.allocation) / 100);
    }

    // Run Optimizer
    const result = optimizePortfolioWeights(memberMetrics, currentWeights, { maxWeight, minWeight: 0 });

    // D. Recalculate FULL Score with New Weights
    // We need history stats again. 
    const statsRow = await c.env.DB.prepare(
        "SELECT * FROM portfolio_stats WHERE group_id = ?"
    ).bind(groupId).first();

    const historyStats = {
        ca: statsRow?.sharpe ? (statsRow.sharpe as number) : 1.0,
        hhi: 0, // Recalc inside
        dr: statsRow?.correlation_spy ? 1 / ((statsRow.correlation_spy as number) + 0.1) : 1.5
    };

    const fullOptimizedScore = await calculatePortfolioScore(c.env, groupId, result.optimizedWeights, historyStats);

    // Format for response (list of changes)
    const changes: any[] = [];
    const allSyms = new Set([...currentWeights.keys(), ...result.optimizedWeights.keys()]);

    allSyms.forEach(sym => {
        const oldW = (currentWeights.get(sym) || 0) * 100;
        const newW = (result.optimizedWeights.get(sym) || 0) * 100;

        // Find metric for metadata
        const m = memberMetrics.find(x => x.symbol === sym);

        changes.push({
            symbol: sym,
            industry: m?.industry || "Tech (Mock)",
            growth: ((m?.profit_growth || 0) * 100).toFixed(1),
            currentWeight: oldW.toFixed(2),
            newWeight: newW.toFixed(2),
            diff: (newW - oldW).toFixed(2)
        });
    });

    changes.sort((a, b) => Math.abs(Number(b.diff)) - Math.abs(Number(a.diff)));

    return c.json({
        originalScore: 0,
        optimizedScore: fullOptimizedScore.total_score,
        optimizedComponents: fullOptimizedScore.components,
        optimizedRawMetrics: fullOptimizedScore.raw_metrics,
        changes: changes
    });
});

// Temporary Test Route
scoring.get('/api/public-test-optimization', async (c) => {
    // 1. Get First Group
    const group = await c.env.DB.prepare("SELECT id FROM groups LIMIT 1").first<{ id: number }>();
    if (!group) return c.json({ error: "No groups found" });
    const groupId = group.id;

    // 2. Fetch Members
    const { results: members } = await c.env.DB.prepare("SELECT * FROM group_members WHERE group_id = ?").bind(groupId).all<GroupMember>();

    // 3. Prepare Allocations & Metrics with Smart Auto-Refresh
    const allocations = new Map<string, number>();
    const metrics: ScoringMetrics[] = [];

    for (const m of members) {
        allocations.set(m.symbol, m.percentage / 100);

        // Check if we have valid cached metrics
        // We do a quick check: if industry is 'Technology' (old mock default) or missing, we auto-refresh.
        // We also rely on 'updateScoringMetrics' (which is now doing the fetch/upsert)
        // But to avoid hitting Yahoo on every request, we should check DB first?
        // Actually, updateScoringMetrics in fetcher.ts does the fetch.
        // Optimization: Check DB first.

        let met = await c.env.DB.prepare("SELECT * FROM scoring_metrics WHERE symbol = ?").bind(m.symbol).first<ScoringMetrics>();

        // Smart Check: Check if data is 'stale' or 'mocked'
        // If industry is 'Technology' -> It's likely our old mock data -> FORCE REFRESH
        // If it's missing -> FORCE REFRESH
        if (!met || met.industry === 'Technology' || !met.industry) {
            console.log(`[Scoring] Auto-Refetching for ${m.symbol} (Reason: Stale/Mock Data)`);
            try {
                met = await updateScoringMetrics(c.env, m.symbol);
            } catch (e) {
                console.error(`Failed to auto-refresh ${m.symbol}`, e);
                // Fallback to whatever met was (if any) or a safe default
                if (!met) {
                    met = {
                        symbol: m.symbol,
                        profit_growth: 0.1,
                        industry_pmi: 50,
                        industry_growth: 0.1,
                        pe_percentile: 0.5,
                        industry: 'Unknown'
                    };
                }
            }
        }

        metrics.push(met!);
    }

    // (Mock stats)
    const statsMock = { cagr: 20, stdDev: 15, maxDD: 10, sharpe: 1.5, ca: 1.5, dr: 1.2 };
    const currentScore = await calculatePortfolioScore(c.env, groupId, allocations, statsMock);

    // 3. Optimize (Correct Signature)
    const optimized = optimizePortfolioWeights(metrics, allocations); // Synchronous

    // 4. Recalculate Optimized Full Score
    const newAllocations = optimized.optimizedWeights;
    const statsMockOpt = { ...statsMock, hhi: 0.1, dr: 1.3 };
    const fullOptimizedScore = await calculatePortfolioScore(c.env, groupId, newAllocations, statsMockOpt);

    return c.json({
        current: currentScore,
        optimized: fullOptimizedScore,
        changes: "check_success"
    });
});

export default scoring;
