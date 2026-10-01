import { Bindings } from './types';
import { fetchQuotes } from './yahoo';
import { logCronStatus, saveQuotesToDB, getLastTradingDate, getESTDate, getESTTimestamp, updatePrices } from './db';
import { calculateStats } from './stats';
import { updateScoringMetrics } from './scoring/fetcher';

const PORTFOLIO_BATCH_SIZE = 5;

// In-memory cache for tracked symbols to eliminate repetitive D1 full scans on group_members (saving 1M+ rows_read)
let cachedTrackedSymbols: { symbols: string[]; timestamp: number } | null = null;
const TRACKED_SYMBOLS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// In-memory cache for trading day completion (eliminating ~900k idle reads per day)
let completedCutoffTime: string | null = null;
let lastFreshCheckTime: number = 0;
const FRESH_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes safety re-check

export function invalidateCronCompletionCache() {
    completedCutoffTime = null;
    lastFreshCheckTime = 0;
    cachedTrackedSymbols = null;
}

async function getTrackedSymbols(env: Bindings): Promise<string[]> {
    const now = Date.now();
    if (cachedTrackedSymbols && (now - cachedTrackedSymbols.timestamp < TRACKED_SYMBOLS_CACHE_TTL)) {
        return cachedTrackedSymbols.symbols;
    }
    const { results } = await env.DB.prepare("SELECT DISTINCT symbol FROM group_members").all();
    const symbols = [...new Set([...results.map((r: any) => r.symbol), 'SPY'])];
    cachedTrackedSymbols = { symbols, timestamp: now };
    return symbols;
}

export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    const runStart = Date.now();
    const isManualTrigger = (event as any)?.cron === 'MANUAL' || (event as any)?.type === 'manual';

    const lastTradingDateStr = getLastTradingDate();
    const cutoffTime = `${lastTradingDateStr} 16:00:00`;
    const now = Date.now();

    // Heartbeat: Log to console so it shows in Cloudflare Logs, but don't spam the DB
    console.log(`[Cron] Heartbeat check at ${new Date().toISOString()} | Target Cutoff: ${cutoffTime}`);

    // Fast-path Level 1: In-memory flag check (Zero cost: 0 DB queries, 0 rows read, <0.01ms CPU)
    if (!isManualTrigger && completedCutoffTime === cutoffTime && (now - lastFreshCheckTime < FRESH_CHECK_INTERVAL_MS)) {
        console.log(`[Cron] System fresh for cutoff ${cutoffTime} (verified ${Math.round((now - lastFreshCheckTime) / 60000)}m ago). Zero-cost skip.`);
        return;
    }

    // Fast-path Level 2: Cold-start or recycled container check via cron_logs index (Cost: exactly 1 row read)
    if (!isManualTrigger && !completedCutoffTime) {
        try {
            const lastLog = await env.DB.prepare(
                "SELECT status, details, timestamp FROM cron_logs ORDER BY timestamp DESC LIMIT 1"
            ).first() as { status: string; details: string; timestamp: string } | null;

            if (lastLog?.status === 'SKIP' && lastLog?.details === `Cutoff: ${cutoffTime}`) {
                const lastLogTime = new Date(lastLog.timestamp + ' EST').getTime();
                if (!isNaN(lastLogTime) && (now - lastLogTime < FRESH_CHECK_INTERVAL_MS)) {
                    completedCutoffTime = cutoffTime;
                    lastFreshCheckTime = now;
                    console.log(`[Cron Fast-Path] Cutoff ${cutoffTime} already verified fresh at ${lastLog.timestamp}. Zero-cost skip.`);
                    return;
                }
            }
        } catch (e) {
            console.warn('[Cron Fast-Path] Error reading last cron log, falling back to full check:', e);
        }
    }

    // 1. Get all unique active symbols from portfolios (using 10-min in-memory cache)
    const symbols = await getTrackedSymbols(env);

    console.log(`[Cron] Updating ${symbols.length} tracked symbols...`);

    // 2. Run updates in a background promise (keep worker alive)
    ctx.waitUntil((async () => {
        try {
            // --- Smart Resume Logic ---
            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
            const dayOfWeek = now.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            const lastTradingDateStr = getLastTradingDate();
            const cutoffTime = `${lastTradingDateStr} 16:00:00`;

            // Check stock_stats for freshness (final output)
            const { results: freshRows } = await env.DB.prepare(
                "SELECT symbol FROM stock_stats WHERE updated_at > ?"
            ).bind(cutoffTime).all();

            const freshSymbols = freshRows.map((r: any) => r.symbol);
            const pendingSymbols = symbols.filter(s => !freshSymbols.includes(s));
            let remainingPending = pendingSymbols.length;

            // ============================================================
            // PHASE 1: INITIALIZATION
            // ============================================================

            // If all symbols are already fresh, silently return without logging
            const initDuration = Date.now() - runStart;

            // Only log setup if we have symbols to process, to avoid spamming logs 
            if (pendingSymbols.length > 0) {
                await logCronStatus(env, 'SETUP',
                    `[1/4] Init: ${symbols.length} total, ${freshSymbols.length} fresh, ${pendingSymbols.length} pending`,
                    `Duration: ${initDuration}ms | Cutoff: ${cutoffTime}`
                );
            } else if (pendingSymbols.length === 0) {
                const { count: stalePfs } = await env.DB.prepare(`
                    SELECT count(*) as count FROM groups g
                    LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                    WHERE ps.updated_at IS NULL OR ps.updated_at < ?
                `).bind(cutoffTime).first() as any;

                if (stalePfs === 0) {
                    completedCutoffTime = cutoffTime;
                    lastFreshCheckTime = Date.now();

                    // Throttled SKIP log: Only log to database once per hour to avoid spam
                    const lastSkip = await env.DB.prepare(
                        "SELECT timestamp FROM cron_logs WHERE status IN ('SKIP', 'CHECKED') ORDER BY id DESC LIMIT 1"
                    ).first() as any;

                    let shouldLogSkip = true;
                    if (lastSkip?.timestamp) {
                        const lastTime = new Date(lastSkip.timestamp + ' EST').getTime();
                        shouldLogSkip = (Date.now() - lastTime) > 60 * 60 * 1000; // 60 minutes
                    }

                    if (shouldLogSkip) {
                        await logCronStatus(env, 'SKIP', 'System Fresh: All symbols and portfolios up to date.', `Cutoff: ${cutoffTime}`);
                    }
                    return;
                }
            }
            // ============================================================
            // PHASE 2: FETCH QUOTES & UPDATE PRICES
            // ============================================================
            const MAX_UPDATES_PER_RUN = 3; // Reduced to 3 to strictly stay within Cloudflare Workers Free limits (10ms CPU / 50 subrequests).
            const symbolsToProcess = pendingSymbols.slice(0, MAX_UPDATES_PER_RUN);
            const quoteStart = Date.now();
            let quotesCount = 0;
            let quoteErrors: string[] = [];
            let pricesUpdated = 0;
            let statsUpdated = 0;
            const dateStr = getLastTradingDate();
            const updatedAt = getESTTimestamp();

            try {
                const quotes = await fetchQuotes(symbolsToProcess, 1);
                if (quotes && quotes.length > 0) {
                    // 1. Save to stock_quotes (existing logic)
                    await saveQuotesToDB(env, quotes);
                    quotesCount += quotes.length;

                    // 2. Sequential processing for each symbol to prevent CPU spikes and subrequest exhaustion
                    let scoringUpdatedCount = 0;

                    for (const q of quotes) {
                        if (q.regularMarketPrice && q.regularMarketPrice > 0) {
                            try {
                                // 2a. Gap Detection & Split Detection Check (Auto-Healing)
                                const lastPriceRow = await env.DB.prepare(
                                    `SELECT date, close FROM stock_prices WHERE symbol = ? AND date < ? ORDER BY date DESC LIMIT 1`
                                ).bind(q.symbol, dateStr).first() as { date: string, close: number } | null;

                                let needsFullBackfill = false;
                                let isSplitDetected = false;

                                if (!lastPriceRow) {
                                    needsFullBackfill = true;
                                } else {
                                    const lastDate = new Date(lastPriceRow.date + 'T00:00:00Z');
                                    const currentDate = new Date(dateStr + 'T00:00:00Z');
                                    const dayDiff = Math.round((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                                    const dayOfWeek = currentDate.getUTCDay();

                                    const maxNormalGap = (dayOfWeek === 1 || dayOfWeek === 2) ? 4 : 2;
                                    if (dayDiff > maxNormalGap) {
                                        console.warn(`[Cron Auto-Heal] Detected historical price gap for ${q.symbol}: last date was ${lastPriceRow.date}, target is ${dateStr} (gap: ${dayDiff} days). Triggering auto-backfill.`);
                                        needsFullBackfill = true;
                                    } else if (lastPriceRow.close > 0) {
                                        const ratio = q.regularMarketPrice / lastPriceRow.close;
                                        if (ratio < 0.6 || ratio > 1.6) {
                                            console.warn(`[Cron Split Detection] Detected potential stock split for ${q.symbol}: ratio ${ratio.toFixed(2)} (Prev: ${lastPriceRow.close}, New: ${q.regularMarketPrice}). Triggering full history backfill.`);
                                            needsFullBackfill = true;
                                            isSplitDetected = true;
                                        }
                                    }
                                }

                                if (needsFullBackfill) {
                                    await updatePrices(env, q.symbol, true);
                                    pricesUpdated++;
                                    statsUpdated++;
                                } else {
                                    // Insert today's price (using current quote price as close)
                                    await env.DB.prepare(`
                                        INSERT OR REPLACE INTO stock_prices (symbol, date, close, open, high, low, volume, updated_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                    `).bind(
                                        q.symbol,
                                        dateStr,
                                        q.regularMarketPrice,
                                        q.regularMarketOpen || null,
                                        q.regularMarketDayHigh || null,
                                        q.regularMarketDayLow || null,
                                        q.regularMarketVolume || null,
                                        updatedAt
                                    ).run();
                                    pricesUpdated++;

                                    // 3. Recalculate stats using existing price history + new price
                                    const { results: history } = await env.DB.prepare(
                                        `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 400`
                                    ).bind(q.symbol).all();

                                    if (history && history.length > 0) {
                                        const pricesAsc = (history as any[]).map(h => ({
                                            symbol: q.symbol,
                                            date: h.date,
                                            close: h.close,
                                            open: h.open || h.close,
                                            high: h.high || h.close,
                                            low: h.low || h.close,
                                            volume: h.volume || 0
                                        })).reverse();
                                        const stats = calculateStats(q.symbol, pricesAsc as any);

                                        if (stats) {
                                            await env.DB.prepare(`
                                                INSERT OR REPLACE INTO stock_stats (
                                                    symbol, change_ytd, change_1y, delta_52w_high, 
                                                    sma_20, sma_50, sma_200, 
                                                    chart_1y, rs_rank_1m, updated_at
                                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                            `).bind(
                                                stats.symbol, stats.changeYTD, stats.change1Y, stats.delta52wHigh,
                                                stats.sma20, stats.sma50, stats.sma200,
                                                stats.chart1Y, stats.rsRank1M, updatedAt
                                            ).run();
                                            statsUpdated++;
                                        } else {
                                            await env.DB.prepare(`
                                                INSERT INTO stock_stats (symbol, updated_at) VALUES (?, ?)
                                                ON CONFLICT(symbol) DO UPDATE SET updated_at = excluded.updated_at
                                            `).bind(q.symbol, updatedAt).run();
                                        }
                                    } else {
                                        await env.DB.prepare(`
                                            INSERT INTO stock_stats (symbol, updated_at) VALUES (?, ?)
                                            ON CONFLICT(symbol) DO UPDATE SET updated_at = excluded.updated_at
                                        `).bind(q.symbol, updatedAt).run();
                                    }
                                }

                                // 4. Update Earnings & Scoring Metrics: Throttled to at most 1 ticker per run to avoid CPU / subrequest limits
                                if (scoringUpdatedCount < 1) {
                                    try {
                                        const yesterdayUTC = new Date(Date.now() - 20 * 60 * 60 * 1000)
                                            .toISOString().replace('T', ' ').substring(0, 19);
                                        const scoringFresh = await env.DB.prepare(
                                            "SELECT 1 FROM scoring_metrics WHERE symbol = ? AND updated_at >= ?"
                                        ).bind(q.symbol, yesterdayUTC).first();

                                        if (!scoringFresh) {
                                            const { updateTicker } = await import('./db');
                                            await updateTicker(env, q.symbol);
                                            await updateScoringMetrics(env, q.symbol);
                                            scoringUpdatedCount++;
                                        }
                                    } catch (errSync: any) {
                                        console.error(`[Cron] Earnings/Scoring update error for ${q.symbol}: ${errSync.message}`);
                                    }
                                }

                            } catch (e: any) {
                                console.error(`[Cron] Price/Stats insert error for ${q.symbol}: ${e.message}`);
                                try {
                                    await env.DB.prepare(`
                                        INSERT INTO stock_stats (symbol, updated_at) VALUES (?, ?)
                                        ON CONFLICT(symbol) DO UPDATE SET updated_at = excluded.updated_at
                                    `).bind(q.symbol, updatedAt).run();
                                } catch (_) {}
                            }
                        }
                    }

                    const failed = symbolsToProcess.filter(s => {
                        const q = quotes.find(quote => quote.symbol === s);
                        return !q || !q.regularMarketPrice || q.regularMarketPrice <= 0;
                    });
                    if (failed.length > 0) quoteErrors.push(...failed);
                } else {
                    quoteErrors.push(...symbolsToProcess);
                }

            }
            catch (e: any) {
                quoteErrors.push(...symbolsToProcess);
                console.error(`[Cron] Quote fetch error: ${e.message}`);
            }

            if (quoteErrors.length > 0) {
                // Update or insert updated_at for failed symbols to move them out of "pending" for the current window
                // but don't recalculate their stats. This prevents 1 symbol from blocking the system.
                for (const s of quoteErrors) {
                    try {
                        await env.DB.prepare(`
                            INSERT INTO stock_stats (symbol, updated_at) VALUES (?, ?)
                            ON CONFLICT(symbol) DO UPDATE SET updated_at = excluded.updated_at
                        `).bind(s, updatedAt).run();
                    } catch (dbErr: any) {
                        console.error(`[Cron] Failed to update error timestamp for ${s}: ${dbErr.message}`);
                    }
                }
            }

            // Anti-Stall Guarantee: Ensure EVERY symbol in symbolsToProcess is stamped with updated_at
            // so no single symbol can deadlock the cron queue across runs.
            for (const s of symbolsToProcess) {
                try {
                    await env.DB.prepare(`
                        INSERT INTO stock_stats (symbol, updated_at) VALUES (?, ?)
                        ON CONFLICT(symbol) DO UPDATE SET updated_at = excluded.updated_at
                    `).bind(s, updatedAt).run();
                } catch (_) {}
            }

            remainingPending -= symbolsToProcess.length;

            const quoteDuration = Date.now() - quoteStart;
            if (quotesCount > 0 || quoteErrors.length > 0) {
                await logCronStatus(env, 'QUOTES',
                    `[2/4] Fetch Quotes & Prices: ${quotesCount} quotes, ${pricesUpdated} prices, ${statsUpdated} stats`,
                    `Duration: ${quoteDuration}ms | Symbols: ${symbolsToProcess.join(',')}`
                );
            }


            // ============================================================
            // PHASE 4: PORTFOLIO STATS (Batching)
            // Only starts once ALL symbols are fresh for the current cutoff.
            // ============================================================
            if (remainingPending > 0) {
                // If we updated quotes this run, the overall SUCCESS marker will cover it.
                // Otherwise, verify phase won't log either since we're still capturing.
                return;
            }

            const portfolioStart = Date.now();
            let portfolioCount = 0;
            let portfolioErrors: string[] = [];

            // Find portfolios updated BEFORE the current cutoffTime (or never updated)
            const { results: staleGroups } = await env.DB.prepare(`
                SELECT g.id, g.name FROM groups g
                LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                WHERE ps.updated_at IS NULL OR ps.updated_at < ?
                LIMIT ?
            `).bind(cutoffTime, PORTFOLIO_BATCH_SIZE).all();

            if (staleGroups && staleGroups.length > 0) {
                const { calculatePortfolioStats } = await import('./portfolio');
                // Shared price cache across this batch of portfolios to eliminate redundant D1 queries
                const sharedPriceMap = new Map<string, { date: string; close: number | null }[]>();

                for (const g of staleGroups as any[]) {
                    try {
                        // Check if ALL symbols in THIS group are fresh
                        const { results: memberStatus } = await env.DB.prepare(`
                            SELECT gm.symbol, s.updated_at 
                            FROM group_members gm
                            LEFT JOIN stock_stats s ON gm.symbol = s.symbol
                            WHERE gm.group_id = ?
                        `).bind(g.id).all();

                        // A portfolio is "ready" if all its members are >= cutoffTime
                        const staleMembers = memberStatus.filter((m: any) => !m.updated_at || m.updated_at < cutoffTime);

                        if (staleMembers.length > 0) {
                            // Dead Symbol Threshold: 7 days ago (don't wait for these, e.g. delisted/halted)
                            const daysAgoThreshold = new Date(now);
                            daysAgoThreshold.setDate(now.getDate() - 7);
                            const tdaStr = daysAgoThreshold.toISOString().split('T')[0];

                            const nonDeadStaleMembers = staleMembers.filter((m: any) => !m.updated_at || m.updated_at > tdaStr);

                            if (nonDeadStaleMembers.length > 0) {
                                // Still waiting for legitimate updates for this portfolio
                                continue;
                            }
                            // Else: Proceed with update using whatever data we have for the "dead" ones
                        }

                        // 1. Recalculate Stats (reusing cached prices across portfolios)
                        await calculatePortfolioStats(env, g.id, sharedPriceMap);
                        try {
                            const { archivePortfolioScore } = await import('./scoring/archiver');
                            await archivePortfolioScore(env, g.id, false);
                        } catch (scoreErr) {
                            console.error(`[Cron] Score calculation error for ${g.id}:`, scoreErr);
                        }
                        portfolioCount++;
                    } catch (e: any) {
                        const safeName = g.name ? String(g.name).substring(0, 50) : `ID:${g.id}`;
                        portfolioErrors.push(safeName);
                        console.error(`[Cron] Portfolio stats error for ${safeName}: ${e.message}`);
                    }
                }
            }

            const portfolioDuration = Date.now() - portfolioStart;

            if (portfolioCount > 0) {
                const successfulPortfolios = staleGroups
                    .filter((g: any) => !portfolioErrors.includes(g.name ? String(g.name).substring(0, 50) : `ID:${g.id}`))
                    .map((g: any) => g.name ? String(g.name).substring(0, 50) : `ID:${g.id}`)
                    .join(', ');
                await logCronStatus(env, 'STATS',
                    `[3/4] Portfolio Stats: ${portfolioCount} recalculated (Batch of ${PORTFOLIO_BATCH_SIZE})`,
                    `Duration: ${portfolioDuration}ms${portfolioErrors.length > 0 ? ' | Failed: ' + portfolioErrors.join(',') : ''} | Portfolios: ${successfulPortfolios}`
                );
            } else if (portfolioErrors.length > 0) {
                await logCronStatus(env, 'STATS',
                    `[3/4] Portfolio Stats: FAILED (Batch of ${PORTFOLIO_BATCH_SIZE})`,
                    `Duration: ${portfolioDuration}ms | Failed: ${portfolioErrors.join(',')}`
                );
            }


            // ============================================================
            // PHASE 5: VERIFICATION
            // ============================================================
            const verifyStart = Date.now();
            let gapSymbols: string[] = [];

            // Verify that all active portfolio symbols have been processed in stock_stats
            const { results: gapRows } = await env.DB.prepare(`
                SELECT DISTINCT gm.symbol FROM group_members gm
                LEFT JOIN stock_stats s ON gm.symbol = s.symbol
                WHERE s.updated_at IS NULL OR s.updated_at <= ?
            `).bind(cutoffTime).all();

            gapSymbols = gapRows.map((r: any) => r.symbol);


            const verifyDuration = Date.now() - verifyStart;

            if (gapSymbols.length > 0) {
                await logCronStatus(env, 'WARNING',
                    `[4/4] Verification: ${gapSymbols.length} Quote/Stats gaps`,
                    `Duration: ${verifyDuration}ms | Gaps: ${gapSymbols.join(',')}`
                );
            } else if (quotesCount > 0 || portfolioCount > 0) {
                await logCronStatus(env, 'VERIFY',
                    `[4/4] Verification: PASSED (0 gaps)`,
                    `Duration: ${verifyDuration}ms`
                );
            }

            // ============================================================
            // FINAL SUMMARY
            // ============================================================
            const totalDuration = Date.now() - runStart;
            const hasErrors = quoteErrors.length > 0 || portfolioErrors.length > 0;
            const hasSignificantErrors = quoteErrors.length > 2 || portfolioErrors.length > 1;
            const finalStatus = hasSignificantErrors ? 'WARNING' : 'SUCCESS';

            // Log final summary ONLY if we did work or have errors
            if (quotesCount > 0 || portfolioCount > 0 || hasErrors) {
                await logCronStatus(env, finalStatus,
                    `Run Complete: ${quotesCount} quotes, ${pricesUpdated} prices, ${statsUpdated} stats`,
                    `Total: ${totalDuration}ms | Pending: ${remainingPending} remaining`
                );
                if (remainingPending === 0 && !hasSignificantErrors) {
                    // Only mark completion guard if ALL portfolios are also fresh (avoid locking out remaining portfolio batches)
                    const { count: remainingStalePfs } = await env.DB.prepare(`
                        SELECT count(*) as count FROM groups g
                        LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                        WHERE ps.updated_at IS NULL OR ps.updated_at < ?
                    `).bind(cutoffTime).first() as any;

                    if (remainingStalePfs === 0) {
                        completedCutoffTime = cutoffTime;
                        lastFreshCheckTime = Date.now();
                    }
                }
            } else {
                // Idle Run - Log CHECKED only once every 30 mins to reduce noise
                const lastChecked = await env.DB.prepare(
                    "SELECT timestamp FROM cron_logs WHERE status = 'CHECKED' ORDER BY id DESC LIMIT 1"
                ).first() as any;

                let shouldLog = true;
                if (lastChecked?.timestamp) {
                    const lastTime = new Date(lastChecked.timestamp + ' EST').getTime();
                    const now = Date.now();
                    shouldLog = (now - lastTime) > 30 * 60 * 1000; // 30 minutes
                }

                if (shouldLog) {
                    await logCronStatus(env, 'CHECKED',
                        `System Fresh: ${symbols.length} symbols checked`,
                        `Total: ${totalDuration}ms | Cutoff: ${cutoffTime}`
                    );
                }
            }

        } catch (e: any) {
            console.error('[Cron] Critical Error', e);
            await logCronStatus(env, 'FAILED', e.message, JSON.stringify(e));
        }
    })());
}
