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
            // 1. Define "Fresh" based on Market Close
            // If Weekday (Mon-Fri): Fresh if updated after 16:00 EST Today.
            // If Weekend (Sat-Sun): Fresh if updated after 16:00 EST *Last Friday*.

            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
            const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            let cutoffTime = "";

            if (isWeekend) {
                // Calculate last Friday
                const dist = (dayOfWeek + 7 - 5) % 7; // Distance to Friday (Sun=0->2 days ago, Sat=6->1 day ago)
                // Actually easier: just subtract days
                const daysToSubtract = dayOfWeek === 0 ? 2 : 1;
                const lastFriday = new Date(now);
                lastFriday.setDate(now.getDate() - daysToSubtract);

                // Format YYYY-MM-DD
                const pad = (n: number) => n.toString().padStart(2, '0');
                const lastFridayStr = `${lastFriday.getFullYear()}-${pad(lastFriday.getMonth() + 1)}-${pad(lastFriday.getDate())}`;

                cutoffTime = `${lastFridayStr} 16:00:00`;
                console.log(`[Cron] It's the Weekend. Checking freshness against Friday Close: ${cutoffTime}`);
            } else {
                // Weekday (Mon-Fri)
                // If it's before 16:00 EST, we should check against *Yesterday* 16:00 EST
                // If it's after 16:00 EST, we check against *Today* 16:00 EST

                const currentHour = now.getHours(); // 0-23 in EST (via toLocaleString setup above?)
                // Wait, 'now' is constructed from toLocaleString string, so getHours() returns EST hour.

                if (currentHour < 16) {
                    // Start of day (00:00 - 15:59): Market hasn't closed yet today.
                    // We want data from Yesterday Close.
                    const yesterday = new Date(now);
                    yesterday.setDate(now.getDate() - 1);

                    const pad = (n: number) => n.toString().padStart(2, '0');
                    const yStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
                    cutoffTime = `${yStr} 16:00:00`;
                    console.log(`[Cron] Early Morning Run (${currentHour}:xx). Checking vs Yesterday Close: ${cutoffTime}`);
                } else {
                    // Late day (16:00 - 23:59): Market Closed today.
                    // We want data from Today Close.
                    const todayStr = getESTDate(); // YYYY-MM-DD
                    cutoffTime = `${todayStr} 16:00:00`;
                    console.log(`[Cron] Post-Market Run. Checking vs Today Close: ${cutoffTime}`);
                }
            }

            // 2. Find stocks already updated after cutoff
            // Note: DB stores EST strings, so direct string comparison works
            const { results: freshRows } = await env.DB.prepare(
                "SELECT symbol FROM stock_quotes WHERE updated_at > ?"
            ).bind(cutoffTime).all();

            const freshSymbols = freshRows.map((r: any) => r.symbol);
            const pendingSymbols = symbols.filter(s => !freshSymbols.includes(s));

            console.log(`[Smart Resume] Cutoff: ${cutoffTime}. Total: ${symbols.length}, Fresh: ${freshSymbols.length}, Pending: ${pendingSymbols.length}`);

            if (pendingSymbols.length === 0) {
                const msg = `All ${symbols.length} symbols already updated today (after ${cutoffTime})`;
                console.log(`[Cron] ${msg}`);
                await logCronStatus(env, 'SKIPPED', msg);
                return;
            }

            // --- Execution ---

            const MAX_UPDATES_PER_RUN = 30; // Limit processing to avoid CPU timeout on free tier
            const symbolsToProcess = pendingSymbols.slice(0, MAX_UPDATES_PER_RUN);

            if (symbolsToProcess.length < pendingSymbols.length) {
                console.log(`[Cron] Rate Limiting: Processing first ${symbolsToProcess.length} of ${pendingSymbols.length} pending symbols.`);
            }

            const BATCH_SIZE = 5;
            let successCount = 0;
            let failedCount = 0;
            const failedSymbols: string[] = [];

            // Only process pending (limited subset)
            for (let i = 0; i < symbolsToProcess.length; i += BATCH_SIZE) {
                const batch = symbolsToProcess.slice(i, i + BATCH_SIZE);
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

            const msg = `Result: ${successCount} updated, ${failedCount} failed, ${freshSymbols.length} skipped.`;
            const details = failedCount > 0 ? `Failed: ${failedSymbols.join(', ')}` : 'Clean run';

            console.log('[Cron] ' + msg);
            await logCronStatus(env, 'SUCCESS', msg, details);
        } catch (e: any) {
            console.error('[Cron] Critical Error', e);
            await logCronStatus(env, 'FAILED', e.message, JSON.stringify(e));
        }
    })());
}
