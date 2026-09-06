import { Bindings } from '../types';
import { calculatePortfolioScore, fetchStockMetricsForScoring } from './calculator';
import { PortfolioScore } from './types';

export async function archivePortfolioScore(env: Bindings, groupId: number, isWeekly: boolean = false) {
    try {
        // 1. Fetch Inputs
        const stocks = await fetchStockMetricsForScoring(env, groupId);
        if (stocks.length === 0) {
            return;
        }

        // 2. Calculate Score (Use DB stats for consistency with Dashboard)
        const scoreResult = await calculatePortfolioScore(env, groupId, stocks, true);

        // 3. Update 'last_score' in portfolio_stats (preserve existing EST updated_at)
        await env.DB.prepare(`
            UPDATE portfolio_stats 
            SET last_score = ? 
            WHERE group_id = ?
        `).bind(scoreResult.total_score, groupId).run();

        // 4. Archive if Weekly
        if (isWeekly) {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            // Check if already archived for today to avoid duplicates if cron runs multiple times
            const existing = await env.DB.prepare('SELECT id FROM portfolio_score_history WHERE group_id = ? AND date = ?')
                .bind(groupId, today).first();

            if (!existing) {
                const details = JSON.stringify({
                    perf: scoreResult.components.performance,
                    hq: scoreResult.components.holdings
                });

                await env.DB.prepare(`
                    INSERT INTO portfolio_score_history (group_id, date, total_score, perf_score, hq_score, details)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).bind(
                    groupId,
                    today,
                    scoreResult.total_score,
                    scoreResult.performance_score,
                    scoreResult.holdings_score,
                    details
                ).run();
                console.log(`[Archiver] Archived weekly score for Group ${groupId}`);
            }
        }

    } catch (e: any) {
        console.error(`[Archiver] Error processing Group ${groupId}:`, e);
    }
}

export async function updateAllPortfoliosScores(env: Bindings, isWeekly: boolean = false) {
    const { results } = await env.DB.prepare('SELECT id FROM groups').all();
    const groups = results as { id: number }[];

    // console.log(`[Archiver] Updating scores for ${groups.length} portfolios (Weekly: ${isWeekly})`);

    for (const g of groups) {
        await archivePortfolioScore(env, g.id, isWeekly);
    }
}
