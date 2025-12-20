-- Create table for storing pre-calculated portfolio risk/return metrics
CREATE TABLE IF NOT EXISTS portfolio_stats (
    group_id INTEGER PRIMARY KEY,
    cagr REAL,
    std_dev REAL,
    max_drawdown REAL,
    sharpe REAL,
    sortino REAL,
    correlation_spy REAL,
    updated_at TEXT
);
