import { Bindings, StockPrice } from './types';
import { calculateStats } from './stats';
import { getESTTimestamp, updatePrices } from './db';

function getDateDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

const BENCHMARK_SYMBOL = "SPY";
const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE = 0.04; // 4% approximation for Sharpe

export async function calculatePortfolioStats(env: Bindings, groupId: number) {
    console.log(`[Portfolio Stats] Starting calculation for group ${groupId}`);
    
    try {
        // 1. Get Portfolio Members & Allocations
        const { results: members } = await env.DB.prepare(
            "SELECT symbol, allocation FROM group_members WHERE group_id = ?"
        ).bind(groupId).all();

        if (!members || members.length === 0) {
            console.warn(`[Portfolio Stats] No members found for group ${groupId}`);
            const updatedAt = getESTTimestamp();
            await env.DB.prepare(`
                INSERT OR REPLACE INTO portfolio_stats (group_id, cagr, std_dev, max_drawdown, sharpe, sortino, updated_at)
                VALUES (?, 0, 0, 0, 0, 0, ?)
            `).bind(groupId, updatedAt).run();
            return null;
        }
        
        console.log(`[Portfolio Stats] Found ${members.length} members for group ${groupId}`);

    const symbols = members.map((m: any) => m.symbol);
    const targetAllocations = new Map<string, number>();
    members.forEach((m: any) => targetAllocations.set(m.symbol, Number(m.allocation) || 0));

    // 2. Fetch History (Dynamic 1 Year window)
    // We fetch a bit more than 252 days to ensure we have overlap, e.g. 370 calendar days
    const startDate = getDateDaysAgo(370);

    // 2. Fetch History for ALL members + Benchmark
    const allSymbols = [...new Set([...symbols, BENCHMARK_SYMBOL])];
    const priceMap = new Map<string, { date: string; close: number | null }[]>();

    // Optimization: Batch Fetch from D1
    // SQLite limit is usually high (999 vars), but let's batch by 50 to be safe
    const BATCH_SIZE = 50;

    for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
        const batch = allSymbols.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');

        try {
            const query = `SELECT symbol, date, close FROM stock_prices WHERE symbol IN (${placeholders}) AND date >= ? ORDER BY date ASC`;
            const { results } = await env.DB.prepare(query)
                .bind(...batch, startDate)
                .all();

            if (results) {
                // Group by symbol
                results.forEach((row: any) => {
                    if (!priceMap.has(row.symbol)) {
                        priceMap.set(row.symbol, []);
                    }
                    priceMap.get(row.symbol)!.push({ date: row.date, close: row.close });
                });
            }
        } catch (err) {
            console.error("Error batch fetching prices:", err);
        }
    }

    // Benchmark Data
    const spyPrices = priceMap.get(BENCHMARK_SYMBOL);
    if (!spyPrices || spyPrices.length < 50) {
        throw new Error(`Batch Calc: Insufficient Spy Data (${spyPrices?.length || 0})`);
    }

    // 3. Normalize Date Range (Target 365 Days)
    // We fetched 370 days, but we want the stats to represent "1 Year" (365 days).
    const targetStartDate = getDateDaysAgo(365);
    let commonStartDate = targetStartDate;

    const validSymbols: string[] = [];
    let validAllocationSum = 0;

    for (const sym of symbols) {
        const history = priceMap.get(sym);
        if (!history || history.length < 30) {
            console.warn(`[Portfolio Stats] Missing or insufficient history for ${sym} (${history?.length || 0} days), excluding from Group ${groupId} stats.`);
            continue;
        }

        // Find the actual available start date for this symbol
        // If symbol IPO'd recently, its start date might be later than targetStartDate
        const symStartDate = history[0].date;
        if (symStartDate > commonStartDate) {
            commonStartDate = symStartDate;
        }

        validSymbols.push(sym);
        validAllocationSum += targetAllocations.get(sym) || 0;
    }

    if (validSymbols.length === 0) {
        console.warn(`[Portfolio Stats] No valid symbols data for group ${groupId}`);
        const updatedAt = getESTTimestamp();
        await env.DB.prepare(`
            INSERT OR REPLACE INTO portfolio_stats (group_id, cagr, std_dev, max_drawdown, sharpe, sortino, updated_at)
            VALUES (?, 0, 0, 0, 0, 0, ?)
        `).bind(groupId, updatedAt).run();
        return null;
    }

    // Re-normalize allocations if some symbols were dropped
    if (validAllocationSum < 99 && validAllocationSum > 0) {
        const scale = 100 / validAllocationSum;
        validSymbols.forEach(s => {
            const old = targetAllocations.get(s) || 0;
            targetAllocations.set(s, old * scale);
        });
    }

    // Filter Benchmark to this start date
    // Note: commonStartDate is now Max(365_days_ago, latest_start_date_of_any_symbol)
    const validSpy = spyPrices?.filter(p => p.date >= commonStartDate) || [];

    if (validSpy.length === 0) throw new Error(`Batch Calc: No valid Spy data after ${commonStartDate}`);

    // 4. Run Simulation
    // Initial Capital = 100,000
    const INITIAL_CAPITAL = 100000;

    // Calculate Shares purchased on Day 0
    const shares = new Map<string, number>();

    validSymbols.forEach(sym => {
        const history = priceMap.get(sym)!;
        const matchingPrice = history.find(p => p.date >= commonStartDate)?.close || history[history.length - 1]?.close || 0;
        const alloc = targetAllocations.get(sym) || 0;
        const dollarAmount = (alloc / 100) * INITIAL_CAPITAL;
        if (matchingPrice > 0) {
            shares.set(sym, dollarAmount / matchingPrice);
        } else {
            shares.set(sym, 0);
        }
    });

    // Create Date-to-Price Maps for each symbol for O(1) lookups
    const symbolPriceMaps = new Map<string, Map<string, number>>();
    for (const [sym, history] of priceMap.entries()) {
        const dateMap = new Map<string, number>();
        history.forEach(h => {
            if (h.close !== null && h.close !== undefined) {
                dateMap.set(h.date, h.close);
            }
        });
        symbolPriceMaps.set(sym, dateMap);
    }

    // Daily Value Tracking
    const portfolioCurve: { date: string, value: number }[] = [];
    const benchmarkCurve: { date: string, value: number }[] = [];
    const lastKnownPrices = new Map<string, number>();

    // Initial price seed
    validSymbols.forEach(sym => {
        const history = priceMap.get(sym)!;
        const matchingPrice = history.find(p => p.date >= commonStartDate)?.close || history[history.length - 1]?.close || 0;
        if (matchingPrice > 0) lastKnownPrices.set(sym, matchingPrice);
    });

    // Simulation Loop  
    for (const day of validSpy) {
        const date = day.date;
        let dailyValue = 0;

        // Sum holdings with Forward Fill
        for (const sym of symbols) {
            const dateMap = symbolPriceMaps.get(sym);
            const close = dateMap?.get(date);

            if (close !== undefined && close !== null) {
                dailyValue += (shares.get(sym) || 0) * close;
                // Update last known price
                lastKnownPrices.set(sym, close);
            } else {
                // Missing data for this day - use last known price (forward fill)
                const lastPrice = lastKnownPrices.get(sym);
                if (lastPrice) {
                    dailyValue += (shares.get(sym) || 0) * lastPrice;
                }
            }
        }

        // Only record if we have value 
        if (dailyValue > 0 && day.close) {
            portfolioCurve.push({ date, value: dailyValue });

            const spyStart = validSpy[0].close || 0;
            if (spyStart > 0) {
                const spyVal = (day.close / spyStart) * INITIAL_CAPITAL;
                benchmarkCurve.push({ date, value: spyVal });
            }
        }
    }



    if (portfolioCurve.length < 30) {
        console.warn(`[Portfolio Stats] Curve too short (${portfolioCurve.length} days) for group ${groupId}. CommonStart: ${commonStartDate}, ValidSpy: ${validSpy.length}`);
        const updatedAt = getESTTimestamp();
        await env.DB.prepare(`
            INSERT OR REPLACE INTO portfolio_stats (group_id, cagr, std_dev, max_drawdown, sharpe, sortino, updated_at)
            VALUES (?, 0, 0, 0, 0, 0, ?)
        `).bind(groupId, updatedAt).run();
        return null;
    }

    // 5. Calculate Metrics

    // A. CAGR
    const endVal = portfolioCurve[portfolioCurve.length - 1].value;
    const startVal = portfolioCurve[0].value;
    const days = portfolioCurve.length;
    const years = days / TRADING_DAYS_PER_YEAR;

    const cagr = (Math.pow(endVal / startVal, 1 / years) - 1) * 100;

    // B. Daily Returns
    const returns: number[] = [];
    const benchReturns: number[] = [];
    for (let i = 1; i < portfolioCurve.length; i++) {
        const r = (portfolioCurve[i].value - portfolioCurve[i - 1].value) / portfolioCurve[i - 1].value;
        returns.push(r);

        const b = (benchmarkCurve[i].value - benchmarkCurve[i - 1].value) / benchmarkCurve[i - 1].value;
        benchReturns.push(b);
    }

    // C. Standard Deviation (Annualized)
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

    // D. Sharpe Ratio
    const sharpe = ((cagr / 100) - RISK_FREE_RATE) / (stdDev / 100);

    // E. Sortino Ratio
    const downsideReturns = returns.filter(r => r < 0);
    const downsideVar = downsideReturns.reduce((a, b) => a + Math.pow(b - 0, 2), 0) / returns.length;
    const downsideDev = Math.sqrt(downsideVar) * Math.sqrt(TRADING_DAYS_PER_YEAR);
    const sortino = ((cagr / 100) - RISK_FREE_RATE) / downsideDev;

    // F. Max Drawdown
    let maxDD = 0;
    let peak = startVal;
    for (const p of portfolioCurve) {
        if (p.value > peak) peak = p.value;
        const dd = (p.value - peak) / peak;
        if (dd < maxDD) maxDD = dd;
    }
    maxDD = maxDD * 100; // Percentage

    // G. Correlation with SPY
    const meanBench = benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;
    let cov = 0;
    let varBench = 0;
    for (let i = 0; i < returns.length; i++) {
        cov += (returns[i] - mean) * (benchReturns[i] - meanBench);
        varBench += Math.pow(benchReturns[i] - meanBench, 2);
    }
    cov /= returns.length;
    const stdBench = Math.sqrt(varBench / returns.length); // Use unitless daily std for correlation
    const stdDaily = Math.sqrt(variance);

    // Fix: Using daily std dev for correlation calculation
    const correlation = cov / (stdDaily * stdBench);

    // H. 1-Day Change (from last 2 days of portfolio curve)
    let change1D = 0;
    if (portfolioCurve.length >= 2) {
        const lastVal = portfolioCurve[portfolioCurve.length - 1].value;
        const prevVal = portfolioCurve[portfolioCurve.length - 2].value;
        if (prevVal > 0) {
            change1D = ((lastVal - prevVal) / prevVal) * 100; // Percentage
        }
    }

    // I. Diversification Ratio (DR)
    // Formula: (Sum of Weighted Volatilities of Components) / (Portfolio Volatility)
    // DR = Sum(w_i * sigma_i) / sigma_p
    let weightedVolSum = 0;

    // We already have daily returns for the portfolio (variance -> stdDev)
    // We need to calculate Annualized Standard Deviation for EACH component
    // We can reuse the priceMap data

    validSymbols.forEach(sym => {
        const history = priceMap.get(sym)!;
        // Filter history to match simulation start date
        const validHistory = history.filter(p => p.date >= commonStartDate);

        if (validHistory.length < 30) return; // Skip if insufficient data

        // Calculate Daily Returns
        const dailyRets: number[] = [];
        for (let i = 1; i < validHistory.length; i++) {
            const prev = validHistory[i - 1].close;
            const curr = validHistory[i].close;
            if (prev !== null && prev !== undefined && curr !== null && curr !== undefined && prev > 0) {
                dailyRets.push((curr - prev) / prev);
            }
        }

        if (dailyRets.length === 0) return;

        // Std Dev of Daily Returns
        const meanR = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
        const varR = dailyRets.reduce((a, b) => a + Math.pow(b - meanR, 2), 0) / dailyRets.length;
        const stdDailyR = Math.sqrt(varR);
        const stdAnnualR = stdDailyR * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100; // Percentage

        // Weight
        const w = (targetAllocations.get(sym) || 0) / 100; // Decimal weight

        weightedVolSum += w * stdAnnualR;
    });

    let dr = 0;
    if (stdDev > 0) {
        dr = weightedVolSum / stdDev;
    }

    // Helper to sanitize NaN/Infinity
    const safeNum = (n: number) => (isNaN(n) || !isFinite(n)) ? null : n;

    // 6. Save to DB
    const updateTime = getESTTimestamp();
    try {
        await env.DB.prepare(`
            INSERT INTO portfolio_stats(
                    group_id, cagr, std_dev, max_drawdown, sharpe, sortino, correlation_spy, change_1d, dr, updated_at
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(group_id) DO UPDATE SET
                cagr = excluded.cagr,
                std_dev = excluded.std_dev,
                max_drawdown = excluded.max_drawdown,
                sharpe = excluded.sharpe,
                sortino = excluded.sortino,
                correlation_spy = excluded.correlation_spy,
                change_1d = excluded.change_1d,
                dr = excluded.dr,
                updated_at = excluded.updated_at
        `).bind(
            groupId,
            safeNum(cagr),
            safeNum(stdDev),
            safeNum(maxDD),
            safeNum(sharpe),
            safeNum(sortino),
            safeNum(correlation),
            safeNum(change1D),
            safeNum(dr),
            updateTime
        ).run();
    } catch (e: any) {
        console.error(`[Portfolio Stats] DB Write Error for Group ${groupId}: ${e.message}`);
        // Return null or partial stats? 
        // Throwing here causes 500. Let's return stats but log error.
    }

    console.log(`[Portfolio Stats] Calculation completed for group ${groupId}`);
    return { cagr, stdDev, maxDD, sharpe, sortino, correlation, change1D, dr };
    } catch (e: any) {
        console.error(`[Portfolio Stats] Critical error for group ${groupId}:`, e);
        throw e;
    }
}

export interface PerformanceMetricStats {
    totalReturn: number | null;
    benchmarkReturn: number | null;
    annualizedReturn: number | null;
    annualizedVolatility: number | null;
    maxDrawdown: number | null;
    sharpeRatio: number | null;
    calmarRatio: number | null;
    sortinoRatio: number | null;
    alpha?: number | null;
    beta?: number | null;
    winRate?: number | null;
    change1d?: number | null;
}

export interface PortfolioPerformanceData {
    groupId: number;
    groupName: string;
    benchmarkSymbol: string;
    startDate: string;
    endDate: string;
    createdAt?: string | null;
    totalTradingDays: number;
    stats: PerformanceMetricStats;
    history: {
        date: string;
        portfolio: number;       // Cumulative return %
        benchmark: number;       // Benchmark cumulative return %
        drawdown: number;        // Drawdown %
        portfolioValue: number;  // Absolute value ($)
        benchmarkValue: number;  // Absolute value ($)
    }[];
    peaks: { date: string; value: number; returnPct: number }[];
    valleys: { date: string; value: number; returnPct: number; drawdown: number }[];
    maxDrawdownInfo: {
        peakDate: string;
        peakValue: number;
        troughDate: string;
        troughValue: number;
        recoveryDate: string | null;
        maxDrawdownPct: number;
    } | null;
}

export async function calculatePortfolioPerformance(
    env: Bindings,
    groupId: number,
    options?: { startDate?: string; benchmark?: string; period?: string }
): Promise<PortfolioPerformanceData | null> {
    const benchmarkSymbol = (options?.benchmark || 'QQQ').toUpperCase();
    
    // 1. Fetch Group details and Members
    const groupRow: any = await env.DB.prepare("SELECT id, name, type, description, created_at FROM groups WHERE id = ?").bind(groupId).first();
    const groupName = groupRow?.name || `Portfolio ${groupId}`;
    const createdDateStr = groupRow?.created_at ? (String(groupRow.created_at).split('T')[0].split(' ')[0]) : null;

    // Default startDate is 2025-01-01 (2025 to present)
    let targetStartDate = options?.startDate || '2025-01-01';
    if (options?.period === 'created' || options?.period === 'inception') {
        targetStartDate = createdDateStr || '2025-01-01';
    } else if (options?.period === '1y') {
        targetStartDate = getDateDaysAgo(365);
    } else if (options?.period === 'all') {
        targetStartDate = '2020-01-01';
    } else if (options?.period === '2025' || options?.period === 'ytd') {
        targetStartDate = '2025-01-01';
    }

    // Fetch extra days before start date to find the earliest close price on/before start
    const d = new Date(targetStartDate);
    d.setDate(d.getDate() - 15);
    const fetchStartDate = d.toISOString().split('T')[0];

    const { results: members } = await env.DB.prepare(
        "SELECT symbol, allocation FROM group_members WHERE group_id = ?"
    ).bind(groupId).all();

    if (!members || members.length === 0) {
        return {
            groupId,
            groupName,
            benchmarkSymbol,
            startDate: targetStartDate,
            endDate: new Date().toISOString().split('T')[0],
            createdAt: createdDateStr,
            totalTradingDays: 0,
            stats: {
                totalReturn: null,
                benchmarkReturn: null,
                annualizedReturn: null,
                annualizedVolatility: null,
                maxDrawdown: null,
                sharpeRatio: null,
                calmarRatio: null,
                sortinoRatio: null,
                winRate: null,
                change1d: null
            },
            history: [],
            peaks: [],
            valleys: [],
            maxDrawdownInfo: null
        };
    }

    const symbols = members.map((m: any) => m.symbol.toUpperCase());
    const targetAllocations = new Map<string, number>();
    members.forEach((m: any) => targetAllocations.set(m.symbol.toUpperCase(), Number(m.allocation) || 0));

    // 2. Fetch prices for all symbols + Benchmark
    const allSymbols = [...new Set([...symbols, benchmarkSymbol])];
    const priceMap = new Map<string, { date: string; close: number | null }[]>();
    const BATCH_SIZE = 50;

    for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
        const batch = allSymbols.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        try {
            const query = `SELECT symbol, date, close FROM stock_prices WHERE symbol IN (${placeholders}) AND date >= ? ORDER BY date ASC`;
            const { results } = await env.DB.prepare(query).bind(...batch, fetchStartDate).all();
            if (results) {
                results.forEach((row: any) => {
                    const sym = row.symbol.toUpperCase();
                    if (!priceMap.has(sym)) {
                        priceMap.set(sym, []);
                    }
                    priceMap.get(sym)!.push({ date: row.date, close: row.close });
                });
            }
        } catch (err) {
            console.error("[Portfolio Performance] Error fetching prices:", err);
        }
    }

    // Check if benchmark data exists; if not, try to fetch it
    let benchPrices = priceMap.get(benchmarkSymbol);
    if (!benchPrices || benchPrices.length < 10) {
        try {
            console.log(`[Portfolio Performance] Fetching missing benchmark prices for ${benchmarkSymbol}`);
            await updatePrices(env, benchmarkSymbol);
            const { results } = await env.DB.prepare(
                `SELECT symbol, date, close FROM stock_prices WHERE symbol = ? AND date >= ? ORDER BY date ASC`
            ).bind(benchmarkSymbol, fetchStartDate).all();
            if (results && results.length > 0) {
                priceMap.set(benchmarkSymbol, results as any[]);
                benchPrices = priceMap.get(benchmarkSymbol);
            }
        } catch (e) {
            console.error(`[Portfolio Performance] Failed to update benchmark ${benchmarkSymbol}:`, e);
        }
    }

    // Fallback to SPY if QQQ not available
    if ((!benchPrices || benchPrices.length < 10) && benchmarkSymbol !== 'SPY') {
        benchPrices = priceMap.get('SPY');
    }

    if (!benchPrices || benchPrices.length < 5) {
        console.warn(`[Portfolio Performance] Insufficient benchmark data for ${benchmarkSymbol}`);
        return null;
    }

    // 3. Align date range
    // Filter benchmark prices to dates >= targetStartDate
    const validBenchPrices = benchPrices.filter(p => p.date >= targetStartDate);
    if (validBenchPrices.length === 0) {
        console.warn(`[Portfolio Performance] No benchmark data on or after ${targetStartDate}`);
        return null;
    }

    const commonStartDate = validBenchPrices[0].date;

    // Filter valid member symbols
    const validSymbols: string[] = [];
    let validAllocationSum = 0;

    for (const sym of symbols) {
        const history = priceMap.get(sym);
        if (!history || history.length < 5) {
            continue;
        }
        validSymbols.push(sym);
        validAllocationSum += targetAllocations.get(sym) || 0;
    }

    if (validSymbols.length === 0) {
        console.warn(`[Portfolio Performance] No constituent price history available for group ${groupId}`);
        return null;
    }

    // Re-scale allocations if some members are missing
    if (validAllocationSum > 0 && Math.abs(validAllocationSum - 100) > 0.01) {
        const scale = 100 / validAllocationSum;
        validSymbols.forEach(s => {
            const old = targetAllocations.get(s) || 0;
            targetAllocations.set(s, old * scale);
        });
    }

    // Fast O(1) date lookups
    const symbolPriceMaps = new Map<string, Map<string, number>>();
    for (const [sym, history] of priceMap.entries()) {
        const dateMap = new Map<string, number>();
        history.forEach(h => {
            if (h.close !== null && h.close !== undefined) {
                dateMap.set(h.date, h.close);
            }
        });
        symbolPriceMaps.set(sym, dateMap);
    }

    // Initial Capital = $100,000
    const INITIAL_CAPITAL = 100000;
    const shares = new Map<string, number>();

    validSymbols.forEach(sym => {
        const history = priceMap.get(sym)!;
        // Find price at or immediately before/after start date
        const matchingPrice = history.find(p => p.date >= commonStartDate)?.close || history[history.length - 1]?.close || 0;
        const alloc = targetAllocations.get(sym) || 0;
        const dollarAmount = (alloc / 100) * INITIAL_CAPITAL;
        if (matchingPrice > 0) {
            shares.set(sym, dollarAmount / matchingPrice);
        } else {
            shares.set(sym, 0);
        }
    });

    const benchStartPrice = validBenchPrices[0].close || 1;
    const lastKnownPrices = new Map<string, number>();

    // Initial price seed
    validSymbols.forEach(sym => {
        const history = priceMap.get(sym)!;
        const matchingPrice = history.find(p => p.date >= commonStartDate)?.close || history[history.length - 1]?.close || 0;
        if (matchingPrice > 0) lastKnownPrices.set(sym, matchingPrice);
    });

    // 4. Daily Tracking Simulation
    interface DailyPoint {
        date: string;
        portfolio: number;
        benchmark: number;
        drawdown: number;
        portfolioValue: number;
        benchmarkValue: number;
    }

    const historyPoints: DailyPoint[] = [];
    let portfolioPeak = INITIAL_CAPITAL;
    let maxDrawdown = 0;

    for (const day of validBenchPrices) {
        const date = day.date;
        let dailyValue = 0;

        for (const sym of validSymbols) {
            const dateMap = symbolPriceMaps.get(sym);
            const close = dateMap?.get(date);
            if (close !== undefined && close !== null) {
                dailyValue += (shares.get(sym) || 0) * close;
                lastKnownPrices.set(sym, close);
            } else {
                const lastPrice = lastKnownPrices.get(sym) || 0;
                dailyValue += (shares.get(sym) || 0) * lastPrice;
            }
        }

        if (dailyValue <= 0) continue;

        if (dailyValue > portfolioPeak) {
            portfolioPeak = dailyValue;
        }

        const currentDD = ((dailyValue - portfolioPeak) / portfolioPeak) * 100;
        if (currentDD < maxDrawdown) {
            maxDrawdown = currentDD;
        }

        const portReturnPct = ((dailyValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
        const benchClose = day.close || benchStartPrice;
        const benchVal = (benchClose / benchStartPrice) * INITIAL_CAPITAL;
        const benchReturnPct = ((benchVal - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;

        historyPoints.push({
            date,
            portfolio: Number(portReturnPct.toFixed(2)),
            benchmark: Number(benchReturnPct.toFixed(2)),
            drawdown: Number(currentDD.toFixed(2)),
            portfolioValue: Number(dailyValue.toFixed(2)),
            benchmarkValue: Number(benchVal.toFixed(2))
        });
    }

    if (historyPoints.length < 2) {
        return null;
    }

    // 5. Calculate Metrics
    const N = historyPoints.length;
    const startVal = historyPoints[0].portfolioValue;
    const endVal = historyPoints[N - 1].portfolioValue;
    const totalReturn = ((endVal - startVal) / startVal) * 100;

    const benchStartVal = historyPoints[0].benchmarkValue;
    const benchEndVal = historyPoints[N - 1].benchmarkValue;
    const benchmarkReturn = ((benchEndVal - benchStartVal) / benchStartVal) * 100;

    const years = Math.max(N / TRADING_DAYS_PER_YEAR, 10 / TRADING_DAYS_PER_YEAR);
    const annualizedReturn = (Math.pow(Math.max(0.001, endVal / startVal), 1 / years) - 1) * 100;
    const benchAnnualizedReturn = (Math.pow(Math.max(0.001, benchEndVal / benchStartVal), 1 / years) - 1) * 100;

    // Daily returns
    const dailyRets: number[] = [];
    const benchDailyRets: number[] = [];
    let positiveDays = 0;

    for (let i = 1; i < N; i++) {
        const prev = historyPoints[i - 1].portfolioValue;
        const curr = historyPoints[i].portfolioValue;
        const r = (curr - prev) / prev;
        dailyRets.push(r);
        if (r > 0) positiveDays++;

        const bPrev = historyPoints[i - 1].benchmarkValue;
        const bCurr = historyPoints[i].benchmarkValue;
        benchDailyRets.push((bCurr - bPrev) / bPrev);
    }

    const meanDaily = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
    const varDaily = dailyRets.reduce((a, b) => a + Math.pow(b - meanDaily, 2), 0) / Math.max(1, dailyRets.length - 1);
    const annualizedVolatility = Math.sqrt(varDaily) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

    // Sharpe Ratio (Rf = 4%)
    const sharpeRatio = annualizedVolatility > 0 ? ((annualizedReturn / 100) - RISK_FREE_RATE) / (annualizedVolatility / 100) : null;

    // Calmar Ratio = Annualized Return / |Max Drawdown|
    const calmarRatio = Math.abs(maxDrawdown) > 0.001 ? (annualizedReturn / Math.abs(maxDrawdown)) : null;

    // Sortino Ratio
    const downsideVar = dailyRets.reduce((a, b) => a + Math.pow(Math.min(0, b), 2), 0) / Math.max(1, dailyRets.length - 1);
    const downsideDev = Math.sqrt(downsideVar) * Math.sqrt(TRADING_DAYS_PER_YEAR);
    const sortinoRatio = downsideDev > 0 ? ((annualizedReturn / 100) - RISK_FREE_RATE) / downsideDev : null;

    // Beta & Alpha vs Benchmark
    const meanBench = benchDailyRets.reduce((a, b) => a + b, 0) / benchDailyRets.length;
    let cov = 0;
    let varBench = 0;
    for (let i = 0; i < dailyRets.length; i++) {
        cov += (dailyRets[i] - meanDaily) * (benchDailyRets[i] - meanBench);
        varBench += Math.pow(benchDailyRets[i] - meanBench, 2);
    }
    const beta = varBench > 0 ? cov / varBench : null;
    const alpha = (beta !== null && isFinite(beta))
        ? ((annualizedReturn / 100) - (RISK_FREE_RATE + beta * ((benchAnnualizedReturn / 100) - RISK_FREE_RATE))) * 100
        : null;

    const winRate = dailyRets.length > 0 ? (positiveDays / dailyRets.length) * 100 : null;

    // 1-Day Change
    let change1d = 0;
    if (N >= 2) {
        const last = historyPoints[N - 1].portfolioValue;
        const prev = historyPoints[N - 2].portfolioValue;
        if (prev > 0) {
            change1d = ((last - prev) / prev) * 100;
        }
    }

    // 6. Identify Peaks, Valleys and Max Drawdown Period
    const peaks: { date: string; value: number; returnPct: number }[] = [];
    const valleys: { date: string; value: number; returnPct: number; drawdown: number }[] = [];

    let currentPeak = historyPoints[0].portfolioValue;
    let currentPeakDate = historyPoints[0].date;
    let minTroughDD = 0;
    let maxDDPeakDate = currentPeakDate;
    let maxDDPeakVal = currentPeak;
    let maxDDTroughDate = currentPeakDate;
    let maxDDTroughVal = currentPeak;
    let maxDDRecoveryDate: string | null = null;

    for (let i = 0; i < N; i++) {
        const pt = historyPoints[i];
        if (pt.portfolioValue >= currentPeak) {
            if (i > 0 && historyPoints[i - 1].portfolioValue < currentPeak) {
                // Recovered to new peak
                if (pt.portfolioValue > currentPeak * 1.01) {
                    peaks.push({ date: pt.date, value: pt.portfolioValue, returnPct: pt.portfolio });
                }
            }
            currentPeak = pt.portfolioValue;
            currentPeakDate = pt.date;
        }

        if (pt.drawdown < minTroughDD) {
            minTroughDD = pt.drawdown;
            maxDDPeakDate = currentPeakDate;
            maxDDPeakVal = currentPeak;
            maxDDTroughDate = pt.date;
            maxDDTroughVal = pt.portfolioValue;
            maxDDRecoveryDate = null; // reset until recovered
        }

        if (minTroughDD < -3 && pt.portfolioValue >= maxDDPeakVal && maxDDRecoveryDate === null) {
            maxDDRecoveryDate = pt.date;
        }

        // Detect prominent valleys (local troughs deeper than -5%)
        if (i > 0 && i < N - 1) {
            const prevDD = historyPoints[i - 1].drawdown;
            const nextDD = historyPoints[i + 1].drawdown;
            if (pt.drawdown < -4 && pt.drawdown <= prevDD && pt.drawdown <= nextDD) {
                valleys.push({
                    date: pt.date,
                    value: pt.portfolioValue,
                    returnPct: pt.portfolio,
                    drawdown: pt.drawdown
                });
            }
        }
    }

    const safeNum = (n: number | null | undefined) => (n === null || n === undefined || isNaN(n) || !isFinite(n)) ? null : Number(n.toFixed(2));

    const maxDrawdownInfo = maxDrawdown < -0.5 ? {
        peakDate: maxDDPeakDate,
        peakValue: Number(maxDDPeakVal.toFixed(2)),
        troughDate: maxDDTroughDate,
        troughValue: Number(maxDDTroughVal.toFixed(2)),
        recoveryDate: maxDDRecoveryDate,
        maxDrawdownPct: Number(maxDrawdown.toFixed(2))
    } : null;

    return {
        groupId,
        groupName,
        benchmarkSymbol,
        startDate: commonStartDate,
        endDate: historyPoints[N - 1].date,
        createdAt: createdDateStr,
        totalTradingDays: N,
        stats: {
            totalReturn: safeNum(totalReturn),
            benchmarkReturn: safeNum(benchmarkReturn),
            annualizedReturn: safeNum(annualizedReturn),
            annualizedVolatility: safeNum(annualizedVolatility),
            maxDrawdown: safeNum(maxDrawdown),
            sharpeRatio: safeNum(sharpeRatio),
            calmarRatio: safeNum(calmarRatio),
            sortinoRatio: safeNum(sortinoRatio),
            alpha: safeNum(alpha),
            beta: safeNum(beta),
            winRate: safeNum(winRate),
            change1d: safeNum(change1d)
        },
        history: historyPoints,
        peaks,
        valleys,
        maxDrawdownInfo
    };
}

