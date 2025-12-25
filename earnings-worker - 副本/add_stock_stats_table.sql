-- Create table for pre-calculated stock statistics and charts
CREATE TABLE IF NOT EXISTS stock_stats (
    symbol TEXT PRIMARY KEY,
    change_ytd REAL,
    change_1y REAL,
    delta_52w_high REAL,
    sma_20 REAL,
    sma_50 REAL,
    sma_200 REAL,
    chart_1y TEXT,     -- SVG string for 1 year price chart
    rs_rank_1m TEXT,   -- SVG string for 1 month RS Rank bar
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
