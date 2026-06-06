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
crons = ["*/1 21-23,0-1 * * 1-5", "*/1 * * * *"]
```

### Step 2: Deploy to Production
Run the deploy command to activate the temporary catch-up trigger:
```powershell
npm run deploy
```

### Step 3: Monitor Database Progress
Query the D1 database to verify that the worker is successfully processing symbols in 10-item batches and writing logs:
```powershell
npx wrangler d1 execute earnings-db --remote --command "SELECT * FROM cron_logs ORDER BY id DESC LIMIT 10"
```
*Look for `freshSymbols` count rising and `pendingSymbols` count falling every minute.*

### Step 4: Revert and Clean Up
Once the catch-up is complete (`pendingSymbols: 0` and `portfolio_stats` recalculation logged), revert the change in `wrangler.toml` and deploy:
```powershell
git restore wrangler.toml
npm run deploy
```
This ensures that the repository remains 100% clean and production does not continue running the cron job every minute.

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

