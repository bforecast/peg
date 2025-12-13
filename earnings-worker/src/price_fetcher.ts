export interface PriceData {
    symbol: string;
    prices: Array<{
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
    }>;
}

export async function fetchPriceHistory(symbol: string): Promise<PriceData | { error: string }> {
    // Yahoo Finance API v8 - free, no API key needed
    // Fetch from 2018-01-01 to present for full historical analysis
    const period1 = Math.floor(new Date('2018-01-01').getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000); // now

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            return { error: `HTTP Error: ${response.status} ${response.statusText}` };
        }

        const data: any = await response.json();

        // Validate structure
        if (!data?.chart?.result?.[0]?.timestamp) {
            return { error: `Invalid data structure or symbol not found` };
        }

        const result = data.chart.result[0];
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];

        const prices = [];
        for (let i = 0; i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
            prices.push({
                date,
                open: quotes.open[i] || 0,
                high: quotes.high[i] || 0,
                low: quotes.low[i] || 0,
                close: quotes.close[i] || 0,
                volume: quotes.volume[i] || 0
            });
        }

        return {
            symbol: result.meta.symbol,
            prices
        };

    } catch (e: any) {
        return { error: `Fetch failed: ${e.message}` };
    }
}
