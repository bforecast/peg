export interface ScoringMetrics {
    symbol: string;
    profit_growth: number;
    industry_pmi: number;
    industry_growth: number;
    pe_percentile: number;
    updated_at?: string;
    industry?: string;
}

export interface PortfolioScore {
    group_id: number;
    total_score: number;
    forward_score: number;
    history_score: number;
    components: {
        forward: {
            profit: number;
            industry: number;
            valuation: number;
            macro: number;
        };
        history: {
            calmar: number;
            hhi: number;
            dr: number;
        };
    };
    raw_metrics?: {
        hhi: number;
        dr: number;
        calmar: number;
    };
    updated_at?: string;
}

export interface WeightOptimizationConstraint {
    minWeight: number;
    maxWeight: number;
    sum: number; // usually 1.0
}
