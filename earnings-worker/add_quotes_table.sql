-- Create table for storing daily board metrics snapshots
CREATE TABLE IF NOT EXISTS stock_quotes (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    price REAL, -- regularMarketPrice
    market_cap REAL, -- marketCap
    pe_ratio REAL, -- trailingPE
    forward_pe REAL, -- forwardPE
    ps_ratio REAL, -- priceToSalesTrailing12Months
    fifty_two_week_high REAL, -- fiftyTwoWeekHigh
    fifty_two_week_high_change_percent REAL, -- fiftyTwoWeekHighChangePercent
    change_percent REAL, -- regularMarketChangePercent
    eps_current_year REAL, -- epsCurrentYear
    eps_next_year REAL, -- epsNextYear
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_quotes_symbol_date ON stock_quotes(symbol, date DESC);
