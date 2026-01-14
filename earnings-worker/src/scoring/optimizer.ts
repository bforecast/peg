/**
 * Scheme B: 分层优化 - 三阶段保守调仓
 * 
 * Phase 1: Performance 指标保护
 *   - 检查 σ_p, DR, MaxDD, Sharpe
 *   - 如果不健康，调整权重改善
 * 
 * Phase 2: Holdings Quality 优化（约束下）
 *   - 仅当 Phase 1 通过时执行
 *   - 约束: σ_p 增加 ≤ 1%, DR ≥ 95% 当前
 *   - 位置上限 35%, 调仓限制 ±15%
 * 
 * Phase 3: 总分验证 & 决策
 *   - 总分改善 ≥ 0.3 分才推荐调仓
 *   - 否则保持当前权重
 */

export interface StockOptInput {
    symbol: string;
    score: number;           // 单股总评分 (0-100)
    volatility: number;      // 年化波动率
    weight: number;          // 当前权重 (0-1)
}

export interface OptimizationConfig {
    // Phase 1 thresholds
    max_sigma: number;           // 最大波动率 (default: 0.22)
    min_dr: number;              // 最小分散化比率 (default: 1.35)
    max_dd_limit: number;        // 最大回撤限制 (default: -0.15)
    min_perf_score: number;      // 最小表现评分 (default: 65)

    // Phase 2 constraints
    max_sigma_increase: number;  // σ_p 最大增加 (default: 0.01)
    min_dr_ratio: number;        // DR 不低于当前的比例 (default: 0.95)
    position_cap: number;        // 单头寸上限 (default: 0.35)
    temperature: number;         // Softmax 温度 (default: 3.0)
    rebalance_limit: number;     // 调仓幅度 (default: 0.15)

    // Phase 3 thresholds
    hq_improvement_threshold: number;  // HQ 改善阈值 (default: 2.0)
    total_score_threshold: number;     // 总分改善阈值 (default: 0.3)
}

export interface OptimizationResult {
    recommendation: 'REBALANCE' | 'HOLD' | 'PROTECT';
    reason: string;

    // Score changes
    totalScoreOld: number;
    totalScoreNew: number;
    totalScoreChange: number;
    hqGain: number;
    perfScoreChange: number;

    // Weights
    newWeights: Map<string, number>;
    changes: Array<{
        symbol: string;
        oldWeight: number;
        newWeight: number;
        change: number;
        action: 'INC' | 'DEC' | 'HOLD';
    }>;

    // Phase details
    phase1Status: 'HEALTHY' | 'PROTECTING';
    phase1Action?: string;
    phase2Feasible: boolean;
}

const DEFAULT_CONFIG: OptimizationConfig = {
    // Phase 1
    max_sigma: 0.30,         // Allow higher volatility for growth portfolios
    min_dr: 1.20,
    max_dd_limit: -0.25,
    min_perf_score: 55,

    // Phase 2
    max_sigma_increase: 0.02,
    min_dr_ratio: 0.90,
    position_cap: 0.35,
    temperature: 3.0,
    rebalance_limit: 0.15,

    // Phase 3
    hq_improvement_threshold: 2.0,
    total_score_threshold: 0.3
};

// ============================================================
// Phase 1: Performance Protection
// ============================================================

interface PerformanceMetrics {
    sigma_p: number;
    dr: number;
    hhi: number;
    perfScore: number;
}

function calculatePerformanceMetrics(
    weights: number[],
    stocks: StockOptInput[]
): PerformanceMetrics {
    const n = weights.length;

    // Weighted portfolio volatility (simplified - assumes no correlation)
    let weightedVol = 0;
    for (let i = 0; i < n; i++) {
        weightedVol += weights[i] * stocks[i].volatility;
    }
    const sigma_p = weightedVol;

    // Portfolio variance (simplified)
    let portVariance = 0;
    for (let i = 0; i < n; i++) {
        portVariance += Math.pow(weights[i] * stocks[i].volatility, 2);
    }
    const sigma_p_actual = Math.sqrt(portVariance);

    // Diversification Ratio = Σ(w×σ) / σ_portfolio
    const dr = sigma_p_actual > 0 ? weightedVol / sigma_p_actual : 1.0;

    // HHI concentration
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);

    // Performance score (simplified)
    let volScore = 50;
    if (sigma_p < 0.15) volScore = 85;
    else if (sigma_p < 0.22) volScore = 70;
    else if (sigma_p < 0.30) volScore = 55;
    else if (sigma_p < 0.40) volScore = 40;
    else volScore = 25;

    let drScore = 50;
    if (dr >= 1.5) drScore = 90;
    else if (dr >= 1.3) drScore = 75;
    else if (dr >= 1.2) drScore = 60;
    else drScore = 40;

    let hhiScore = 50;
    if (hhi < 0.10) hhiScore = 90;
    else if (hhi < 0.15) hhiScore = 70;
    else if (hhi < 0.25) hhiScore = 50;
    else hhiScore = 30;

    const perfScore = 0.40 * volScore + 0.30 * drScore + 0.30 * hhiScore;

    return { sigma_p, dr, hhi, perfScore };
}

function checkPerformanceHealth(
    metrics: PerformanceMetrics,
    config: OptimizationConfig
): { isHealthy: boolean; issues: string[]; issueType: string } {
    const issues: string[] = [];
    let issueType = 'healthy';

    if (metrics.sigma_p > config.max_sigma) {
        issues.push(`High volatility: ${(metrics.sigma_p * 100).toFixed(1)}% > ${(config.max_sigma * 100).toFixed(0)}%`);
        issueType = 'volatility';
    }

    if (metrics.dr < config.min_dr) {
        issues.push(`Low diversification: DR=${metrics.dr.toFixed(2)} < ${config.min_dr.toFixed(2)}`);
        issueType = 'diversification';
    }

    if (metrics.hhi > 0.25) {
        issues.push(`High concentration: HHI=${(metrics.hhi * 100).toFixed(1)}% > 25%`);
        issueType = 'concentration';
    }

    return {
        isHealthy: issues.length === 0,
        issues,
        issueType
    };
}

function reduceConcentration(weights: number[], stocks: StockOptInput[]): number[] {
    const n = weights.length;
    let newW = [...weights];

    // Find highest weight positions and reduce them
    const sorted = stocks.map((s, i) => ({ idx: i, w: weights[i], vol: s.volatility }))
        .sort((a, b) => b.w - a.w);

    // Reduce top 2 positions by 5% each
    for (let k = 0; k < Math.min(2, sorted.length); k++) {
        const idx = sorted[k].idx;
        if (newW[idx] > 0.15) {
            newW[idx] -= 0.05;
        }
    }

    // Increase smallest positions
    const smallest = stocks.map((s, i) => ({ idx: i, w: weights[i] }))
        .sort((a, b) => a.w - b.w);

    for (let k = 0; k < Math.min(3, smallest.length); k++) {
        const idx = smallest[k].idx;
        newW[idx] += 0.02;
    }

    // Normalize
    const sum = newW.reduce((a, b) => a + b, 0);
    return newW.map(w => Math.max(0, w) / sum);
}

// ============================================================
// Phase 2: Constrained HQ Optimization
// ============================================================

function computeSoftmax(scores: number[], temperature: number): number[] {
    const maxScore = Math.max(...scores);
    const scaled = scores.map(s => (s - maxScore) / temperature);
    const expScaled = scaled.map(x => Math.exp(x));
    const sumExp = expScaled.reduce((a, b) => a + b, 0);
    return expScaled.map(e => e / sumExp);
}

function applyPositionCap(idealW: number[], cap: number): number[] {
    let w = [...idealW];
    for (let iter = 0; iter < 10; iter++) {
        w = w.map(x => Math.min(x, cap));
        const sum = w.reduce((a, b) => a + b, 0);
        w = w.map(x => x / sum);
        if (w.every(x => x <= cap + 0.001)) break;
    }
    return w;
}

function applyRebalanceLimit(idealW: number[], oldW: number[], limit: number): number[] {
    const n = idealW.length;
    const constrained = new Array(n);
    for (let i = 0; i < n; i++) {
        const minAllowed = oldW[i] - limit;
        const maxAllowed = oldW[i] + limit;
        constrained[i] = Math.max(0, Math.max(minAllowed, Math.min(maxAllowed, idealW[i])));
    }
    const sum = constrained.reduce((a, b) => a + b, 0);
    return constrained.map(w => w / sum);
}

function constrainedOptimization(
    oldW: number[],
    stocks: StockOptInput[],
    scores: number[],
    currentMetrics: PerformanceMetrics,
    config: OptimizationConfig
): { newWeights: number[]; hqGain: number; feasible: boolean; perfChange: number } {

    // Softmax ideal weights
    const idealW = computeSoftmax(scores, config.temperature);

    // Apply position cap
    const cappedW = applyPositionCap(idealW, config.position_cap);

    // Apply rebalance limit
    let finalW = applyRebalanceLimit(cappedW, oldW, config.rebalance_limit);

    // Check constraints
    const newMetrics = calculatePerformanceMetrics(finalW, stocks);
    const sigmaIncrease = newMetrics.sigma_p - currentMetrics.sigma_p;
    const drRatio = currentMetrics.dr > 0 ? newMetrics.dr / currentMetrics.dr : 1;

    let feasible = true;

    // If volatility increased too much, adjust
    if (sigmaIncrease > config.max_sigma_increase) {
        // Reduce high-vol stocks
        for (let i = 0; i < stocks.length; i++) {
            if (stocks[i].volatility > 0.30) {
                finalW[i] *= 0.92;
            } else if (stocks[i].volatility < 0.15) {
                finalW[i] *= 1.03;
            }
        }
        const sum = finalW.reduce((a, b) => a + b, 0);
        finalW = finalW.map(w => w / sum);
        feasible = false;
    }

    // If DR dropped too much, reduce concentration
    if (drRatio < config.min_dr_ratio) {
        finalW = reduceConcentration(finalW, stocks);
        feasible = false;
    }

    // Calculate HQ gain
    const hqOld = oldW.reduce((sum, w, i) => sum + w * scores[i], 0);
    const hqNew = finalW.reduce((sum, w, i) => sum + w * scores[i], 0);
    const hqGain = hqNew - hqOld;

    // Recalculate perf change
    const finalMetrics = calculatePerformanceMetrics(finalW, stocks);
    const perfChange = finalMetrics.perfScore - currentMetrics.perfScore;

    return { newWeights: finalW, hqGain, feasible, perfChange };
}

// ============================================================
// Phase 3: Total Score Verification
// ============================================================

function verifyTotalScore(
    oldW: number[],
    newW: number[],
    stocks: StockOptInput[],
    scores: number[],
    hqGain: number,
    perfChange: number,
    config: OptimizationConfig
): { recommendation: 'REBALANCE' | 'HOLD'; totalScoreOld: number; totalScoreNew: number; reason: string } {

    // Calculate old HQ and perf
    const hqOld = oldW.reduce((sum, w, i) => sum + w * scores[i], 0);
    const oldMetrics = calculatePerformanceMetrics(oldW, stocks);

    // Calculate new HQ and perf from NEW WEIGHTS (ignore passed deltas for accuracy)
    const hqNew = newW.reduce((sum, w, i) => sum + w * scores[i], 0);
    const newMetrics = calculatePerformanceMetrics(newW, stocks);
    const newPerfScore = newMetrics.perfScore;

    // Recalculate deltas for reason string
    const actualHqGain = hqNew - hqOld;
    const actualPerfChange = newPerfScore - oldMetrics.perfScore;

    // Total scores (65% Performance + 35% Holdings)
    const totalScoreOld = 0.65 * oldMetrics.perfScore + 0.35 * hqOld;
    const totalScoreNew = 0.65 * newPerfScore + 0.35 * hqNew;
    const totalScoreChange = totalScoreNew - totalScoreOld;

    let recommendation: 'REBALANCE' | 'HOLD' = 'HOLD';
    let reason = '';

    // Decision logic
    if (actualHqGain >= config.hq_improvement_threshold && totalScoreChange >= config.total_score_threshold) {
        recommendation = 'REBALANCE';
        reason = `Total score improved by ${totalScoreChange.toFixed(2)} points (HQ +${actualHqGain.toFixed(2)}, Perf ${actualPerfChange >= 0 ? '+' : ''}${actualPerfChange.toFixed(2)})`;
    } else if (totalScoreChange < config.total_score_threshold) {
        recommendation = 'HOLD';
        reason = `Total score change (${totalScoreChange >= 0 ? '+' : ''}${totalScoreChange.toFixed(2)}) below threshold (${config.total_score_threshold}). Not worth rebalancing.`;
    } else {
        recommendation = 'HOLD';
        reason = `HQ improvement (+${actualHqGain.toFixed(2)}) below threshold (${config.hq_improvement_threshold}). Keep current weights.`;
    }

    return { recommendation, totalScoreOld, totalScoreNew, reason };
}

// ============================================================
// Main Optimization Function
// ============================================================

export function optimizePortfolioWeights(
    stocks: StockOptInput[],
    config: Partial<OptimizationConfig> = {}
): OptimizationResult {
    const cfg: OptimizationConfig = { ...DEFAULT_CONFIG, ...config };
    const n = stocks.length;

    if (n === 0) {
        return {
            recommendation: 'HOLD',
            reason: 'Empty portfolio',
            totalScoreOld: 0,
            totalScoreNew: 0,
            totalScoreChange: 0,
            hqGain: 0,
            perfScoreChange: 0,
            newWeights: new Map(),
            changes: [],
            phase1Status: 'HEALTHY',
            phase2Feasible: false
        };
    }

    const scores = stocks.map(s => s.score);
    const oldWeights = stocks.map(s => s.weight);

    // Normalize weights
    const weightSum = oldWeights.reduce((a, b) => a + b, 0);
    const normalizedOldW = weightSum > 0 ? oldWeights.map(w => w / weightSum) : oldWeights;

    // =====================================================
    // PHASE 1: Performance Protection
    // =====================================================
    const currentMetrics = calculatePerformanceMetrics(normalizedOldW, stocks);
    const healthCheck = checkPerformanceHealth(currentMetrics, cfg);

    let phase1Weights = normalizedOldW;
    let phase1Status: 'HEALTHY' | 'PROTECTING' = 'HEALTHY';
    let phase1Action: string | undefined;

    if (!healthCheck.isHealthy) {
        phase1Status = 'PROTECTING';
        phase1Action = `Fixing: ${healthCheck.issues.join('; ')}`;
        phase1Weights = reduceConcentration(normalizedOldW, stocks);
    }

    // =====================================================
    // PHASE 2: Constrained HQ Optimization
    // =====================================================
    let phase2Result = { newWeights: phase1Weights, hqGain: 0, feasible: true, perfChange: 0 };

    if (phase1Status === 'HEALTHY') {
        phase2Result = constrainedOptimization(
            phase1Weights,
            stocks,
            scores,
            currentMetrics,
            cfg
        );
    }

    // =====================================================
    // PHASE 3: Total Score Verification
    // =====================================================
    const verifyResult = verifyTotalScore(
        normalizedOldW,
        phase2Result.newWeights,
        stocks,
        scores,
        phase2Result.hqGain,
        phase2Result.perfChange,
        cfg
    );

    // Build final result
    let recommendation = verifyResult.recommendation;
    let finalWeights = phase2Result.newWeights;

    if (phase1Status === 'PROTECTING') {
        recommendation = 'PROTECT';
        finalWeights = phase1Weights;
    }

    // CRITICAL: Never recommend a downgrade
    // If the optimization (PROTECT or REBALANCE) results in a lower score, revert to HOLD.
    // We allow a tiny floating point tolerance err (0.01)
    if (verifyResult.totalScoreNew < verifyResult.totalScoreOld - 0.01) {
        recommendation = 'HOLD';
        finalWeights = normalizedOldW; // Revert weights to original
        verifyResult.reason = `Optimization would reduce score (${verifyResult.totalScoreNew.toFixed(1)} < ${verifyResult.totalScoreOld.toFixed(1)}). keeping current.`;
        verifyResult.totalScoreNew = verifyResult.totalScoreOld;
        verifyResult.recommendation = 'HOLD';
        phase1Status = 'HEALTHY'; // Reset status since we are ignoring the protection
        phase1Action = undefined;
    }

    // Build changes array
    const newWeightsMap = new Map<string, number>();
    const changes: OptimizationResult['changes'] = [];

    for (let i = 0; i < n; i++) {
        const symbol = stocks[i].symbol;
        const oldW = normalizedOldW[i];
        const newW = finalWeights[i];
        const change = newW - oldW;

        newWeightsMap.set(symbol, newW);
        changes.push({
            symbol,
            oldWeight: oldW,
            newWeight: newW,
            change,
            action: change > 0.001 ? 'INC' : (change < -0.001 ? 'DEC' : 'HOLD')
        });
    }

    // Sort by absolute change
    changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    return {
        recommendation,
        reason: phase1Status === 'PROTECTING' ? (phase1Action || 'Protective adjustments applied') : verifyResult.reason,
        totalScoreOld: verifyResult.totalScoreOld,
        totalScoreNew: verifyResult.totalScoreNew,
        totalScoreChange: verifyResult.totalScoreNew - verifyResult.totalScoreOld,
        hqGain: finalWeights.reduce((sum, w, i) => sum + w * scores[i], 0) - normalizedOldW.reduce((sum, w, i) => sum + w * scores[i], 0), // Recalculate HQ gain based on final weights
        perfScoreChange: 0, // Simplified, we only track HQ change accurately here if reverted
        newWeights: newWeightsMap,
        changes,
        phase1Status,
        phase1Action,
        phase2Feasible: phase2Result.feasible
    };
}
