-- Scoring Metrics Table (Per Symbol)
CREATE TABLE IF NOT EXISTS scoring_metrics (
    symbol TEXT PRIMARY KEY,
    profit_growth REAL, -- Consensus EPS Growth (Forward)
    industry_pmi REAL, -- ISM PMI
    industry_growth REAL, -- Sector Growth
    pe_percentile REAL, -- PE Ratio Percentile (5Y)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolio Scores Table (Per Portfolio Group)
CREATE TABLE IF NOT EXISTS portfolio_scores (
    group_id INTEGER PRIMARY KEY,
    total_score REAL,
    forward_score REAL,
    history_score REAL,
    
    -- Forward Components
    score_profit REAL,
    score_industry REAL,
    score_valuation REAL,
    score_macro REAL,
    
    -- History Components (some duplicate of portfolio_stats but good for snapshot)
    score_calmar REAL,
    score_hhi REAL,
    score_dr REAL,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_scoring_metrics_updated ON scoring_metrics(updated_at);
