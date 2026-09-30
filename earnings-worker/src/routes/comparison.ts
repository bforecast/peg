import { Hono } from 'hono';
import { Bindings } from '../types';
import { runPortfolioComparisonWithJev, PortfolioSummaryForComparison } from '../ai/jev';
import { toFiniteNum, toFiniteNumOrNull } from '../db';

const comparisonRoutes = new Hono<{ Bindings: Bindings }>();

/**
 * Fetch and calculate summary metrics for all active portfolios
 */
export async function fetchAllPortfoliosSummary(db: any): Promise<PortfolioSummaryForComparison[]> {
    // 1. Fetch all groups
    const { results: groups } = await db.prepare(
        'SELECT id, name, description FROM groups ORDER BY id ASC'
    ).all();

    if (!groups || groups.length === 0) {
        return [];
    }

    // 2. Fetch all portfolio stats in one query
    const { results: allStats } = await db.prepare(
        'SELECT group_id, cagr, std_dev, max_drawdown, sharpe, sortino, dr FROM portfolio_stats'
    ).all();
    const statsMap = new Map<number, any>();
    if (allStats) {
        for (const s of allStats) {
            statsMap.set(s.group_id, s);
        }
    }

    // 3. Fetch all group members with quotes & stats
    const { results: allMembers } = await db.prepare(`
        SELECT gm.group_id, gm.symbol, gm.allocation,
               lq.price, lq.forward_pe, lq.eps_current_year, lq.eps_next_year,
               ss.sma_20, ss.sma_50, ss.sma_200, ss.change_1y, ss.rs_rank_1m
        FROM group_members gm
        LEFT JOIN (
            SELECT symbol, price, forward_pe, eps_current_year, eps_next_year,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) as rn
            FROM stock_quotes
            WHERE date >= date('now', '-30 days')
        ) lq ON gm.symbol = lq.symbol AND lq.rn = 1
        LEFT JOIN stock_stats ss ON gm.symbol = ss.symbol
        ORDER BY gm.allocation DESC
    `).all();

    const membersByGroup = new Map<number, any[]>();
    if (allMembers) {
        for (const m of allMembers) {
            if (!membersByGroup.has(m.group_id)) {
                membersByGroup.set(m.group_id, []);
            }
            membersByGroup.get(m.group_id)!.push(m);
        }
    }

    // 4. Assemble summary for each portfolio
    const summaries: PortfolioSummaryForComparison[] = [];

    for (const g of groups) {
        const pStats = statsMap.get(g.id);
        const members = membersByGroup.get(g.id) || [];

        if (members.length === 0) continue; // Skip empty groups

        // Calculate weighted PEG and forward PE
        let totalWeight = 0;
        let weightedPegSum = 0;
        let validPegWeight = 0;
        let weightedPeSum = 0;
        let validPeWeight = 0;
        let above50SmaCount = 0;

        for (const m of members) {
            const alloc = toFiniteNum(m.allocation) || 0;
            totalWeight += alloc;

            // Calculate stock PEG
            const epsC = toFiniteNumOrNull(m.eps_current_year);
            const epsN = toFiniteNumOrNull(m.eps_next_year);
            const fpe = toFiniteNumOrNull(m.forward_pe);

            if (fpe !== null && fpe > 0) {
                weightedPeSum += fpe * alloc;
                validPeWeight += alloc;
            }

            if (epsC !== null && epsN !== null && epsC !== 0 && fpe !== null) {
                const growth = ((epsN - epsC) / Math.abs(epsC)) * 100;
                if (growth > 0 && fpe > 0) {
                    const peg = fpe / growth;
                    if (Number.isFinite(peg) && peg > 0 && peg < 10) {
                        weightedPegSum += peg * alloc;
                        validPegWeight += alloc;
                    }
                }
            }

            const price = toFiniteNumOrNull(m.price);
            const sma50 = toFiniteNumOrNull(m.sma_50);
            if (price !== null && sma50 !== null && price >= sma50) {
                above50SmaCount++;
            }
        }

        const avgPeg = validPegWeight > 0 ? (weightedPegSum / validPegWeight) : null;
        const avgForwardPe = validPeWeight > 0 ? (weightedPeSum / validPeWeight) : null;
        const above50Pct = members.length > 0 ? Math.round((above50SmaCount / members.length) * 100) : 50;

        summaries.push({
            id: g.id,
            name: g.name || `Portfolio ${g.id}`,
            cagr: toFiniteNumOrNull(pStats?.cagr),
            sharpe: toFiniteNumOrNull(pStats?.sharpe),
            sortino: toFiniteNumOrNull(pStats?.sortino),
            maxDrawdown: toFiniteNumOrNull(pStats?.max_drawdown),
            stdDev: toFiniteNumOrNull(pStats?.std_dev),
            avgPeg,
            avgForwardPe,
            holdingsCount: members.length,
            topHoldings: members.slice(0, 4).map(m => ({
                symbol: m.symbol,
                weight: (toFiniteNum(m.allocation) || 0) / (totalWeight || 1)
            })),
            technicalStatus: `${above50Pct}% stocks above 50SMA`
        });
    }

    return summaries;
}

/**
 * API: Get Cross-Portfolio Comparison & Tactical Overweight Recommendation
 */
comparisonRoutes.get('/api/portfolios/cross-comparison', async (c) => {
    try {
        const summaries = await fetchAllPortfoliosSummary(c.env.DB);
        if (summaries.length === 0) {
            return c.json({ error: 'No portfolios with members found.' }, 404);
        }

        const comparison = await runPortfolioComparisonWithJev(c.env.AI, summaries);

        // Add 60s cache
        c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return c.json({
            success: true,
            data: comparison
        });
    } catch (err: any) {
        console.error('[Comparison API] Error:', err);
        return c.json({ error: err.message || 'Internal comparison error' }, 500);
    }
});

export default comparisonRoutes;
