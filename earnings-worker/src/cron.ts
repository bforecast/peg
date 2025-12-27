import { Bindings } from './types';
import { fetchQuotes } from './yahoo_finance';
import { logCronStatus, saveQuotesToDB, getESTDate, getESTTimestamp } from './db';
import { calculateStats } from './stats';

export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log('Scheduled Update Triggered');
    const runStart = Date.now();

    // 1. Get all unique active symbols from portfolios
    const { results } = await env.DB.prepare("SELECT DISTINCT symbol FROM group_members").all();
    // Always include SPY for benchmark stats
    const symbols = [...new Set([...results.map((r: any) => r.symbol), 'SPY'])];

    console.log(`[Cron] Updating ${symbols.length} tracked symbols...`);

    // 2. Run updates in a background promise (keep worker alive)
    ctx.waitUntil((async () => {
        try {
            // --- Smart Resume Logic ---
            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
            const dayOfWeek = now.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            let cutoffTime = "";
            const pad = (n: number) => n.toString().padStart(2, '0');

            if (isWeekend) {
                const daysToSubtract = dayOfWeek === 0 ? 2 : 1;
                const lastFriday = new Date(now);
                lastFriday.setDate(now.getDate() - daysToSubtract);
                const lastFridayStr = `${lastFriday.getFullYear()}-${pad(lastFriday.getMonth() + 1)}-${pad(lastFriday.getDate())}`;
                cutoffTime = `${lastFridayStr} 16:00:00`;
            } else {
                const currentHour = now.getHours();
                if (currentHour < 16) {
                    const yesterday = new Date(now);
                    yesterday.setDate(now.getDate() - 1);
                    const yStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
                    cutoffTime = `${yStr} 16:00:00`;
                } else {
                    const todayStr = getESTDate();
                    cutoffTime = `${todayStr} 16:00:00`;
                }
            }

            // Check stock_stats for freshness (final output)
            const { results: freshRows } = await env.DB.prepare(
                "SELECT symbol FROM stock_stats WHERE updated_at > ?"
            ).bind(cutoffTime).all();

            const freshSymbols = freshRows.map((r: any) => r.symbol);
            const pendingSymbols = symbols.filter(s => !freshSymbols.includes(s));

            // ============================================================
            // PHASE 1: INITIALIZATION
            // ============================================================
            const initDuration = Date.now() - runStart;
            await logCronStatus(env, 'SETUP',
                `[1/4] Init: ${symbols.length} total, ${freshSymbols.length} fresh, ${pendingSymbols.length} pending`,
                `Duration: ${initDuration}ms | Cutoff: ${cutoffTime}`
            );

            if (pendingSymbols.length === 0) {
                await logCronStatus(env, 'SKIPPED',
                    `All ${symbols.length} symbols up-to-date`,
                    `Duration: ${initDuration}ms`
                );
                return;
            }


            // ============================================================
            // PHASE 2: FETCH QUOTES & UPDATE PRICES
            // ============================================================
            const MAX_UPDATES_PER_RUN = 10; // Increased to 10 after optimization (execution time ~6-10s)
            const symbolsToProcess = pendingSymbols.slice(0, MAX_UPDATES_PER_RUN);

            const quoteStart = Date.now();
            let quotesCount = 0;
            let quoteErrors: string[] = [];
            let pricesUpdated = 0;
            let statsUpdated = 0;

            // Fetch all selected symbols in one go (Yahoo batch supports this easily)
            try {
                const quotes = await fetchQuotes(symbolsToProcess);
                if (quotes && quotes.length > 0) {
                    // 1. Save to stock_quotes (existing logic)
                    await saveQuotesToDB(env, quotes);
                    quotesCount += quotes.length;

                    // 2. NEW: Insert today's price into stock_prices for each symbol
                    const dateStr = getESTDate();
                    const updatedAt = getESTTimestamp();

                    for (const q of quotes) {
                        if (q.regularMarketPrice && q.regularMarketPrice > 0) {
                            try {
                                // Insert today's price (using current quote price as close)
                                await env.DB.prepare(`
                                    INSERT OR REPLACE INTO stock_prices (symbol, date, close, open, high, low, volume, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `).bind(
                                    q.symbol,
                                    dateStr,
                                    q.regularMarketPrice,
                                    null, null, null, null,  // OHLV not available from quote, but close is enough
                                    updatedAt
                                ).run();
                                pricesUpdated++;

                                // 3. Recalculate stats using existing price history + new price
                                const { results: history } = await env.DB.prepare(
                                    `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 400`
                                ).bind(q.symbol).all();

                                if (history && history.length > 0) {
                                    const pricesAsc = (history as unknown as { date: string; close: number }[]).reverse();
                                    const stats = calculateStats(q.symbol, pricesAsc);

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
                                    }
                                }
                            } catch (e: any) {
                                console.error(`[Cron] Price/Stats insert error for ${q.symbol}: ${e.message}`);
                            }
                        }
                    }

                    const failed = symbolsToProcess.filter(s => !quotes.find(q => q.symbol === s));
                    if (failed.length > 0) quoteErrors.push(...failed);
                } else {
                    quoteErrors.push(...symbolsToProcess);
                }
            } catch (e: any) {
                quoteErrors.push(...symbolsToProcess);
                console.error(`[Cron] Quote fetch error: ${e.message}`);
            }

            const quoteDuration = Date.now() - quoteStart;
            await logCronStatus(env, 'QUOTES',
                `[2/4] Fetch Quotes & Prices: ${quotesCount} quotes, ${pricesUpdated} prices, ${statsUpdated} stats`,
                `Duration: ${quoteDuration}ms | Symbols: ${symbolsToProcess.join(',')}`
            );

            // NOTE: Phase 3 (Update Earnings) was removed because EPS estimates are already
            // fetched in Phase 2 via fetchQuotes (earningsTrend module) and saved to stock_quotes.

            // ============================================================
            // PHASE 4: PORTFOLIO STATS (Only when all symbols are updated)
            // ============================================================
            const portfolioStart = Date.now();
            const remainingPending = pendingSymbols.length - symbolsToProcess.length;
            let portfolioCount = 0;
            let portfolioErrors: string[] = [];

            // Only recalculate portfolio stats when ALL pending symbols have been processed
            if (remainingPending === 0) {
                const { results: groups } = await env.DB.prepare("SELECT id, name FROM groups").all();

                if (groups && groups.length > 0) {
                    const { calculatePortfolioStats } = await import('./portfolio');
                    for (const g of groups as any[]) {
                        try {
                            await calculatePortfolioStats(env, g.id);
                            portfolioCount++;
                        } catch (e: any) {
                            portfolioErrors.push(g.name || `ID:${g.id}`);
                            console.error(`[Cron] Portfolio stats error for ${g.name}: ${e.message}`);
                        }
                    }
                }

                const portfolioDuration = Date.now() - portfolioStart;
                await logCronStatus(env, 'STATS',
                    `[3/4] Portfolio Stats: ${portfolioCount}/${groups?.length || 0} recalculated (FINAL)`,
                    `Duration: ${portfolioDuration}ms${portfolioErrors.length > 0 ? ' | Failed: ' + portfolioErrors.join(',') : ''}`
                );
            } else {
                await logCronStatus(env, 'STATS',
                    `[3/4] Portfolio Stats: SKIPPED (${remainingPending} symbols still pending)`,
                    `Duration: 0ms`
                );
            }

            // ============================================================
            // PHASE 5: VERIFICATION (Only meaningful when all symbols processed)
            // ============================================================
            const verifyStart = Date.now();
            let gapSymbols: string[] = [];

            // Only run gap check when all symbols are processed (remainingPending === 0)
            if (remainingPending === 0) {
                const { results: gapRows } = await env.DB.prepare(`
                    SELECT q.symbol FROM stock_quotes q
                    LEFT JOIN stock_stats s ON q.symbol = s.symbol
                    WHERE q.updated_at > ? AND (s.updated_at IS NULL OR s.updated_at <= ?)
                `).bind(cutoffTime, cutoffTime).all();

                gapSymbols = gapRows.map((r: any) => r.symbol);
            }

            const verifyDuration = Date.now() - verifyStart;

            if (remainingPending > 0) {
                await logCronStatus(env, 'VERIFY',
                    `[4/4] Verification: SKIPPED (${remainingPending} symbols still pending)`,
                    `Duration: ${verifyDuration}ms`
                );
            } else if (gapSymbols.length > 0) {
                await logCronStatus(env, 'WARNING',
                    `[4/4] Verification: ${gapSymbols.length} Quote/Stats gaps`,
                    `Duration: ${verifyDuration}ms | Gaps: ${gapSymbols.join(',')}`
                );
            } else {
                await logCronStatus(env, 'VERIFY',
                    `[4/4] Verification: PASSED (0 gaps)`,
                    `Duration: ${verifyDuration}ms`
                );
            }

            // ============================================================
            // FINAL SUMMARY
            // ============================================================
            const totalDuration = Date.now() - runStart;
            const hasErrors = quoteErrors.length > 0 || portfolioErrors.length > 0 || (remainingPending === 0 && gapSymbols.length > 0);
            const finalStatus = hasErrors ? 'WARNING' : 'SUCCESS';

            await logCronStatus(env, finalStatus,
                `Run Complete: ${quotesCount} quotes, ${pricesUpdated} prices, ${statsUpdated} stats`,
                `Total: ${totalDuration}ms | Pending: ${remainingPending} remaining`
            );

        } catch (e: any) {
            console.error('[Cron] Critical Error', e);
            await logCronStatus(env, 'FAILED', e.message, JSON.stringify(e));
        }
    })());
}
