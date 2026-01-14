// 新版评分系统类型定义 - 基于 scoring.md 规范

/** 单只股票的评分指标原始数据 */
export interface StockMetricsInput {
    symbol: string;
    weight: number;          // 当前权重 (0-1)
    forwardPE: number;       // forward PE
    peg: number;             // forward PEG
    prices: number[];        // 252天收盘价 (用于计算收益率、波动率、最大回撤)
}

/** 单只股票的评分组件 */
export interface StockScoreComponents {
    value: number;           // 估值分 (满分来自权重40%)
    momentum: number;        // 动量分 (满分来自权重25%)
    risk: number;            // 风险分 (满分来自权重35%)
    total: number;           // 单股总分 (0-100)
}

/** 单只股票的原始指标 */
export interface StockRawMetrics {
    symbol: string;
    weight: number;
    forwardPE: number;
    peg: number;
    return1Y: number;        // 一年收益率
    volatility: number;      // 年化波动率
    maxDrawdown: number;     // 最大回撤
    sharpe: number;          // 夏普比率
}

/** 组合层评分组件 */
export interface PortfolioPerformanceComponents {
    return: number;          // 收益分 (35%)
    volatility: number;      // 波动率分 (20%)
    maxDrawdown: number;     // 最大回撤分 (15%)
    sharpe: number;          // 夏普分 (15%)
    dr: number;              // 分散化比率分 (15%)
    total: number;           // 组合表现总分
}

/** 持仓质量评分组件 */
export interface HoldingsQualityComponents {
    avgValue: number;        // 加权平均估值分
    avgMomentum: number;     // 加权平均动量分
    avgRisk: number;         // 加权平均风险分
    total: number;           // 持仓质量总分
}

/** 组合原始指标 */
export interface PortfolioRawMetrics {
    return1Y: number;        // 组合一年收益
    volatility: number;      // 组合年化波动率
    maxDrawdown: number;     // 组合最大回撤
    sharpe: number;          // 组合夏普比率
    dr: number;              // 分散化比率
    hhi: number;             // HHI 集中度
}

/** 最终组合评分结果 */
export interface PortfolioScore {
    group_id: number;
    total_score: number;     // 最终评分 = 65% Performance + 35% Holdings

    // 双维度评分
    performance_score: number;   // 组合历史表现分 (65%)
    holdings_score: number;      // 持仓质量分 (35%)

    // 详细组件
    components: {
        performance: PortfolioPerformanceComponents;
        holdings: HoldingsQualityComponents;
    };

    // 原始指标 (用于UI展示)
    raw_metrics: PortfolioRawMetrics;

    // 单股详情
    stock_details: Array<{
        symbol: string;
        weight: number;
        score: number;
        components: StockScoreComponents;
        raw: StockRawMetrics;
    }>;

    updated_at?: string;
}

/** 优化约束 */
export interface WeightOptimizationConstraint {
    minWeight: number;
    maxWeight: number;
    sum: number; // usually 1.0
}

// Legacy - 保留兼容性
export interface ScoringMetrics {
    symbol: string;
    profit_growth: number;
    industry_pmi: number;
    industry_growth: number;
    pe_percentile: number;
    updated_at?: string;
    industry?: string;
}
