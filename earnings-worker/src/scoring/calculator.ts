/**
 * 专业级投资组合评分系统 - 基于 scoring.md 规范
 * 
 * 核心公式:
 * - 最终评分 = 65% × Performance_port + 35% × Holdings_quality
 * - Holdings_quality = Σ(w[i] × Score[i])
 * - Score[i] = 40% × Value + 25% × Momentum + 35% × Risk
 */

import {
    StockMetricsInput,
    StockScoreComponents,
    StockRawMetrics,
    PortfolioPerformanceComponents,
    HoldingsQualityComponents,
    PortfolioRawMetrics,
    PortfolioScore
} from './types';
import { Bindings } from '../types';

const RISK_FREE_RATE = 0.04; // 无风险利率 4%

// ============================================================================
// 评分区间映射函数
// ============================================================================

/** PE评分: PE越低越好 */
function scorePE(pe: number): number {
    if (pe < 10) return 85;
    if (pe < 20) return 75;
    if (pe < 30) return 60;
    if (pe < 50) return 45;
    return 30;
}

/** PEG评分: PEG越低越好 */
function scorePEG(peg: number): number {
    if (peg < 0.7) return 90;
    if (peg < 1) return 80;
    if (peg < 1.5) return 65;
    if (peg < 2) return 50;
    return 35;
}

/** 动量评分: 一年收益率 */
function scoreMomentum(return1Y: number): number {
    if (return1Y >= 0.50) return 85;
    if (return1Y >= 0.20) return 75;
    if (return1Y >= 0) return 60;
    if (return1Y >= -0.20) return 45;
    return 30;
}

/** 波动率评分: 年化波动率越低越好 */
function scoreVolatility(vol: number): number {
    if (vol < 0.15) return 90;
    if (vol < 0.25) return 70;
    if (vol < 0.35) return 50;
    if (vol < 0.50) return 30;
    return 15;
}

/** 最大回撤评分: 回撤越小越好 */
function scoreMaxDrawdown(dd: number): number {
    const d = Math.abs(dd);
    if (d < 0.10) return 85;
    if (d < 0.20) return 65;
    if (d < 0.40) return 45;
    return 25;
}

/** 夏普比率评分 */
function scoreSharpe(sharpe: number): number {
    if (sharpe >= 2.0) return 90;
    if (sharpe >= 1.0) return 70;
    if (sharpe >= 0) return 50;
    return 30;
}

/** 组合收益评分 */
function scorePortfolioReturn(ret: number): number {
    if (ret >= 0.20) return 90;
    if (ret >= 0.10) return 75;
    if (ret >= 0) return 60;
    if (ret >= -0.10) return 45;
    return 30;
}

/** 组合波动率评分: 组合级别的波动率阈值更严格 */
function scorePortfolioVolatility(vol: number): number {
    if (vol < 0.12) return 90;
    if (vol < 0.20) return 70;
    if (vol < 0.30) return 50;
    if (vol < 0.45) return 30;
    return 15;
}

/** 组合最大回撤评分 */
function scorePortfolioMaxDrawdown(dd: number): number {
    const d = Math.abs(dd);
    if (d < 0.10) return 85;
    if (d < 0.20) return 65;
    if (d < 0.35) return 45;
    return 25;
}

/** 分散化比率评分: DR越高代表分散效果越好 */
function scoreDR(dr: number): number {
    if (dr < 1.1) return 30;
    if (dr < 1.3) return 50;
    if (dr < 1.5) return 70;
    if (dr < 1.8) return 85;
    return 95;
}

// ============================================================================
// 指标计算函数
// ============================================================================

/** 从价格序列计算日收益率 */
function calculateDailyReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
    }
    return returns;
}

/** 计算标准差 */
function std(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sqDiffs = arr.map(x => Math.pow(x - mean, 2));
    return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1));
}

/** 计算年化波动率 */
function calculateVolatility(prices: number[]): number {
    const dailyReturns = calculateDailyReturns(prices);
    return std(dailyReturns) * Math.sqrt(252);
}

/** 计算一年收益率 */
function calculateReturn1Y(prices: number[]): number {
    if (prices.length < 2) return 0;
    const start = prices[0];
    const end = prices[prices.length - 1];
    return start > 0 ? (end - start) / start : 0;
}

/** 计算最大回撤 */
function calculateMaxDrawdown(prices: number[]): number {
    if (prices.length < 2) return 0;

    let peak = prices[0];
    let maxDD = 0;

    for (const price of prices) {
        if (price > peak) {
            peak = price;
        }
        const dd = (price - peak) / peak;
        if (dd < maxDD) {
            maxDD = dd;
        }
    }

    return maxDD;
}

/** 计算夏普比率 */
function calculateSharpe(prices: number[], riskFreeRate: number = RISK_FREE_RATE): number {
    const return1Y = calculateReturn1Y(prices);
    const volatility = calculateVolatility(prices);
    if (volatility === 0) return 0;
    return (return1Y - riskFreeRate) / volatility;
}

// ============================================================================
// 单只股票评分
// ============================================================================

/**
 * 计算单只股票的评分
 * Score[i] = 0.40 × Value + 0.25 × Momentum + 0.35 × Risk
 */
export function calculateStockScore(input: StockMetricsInput): { components: StockScoreComponents; raw: StockRawMetrics } {
    // 计算原始指标
    const return1Y = calculateReturn1Y(input.prices);
    const volatility = calculateVolatility(input.prices);
    const maxDrawdown = calculateMaxDrawdown(input.prices);
    const sharpe = calculateSharpe(input.prices);

    // Value评分 (满分100)
    const peScore = scorePE(input.forwardPE);
    const pegScore = scorePEG(input.peg);
    const valueScore = 0.70 * pegScore + 0.30 * peScore;

    // Momentum评分 (满分100)
    const momentumScore = scoreMomentum(return1Y);

    // Risk评分 (满分100)
    const volScore = scoreVolatility(volatility);
    const ddScore = scoreMaxDrawdown(maxDrawdown);
    const sharpeScore = scoreSharpe(sharpe);
    const riskScore = 0.40 * volScore + 0.30 * ddScore + 0.30 * sharpeScore;

    // 总分 = 40% Value + 25% Momentum + 35% Risk
    const totalScore = 0.40 * valueScore + 0.25 * momentumScore + 0.35 * riskScore;

    return {
        components: {
            value: valueScore,
            momentum: momentumScore,
            risk: riskScore,
            total: totalScore
        },
        raw: {
            symbol: input.symbol,
            weight: input.weight,
            forwardPE: input.forwardPE,
            peg: input.peg,
            return1Y,
            volatility,
            maxDrawdown,
            sharpe
        }
    };
}

// ============================================================================
// 组合评分
// ============================================================================

/**
 * 计算组合的日收益序列 (加权平均)
 */
function calculatePortfolioDailyReturns(stocks: StockMetricsInput[]): number[] {
    if (stocks.length === 0) return [];

    // 找到所有股票的最短价格序列长度
    const minLength = Math.min(...stocks.map(s => s.prices.length));
    if (minLength < 2) return [];

    // 计算每只股票的日收益
    const stockReturns = stocks.map(s => {
        const prices = s.prices.slice(-minLength);
        return calculateDailyReturns(prices);
    });

    // 加权平均日收益
    const portfolioReturns: number[] = [];
    const numDays = stockReturns[0]?.length || 0;

    for (let d = 0; d < numDays; d++) {
        let weightedReturn = 0;
        for (let i = 0; i < stocks.length; i++) {
            weightedReturn += stocks[i].weight * (stockReturns[i][d] || 0);
        }
        portfolioReturns.push(weightedReturn);
    }

    return portfolioReturns;
}

/**
 * 从日收益序列计算组合净值曲线
 */
function calculateNAVFromReturns(dailyReturns: number[]): number[] {
    const nav = [1.0];
    for (const r of dailyReturns) {
        nav.push(nav[nav.length - 1] * (1 + r));
    }
    return nav;
}

/**
 * 计算分散化比率 DR = Σ(w[i] × σ[i]) / σ_portfolio
 */
function calculateDR(stocks: StockMetricsInput[], portfolioVol: number): number {
    if (portfolioVol === 0) return 1.0;

    let weightedVol = 0;
    for (const s of stocks) {
        const vol = calculateVolatility(s.prices);
        weightedVol += s.weight * vol;
    }

    return weightedVol / portfolioVol;
}

/**
 * 计算HHI集中度 = Σ(w[i]^2)
 */
function calculateHHI(stocks: StockMetricsInput[]): number {
    return stocks.reduce((sum, s) => sum + s.weight * s.weight, 0);
}

/**
 * 计算完整的组合评分
 */
export async function calculatePortfolioScore(
    env: Bindings,
    groupId: number,
    stocks: StockMetricsInput[],
    useDbStats: boolean = true
): Promise<PortfolioScore> {

    // ========== 1. 计算每只股票的评分 ==========
    const stockDetails: PortfolioScore['stock_details'] = [];
    let holdingsValue = 0;
    let holdingsMomentum = 0;
    let holdingsRisk = 0;

    for (const stock of stocks) {
        const { components, raw } = calculateStockScore(stock);
        stockDetails.push({
            symbol: stock.symbol,
            weight: stock.weight,
            score: components.total,
            components,
            raw
        });

        // 加权汇总
        holdingsValue += stock.weight * components.value;
        holdingsMomentum += stock.weight * components.momentum;
        holdingsRisk += stock.weight * components.risk;
    }

    // Holdings_quality = Σ(w[i] × Score[i])
    const holdingsTotal = 0.40 * holdingsValue + 0.25 * holdingsMomentum + 0.35 * holdingsRisk;

    const holdingsComponents: HoldingsQualityComponents = {
        avgValue: holdingsValue,
        avgMomentum: holdingsMomentum,
        avgRisk: holdingsRisk,
        total: holdingsTotal
    };

    // ========== 2. 计算组合层指标 ==========
    // 优先从 portfolio_stats 表读取 (Pre-calculated by cron/backfill)
    let portfolioReturn1Y = 0;
    let portfolioVol = 0;
    let portfolioMaxDD = 0;
    let portfolioSharpe = 0;
    let dr = 0;
    let hhi = calculateHHI(stocks); // HHI is simple enough to calc runtime

    let stats = null;
    if (useDbStats) {
        stats = await env.DB.prepare(
            'SELECT cagr, std_dev, max_drawdown, sharpe, dr FROM portfolio_stats WHERE group_id = ?'
        ).bind(groupId).first() as { cagr: number; std_dev: number; max_drawdown: number; sharpe: number; dr: number } | null;
    }

    if (stats) {
        // Convert from Percentage (DB) to Decimal (Scoring Logic) where needed
        portfolioReturn1Y = (stats.cagr || 0) / 100;
        portfolioVol = (stats.std_dev || 0) / 100;
        portfolioMaxDD = (stats.max_drawdown || 0) / 100; // stored as negative percent e.g. -25.5
        portfolioSharpe = stats.sharpe || 0;
        dr = stats.dr || 0;
    } else {
        // Fallback: Calculate Runtime
        const portfolioReturns = calculatePortfolioDailyReturns(stocks);
        const portfolioNAV = calculateNAVFromReturns(portfolioReturns);

        portfolioReturn1Y = portfolioNAV.length > 1
            ? portfolioNAV[portfolioNAV.length - 1] - 1
            : 0;

        portfolioVol = std(portfolioReturns) * Math.sqrt(252);
        portfolioMaxDD = calculateMaxDrawdown(portfolioNAV);
        portfolioSharpe = portfolioVol > 0
            ? (portfolioReturn1Y - RISK_FREE_RATE) / portfolioVol
            : 0;
        dr = calculateDR(stocks, portfolioVol);
    }

    // ========== 3. 组合层评分 ==========
    const returnScore = scorePortfolioReturn(portfolioReturn1Y);
    const volScore = scorePortfolioVolatility(portfolioVol);
    const ddScore = scorePortfolioMaxDrawdown(portfolioMaxDD);
    const sharpeScore = scoreSharpe(portfolioSharpe);
    const drScore = scoreDR(dr);

    // Performance_port = 0.35×Return + 0.20×Vol + 0.15×MaxDD + 0.15×Sharpe + 0.15×DR
    const performanceTotal =
        0.35 * returnScore +
        0.20 * volScore +
        0.15 * ddScore +
        0.15 * sharpeScore +
        0.15 * drScore;

    const performanceComponents: PortfolioPerformanceComponents = {
        return: returnScore,
        volatility: volScore,
        maxDrawdown: ddScore,
        sharpe: sharpeScore,
        dr: drScore,
        total: performanceTotal
    };

    // ========== 4. 最终评分 ==========
    // Score_port = 0.65 × Performance_port + 0.35 × Holdings_quality
    const totalScore = 0.65 * performanceTotal + 0.35 * holdingsTotal;

    const rawMetrics: PortfolioRawMetrics = {
        return1Y: portfolioReturn1Y,
        volatility: portfolioVol,
        maxDrawdown: portfolioMaxDD,
        sharpe: portfolioSharpe,
        dr,
        hhi
    };

    // ========== 5. Save to database (optional, may fail if schema is outdated) ==========
    const updatedAt = new Date().toISOString();

    try {
        await env.DB.prepare(`
            INSERT OR REPLACE INTO portfolio_scores (
                group_id, total_score, performance_score, holdings_score,
                return_score, vol_score, maxdd_score, sharpe_score, dr_score,
                holdings_value, holdings_momentum, holdings_risk,
                raw_return, raw_vol, raw_maxdd, raw_sharpe, raw_dr, raw_hhi,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            groupId,
            totalScore,
            performanceTotal,
            holdingsTotal,
            returnScore,
            volScore,
            ddScore,
            sharpeScore,
            drScore,
            holdingsValue,
            holdingsMomentum,
            holdingsRisk,
            portfolioReturn1Y,
            portfolioVol,
            portfolioMaxDD,
            portfolioSharpe,
            dr,
            hhi,
            updatedAt
        ).run();
    } catch (e) {
        console.warn('[Scoring] Failed to save score to DB (schema may need update):', e);
    }

    // NEW: Always sync last_score to portfolio_stats for Dashboard visibility
    try {
        await env.DB.prepare(`
            UPDATE portfolio_stats SET last_score = ? WHERE group_id = ?
        `).bind(totalScore, groupId).run();
    } catch (e) {
        console.warn('[Scoring] Failed to sync last_score to portfolio_stats:', e);
    }

    return {
        group_id: groupId,
        total_score: totalScore,
        performance_score: performanceTotal,
        holdings_score: holdingsTotal,
        components: {
            performance: performanceComponents,
            holdings: holdingsComponents
        },
        raw_metrics: rawMetrics,
        stock_details: stockDetails,
        updated_at: updatedAt
    };
}

/**
 * 从数据库获取股票数据并构建评分输入
 */
export async function fetchStockMetricsForScoring(
    env: Bindings,
    groupId: number
): Promise<StockMetricsInput[]> {

    // 1. 获取组合成员和权重
    const { results: members } = await env.DB.prepare(
        'SELECT symbol, allocation FROM group_members WHERE group_id = ?'
    ).bind(groupId).all();

    if (!members || members.length === 0) {
        return [];
    }

    const stocks: StockMetricsInput[] = [];

    for (const m of members) {
        const member = m as { symbol: string; allocation: number };
        const symbol = member.symbol;
        const weight = (member.allocation || 0) / 100; // 转换为小数

        // 2. 获取报价数据 (Forward PE, EPS)
        const quote = await env.DB.prepare(
            'SELECT forward_pe, eps_current_year, eps_next_year FROM stock_quotes WHERE symbol = ? ORDER BY date DESC LIMIT 1'
        ).bind(symbol).first() as { forward_pe: number; eps_current_year: number; eps_next_year: number } | null;

        const forwardPE = quote?.forward_pe || 20; // 默认值

        // 计算 PEG
        let peg = 1.5; // 默认值
        if (quote?.eps_current_year && quote?.eps_next_year && quote.eps_current_year > 0 && forwardPE > 0) {
            const growth = ((quote.eps_next_year - quote.eps_current_year) / Math.abs(quote.eps_current_year)) * 100;
            if (growth > 0) {
                peg = forwardPE / growth;
            }
        }

        // 3. 获取价格历史 (252天)
        const { results: priceRows } = await env.DB.prepare(
            'SELECT close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 252'
        ).bind(symbol).all();

        const prices = (priceRows || [])
            .map((r: any) => r.close as number)
            .filter((p: number) => p > 0)
            .reverse(); // 转为升序

        if (prices.length < 20) {
            console.warn(`[Scoring] Skipping ${symbol}: insufficient price data (${prices.length} days)`);
            continue;
        }

        stocks.push({
            symbol,
            weight,
            forwardPE,
            peg,
            prices
        });
    }

    // 重新归一化权重 (确保总和为1)
    const totalWeight = stocks.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight > 0 && totalWeight !== 1) {
        for (const s of stocks) {
            s.weight = s.weight / totalWeight;
        }
    }

    return stocks;
}
