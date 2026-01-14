import { Hono } from 'hono';
import { Bindings } from '../types';
import { calculatePortfolioScore, fetchStockMetricsForScoring, calculateStockScore } from '../scoring/calculator';
import { optimizePortfolioWeights, StockOptInput } from '../scoring/optimizer';
import { SCORING_HTML } from '../scoring_html';

const scoring = new Hono<{ Bindings: Bindings }>();

// UI Route
scoring.get('/scoring', (c) => c.html(SCORING_HTML));

// 1. Calculate Score for a Group
scoring.get('/api/scoring/:groupId', async (c) => {
    const groupId = Number(c.req.param('groupId'));

    try {
        const stocks = await fetchStockMetricsForScoring(c.env, groupId);

        if (stocks.length === 0) {
            return c.json({ error: "Group empty or no valid price data" }, 404);
        }

        const scoreResult = await calculatePortfolioScore(c.env, groupId, stocks);
        return c.json(scoreResult);
    } catch (e) {
        console.error('[Scoring] Error:', e);
        return c.json({ error: "Failed to calculate score" }, 500);
    }
});

// 2. Optimize using Scheme B (3-phase hierarchical optimization)
scoring.post('/api/scoring/:groupId/optimize', async (c) => {
    const groupId = Number(c.req.param('groupId'));

    try {
        // Get stock data and calculate scores
        const stocks = await fetchStockMetricsForScoring(c.env, groupId);

        if (stocks.length === 0) {
            return c.json({ error: "No valid stocks" }, 404);
        }

        // Calculate current score (Force Runtime calc to ensure consistent comparison with Optimized)
        const currentScore = await calculatePortfolioScore(c.env, groupId, stocks, false);

        // Build optimizer input
        const optInput: StockOptInput[] = currentScore.stock_details.map(detail => ({
            symbol: detail.symbol,
            score: detail.score,
            volatility: detail.raw.volatility,
            weight: detail.weight
        }));

        // Run Scheme B 3-phase optimization
        const optResult = optimizePortfolioWeights(optInput);

        // Build optimized stocks for recalculation
        const optimizedStocks = stocks.map(s => ({
            ...s,
            weight: optResult.newWeights.get(s.symbol) || s.weight
        }));

        // Recalculate with new weights using the FULL scoring formula (Runtime)
        const optimizedScore = await calculatePortfolioScore(c.env, groupId, optimizedStocks, false);

        // Calculate ACTUAL score changes (using real scores, not optimizer estimates)
        const actualTotalChange = optimizedScore.total_score - currentScore.total_score;
        const actualHqChange = optimizedScore.holdings_score - currentScore.holdings_score;
        const actualPerfChange = optimizedScore.performance_score - currentScore.performance_score;

        // Override recommendation based on ACTUAL score improvement
        let recommendation = optResult.recommendation;
        let reason = optResult.reason;

        const TOTAL_SCORE_THRESHOLD = 0.3;
        const HQ_THRESHOLD = 2.0;

        if (optResult.phase1Status === 'PROTECTING') {
            // Keep PROTECT status
            recommendation = 'PROTECT';
        } else if (actualTotalChange >= TOTAL_SCORE_THRESHOLD && actualHqChange >= HQ_THRESHOLD) {
            recommendation = 'REBALANCE';
            reason = `Total score improved by ${actualTotalChange.toFixed(2)} points (HQ +${actualHqChange.toFixed(2)}, Perf ${actualPerfChange >= 0 ? '+' : ''}${actualPerfChange.toFixed(2)})`;
        } else if (actualTotalChange < TOTAL_SCORE_THRESHOLD) {
            recommendation = 'HOLD';
            reason = `Total score change (${actualTotalChange >= 0 ? '+' : ''}${actualTotalChange.toFixed(2)}) below threshold (${TOTAL_SCORE_THRESHOLD}). Not worth rebalancing.`;
        } else {
            recommendation = 'HOLD';
            reason = `HQ improvement (+${actualHqChange.toFixed(2)}) below threshold (${HQ_THRESHOLD}). Keep current weights.`;
        }

        // Format changes for UI
        const changes = optResult.changes.map(ch => ({
            symbol: ch.symbol,
            score: optInput.find(s => s.symbol === ch.symbol)?.score.toFixed(1) || '0',
            currentWeight: (ch.oldWeight * 100).toFixed(2),
            newWeight: (ch.newWeight * 100).toFixed(2),
            diff: (ch.change * 100).toFixed(2),
            action: ch.action
        }));

        return c.json({
            // Recommendation (using actual scores)
            recommendation,
            reason,

            // Score comparison (actual values)
            originalScore: currentScore.total_score,
            optimizedScore: optimizedScore.total_score,
            totalScoreChange: actualTotalChange,

            // Component scores
            optimizedPerfScore: optimizedScore.performance_score,
            optimizedHqScore: optimizedScore.holdings_score,

            // HQ changes (actual values)
            hqGain: actualHqChange,
            perfScoreChange: actualPerfChange,

            // Components for radar
            optimizedComponents: optimizedScore.components,
            optimizedRawMetrics: optimizedScore.raw_metrics,

            // Phase info
            phase1Status: optResult.phase1Status,
            phase1Action: optResult.phase1Action,
            phase2Feasible: optResult.phase2Feasible,

            // Weight changes
            changes
        });
    } catch (e) {
        console.error('[Scoring] Optimization Error:', e);
        return c.json({ error: "Failed to optimize" }, 500);
    }
});

export default scoring;
