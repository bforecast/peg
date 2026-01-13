import { ScoringMetrics } from './types';
import { calculateStockScore } from './calculator';

// Optimization Constraints
interface Constraints {
    maxWeight: number; // e.g. 0.18 (18%)
    minWeight: number; // e.g. 0.03 (3%) for active positions
}

export interface OptimizationResult {
    optimizedWeights: Map<string, number>;
    originalScore: number;
    optimizedScore: number;
}

/**
 * Optimizes portfolio weights to maximize the 'Forward Score' (Profit + Industry + Valuation + Macro).
 * Note: Historical score (Calmar, HHI) depends on past price volatility which is hard to predict with weight changes 
 * efficiently in this loop without re-running full backtest. 
 * 
 * SIMPLIFICATION: We will maximize the weighted sum of Stock Scores (Profit + Industry)
 * subject to constraints. This is a Linear Programming problem.
 * Maximize sum(w_i * S_i)
 * Subject to:
 * sum(w_i) = 1
 * 0 <= w_i <= maxWeight
 */
// Helper: Get HHI Points (Duplicate of calculator logic to avoid import cycle)
function getHHIPoints(hhi: number): number {
    if (hhi < 0.10) return 25;
    if (hhi < 0.15) return 20;
    if (hhi < 0.25) return 15;
    return 5;
}

/**
 * Optimizes weights to MAXIMIZE TOTAL SCORE (Forward + History).
 * 
 * Strategy: "Iterative HHI-Constraint Scan"
 * Since HHI penalty is discrete (step-function), we run the Greedy Forward optimization 
 * with varying 'MaxWeight' caps.
 * 
 * We test MaxWeight = [0.18, 0.15, 0.12, 0.10, 0.08, 0.06]
 * 
 * For each cap:
 *   1. Calculate Best Forward Score (Greedy Alloc)
 *   2. Calculate resulting HHI & HHI Score
 *   3. Sum them up (Forward + HHI Score) = Objective
 *   4. Pick the cap that gives the highest Objective.
 */
export function optimizePortfolioWeights(
    metrics: ScoringMetrics[],
    currentWeights: Map<string, number>,
    constraints: Constraints = { maxWeight: 0.18, minWeight: 0.0 }
): OptimizationResult {
    const symbols = metrics.map(m => m.symbol);

    // 1. Calculate Stock Scores (Utility)
    // S_i = ProfitScore + IndustryScore (See calculator.ts)
    // We recreate the logic roughly here or just use the pre-calculated one if available.
    // Ideally we should import calculateStockScore but careful of deps.
    const scores = metrics.map(m => {
        const s = calculateStockScore(m);
        return { symbol: m.symbol, score: s.total };
    });
    scores.sort((a, b) => b.score - a.score); // Descending

    // Candidate Max Weights to scan
    // We start with user constraint, then try tightening it to improve diversity
    const userMax = constraints.maxWeight;
    const candidates = [userMax, 0.15, 0.12, 0.10, 0.08, 0.06].filter(c => c <= userMax);
    // allow duplicates? Set unique?
    const uniqueCandidates = [...new Set(candidates)].sort((a, b) => b - a);

    let bestResult: { weights: Map<string, number>, totalObj: number } | null = null;

    for (const cap of uniqueCandidates) {
        // Run Greedy with this cap
        const newWeights = new Map<string, number>();
        symbols.forEach(s => newWeights.set(s, 0));

        let remainingCap = 1.0;
        for (const item of scores) {
            if (remainingCap <= 0.0001) break;
            const alloc = Math.min(remainingCap, cap);
            newWeights.set(item.symbol, alloc);
            remainingCap -= alloc;
        }

        // Calculate Derived Metrics
        // A. Forward Score (Weighted Sum of Stock Scores)
        // Score = Sum(w * s) 
        // Note: The logic in calculator.ts also adds 'Valuation' and 'Macro'. 
        // Those are constant for the portfolio?
        // Valuation depends on weighted PE. Assume constant for simplification or similar direction.
        // We maximize the Stock Portion of Forward Score.
        const fwdScorePart = scores.reduce((sum, item) => sum + (newWeights.get(item.symbol) || 0) * item.score, 0);

        // B. HHI Score
        let hhiVal = 0;
        newWeights.forEach(w => hhiVal += w * w);
        const hhiPts = getHHIPoints(hhiVal);

        const totalObj = fwdScorePart + hhiPts;

        if (!bestResult || totalObj > bestResult.totalObj) {
            bestResult = { weights: newWeights, totalObj };
        }
    }

    // Use the best result
    const finalWeights = bestResult!.weights;

    // Recalculate basic forward score sum for return (not full total)
    const optimizedScore = scores.reduce((sum, item) => sum + (finalWeights.get(item.symbol) || 0) * item.score, 0);

    return {
        optimizedWeights: finalWeights,
        originalScore: 0,
        optimizedScore // This is just the forward component part
    };
}
