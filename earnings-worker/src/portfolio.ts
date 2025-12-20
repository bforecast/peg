import { Bindings, StockPrice } from './types';
import { calculateStats } from './stats';
import { getESTDate } from './db';

const START_DATE = "2020-01-01";
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

    // 2. Fetch History for ALL members + Benchmark
    const allSymbols = [...new Set([...symbols, BENCHMARK_SYMBOL])];
    const priceMap = new Map<string, StockPrice[]>();

    // Optimization: Parallel Fetch from D1 (or Batch if implemented)
    // For now, simple loop as we are inside a cron/admin task
    for (const sym of allSymbols) {
        const { results } = await env.DB.prepare(
            "SELECT date, close FROM stock_prices WHERE symbol = ? AND date >= ? ORDER BY date ASC"
        ).bind(sym, START_DATE).all();

        if (results && results.length > 0) {
            priceMap.set(sym, results as unknown as StockPrice[]);
        }
    }

    // Benchmark Data
    const spyPrices = priceMap.get(BENCHMARK_SYMBOL);
    if (!spyPrices || spyPrices.length < 50) {
        console.error("Insufficient Benchmark (SPY) data");
        // Proceed without correlation or return error? Let's try to proceed.
    }

    // 3. Normalize Date Range
    let commonStartDate = START_DATE;

    for (const sym of symbols) {
        const history = priceMap.get(sym);
        if (!history || history.length === 0) return null; // Cannot calculate for missing data
        if (history[0].date > commonStartDate) commonStartDate = history[0].date;
    }

    console.log(`[Portfolio Stats] Group ${groupId} Simulation Start: ${commonStartDate}`);

    // Filter Benchmark to this start date
    const validSpy = spyPrices?.filter(p => p.date >= commonStartDate) || [];

    // 4. Run Simulation
    // Initial Capital = 100,000
    const INITIAL_CAPITAL = 100000;

    // Calculate Shares purchased on Day 0
    const shares = new Map<string, number>();

    symbols.forEach(sym => {
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

    // 6. Save to DB
    const updateTime = getESTDate();
    await env.DB.prepare(`
        INSERT OR REPLACE INTO portfolio_stats (
            group_id, cagr, std_dev, max_drawdown, sharpe, sortino, correlation_spy, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        groupId, cagr, stdDev, maxDD, sharpe, sortino, correlation, updateTime
    ).run();

    return { cagr, stdDev, maxDD, sharpe, sortino, correlation };
}
