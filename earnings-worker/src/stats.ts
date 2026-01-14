import { StockPrice } from './types';

export interface StockStats {
    symbol: string;
    changeYTD: number;
    change1Y: number;
    delta52wHigh: number;
    sma20: number;
    sma50: number;
    sma200: number;
    chart1Y: string;    // SVG 
    rsRank1M: string;   // SVG
    sharpeRatio1Y: number;
}

/**
 * Generates an SVG sparkline for the last 1 year of prices
 */
function generateChart1Y(prices: number[], width: number = 120, height: number = 40): string {
    if (prices.length < 2) return '';

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min;

    // Polyline points
    const points = prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * width;
        // Normalize y (invert because SVG y=0 is top)
        const y = height - ((p - min) / (range || 1)) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const color = prices[prices.length - 1] >= prices[0] ? '#10B981' : '#EF4444'; // Green or Red

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    </svg>`;
}

/**
 * Generates an SVG bar chart for RS Rank History (last 22 days/1 month)
 * The rank is normalized 0-99 relative to the displayed window
 */
function generateRSRank1M(prices: number[], lookback: number = 22, width: number = 100, height: number = 20): string {
    if (prices.length < 5) return '';

    const displayPrices = prices.slice(-lookback);
    const min = Math.min(...displayPrices);
    const max = Math.max(...displayPrices);
    const range = max - min;

    // Normalize to 0-1 range
    const ranks = displayPrices.map(p => range === 0 ? 0.5 : (p - min) / range);

    // Bar dimensions: 60% width with 20% gap on each side
    const slotWidth = width / ranks.length;
    const barWidth = (slotWidth * 0.6).toFixed(2);
    const offset = slotWidth * 0.2;

    const bars = ranks.map((r, i) => {
        const x = ((i * slotWidth) + offset).toFixed(1);
        const barH = Math.max(2, r * height);
        const y = (height - barH).toFixed(1);
        const fill = r === 1.0 ? '#15803d' : '#86efac'; // green-700 for max, green-300 for others
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH.toFixed(1)}" fill="${fill}" />`;
    }).join('');

    const currentScore = ranks.length > 0 ? (ranks[ranks.length - 1] * 100).toFixed(0) : "0";

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" data-score="${currentScore}">
        ${bars}
    </svg>`;
}

function calculateSharpeRatio(prices: number[], riskFreeRateAnnual: number = 0.045): number {
    if (prices.length < 30) return 0; // Not enough data

    // 1. Calculate Daily Returns
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        const prev = prices[i - 1];
        const curr = prices[i];
        if (prev > 0) {
            returns.push((curr - prev) / prev);
        }
    }

    if (returns.length === 0) return 0;

    // 2. Average Daily Return
    const sumRet = returns.reduce((a, b) => a + b, 0);
    const avgDailyRet = sumRet / returns.length;

    // 3. Daily Standard Deviation
    const sqDiffs = returns.map(r => Math.pow(r - avgDailyRet, 2));
    const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1); // Sample std dev
    const dailyStdDev = Math.sqrt(avgSqDiff);

    // 4. Annualize
    // Annualized Return = ((1 + avgDaily)^252) - 1  ... or simply avgDaily * 252 for approximations
    // Let's use simple approximation for Sharpe: Mean * 252
    const annualizedReturn = avgDailyRet * 252;
    const annualizedVol = dailyStdDev * Math.sqrt(252);

    // 5. Sharpe Ratio
    if (annualizedVol === 0) return 0;

    return (annualizedReturn - riskFreeRateAnnual) / annualizedVol;
}

export function calculateStats(symbol: string, prices: StockPrice[]): StockStats | null {
    if (!prices || prices.length === 0) return null;

    // Ensure sorted by date ascending for calculations
    // DB usually returns them, but let's be safe if we pass raw rows
    // Assuming 'prices' here are sorted ASCENDING (oldest to newest)
    const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
    const closes = sorted.map(p => p.close || 0);
    const currentPrice = closes[closes.length - 1];

    // 1. Moving Averages
    const sma = (n: number) => {
        if (closes.length < n) return 0;
        const slice = closes.slice(-n);
        return slice.reduce((a, b) => a + b, 0) / n;
    };
    const sma20 = sma(20);
    const sma50 = sma(50);
    const sma200 = sma(200);

    // 2. Performance: % 1Y and % YTD
    // 1Y
    let change1Y = 0;
    if (closes.length > 0) {
        // approx 252 trading days = 1 year
        const idx = Math.max(0, closes.length - 253);
        const p1y = closes[idx];
        change1Y = p1y !== 0 ? ((currentPrice - p1y) / p1y) * 100 : 0;
    }

    // YTD - find last close of previous year
    const currentYear = new Date().getFullYear();
    const prevYearStr = (currentYear - 1).toString();
    let startPrice = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].date.startsWith(prevYearStr)) {
            startPrice = sorted[i].close || 0;
            break;
        }
    }
    if (startPrice === 0 && closes.length > 0) {
        startPrice = closes[0]; // Fallback to first available
    }
    const changeYTD = startPrice !== 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;

    // 3. Delta 52w High
    // We can calculate this from the price history we have (max 252 days)
    // Or prefer the quote data if we had it, but this function relies on Price History
    // Let's use the local history for consistency
    const recent1Y = closes.slice(-252);
    const high52 = Math.max(...recent1Y);
    const delta52wHigh = high52 !== 0 ? ((currentPrice - high52) / high52) * 100 : 0;

    // 4. Charts
    // 1Y Chart
    // Decimate if too many points? 250 points for 120px width is fine to render all, or step 2
    const chart1Y = generateChart1Y(recent1Y);

    // RS Rank 1M (last 22 days)
    const rsRank1M = generateRSRank1M(closes);

    // 5. Sharpe Ratio (Last 1Y = approx 252 days)
    const sharpeRatio1Y = calculateSharpeRatio(recent1Y, 0.045);

    return {
        symbol,
        changeYTD,
        change1Y,
        delta52wHigh,
        sma20,
        sma50,
        sma200,
        chart1Y,
        rsRank1M,
        sharpeRatio1Y
    };
}
