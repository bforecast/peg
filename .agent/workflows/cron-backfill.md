---
description: Backfill missed cron data using temporary Cloudflare cron trigger
---

# Temporary Cron Backfill

Use this method when the Cloudflare cron job missed a day and you need to backfill data using the production cron infrastructure (not local dev which has CPU limits).

## When to Use
- Cron job failed to run on a scheduled day
- Need to process many symbols that would timeout via local HTTP triggers
- Want to use production Cloudflare CPU limits (30s) instead of HTTP limits (50ms)

## Steps

### 1. Add Temporary Cron Schedule
Edit `wrangler.toml` and add a second cron expression for the current UTC hour:

```toml
[triggers]
crons = ["*/1 22-23 * * 1-5", "*/1 1-3 * * *"]  # TEMP: second cron for backfill
```

The second expression should cover the current UTC hour range. Example patterns:
- `*/1 1-3 * * *` = Every minute, 01:00-03:59 UTC, any day
- `*/1 14-16 * * 6` = Every minute, 14:00-16:59 UTC, Saturday only

### 2. Deploy
```powershell
npx wrangler deploy
```

### 3. Monitor Progress
Wait for Cloudflare to trigger the cron automatically (every minute). Check progress:

```powershell
# Set the cutoff date (default: last trading day at market close)
$CutoffDate = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd") + " 16:00:00"
# Or specify manually:
# $CutoffDate = "2026-01-16 16:00:00"

npx wrangler d1 execute earnings-db --command "SELECT count(*) as fresh_count FROM stock_stats WHERE updated_at >= '$CutoffDate'" --remote
```

Check cron logs:
```powershell
npx wrangler d1 execute earnings-db --command "SELECT timestamp, status, message FROM cron_logs ORDER BY id DESC LIMIT 10" --remote
```

### 4. Remove Temporary Cron
Once backfill is complete (pending = 0), remove the temporary cron from `wrangler.toml`:
```toml
[triggers]
crons = ["*/1 22-23 * * 1-5"]  # Original only
```

// turbo
### 5. Redeploy
```powershell
npx wrangler deploy
```

## Why This Works
- Cloudflare's scheduled worker triggers have higher CPU limits (30s) than HTTP requests (50ms-500ms)
- The real cron job (`src/cron.ts`) uses smart batching (10 symbols/run) and skips already-fresh data
- Production infrastructure handles `ctx.waitUntil` properly unlike `wrangler dev --remote`
