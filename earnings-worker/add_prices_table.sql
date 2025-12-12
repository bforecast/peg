-- Add stock_prices table only (earnings_estimates already exists)
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
