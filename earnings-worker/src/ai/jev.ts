/**
 * Jev (typesafe/jev) Structured Decision Engine Adapter
 * 
 * Provides type-safe portfolio cross-comparison, tactical rating,
 * and next-week overweight recommendation using Cloudflare Workers AI.
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
    technicalStatus?: string;
}

export interface PortfolioTacticalRating {
    id: number;
    name: string;
    action: 'STRONG_OVERWEIGHT' | 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT';
    actionLabel: string;
    score: number;             // 0 - 100 tactical score
    confidence: number;        // 0.0 - 1.0 probability
    reason: string;
    metrics: {
        cagr: number | null;
        sharpe: number | null;
        avgPeg: number | null;
        maxDrawdown: number | null;
        avgForwardPe: number | null;
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

    // 1. Prepare deterministic fallback first to ensure 100% reliability
    const fallbackResult = calculateDeterministicComparison(portfolios);

    if (!ai) {
        console.warn('[Jev] env.AI binding missing, returning quant engine comparison.');
        return fallbackResult;
    }

    try {
        console.log(`[Jev] Initiating portfolio cross-comparison for ${portfolios.length} portfolios...`);

        // Format state payload
        const statePayload = {
            comparison_date: new Date().toISOString().split('T')[0],
            portfolio_count: portfolios.length,
            portfolios: portfolios.map(p => ({
                id: p.id,
                name: p.name,
                cagr_pct: p.cagr !== null ? `${p.cagr.toFixed(1)}%` : 'N/A',
                sharpe_ratio: p.sharpe !== null ? p.sharpe.toFixed(2) : 'N/A',
                sortino_ratio: p.sortino !== null ? p.sortino.toFixed(2) : 'N/A',
                max_drawdown_pct: p.maxDrawdown !== null ? `${p.maxDrawdown.toFixed(1)}%` : 'N/A',
                annualized_volatility_pct: p.stdDev !== null ? `${p.stdDev.toFixed(1)}%` : 'N/A',
                average_forward_peg: p.avgPeg !== null ? p.avgPeg.toFixed(2) : 'N/A',
                average_forward_pe: p.avgForwardPe !== null ? p.avgForwardPe.toFixed(1) : 'N/A',
                holdings_count: p.holdingsCount,
                top_holdings: p.topHoldings.slice(0, 4).map(h => `${h.symbol}(${(h.weight * 100).toFixed(0)}%)`).join(', '),
                technical_status: p.technicalStatus || 'Balanced'
            }))
        };

        // Construct dynamic choice options for best portfolio
        const criteriaMap: Record<string, string> = {};
        for (const p of portfolios) {
            criteriaMap[`p_${p.id}`] = `${p.name}: CAGR=${p.cagr?.toFixed(1) ?? 'N/A'}%, Sharpe=${p.sharpe?.toFixed(2) ?? 'N/A'}, PEG=${p.avgPeg?.toFixed(2) ?? 'N/A'}, MaxDD=${p.maxDrawdown?.toFixed(1) ?? 'N/A'}%`;
        }

        const jevQuestions = {
            top_portfolio_pick: {
                type: 'choice',
                instructions: 'Which single portfolio has the most compelling risk-reward balance for new capital allocation next week (favoring reasonable PEG 0.8-1.5, high Sharpe, and managed drawdown)?',
                criteria: criteriaMap
            },
            market_risk_environment: {
                type: 'choice',
                instructions: 'What is the recommended overall tactical stance across these equity portfolios?',
                criteria: {
                    aggressive_expansion: 'Valuations are cheap and drawdowns are recovering; maximize high beta growth.',
                    selective_garp: 'Growth is attractive but selective; overweight reasonable PEG with strong earnings.',
                    defensive_hedging: 'Valuations are overextended; preserve capital and favor low volatility.'
                }
            }
        };

        const response: any = await ai.run('typesafe/jev', {
            state: JSON.stringify(statePayload),
            questions: jevQuestions
        });

        console.log('[Jev] Raw response received successfully:', JSON.stringify(response));

        const answers = response?.answers || response?.result?.answers;
        if (answers && answers.top_portfolio_pick) {
            const pickedKey = answers.top_portfolio_pick.choice; // e.g. "p_1"
            const pickedId = parseInt(pickedKey.replace('p_', ''), 10);
            const pickedPort = portfolios.find(p => p.id === pickedId) || portfolios[0];
            const confidence = answers.top_portfolio_pick.probabilities?.[pickedKey] || 0.82;

            // Merge Jev pick with quant ratings
            const ratings = fallbackResult.ratings.map(r => {
                if (r.id === pickedId) {
                    return {
                        ...r,
                        action: 'STRONG_OVERWEIGHT' as const,
                        actionLabel: '🥇 强烈增配',
                        confidence: Math.max(r.confidence, confidence),
                        reason: `Jev 评选为全场最优配置标的：估值性价比与夏普收益率综合共振最佳。`
                    };
                }
                return r;
            });

            return {
                topPick: {
                    id: pickedPort.id,
                    name: pickedPort.name,
                    conviction: confidence > 0.6 ? 'HIGH' : 'MODERATE',
                    confidence: Math.round(confidence * 100),
                    headline: `Jev 优选「${pickedPort.name}」为下周首选增配组合`,
                    keyDrivers: [
                        `估值合理性：平均 Forward PEG 为 ${pickedPort.avgPeg ? pickedPort.avgPeg.toFixed(2) : '适中'}，业绩支撑坚实`,
                        `风险收益质量：夏普比率 ${pickedPort.sharpe ? pickedPort.sharpe.toFixed(2) : '-'}，在各组合中具有最优防御弹性`,
                        `动量与回撤：历史最大回撤控制在 ${pickedPort.maxDrawdown ? pickedPort.maxDrawdown.toFixed(1) + '%' : '-'}，当前盈亏比优异`
                    ],
                    riskWarning: pickedPort.avgPeg && pickedPort.avgPeg > 2.0 
                        ? '注意：该组合部分持仓 PEG 偏高，建议分批逢回调介入。'
                        : '建议：维持核心仓位配置，若下周大盘波动可作为防御增配底仓。'
                },
                ratings,
                evaluatedAt: new Date().toISOString(),
                engine: 'jev',
                rawJevResponse: answers
            };
        }

        console.warn('[Jev] Invalid answer format, using deterministic fallback.');
        return fallbackResult;

    } catch (err: any) {
        console.warn('[Jev] typesafe/jev invocation failed or not permitted, fallback to quant ranking:', err.message);
        return fallbackResult;
    }
}

/**
 * Deterministic multi-factor scoring algorithm for cross-portfolio comparison
 */
function calculateDeterministicComparison(portfolios: PortfolioSummaryForComparison[]): CrossComparisonResult {
    const scoredList = portfolios.map(p => {
        let score = 50; // Base score

        // 1. Valuation Factor (PEG: 0.8-1.4 is optimal)
        if (p.avgPeg !== null && p.avgPeg > 0) {
            if (p.avgPeg >= 0.8 && p.avgPeg <= 1.4) score += 20;
            else if (p.avgPeg < 0.8 && p.avgPeg >= 0.5) score += 15;
            else if (p.avgPeg > 1.4 && p.avgPeg <= 2.0) score += 8;
            else if (p.avgPeg > 2.5) score -= 15; // Valuation bubble penalty
        } else {
            score += 5; // Neutral
        }

        // 2. Risk-adjusted return (Sharpe)
        if (p.sharpe !== null) {
            if (p.sharpe >= 1.8) score += 20;
            else if (p.sharpe >= 1.2) score += 14;
            else if (p.sharpe >= 0.8) score += 8;
            else if (p.sharpe < 0.5) score -= 10;
        }

        // 3. CAGR Growth
        if (p.cagr !== null) {
            if (p.cagr >= 25) score += 15;
            else if (p.cagr >= 15) score += 10;
            else if (p.cagr >= 5) score += 5;
            else if (p.cagr < 0) score -= 12;
        }

        // 4. Drawdown Penalty
        if (p.maxDrawdown !== null) {
            if (p.maxDrawdown > -15) score += 10; // Low drawdown bonus
            else if (p.maxDrawdown < -30) score -= 15; // Severe drawdown penalty
            else if (p.maxDrawdown < -25) score -= 8;
        }

        score = Math.max(10, Math.min(98, score));

        let action: 'STRONG_OVERWEIGHT' | 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT' = 'NEUTRAL';
        let actionLabel = '⚪ 标配观望';

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
        if (action === 'STRONG_OVERWEIGHT' || action === 'OVERWEIGHT') {
            reason = `估值性价比突出 (PEG: ${p.avgPeg ? p.avgPeg.toFixed(2) : '合理'})，夏普 (${p.sharpe ? p.sharpe.toFixed(2) : '-'}) 与回撤控制极佳。`;
        } else if (action === 'UNDERWEIGHT') {
            reason = `回撤较大 (${p.maxDrawdown ? p.maxDrawdown.toFixed(1) + '%' : '-'}) 或估值透支，性价比偏低。`;
        } else {
            reason = `整体表现稳健，建议保持现有权重观察。`;
        }

        return {
            id: p.id,
            name: p.name,
            action,
            actionLabel,
            score,
            confidence: Math.min(0.95, 0.65 + (score / 300)),
            reason,
            metrics: {
                cagr: p.cagr,
                sharpe: p.sharpe,
                avgPeg: p.avgPeg,
                maxDrawdown: p.maxDrawdown,
                avgForwardPe: p.avgForwardPe
            }
        };
    });

    // Sort by tactical score descending
    scoredList.sort((a, b) => b.score - a.score);

    const top = scoredList[0] || {
        id: 0,
        name: 'None',
        score: 50,
        confidence: 0.5,
        action: 'NEUTRAL' as const,
        actionLabel: '保持中性',
        reason: '',
        metrics: { cagr: null, sharpe: null, avgPeg: null, maxDrawdown: null, avgForwardPe: null }
    };

    return {
        topPick: {
            id: top.id,
            name: top.name,
            conviction: top.score >= 80 ? 'HIGH' : 'MODERATE',
            confidence: Math.round(top.confidence * 100),
            headline: `多因子量化选出「${top.name}」为下周最具性价比组合`,
            keyDrivers: [
                `估值支撑：平均 Forward PEG 约 ${top.metrics.avgPeg ? top.metrics.avgPeg.toFixed(2) : '适中'}，处于健康合理区间`,
                `风险调整收益：夏普比率达 ${top.metrics.sharpe ? top.metrics.sharpe.toFixed(2) : '-'}，具备高盈亏比`,
                `最大回撤控制：历史回撤约为 ${top.metrics.maxDrawdown ? top.metrics.maxDrawdown.toFixed(1) + '%' : '-'}，下行风险可控`
            ],
            riskWarning: top.metrics.avgPeg && top.metrics.avgPeg > 2.0
                ? '注意：部分高权重成长股估值偏高，注意控制单次建仓幅度。'
                : '配置建议：适合作为下周增量资金的优先配置方向。'
        },
        ratings: scoredList,
        evaluatedAt: new Date().toISOString(),
        engine: 'quant_engine'
    };
}
