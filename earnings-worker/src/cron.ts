import { Bindings } from './types';
import { fetchQuotes } from './yahoo_finance';
import { logCronStatus, saveQuotesToDB, updatePrices, updateTicker, getESTDate } from './db';

export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log('Scheduled Update Triggered');

    // 1. Get all unique active symbols from portfolios
    const { results } = await env.DB.prepare("SELECT DISTINCT symbol FROM group_members").all();
    const symbols = results.map((r: any) => r.symbol);

    console.log(`[Cron] Updating ${symbols.length} tracked symbols...`);

    // 2. Run updates in a background promise (keep worker alive)
    ctx.waitUntil((async () => {
        try {
            await logCronStatus(env, 'STARTED', `Processing ${symbols.length} portfolio symbols`);

            // --- Smart Resume Logic ---
            // 1. Define "Fresh" as updated after 4:00 PM EST today (Market Close)
            const todayStr = getESTDate(); // YYYY-MM-DD in NY
            const cutoffTime = `${todayStr} 16:00:00`;

            // 2. Find stocks already updated after cutoff
            // Note: DB stores EST strings, so direct string comparison works
            const { results: freshRows } = await env.DB.prepare(
                "SELECT symbol FROM stock_quotes WHERE updated_at > ?"
            ).bind(cutoffTime).all();

            const freshSymbols = freshRows.map((r: any) => r.symbol);
            const pendingSymbols = symbols.filter(s => !freshSymbols.includes(s));

            console.log(`[Smart Resume] Total: ${symbols.length}, Fresh: ${freshSymbols.length}, Pending: ${pendingSymbols.length}`);

            if (pendingSymbols.length === 0) {
                const msg = `All ${symbols.length} symbols already updated today (after ${cutoffTime})`;
                console.log(`[Cron] ${msg}`);
                await logCronStatus(env, 'SKIPPED', msg);
                return;
            }

            // --- Execution ---

            const BATCH_SIZE = 5;
            let successCount = 0;
            let failedCount = 0;
            const failedSymbols: string[] = [];

            // Only process pending
            for (let i = 0; i < pendingSymbols.length; i += BATCH_SIZE) {
                const batch = pendingSymbols.slice(i, i + BATCH_SIZE);
                try {
                    const quotes = await fetchQuotes(batch);

                    if (quotes && quotes.length > 0) {
                        await saveQuotesToDB(env, quotes);

                        // Calculate stats
                        const batchSuccess = quotes.map(q => q.symbol);
                        successCount += batchSuccess.length;

                        const batchFailed = batch.filter(s => !batchSuccess.includes(s));
                        if (batchFailed.length > 0) {
                            failedCount += batchFailed.length;
                            failedSymbols.push(...batchFailed);
                        }
                    } else {
                        // All failed
                        failedCount += batch.length;
                        failedSymbols.push(...batch);
                    }
                } catch (e) {
                    console.error(`[Cron] Error updating quotes for batch ${batch.join(',')}`, e);
                    failedCount += batch.length;
                    failedSymbols.push(...batch);
                }

                // Update secondary tables (Prices/Tickers) for *all* in batch (fallback possibility?)
                // Actually, if quote fetch failed, price update might still work via Yahoo? 
                // Let's run it for all to be safe.
                await Promise.all(batch.map(async (symbol) => {
                    try {
                        await updatePrices(env, symbol);
                        await updateTicker(env, symbol);
                    } catch (e) {
                        // failing secondary updates isn't critical for the "Main Cron Status"
                        console.error(`Update failed for ${symbol}`, e);
                    }
                }));

                await new Promise(r => setTimeout(r, 1000));
            }

            const msg = `Complete: ${successCount}/${pendingSymbols.length} updated. (${freshSymbols.length} skipped)`;
            const details = failedCount > 0 ? `Failed: ${failedSymbols.join(', ')}` : 'Clean run';

            console.log('[Cron] ' + msg);
            await logCronStatus(env, 'SUCCESS', msg, details);
        } catch (e: any) {
            console.error('[Cron] Critical Error', e);
            await logCronStatus(env, 'FAILED', e.message, JSON.stringify(e));
        }
    })());
}
