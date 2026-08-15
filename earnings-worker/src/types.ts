export type Bindings = {
    DB: D1Database;
    ALPHA_VANTAGE_KEY: string;
    GEMINI_API_KEY: string;
    PERPLEXITY_API_KEY?: string;
    NVIDIA_API_KEY?: string;
    AUTH_USERNAME?: string;
    AUTH_PASSWORD?: string;
    MCP_SHARED_SECRET?: string;
    AI: any;
};


export interface StockPrice {
    symbol: string;
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    updated_at?: string;
}

export interface StockQuote {
    symbol: string;
    date: string;
    price: number;
    market_cap: number;
    pe_ratio: number | null;
    forward_pe: number | null;
    ps_ratio: number | null;
    fifty_two_week_high: number | null;
    fifty_two_week_high_change_percent: number | null;
    change_percent: number | null;
    eps_current_year: number | null;
    eps_next_year: number | null;
    dividend_yield?: number | null;
    updated_at: string;
}

export interface EarningsEstimate {
    symbol: string;
    fiscal_date_ending: string;
    estimated_eps: number | null;
    reported_eps: number | null;
    surprise: number | null;
    surprise_percentage: number | null;
    report_date: string | null;
    updated_at: string;
}

export interface GroupMember {
    group_id: number;
    symbol: string;
    allocation: number;
    created_at?: string;
}

export interface Superinvestor {
    name: string;
    code: string;
}

export interface PortfolioHolding {
    symbol: string;
    name: string;
    allocation: number;
}

export interface Portfolio {
    manager: string;
    cik?: string;
    date: string;
    period: string;
    value: string;
    holdings: PortfolioHolding[];
}

export interface PriceData {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface AssetIndicators {
    [date: string]: {
        RSI: number;
        BBW: number;
        ATR: number;
        VolOsc: number;
        CMF: number;
    };
}

export interface HealthResult {
    date: string;
    Health_Index: number;
}

export interface PricePoint {
    date: string;
    close: number;
}

export interface PortfolioHealthData {
    results: HealthResult[];
    prices: { [ticker: string]: PricePoint[] };
    indicators: { [ticker: string]: AssetIndicators };
}
