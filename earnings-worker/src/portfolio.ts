import { Bindings, StockPrice } from './types';
import { calculateStats } from './stats';
import { getESTDate } from './db';

// Helper to get date N days ago
function getDateDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

const BENCHMARK_SYMBOL = "SPY";
const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE = 0.04; // 4% approximation for Sharpe

export async function calculatePortfolioStats(env: Bindings, groupId: number) {
    // 1. Get Portfolio Members & Allocations
    const { results: members } = await env.DB.prepare(
        "SELECT symbol, allocation FROM group_members WHERE group_id = ?"
    ).bind(groupId).all();

    if (!members || members.length === 0) return null;

    const symbols = members.map((m: any) => m.symbol);
    const targetAllocations = new Map<string, number>();
    members.forEach((m: any) => targetAllocations.set(m.symbol, Number(m.allocation) || 0));

    // 2. Fetch History (Dynamic 1 Year window)
    // We fetch a bit more than 252 days to ensure we have overlap, e.g. 370 calendar days
    const startDate = getDateDaysAgo(370);

    // 2. Fetch History for ALL members + Benchmark
    const allSymbols = [...new Set([...symbols, BENCHMARK_SYMBOL])];
    const priceMap = new Map<string, StockPrice[]>();

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
        console.error("Insufficient Benchmark (SPY) data");
        // Proceed without correlation or return error? Let's try to proceed.
    }

    // 3. Normalize Date Range
    let commonStartDate = startDate;

    const validSymbols: string[] = [];
    let validAllocationSum = 0;

    for (const sym of symbols) {
        const history = priceMap.get(sym);
        if (!history || history.length === 0) {
            console.warn(`[Portfolio Stats] Missing history for ${sym}, excluding from Group ${groupId} stats.`);
            continue;
        }
        if (history[0].date > commonStartDate) commonStartDate = history[0].date;
        validSymbols.push(sym);
        validAllocationSum += targetAllocations.get(sym) || 0;
    }

    if (validSymbols.length === 0) {
        console.error(`[Portfolio Stats] No valid symbols for Group ${groupId}`);
        return null;
    }

    // Re-normalize allocations if some symbols were dropped
    if (validAllocationSum < 99 && validAllocationSum > 0) {
        const scale = 100 / validAllocationSum;
        console.log(`[Portfolio Stats]Re - normalizing weights by ${scale.toFixed(2)} (Valid Alloc: ${validAllocationSum}%)`);
        validSymbols.forEach(s => {
            const old = targetAllocations.get(s) || 0;
            targetAllocations.set(s, old * scale);
        });
    }

    console.log(`[Portfolio Stats] Group ${groupId} Simulation Start: ${commonStartDate} (1Y Trailing)`);

    // Filter Benchmark to this start date
    const validSpy = spyPrices?.filter(p => p.date >= commonStartDate) || [];

    // 4. Run Simulation
    // Initial Capital = 100,000
    const INITIAL_CAPITAL = 100000;

    // Calculate Shares purchased on Day 0
    const shares = new Map<string, number>();

    validSymbols.forEach(sym => {
        const history = priceMap.get(sym)!;
        const startPrice = history[0].close || 0; // Robust null check
        const alloc = targetAllocations.get(sym) || 0;
        const dollarAmount = (alloc / 100) * INITIAL_CAPITAL;
        if (startPrice > 0) {
            shares.set(sym, dollarAmount / startPrice);
        } else {
            shares.set(sym, 0);
        }
    });

    // Daily Value Tracking
    const portfolioCurve: { date: string, value: number }[] = [];
    const benchmarkCurve: { date: string, value: number }[] = [];

    if (validSpy.length === 0) return null;

    // Simulation Loop  
    for (const day of validSpy) {
        const date = day.date;
        let dailyValue = 0;

        // Sum holdings
        for (const sym of symbols) {
            const history = priceMap.get(sym);
            const priceObj = history?.find(p => p.date === date);

            if (priceObj && priceObj.close) {
                dailyValue += (shares.get(sym) || 0) * priceObj.close;
            } else {
                // Missing data for this day, assume value held (simple simulation)
                // Or if truly missing, skip day logic?
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

    if (portfolioCurve.length < 30) return null; // Not enough data

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

    // 6. Save to DB
    const updateTime = getESTDate();
    await env.DB.prepare(`
        INSERT OR REPLACE INTO portfolio_stats(
                group_id, cagr, std_dev, max_drawdown, sharpe, sortino, correlation_spy, change_1d, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
        groupId, cagr, stdDev, maxDD, sharpe, sortino, correlation, change1D, updateTime
    ).run();

    return { cagr, stdDev, maxDD, sharpe, sortino, correlation, change1D };
}
