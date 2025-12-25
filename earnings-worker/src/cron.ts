import { Bindings } from './types';
import { fetchQuotes } from './yahoo_finance';
import { logCronStatus, saveQuotesToDB, updatePrices, updateTicker, getESTDate } from './db';

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
            await logCronStatus(env, 'PHASE',
                `[1/5] Init: ${symbols.length} total, ${freshSymbols.length} fresh, ${pendingSymbols.length} pending`,
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
            // PHASE 2: FETCH QUOTES
            // ============================================================
            const MAX_UPDATES_PER_RUN = 10; // Reduced for free tier
            const BATCH_SIZE = 10;
            const symbolsToProcess = pendingSymbols.slice(0, MAX_UPDATES_PER_RUN);

            const quoteStart = Date.now();
            let quotesCount = 0;
            let quoteErrors: string[] = [];

            for (let i = 0; i < symbolsToProcess.length; i += BATCH_SIZE) {
                const batch = symbolsToProcess.slice(i, i + BATCH_SIZE);
                try {
                    const quotes = await fetchQuotes(batch);
                    if (quotes && quotes.length > 0) {
                        await saveQuotesToDB(env, quotes);
                        quotesCount += quotes.length;
                        const failed = batch.filter(s => !quotes.find(q => q.symbol === s));
                        if (failed.length > 0) quoteErrors.push(...failed);
                    } else {
                        quoteErrors.push(...batch);
                    }
                } catch (e: any) {
                    quoteErrors.push(...batch);
                    console.error(`[Cron] Quote fetch error: ${e.message}`);
                }
            }

            const quoteDuration = Date.now() - quoteStart;
            await logCronStatus(env, 'PHASE',
                `[2/5] Fetch Quotes: ${quotesCount} fetched, ${quoteErrors.length} failed`,
                `Duration: ${quoteDuration}ms | Symbols: ${symbolsToProcess.join(',')}`
            );

            // ============================================================
            // PHASE 3: UPDATE PRICES & STATS
            // ============================================================
            const priceStart = Date.now();
            let pricesCount = 0;
            let statsCount = 0;
            let priceErrors: string[] = [];

            for (const symbol of symbolsToProcess) {
                try {
                    const priceRes = await updatePrices(env, symbol);
                    if (priceRes && priceRes.count > 0) pricesCount++;
                    // Note: updatePrices also updates stock_stats

                    const tickerRes = await updateTicker(env, symbol);
                    if (tickerRes && tickerRes.count > 0) statsCount++;
                } catch (e: any) {
                    priceErrors.push(symbol);
                    console.error(`[Cron] Price/Stats error for ${symbol}: ${e.message}`);
                }
            }

            const priceDuration = Date.now() - priceStart;
            await logCronStatus(env, 'PHASE',
                `[3/5] Update Prices: ${pricesCount} prices, ${statsCount} earnings | ${priceErrors.length} errors`,
                `Duration: ${priceDuration}ms${priceErrors.length > 0 ? ' | Failed: ' + priceErrors.join(',') : ''}`
            );

            // ============================================================
            // PHASE 4: PORTFOLIO STATS
            // ============================================================
            const portfolioStart = Date.now();
            const { results: groups } = await env.DB.prepare("SELECT id, name FROM groups").all();
            let portfolioCount = 0;
            let portfolioErrors: string[] = [];

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
            await logCronStatus(env, 'PHASE',
                `[4/5] Portfolio Stats: ${portfolioCount}/${groups?.length || 0} recalculated`,
                `Duration: ${portfolioDuration}ms${portfolioErrors.length > 0 ? ' | Failed: ' + portfolioErrors.join(',') : ''}`
            );

            // ============================================================
            // PHASE 5: VERIFICATION
            // ============================================================
            const verifyStart = Date.now();
            const { results: gapRows } = await env.DB.prepare(`
                SELECT q.symbol FROM stock_quotes q
                LEFT JOIN stock_stats s ON q.symbol = s.symbol
                WHERE q.updated_at > ? AND (s.updated_at IS NULL OR s.updated_at <= ?)
            `).bind(cutoffTime, cutoffTime).all();

            const gapSymbols = gapRows.map((r: any) => r.symbol);
            const verifyDuration = Date.now() - verifyStart;

            if (gapSymbols.length > 0) {
                await logCronStatus(env, 'WARNING',
                    `[5/5] Verification: ${gapSymbols.length} Quote/Stats gaps`,
                    `Duration: ${verifyDuration}ms | Gaps: ${gapSymbols.join(',')}`
                );
            } else {
                await logCronStatus(env, 'PHASE',
                    `[5/5] Verification: PASSED (0 gaps)`,
                    `Duration: ${verifyDuration}ms`
                );
            }

            // ============================================================
            // FINAL SUMMARY
            // ============================================================
            const totalDuration = Date.now() - runStart;
            const hasErrors = quoteErrors.length > 0 || priceErrors.length > 0 || portfolioErrors.length > 0 || gapSymbols.length > 0;
            const finalStatus = hasErrors ? 'WARNING' : 'SUCCESS';

            await logCronStatus(env, finalStatus,
                `Run Complete: ${quotesCount} quotes, ${pricesCount} prices, ${portfolioCount} portfolios`,
                `Total: ${totalDuration}ms | Pending: ${pendingSymbols.length - symbolsToProcess.length} remaining`
            );

        } catch (e: any) {
            console.error('[Cron] Critical Error', e);
            await logCronStatus(env, 'FAILED', e.message, JSON.stringify(e));
        }
    })());
}
