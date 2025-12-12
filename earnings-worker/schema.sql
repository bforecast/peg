-- earnings_estimates table already exists with data
CREATE TABLE IF NOT EXISTS earnings_estimates (
    symbol TEXT NOT NULL,
    fiscal_date_ending TEXT NOT NULL,
    estimated_eps REAL,
    reported_eps REAL,
    surprise REAL,
    surprise_percentage REAL,
    report_date TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (symbol, fiscal_date_ending)
);
CREATE INDEX IF NOT EXISTS idx_earnings_symbol ON earnings_estimates(symbol);

DROP TABLE IF EXISTS stock_prices;
CREATE TABLE stock_prices (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (symbol, date)
);
CREATE INDEX idx_prices_symbol ON stock_prices(symbol);
CREATE INDEX idx_prices_date ON stock_prices(symbol, date DESC);
