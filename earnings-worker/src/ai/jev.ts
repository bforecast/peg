/**
 * Jev (typesafe/jev) Structured Decision Engine Adapter
 * 
 * Provides type-safe portfolio cross-comparison, dual-track tactical rating
 * (Right-Side Momentum vs. Left-Side Contrarian Dip), and next-week recommendation.
 */

export interface PortfolioSummaryForComparison {
    id: number;
    name: string;
    cagr: number | null;
    sharpe: number | null;
    sortino: number | null;
    maxDrawdown: number | null;
    stdDev: number | null;
    avgPeg: number | null;
    avgForwardPe: number | null;
    holdingsCount: number;
    topHoldings: Array<{ symbol: string; weight: number }>;
    above20Pct?: number | null;
    above50Pct?: number | null;
    avgDelta52w?: number | null;
    epsGrowthPositivePct?: number | null;
    technicalStatus?: string;
}

export interface PortfolioTacticalRating {
    id: number;
    name: string;
    action: 'STRONG_OVERWEIGHT' | 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT';
    actionLabel: string;
    style: 'RIGHT_SIDE_MOMENTUM' | 'LEFT_SIDE_CONTRARIAN' | 'BALANCED' | 'DEFENSIVE' | 'RISK_AVOID';
    styleLabel: string;
    score: number;             // 0 - 100 tactical composite score
    momentumScore: number;     // 0 - 100 right-side trend following score
    contrarianScore: number;   // 0 - 100 left-side oversold value score
    confidence: number;        // 0.0 - 1.0 probability
    reason: string;
    metrics: {
        cagr: number | null;
        sharpe: number | null;
        avgPeg: number | null;
        maxDrawdown: number | null;
        avgForwardPe: number | null;
        above20Pct?: number | null;
        above50Pct?: number | null;
        avgDelta52w?: number | null;
        epsGrowthPositivePct?: number | null;
    };
}

export interface CrossComparisonResult {
    topPick: {
        id: number;
        name: string;
        conviction: string;
        confidence: number;
        headline: string;
        keyDrivers: string[];
        riskWarning: string;
    };
    topMomentumPick?: {
        id: number;
        name: string;
        confidence: number;
        headline: string;
        keyDrivers: string[];
    };
    topContrarianPick?: {
        id: number;
        name: string;
        confidence: number;
        headline: string;
        keyDrivers: string[];
    };
    ratings: PortfolioTacticalRating[];
    evaluatedAt: string;
    engine: 'jev' | 'quant_engine';
    rawJevResponse?: any;
}

/**
 * Execute Jev comparison via Cloudflare Workers AI with resilient fallback
 */
export async function runPortfolioComparisonWithJev(
    ai: any,
    portfolios: PortfolioSummaryForComparison[]
): Promise<CrossComparisonResult> {
    if (!portfolios || portfolios.length === 0) {
        throw new Error('No active portfolios found to compare.');
    }

    // 1. Prepare deterministic dual-track fallback first to ensure 100% reliability
    const fallbackResult = calculateDeterministicComparison(portfolios);

    if (!ai) {
        console.warn('[Jev] env.AI binding missing, returning quant engine comparison.');
        return fallbackResult;
    }

    try {
        console.log(`[Jev] Initiating dual-track portfolio cross-comparison for ${portfolios.length} portfolios...`);

        // Format state payload
        const statePayload = {
            comparison_date: new Date().toISOString().split('T')[0],
            portfolio_count: portfolios.length,
            portfolios: portfolios.map(p => ({
                id: p.id,
                name: p.name,
                cagr_pct: p.cagr !== null ? `${p.cagr.toFixed(1)}%` : 'N/A',
                sharpe_ratio: p.sharpe !== null ? p.sharpe.toFixed(2) : 'N/A',
                max_drawdown_pct: p.maxDrawdown !== null ? `${p.maxDrawdown.toFixed(1)}%` : 'N/A',
                average_forward_peg: p.avgPeg !== null ? p.avgPeg.toFixed(2) : 'N/A',
                above_20_sma_pct: p.above20Pct !== null && p.above20Pct !== undefined ? `${p.above20Pct}%` : 'N/A',
                above_50_sma_pct: p.above50Pct !== null && p.above50Pct !== undefined ? `${p.above50Pct}%` : 'N/A',
                dist_52w_high_pct: p.avgDelta52w !== null && p.avgDelta52w !== undefined ? `${p.avgDelta52w.toFixed(1)}%` : 'N/A',
                holdings_count: p.holdingsCount,
                top_holdings: p.topHoldings.slice(0, 4).map(h => `${h.symbol}(${(h.weight * 100).toFixed(0)}%)`).join(', ')
            }))
        };

        // Construct dynamic choice options with technical + fundamental profiles
        const criteriaMap: Record<string, string> = {};
        for (const p of portfolios) {
            criteriaMap[`p_${p.id}`] = `${p.name}: 20SMA=${p.above20Pct ?? '-'}%, 50SMA=${p.above50Pct ?? '-'}%, 52W距高点=${p.avgDelta52w !== null && p.avgDelta52w !== undefined ? p.avgDelta52w.toFixed(1) + '%' : '-'}, PEG=${p.avgPeg?.toFixed(2) ?? 'N/A'}, Sharpe=${p.sharpe?.toFixed(2) ?? 'N/A'}, MaxDD=${p.maxDrawdown?.toFixed(1) ?? 'N/A'}%`;
        }

        const jevQuestions = {
            top_momentum_pick: {
                type: 'choice',
                instructions: 'Which single portfolio has the strongest right-side trend momentum (high 20SMA & 50SMA ratio, near 52w highs) combined with solid growth and reasonable PEG (0.8-1.5)?',
                criteria: criteriaMap
            },
            top_contrarian_pick: {
                type: 'choice',
                instructions: 'Which single portfolio represents the best left-side contrarian/deep value opportunity (significantly oversold from 52w highs, washed out moving averages, but exceptionally cheap Forward PEG < 0.8 and resilient growth)?',
                criteria: criteriaMap
            }
        };

        const response: any = await ai.run('typesafe/jev', {
            state: JSON.stringify(statePayload),
            questions: jevQuestions
        });

        console.log('[Jev] Raw dual-track response received:', JSON.stringify(response));

        const answers = response?.answers || response?.result?.answers;
        if (answers) {
            let topPick = fallbackResult.topPick;
            let topMomentum = fallbackResult.topMomentumPick;
            let topContrarian = fallbackResult.topContrarianPick;

            // Handle momentum pick from Jev
            if (answers.top_momentum_pick) {
                const key = answers.top_momentum_pick.choice;
                const id = parseInt(key.replace('p_', ''), 10);
                const port = portfolios.find(p => p.id === id);
                const conf = answers.top_momentum_pick.probabilities?.[key] || 0.85;
                if (port) {
                    topMomentum = {
                        id: port.id,
                        name: port.name,
                        confidence: Math.round(conf * 100),
                        headline: `Jev 优选「${port.name}」为右侧顺势突破标杆`,
                        keyDrivers: [
                            `短线走势强劲：${port.above20Pct ?? 70}% 标的站上 20SMA，资金持续净流入`,
                            `估值动能匹配：平均 Forward PEG 为 ${port.avgPeg ? port.avgPeg.toFixed(2) : '健康'}，避免盲目追高`,
                            `风险调整回报：夏普比率 ${port.sharpe ? port.sharpe.toFixed(2) : '-'}，具备坚实主升浪防守底线`
                        ]
                    };
                }
            }

            // Handle contrarian pick from Jev
            if (answers.top_contrarian_pick) {
                const key = answers.top_contrarian_pick.choice;
                const id = parseInt(key.replace('p_', ''), 10);
                const port = portfolios.find(p => p.id === id);
                const conf = answers.top_contrarian_pick.probabilities?.[key] || 0.82;
                if (port) {
                    topContrarian = {
                        id: port.id,
                        name: port.name,
                        confidence: Math.round(conf * 100),
                        headline: `Jev 甄选「${port.name}」为左侧超跌黄金坑`,
                        keyDrivers: [
                            `估值极度低估：Forward PEG 仅 ${port.avgPeg ? port.avgPeg.toFixed(2) : '极低'}，安全边际极高`,
                            `回调出清充分：距 52 周新高回撤 ${port.avgDelta52w ? port.avgDelta52w.toFixed(1) + '%' : '明显'}，空头动能衰竭`,
                            `反弹弹性可期：历史具备优异盈利增长能力，适合逢低网格分批埋伏`
                        ]
                    };
                }
            }

            // Default topPick prioritizes highest confidence pick
            if (topMomentum && (!topContrarian || topMomentum.confidence >= topContrarian.confidence)) {
                topPick = {
                    id: topMomentum.id,
                    name: topMomentum.name,
                    conviction: topMomentum.confidence > 70 ? 'HIGH' : 'MODERATE',
                    confidence: topMomentum.confidence,
                    headline: topMomentum.headline,
                    keyDrivers: topMomentum.keyDrivers,
                    riskWarning: '建议：适合作为下周增量资金的顺势配置底仓，若大盘急跌可分批介入。'
                };
            } else if (topContrarian) {
                topPick = {
                    id: topContrarian.id,
                    name: topContrarian.name,
                    conviction: 'HIGH',
                    confidence: topContrarian.confidence,
                    headline: topContrarian.headline,
                    keyDrivers: topContrarian.keyDrivers,
                    riskWarning: '注意：该组合属于左侧逆向博弈，建议分批挂单吸筹，做好短期磨底心理准备。'
                };
            }

            return {
                topPick,
                topMomentumPick: topMomentum,
                topContrarianPick: topContrarian,
                ratings: fallbackResult.ratings,
                evaluatedAt: new Date().toISOString(),
                engine: 'jev',
                rawJevResponse: answers
            };
        }

        return fallbackResult;

    } catch (err: any) {
        console.warn('[Jev] typesafe/jev invocation failed, falling back to dual-track quant ranking:', err.message);
        return fallbackResult;
    }
}

/**
 * Deterministic dual-track multi-factor scoring algorithm for cross-portfolio comparison
 */
function calculateDeterministicComparison(portfolios: PortfolioSummaryForComparison[]): CrossComparisonResult {
    const scoredList: PortfolioTacticalRating[] = portfolios.map(p => {
        let mScore = 45; // Momentum base score
        let cScore = 35; // Contrarian base score

        const above20 = p.above20Pct ?? 50;
        const above50 = p.above50Pct ?? 50;
        const delta52w = p.avgDelta52w ?? -20;
        const epsPos = p.epsGrowthPositivePct ?? 50;
        const peg = p.avgPeg;

        // --- 1. RIGHT-SIDE MOMENTUM SCORING ---
        // Trend following: rewards stocks above 20SMA & 50SMA, near 52w highs, solid Sharpe & reasonable PEG
        if (above20 >= 80) mScore += 18;
        else if (above20 >= 60) mScore += 10;
        else if (above20 < 40) mScore -= 15;

        if (above50 >= 75) mScore += 14;
        else if (above50 >= 55) mScore += 7;
        else if (above50 < 35) mScore -= 12;

        if (delta52w >= -10) mScore += 14; // Near 52w highs / breakout
        else if (delta52w >= -18) mScore += 7;
        else if (delta52w < -30) mScore -= 12; // Far from highs

        if (p.sharpe !== null) {
            if (p.sharpe >= 1.8) mScore += 15;
            else if (p.sharpe >= 1.2) mScore += 10;
            else if (p.sharpe < 0.5) mScore -= 10;
        }

        if (peg !== null && peg > 0) {
            if (peg >= 0.8 && peg <= 1.4) mScore += 15;
            else if (peg < 0.8 && peg >= 0.5) mScore += 10;
            else if (peg > 2.2) mScore -= 15;
        }

        if (p.cagr !== null) {
            if (p.cagr >= 25) mScore += 10;
            else if (p.cagr < 0) mScore -= 10;
        }

        if (p.maxDrawdown !== null && p.maxDrawdown < -30) mScore -= 10;

        // --- 2. LEFT-SIDE CONTRARIAN SCORING ---
        // Deep value dip: rewards deep pullback (-20% to -45%), washed-out 20SMA, but ultra-low PEG & growing EPS
        if (peg !== null && peg > 0) {
            if (peg < 0.6) cScore += 30; // Extreme undervaluation
            else if (peg < 0.8) cScore += 20;
            else if (peg < 1.0) cScore += 10;
            else if (peg > 1.5) cScore -= 25; // Not cheap -> Cannot be contrarian dip
        } else {
            cScore -= 10;
        }

        if (epsPos >= 70) cScore += 15; // Growth resilient
        else if (epsPos >= 50) cScore += 8;

        if (delta52w <= -20 && delta52w >= -50) cScore += 25; // Golden dip zone
        else if (delta52w < -12) cScore += 12;
        else if (delta52w >= -8) cScore -= 20; // Near highs is NOT a left-side dip

        if (above20 <= 35) cScore += 12; // Extreme short-term oversold exhaustion
        if (above50 <= 40) cScore += 8;

        if (p.sharpe !== null && p.sharpe >= 1.0) cScore += 10; // Quality rebound capacity
        if (p.cagr !== null && p.cagr >= 15) cScore += 10;

        // Bound scores
        mScore = Math.max(10, Math.min(98, Math.round(mScore)));
        cScore = Math.max(10, Math.min(98, Math.round(cScore)));

        // Determine style and tactical action
        let style: 'RIGHT_SIDE_MOMENTUM' | 'LEFT_SIDE_CONTRARIAN' | 'BALANCED' | 'DEFENSIVE' | 'RISK_AVOID' = 'BALANCED';
        let styleLabel = '⚖️ 均衡配置';

        if (cScore >= 70 && cScore > mScore) {
            style = 'LEFT_SIDE_CONTRARIAN';
            styleLabel = '💎 左侧黄金坑';
        } else if (mScore >= 70 && mScore >= cScore) {
            style = 'RIGHT_SIDE_MOMENTUM';
            styleLabel = '🚀 右侧顺势';
        } else if (p.maxDrawdown !== null && p.maxDrawdown > -10 && (p.stdDev || 20) < 15) {
            style = 'DEFENSIVE';
            styleLabel = '🛡️ 防御底仓';
        } else if (mScore < 45 && cScore < 45) {
            style = 'RISK_AVOID';
            styleLabel = '⚠️ 警惕破位';
        }

        // Composite tactical score
        const score = Math.max(mScore, cScore);

        let action: 'STRONG_OVERWEIGHT' | 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT' = 'NEUTRAL';
        let actionLabel = '⚪ 保持中性';

        if (score >= 80) {
            action = 'STRONG_OVERWEIGHT';
            actionLabel = '🥇 强烈增配';
        } else if (score >= 68) {
            action = 'OVERWEIGHT';
            actionLabel = '🟢 适度增配';
        } else if (score >= 50) {
            action = 'NEUTRAL';
            actionLabel = '⚪ 保持中性';
        } else {
            action = 'UNDERWEIGHT';
            actionLabel = '🔻 建议减配';
        }

        let reason = '';
        if (style === 'LEFT_SIDE_CONTRARIAN') {
            reason = `左侧错杀黄金坑：PEG仅为 ${peg ? peg.toFixed(2) : '极低'}，距新高深度回调 ${delta52w.toFixed(1)}%，均线做空动能衰竭，适合分批吸筹博弈均值回归。`;
        } else if (style === 'RIGHT_SIDE_MOMENTUM') {
            reason = `右侧顺势突破：${above20}%站上20SMA多头排列，PEG=${peg ? peg.toFixed(2) : '-'}处于健康带，夏普(${p.sharpe?.toFixed(2) ?? '-'})优异。`;
        } else if (style === 'DEFENSIVE') {
            reason = `低波动防御：历史最大回撤仅 ${p.maxDrawdown ? p.maxDrawdown.toFixed(1) + '%' : '-'}，市场震荡期避险底仓。`;
        } else if (style === 'RISK_AVOID') {
            reason = `破位风险：均线全面转弱且估值或动能缺失，建议控制风险或适度减配。`;
        } else {
            reason = `各项指标相对平衡，建议维持基准仓位观察。`;
        }

        return {
            id: p.id,
            name: p.name,
            action,
            actionLabel,
            style,
            styleLabel,
            score,
            momentumScore: mScore,
            contrarianScore: cScore,
            confidence: Math.min(0.95, 0.65 + (score / 300)),
            reason,
            metrics: {
                cagr: p.cagr,
                sharpe: p.sharpe,
                avgPeg: p.avgPeg,
                maxDrawdown: p.maxDrawdown,
                avgForwardPe: p.avgForwardPe,
                above20Pct: p.above20Pct,
                above50Pct: p.above50Pct,
                avgDelta52w: p.avgDelta52w,
                epsGrowthPositivePct: p.epsGrowthPositivePct
            }
        };
    });

    // Sort by tactical score descending
    scoredList.sort((a, b) => b.score - a.score);

    // Identify top momentum pick
    const momentumList = [...scoredList].sort((a, b) => b.momentumScore - a.momentumScore);
    const topMomentumPort = momentumList[0];
    const topMomentumPick = topMomentumPort ? {
        id: topMomentumPort.id,
        name: topMomentumPort.name,
        confidence: Math.round(topMomentumPort.confidence * 100),
        headline: `多因子量化优选「${topMomentumPort.name}」为右侧顺势进攻先锋`,
        keyDrivers: [
            `短线走势强劲：${topMomentumPort.metrics.above20Pct ?? 70}% 标的站上 20SMA，多头形态良好`,
            `估值合理不虚高：平均 Forward PEG 约 ${topMomentumPort.metrics.avgPeg ? topMomentumPort.metrics.avgPeg.toFixed(2) : '适中'}，业绩支撑坚挺`,
            `高夏普收益比：夏普比率达 ${topMomentumPort.metrics.sharpe ? topMomentumPort.metrics.sharpe.toFixed(2) : '-'}，主升浪兼顾回撤控制`
        ]
    } : undefined;

    // Identify top contrarian pick (must have PEG < 1.0 or high contrarian score)
    const contrarianList = [...scoredList].sort((a, b) => b.contrarianScore - a.contrarianScore);
    const topContrarianPort = contrarianList.find(p => (p.metrics.avgPeg || 99) < 1.2) || contrarianList[0];
    const topContrarianPick = topContrarianPort ? {
        id: topContrarianPort.id,
        name: topContrarianPort.name,
        confidence: Math.round(topContrarianPort.confidence * 100),
        headline: `多因子量化甄选「${topContrarianPort.name}」为左侧黄金坑首选`,
        keyDrivers: [
            `估值深度打折：Forward PEG 仅 ${topContrarianPort.metrics.avgPeg ? topContrarianPort.metrics.avgPeg.toFixed(2) : '极低'}，安全边际极高`,
            `回撤洗盘充分：距 52 周新高回撤 ${topContrarianPort.metrics.avgDelta52w ? topContrarianPort.metrics.avgDelta52w.toFixed(1) + '%' : '较深'}，筹码充分出清`,
            `历史反弹弹性大：长期业绩与收益底色扎实，适合逢低分批布局博弈反弹`
        ]
    } : undefined;

    const top = scoredList[0] || {
        id: 0,
        name: 'None',
        score: 50,
        momentumScore: 50,
        contrarianScore: 50,
        confidence: 0.5,
        action: 'NEUTRAL' as const,
        actionLabel: '保持中性',
        style: 'BALANCED' as const,
        styleLabel: '⚖️ 均衡配置',
        reason: '',
        metrics: { cagr: null, sharpe: null, avgPeg: null, maxDrawdown: null, avgForwardPe: null }
    };

    return {
        topPick: {
            id: top.id,
            name: top.name,
            conviction: top.score >= 80 ? 'HIGH' : 'MODERATE',
            confidence: Math.round(top.confidence * 100),
            headline: `战术量化选出「${top.name}」为下周最具配置价值组合（${top.styleLabel}）`,
            keyDrivers: [
                `战术风格定位：${top.styleLabel}，综合评分达 ${top.score} 分`,
                `估值性价比：平均 Forward PEG 为 ${top.metrics.avgPeg ? top.metrics.avgPeg.toFixed(2) : '适中'}`,
                `收益与回撤：夏普比率 ${top.metrics.sharpe ? top.metrics.sharpe.toFixed(2) : '-'}，最大回撤 ${top.metrics.maxDrawdown ? top.metrics.maxDrawdown.toFixed(1) + '%' : '-'}`
            ],
            riskWarning: top.style === 'LEFT_SIDE_CONTRARIAN'
                ? '注意：该组合为左侧超跌机会，建议分批逢回调介入，不宜一次性重仓追高。'
                : '配置建议：适宜作为下周重点关注和增量仓位投放标的。'
        },
        topMomentumPick,
        topContrarianPick,
        ratings: scoredList,
        evaluatedAt: new Date().toISOString(),
        engine: 'quant_engine'
    };
}
