# Cloudflare Workers Cron Trigger & Troubleshooting Guide

This guide documents key architectural details, lessons learned, and manual recovery procedures for the background data fetcher (Cron Job) of the `earnings-worker` system.

---

## 1. The UTC Timezone Trap (Timezone Alignment)

**CRITICAL LESSON:** Cloudflare Worker cron triggers ALWAYS execute in the **UTC** timezone, regardless of the system's runtime timezone settings.

### The Bug in `crons = ["*/1 21-23,0-1 * * 1-5"]`
The original schedule was intended to run every 1 minute from 4:00 PM to 9:59 PM EST on weekdays (Mon-Fri).
Let's look at the mapping:
- **UTC 21:00 - 23:59** on Mon-Fri matches UTC Day `1-5`. Runs successfully.
- **UTC 00:00 - 01:59** matches UTC Day `1-5`.
  - **Thursday night EST** is **Friday 00:00 - 01:59 UTC** (UTC Day 5). Matches `1-5`. **Runs.**
  - **Friday night EST** is **Saturday 00:00 - 01:59 UTC** (UTC Day 6). **Does NOT match `1-5`. Fails to run!**

This resulted in a critical gap where **Friday's stock market close data (the most important data for the weekend) was completely missed**, leaving the system stale until Sunday night.

### The Solution: Split Cron Schedules using Day Names

To perfectly capture US stock market hours (Mon-Fri 4 PM - 10 PM EST) without running on weekends, we split the schedule into two UTC triggers. 

**CRITICAL WARNING:** Cloudflare Workers use Quartz-style day-of-week indexing where **`1` is Sunday** (unlike Unix cron where `1` is Monday). 
- Using numeric `1-5` maps to Sunday-Thursday UTC.
- Using numeric `2-6` maps to Monday-Friday UTC.
This leaves Friday night EST (Saturday UTC / Day 7) and Friday afternoon EST (Friday UTC / Day 6) completely un-triggered.

To avoid this ambiguity, always use **explicit day names** (`MON-FRI` and `TUE-SAT`) in `wrangler.toml`:

```toml
[triggers]
crons = [
    "*/1 20-23 * * MON-FRI",  # Mon-Fri 4 PM - 7:59 PM EST (Mon-Fri 20:00-23:59 UTC)
    "*/1 0-3 * * TUE-SAT"     # Mon-Fri 8 PM - 11:59 PM EST (Tue-Sat 00:00-03:59 UTC)
]
```

---

## 2. The Dev-Server Subrequest Trap

When executing manual catch-ups, it is tempting to run `npx wrangler dev --remote` and trigger the scheduled event locally via curl or HTTP requests.

### The Error
`Too many API requests by single Worker invocation.`

### Why This Happens
Cloudflare's local Wrangler runtime enforces a strict limit of **50 subrequests / D1 database calls per request invocation** in dev preview mode. 
Because updating a single symbol triggers multiple database writes (`stock_prices`, `stock_stats`, `earnings_estimates`, `scoring_metrics`), processing even **15 symbols** in a single HTTP request exceeds 100+ database operations, causing a runtime crash.

### How it works in Production
Production Cloudflare Workers (especially Paid/Unbound) have significantly higher subrequest limits, and since **each minute of the cron trigger is a separate request invocation**, running 10 symbols per run (which resets the 50-limit count every minute) never hits this wall.

---

## 3. Manual Catch-up Trigger Workflow (Production Safe)

If the cron job fails to run or lags behind, follow this safe manual trigger workflow:

### Step 1: Add a Temporary 1-Minute Cron Trigger
Open `wrangler.toml` and temporarily add `"*/1 * * * *"` to the triggers:
```toml
[triggers]
crons = ["*/1 20-23 * * MON-FRI", "*/1 0-3 * * TUE-SAT", "*/1 * * * *"]
```

### Step 2: Deploy to Production
Run the deploy command to activate the temporary catch-up trigger:
```powershell
npm run deploy
```

### Step 3: Monitor Database Progress
Query the D1 database to verify that the worker is successfully processing symbols in batches and writing logs:
```powershell
npx wrangler d1 execute earnings-db --remote --command "SELECT * FROM cron_logs ORDER BY id DESC LIMIT 10"
```
*Look for `freshSymbols` count rising and `pendingSymbols` count falling every minute.*

### Step 4: Revert and Clean Up (MANDATORY!)
> [!WARNING]
> **CRITICAL:** Do NOT forget this step! Leaving `"*/1 * * * *"` active in production will run the worker every minute 24/7 (1,920+ executions/day), burning unnecessary invocation and read quotas.

Once the catch-up is complete (`pendingSymbols: 0` and `portfolio_stats` recalculation logged), revert the change in `wrangler.toml` and redeploy immediately:
```powershell
git restore wrangler.toml
npm run deploy
```
This ensures production returns to only triggering during market-close hours (480 minutes/day).

---

## 4. The Cloudflare Workers CPU Timeout Trap (`exceededCpu`)

**CRITICAL LESSON:** Cloudflare scheduled triggers run under a strict CPU runtime limit (typically 10ms of active V8 execution time on standard plans).

### The Bug
- The portfolio simulation loop inside `calculatePortfolioStats` originally searched the raw historical price array using a linear `.find()` for every single symbol, on every simulated trading day.
- For a portfolio with 19 symbols, this triggered up to **$252 \text{ days} \times 19 \text{ assets} \times 252 \text{ history} \approx 1,200,000$ linear search iterations** using high-overhead JavaScript callback functions.
- This exploded CPU execution time, causing the worker to exceed the 10ms V8 limit and terminate with an `exceededCpu` error. It calculated 1-2 small portfolios, but crashed silently as soon as it hit a larger portfolio.

### The Solution: O(1) Map Lookups
- Pre-process the historical symbol price arrays into direct date-to-price lookups: `Map<string, Map<string, number>>`.
- Inside the simulation loop, replace the $O(N)$ linear `.find()` with a direct $O(1)$ Map `.get()` lookup.
- This simple data-structure shift reduced average CPU execution time from **10ms+** to **< 1.3ms** per portfolio, comfortably avoiding V8 runtime terminations.

---

## 5. The D1 Full-History Overwrite Trap (Free Tier 100k `rows_written` Limit)

**CRITICAL LESSON:** Daily price update routines must never overwrite full 2-year history on every ticker refresh.

### The Bug
- `updatePrices()` previously fetched Yahoo Finance 2-year OHLCV prices (~500 days) and performed an unconditional `INSERT OR REPLACE` for all 500 rows into `stock_prices`.
- Updating 200 symbol instances per day consumed $200 \times 500 = 100,000$ database writes, instantly exhausting Cloudflare D1's 100,000 rows_written free tier daily quota.

### The Solution: Smart Incremental Upsert
- Check `max(date)` in `stock_prices`.
- For symbols with existing history (`count >= 200` and not forced), filter `pricesToInsert = prices.filter(p => p.date >= maxDate)`.
- This reduces writes from ~500 rows down to 1–2 rows per update (refreshing latest day + inserting today's new close), slashing daily D1 write volume by **99.6%**.
- Full 2-year backfill is preserved for brand-new symbols (`count < 200`) and stock split events (`force = true`).

---

## 6. The US Market Holiday Trap (Market Closures)

**CRITICAL LESSON:** Simply checking `hour >= 16` and weekday index is insufficient because US stock exchanges close on official federal holidays (e.g. Labor Day, Memorial Day, Juneteenth, Independence Day).

### The Bug
- On holiday evenings, `getLastTradingDate()` previously assumed that any weekday after 16:00 EST was a valid trading day.
- Quotes fetched on holidays retained the previous Friday's closing price, but were stamped with the holiday date (e.g. `2026-09-07` on Labor Day), inserting phantom non-trading-day records into `stock_prices` and leaving the true trading day missing.

### The Solution: Holiday-Aware Backward Search
- Built an explicit `US_MARKET_HOLIDAYS` set covering all NYSE/NASDAQ holidays (2025–2027).
- `getLastTradingDate()` loops backward past both weekends and market holidays until it reaches a genuine trading day.
- During holidays, Cron detects that all symbols are already fresh for the true prior trading day and immediately exits silently in Phase 1, avoiding spurious writes and false gap healing.

---

## 7. The D1 2x Read Amplification Trap (Temp B-Tree & Order Mismatch)

**CRITICAL LESSON:** In SQLite and Cloudflare D1, querying with `WHERE symbol IN (...)` while ordering by a column that does not match the clustered primary key forces SQLite to construct a temporary in-memory B-Tree (`USE TEMP B-TREE FOR ORDER BY`). This doubles the number of rows read (`Rows read/returned = 2`).

### The Bug
- In `calculatePortfolioStats` and `calculatePortfolioPerformance`, the SQL was written as:
  ```sql
  SELECT symbol, date, close FROM stock_prices 
  WHERE symbol IN (?, ?, ...) AND date >= ? 
  ORDER BY date ASC
  ```
- The primary key of `stock_prices` is `(symbol, date)`. Because the query requested rows globally ordered by `date ASC` across all symbols, SQLite could not read the index in storage order.
- To sort the result, SQLite was forced to scan every matching row into a temporary B-Tree before returning it.
- **Impact:** `Rows read / Rows returned` was exactly **2**, burning **1.79 Million rows read** on this single query alone and pushing daily D1 read quota past the 75% limit (3.82M reads/day).

### The Solution: Align Sorting with Clustered Index
- Change the query ordering to match the composite primary key:
  ```sql
  SELECT symbol, date, close FROM stock_prices 
  WHERE symbol IN (?, ?, ...) AND date >= ? 
  ORDER BY symbol ASC, date ASC
  ```
- SQLite can now directly traverse the clustered index without intermediate sorting.
- **Verification (`EXPLAIN QUERY PLAN`):** `USE TEMP B-TREE FOR ORDER BY` completely disappeared.
- **Results:**
  - `Rows read/returned` dropped from **2 to 1**.
  - Query latency dropped from **0.83ms to 0.17ms** (5x faster).
  - Daily read volume plummeted by **96.7%** (from 1.79M rows down to ~59k rows).

---

## 8. Cross-Portfolio Shared Price Map & Tracked Symbol Caching

**CRITICAL LESSON:** Redundantly reading identical historical data across multiple portfolio evaluations or scanning static group member tables on every cron tick burns millions of unnecessary reads.

### The Bug
1. **Benchmark & Mega-Cap Redundancy:** Portfolios in the same batch frequently hold common benchmark symbols (`SPY`, `QQQ`) and popular mega-caps (`AAPL`, `MSFT`, `NVDA`). Each portfolio independently queried D1 for 1-year history.
2. **Every-Minute Group Member Scans:** Every minute cron tick executed `SELECT DISTINCT symbol FROM group_members` to know what to update, reading 1.15 Million rows per day on an essentially static table.

### The Solution: Two-Level In-Memory Caching
1. **Module-Level `group_members` Cache:**
   - In `cron.ts`, `getTrackedSymbols()` caches the symbol list in memory with a 10-minute TTL (`cachedTrackedSymbols`).
   - Slashes `group_members` full-table scans by **95%+** (saving ~1.1M reads/day).
2. **Batch-Level `sharedPriceMap`:**
   - In `cron.ts` Phase 4, instantiate `sharedPriceMap = new Map<string, { date: string, close: number }[]>()` across the batch.
   - Pass `sharedPriceMap` into `calculatePortfolioStats()`. Tickers fetched by Portfolio 1 are reused by Portfolios 2–5 with **zero database queries**.

---

## 9. The Idle-Loop Read Exhaustion Trap & Two-Tier Zero-Cost Completion Guard

**CRITICAL LESSON:** When all stocks and portfolios are updated for the day, repeatedly querying the database to confirm "is everything still fresh?" will exhaust your daily read quota during the 20+ hours of market downtime.

### The Bug
- After Phase 1 finishes updating all ~350 stocks and Phase 4 recalculates all 152 portfolios (typically within 45–60 minutes after market close), the system enters an idle state.
- However, on every subsequent minute trigger:
  - `SELECT symbol FROM stock_stats WHERE updated_at > ?` matched and returned all 347 fresh rows (**669.52k rows read/day**).
  - `SELECT count(*) FROM groups LEFT JOIN portfolio_stats...` scanned all 152 groups (**249.28k rows read/day**).
- Together, these two "all fresh" checks burned **918,800 rows read/day (65% of total system reads)** doing completely useless work!
- Furthermore, an un-reverted temporary catch-up trigger `"*/1 * * * *"` in `wrangler.toml` compounded this issue by running 24/7 (1,920 triggers/day).

### The Solution: Dual-Layer Zero-Cost Completion Guard (双层零开销哨兵)

```
[Cron Invocation]
       │
       ▼
┌──────────────────────────────────────────────┐
│ Level 1: In-Memory Completion Guard          │
│ completedCutoffTime === cutoffTime && < 60m? │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼ YES                       ▼ NO
┌──────────────────┐   ┌──────────────────────────────────────────────┐
│ Instant Return   │   │ Level 2: Cold-Start Index Fast-Path          │
│ (0 DB Queries,   │   │ SELECT FROM cron_logs ORDER BY timestamp     │
│  0 Rows Read,    │   │ DESC LIMIT 1 -> matches SKIP + Cutoff?       │
│  <0.01ms CPU)    │   └──────────────────────┬───────────────────────┘
└──────────────────┘                          │
                                ┌─────────────┴─────────────┐
                                ▼ YES                       ▼ NO
                       ┌──────────────────┐   ┌─────────────────────────┐
                       │ Instant Return   │   │ Run Full Refresh Checks │
                       │ (1 Row Read,     │   │ (Updates & Calculations)│
                       │  0.2ms Latency)  │   └─────────────────────────┘
                       └──────────────────┘
```

1. **Level 1 (Memory Guard - 0 Queries, 0 Rows Read, <0.01ms CPU):**
   - When `pendingSymbols.length === 0 && stalePfs === 0`, record `completedCutoffTime = cutoffTime` and `lastFreshCheckTime = Date.now()`.
   - Subsequent cron triggers within the same worker container check this flag at line 1 of `scheduled()` and exit immediately without any database queries or subrequests.
2. **Level 2 (Fast-Path on Cold Start - 1 Row Read, 0.2ms):**
   - If a new container starts cold (`completedCutoffTime === null`), it queries `cron_logs` with index:
     ```sql
     SELECT status, details, timestamp FROM cron_logs ORDER BY timestamp DESC LIMIT 1
     ```
   - If `status === 'SKIP'` and `details === 'Cutoff: ' + cutoffTime`, it restores the in-memory cache and exits immediately, reading **exactly 1 row** instead of 500 rows.
3. **Active Invalidation & Safety Fallback:**
   - Any admin/user write action (`/api/groups`, `/api/groups/:id/members`, `/api/import-x`, `/api/import-superinvestor`, `/api/admin/force-run-cron`, etc.) calls `invalidateCronCompletionCache()`.
   - An automatic 60-minute safety TTL ensures fresh checks are run once per hour to catch any direct DB changes.
4. **Trigger Cleanup:**
   - Removed temporary `"*/1 * * * *"` from `wrangler.toml`, restoring schedule to market-close hours only (480 minutes/day).

**Impact:** Eliminates ~900k daily idle reads, driving total daily system reads from **1.42M rows (< 29%)** down to **< 300k rows (< 6%)**.


