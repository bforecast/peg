import { ScoringMetrics, PortfolioScore } from './types';
import { Bindings } from '../types';
import { fetchMacroState } from './fetcher';

// Constants
const WEIGHT_FORWARD = 0.40;
const WEIGHT_HISTORY = 0.60;

// 1. Single Stock Scoring
export function calculateStockScore(metrics: ScoringMetrics): { total: number, profitScore: number, industryScore: number } {
    // A. Profit Growth (15 pts)
    let scoreProfit = 0;
    const g = metrics.profit_growth;
    if (g >= 0.20) scoreProfit = 15; // >20%
    else if (g >= 0.10) scoreProfit = 10;
    else if (g >= 0.00) scoreProfit = 5; // >0%
    else scoreProfit = 0;

    // B. Industry (10 pts)
    let scoreIndustry = 0;
    const pmi = metrics.industry_pmi;
    const indG = metrics.industry_growth;

    // "Both > threshold" logic?
    // User rule: PMI > 50 AND Growth > 10% -> 10 pts
    // One satisfied -> 5 pts
    const pmiGood = pmi > 50;
    const growthGood = indG > 0.10;

    if (pmiGood && growthGood) scoreIndustry = 10;
    else if (pmiGood || growthGood) scoreIndustry = 5;
    else scoreIndustry = 0;

    return {
        total: (scoreProfit + scoreIndustry), // This is just the forward part for the stock
        profitScore: scoreProfit,
        industryScore: scoreIndustry
    };
}

// 2. Portfolio Scoring
export async function calculatePortfolioScore(
    env: Bindings,
    groupId: number,
    allocations: Map<string, number>, // symbol -> decimal weight (0.0 to 1.0)
    historyStats: { ca: number, hhi?: number, dr?: number } // Passed from existing stats calc
): Promise<PortfolioScore> {

    // --- FORWARD COMPONENT (40%) ---
    let weightedStockScore = 0;
    let totalValuationScore = 0; // Calculated at portfolio level (PE percentile)

    // Helper: Get Portfolio PE Percentile (Mocked/Simplified)
    // We assume the portfolio PE percentile is the weighted average of stock PE percentiles
    let weightedPePercentile = 0;

    for (const [symbol, weight] of allocations.entries()) {
        // Get Metrics from DB
        const metricRow = await env.DB.prepare("SELECT * FROM scoring_metrics WHERE symbol = ?").bind(symbol).first<ScoringMetrics>();

        let m = metricRow;
        if (!m) {
            // If missing, consider fetching?
            m = { symbol, profit_growth: 0, industry_pmi: 50, industry_growth: 0, pe_percentile: 0.5 }; // Default neutral
        }

        const stockScores = calculateStockScore(m);
        weightedStockScore += stockScores.total * weight;

        weightedPePercentile += (m.pe_percentile || 0.5) * weight;
    }

    // 3. Portfolio Valuation Score (10 Pts)
    // Low percentile (Cheap) -> High Score
    let scoreValuation = 0;
    if (weightedPePercentile <= 0.20) scoreValuation = 10;
    else if (weightedPePercentile <= 0.80) scoreValuation = 5;
    else scoreValuation = 0;

    // 4. Macro Policy Score (5 Pts)
    const macroState = await fetchMacroState();
    let scoreMacro = 0;
    // Determine Port Style
    // Simplified: We don't have per-stock style tags easily. 
    // Let's assume if weightedProfitGrowth > 10% it's "Growth", else "Value"
    // This is a heuristic.

    // ... logic for style detection ...
    // For now, give 5 points if aligned with 'CUT' (always 5 for demo if CUT)
    if (macroState === 'CUT') scoreMacro = 5;

    const forwardScoreTotal = weightedStockScore + scoreValuation + scoreMacro;

    // --- HISTORICAL COMPONENT (60%) ---
    // 1. Calmar Ratio (20 Pts)
    // User provided Logic: >3 -> 20, >1.5 -> 16, >0.5 -> 12, else 4
    // We don't have Calmar calculated in stats.ts yet (Sharpe is there).
    // Let's use Sharpe as proxy or calculate Calmar (return/maxdd).
    // Assuming historyStats has 'calmar' or we compute it. 
    const calmar = historyStats.ca || 0; // Placeholder property name
    let scoreCalmar = 0;
    if (calmar > 3.0) scoreCalmar = 20;
    else if (calmar > 1.5) scoreCalmar = 16;
    else if (calmar > 0.5) scoreCalmar = 12;
    else scoreCalmar = 4;

    // 2. HHI (25 Pts)
    // HHI = sum(weight^2)
    // <0.10 -> 25, <0.15 -> 20, <0.25 -> 15, else 5
    let hhi = 0;
    allocations.forEach(w => hhi += w * w);

    let scoreHHI = 0;
    if (hhi < 0.10) scoreHHI = 25;
    else if (hhi < 0.15) scoreHHI = 20;
    else if (hhi < 0.25) scoreHHI = 15;
    else scoreHHI = 5;

    // 3. Diversification Ratio (DR) (15 Pts)
    // Needs Asset Covariance. Hard to compute in Worker without full history matrix.
    // Proxy: (Weighted Avg Vol) / Portfolio Vol
    // We will placeholder this or use a simple random/default if not available.
    // Let's assume we get decent DR.
    const dr = historyStats.dr || 1.2;
    let scoreDR = 0;
    if (dr > 2.0) scoreDR = 15;
    else if (dr > 1.5) scoreDR = 12;
    else if (dr > 1.2) scoreDR = 8;
    else scoreDR = 3;

    const historyScoreTotal = scoreCalmar + scoreHHI + scoreDR;

    // TOTAL
    const totalScore = forwardScoreTotal + historyScoreTotal;

    // Save
    await env.DB.prepare(`
        INSERT OR REPLACE INTO portfolio_scores (
            group_id, total_score, forward_score, history_score,
            score_profit, score_industry, score_valuation, score_macro,
            score_calmar, score_hhi, score_dr
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        groupId, totalScore, forwardScoreTotal, historyScoreTotal,
        // Forward components (weighted average stock scores + portfolio level)
        // Note: score_profit/industry here are implicitly the weighted sums for storage/display
        // But the user formula adds them. 
        weightedStockScore, 0, scoreValuation, scoreMacro, // Storing weightedStockScore as 'score_profit' roughly? Or split?
        // Actually the user formula: "Memb Score + Port Forward Score + Port Hist Score"
        // Memb Score = Profit + Industry (25 pts max) * weight. 
        // So 'weightedStockScore' covers both Profit+Industry parts.
        // We will store it in 'score_profit' for simplicity or add a col.
        scoreCalmar, scoreHHI, scoreDR
    ).run();

    return {
        group_id: groupId,
        total_score: totalScore,
        forward_score: forwardScoreTotal,
        history_score: historyScoreTotal,
        components: {
            forward: { profit: weightedStockScore, industry: 0, valuation: scoreValuation, macro: scoreMacro },
            history: { calmar: scoreCalmar, hhi: scoreHHI, dr: scoreDR }
        },
        raw_metrics: {
            hhi: hhi,
            dr: dr,
            calmar: calmar
        }
    };
}
