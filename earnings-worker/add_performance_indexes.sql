-- Performance Indexes Migration
-- 1. Index on group_members(symbol) to accelerate reverse portfolio lookup and eliminate full-table scans
CREATE INDEX IF NOT EXISTS idx_group_members_symbol ON group_members(symbol);

-- 2. Index on stock_quotes(date DESC) to accelerate date range filtering
CREATE INDEX IF NOT EXISTS idx_quotes_date ON stock_quotes(date DESC);

-- 3. Index on stock_prices(date DESC) to accelerate date range filtering and cross-symbol date queries
CREATE INDEX IF NOT EXISTS idx_prices_date_only ON stock_prices(date DESC);
