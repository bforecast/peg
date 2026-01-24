# Security Incident Report - 2026-01-23

## 1. Incident Overview
On **January 23, 2026**, the scheduled cron job for `earnings-worker` (scheduled for 22:00-23:59 UTC) failed to execute. No logs were generated for the scheduled time, indicating a potential platform-level drop or resource exhaustion before startup.

## 2. Root Cause Analysis
Analysis of the logs (`logs-2026-01-24T11_22_43.863Z.csv`) revealed a massive **vulnerability scan attack** targeting `bxhub.bforecast.com` (a sibling worker in the same zone/account) just minutes before the scheduled cron window (approx **21:52 UTC**).

The attacker flooded the system with hundreds of requests targeting:
- `/.git/config`
- `/.env`, `/.env.production`
- `/.aws/credentials`
- `/wp-content/`
- `/phpinfo.php`
- `/package-updates/`

**Impact:**
This burst of traffic likely triggered **Cloudflare Account-level Rate Limiting**, **CPU Quota Exhaustion**, or **Worker Burst Limits**, causing the subsequent cron trigger for `earnings-worker` to be prioritized lower or dropped completely by the scheduler.

## 3. Mitigation & Resolution

### A. Immediate Fix (Backfill)
- Manually backfilled missing data for Jan 23 using a temporary cron trigger.
- Verified 100% data integrity (242/242 symbols restored).

### B. Permanent Fix (WAF)
A **Zone-level Web Application Firewall (WAF)** rule was deployed to block these requests at the Cloudflare Edge, preventing them from consuming Worker resources.

**WAF Rule Configuration:**
- **Navigation:** Cloudflare Dashboard > Security > Security Rules > Custom Rules
- **Rule Name:** `Block Security Scanner`
- **Action:** `Block`
- **Expression:**
```text
(http.request.uri.path contains "/.git") or 
(http.request.uri.path contains "/.env") or 
(http.request.uri.path contains "/.aws") or 
(http.request.uri.path contains "/wp-") or 
(http.request.uri.path contains ".sql") or 
(http.request.uri.path contains "phpinfo")
```

## 4. Future Prevention
1.  **WAF Active:** The new rule protects ALL subdomains (`pf.bforecast.com`, `bxhub.bforecast.com`, etc.) from wasting CPU on scan traffic.
2.  **Observability Enabled:** `wrangler.toml` updated to enable `[observability.logs]` and `[observability.traces]` to catch startup failures in the future.
3.  **Optimization:** Portfolio batch size reduced from 10 to 5 to lower CPU pressure per run.
