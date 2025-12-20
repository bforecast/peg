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

    // We only take the last 'lookback' prices for the display
    const displayPrices = prices.slice(-lookback);

    // Normalize to 0-99 rank relative to THIS window
    const min = Math.min(...displayPrices);
    const max = Math.max(...displayPrices);
    const range = max - min;

    const ranks = displayPrices.map(p => {
        if (range === 0) return 50;
        return ((p - min) / range); // 0.0 to 1.0
    });

    // Generate bars
    // Width per slot
    const slotWidth = width / ranks.length;
    // Use 60% of slot for bar, leaving 20% gap on each side
    const barWidth = (slotWidth * 0.6).toFixed(2);
    const offset = slotWidth * 0.2;

    // We want to highlight the MAX rank in a special color if it's the current one?
    // mimic existing logic: Deep Green for max, Light Green for others.

    let bars = '';
    ranks.forEach((r, i) => {
        const x = ((i * slotWidth) + offset).toFixed(1);
        const barH = Math.max(2, r * height); // Min height 2px
        const y = (height - barH).toFixed(1);

        // Color logic: if it's the max value in the set, make it darker/stronger
        const isMax = r === 1.0;
        const fill = isMax ? '#15803d' : '#86efac'; // green-700 : green-300

        bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH.toFixed(1)}" fill="${fill}" />`;
    });

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${bars}
    </svg>`;
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

    // YTD
    let changeYTD = 0;
    const currentYear = new Date().getFullYear();
    const prevYearStr = (currentYear - 1).toString();
    // Find last close of previous year
    let startPrice = 0;
    // Walk backwards
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].date.startsWith(prevYearStr)) {
            startPrice = sorted[i].close || 0;
            break;
        }
    }
    // Fallback: if no prev year data, use first available
    if (startPrice === 0 && closes.length > 0) startPrice = closes[0];

    changeYTD = startPrice !== 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;

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

    return {
        symbol,
        changeYTD,
        change1Y,
        delta52wHigh,
        sma20,
        sma50,
        sma200,
        chart1Y,
        rsRank1M
    };
}
