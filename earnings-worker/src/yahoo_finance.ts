export interface YahooEarningsData {
    symbol: string;
    currentQuarterEstimate: number | null;
    fiscalQuarterEnd: string | null;
}

export async function fetchCurrentEarnings(symbol: string): Promise<YahooEarningsData | { error: string }> {
    // Yahoo Finance API for earnings estimates
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=earningsTrend`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            return { error: `HTTP Error: ${response.status}` };
        }

        const data: any = await response.json();

        if (!data?.quoteSummary?.result?.[0]?.earningsTrend) {
            return { error: 'No earnings data available' };
        }

        const trend = data.quoteSummary.result[0].earningsTrend.trend;

        // Get current quarter estimate (index 0 is current quarter)
        const currentQuarter = trend.find((t: any) => t.period === '0q');

        if (!currentQuarter?.earningsEstimate?.avg) {
            return { error: 'No current quarter estimate found' };
        }

        return {
            symbol,
            currentQuarterEstimate: currentQuarter.earningsEstimate.avg.raw,
            fiscalQuarterEnd: currentQuarter.endDate || null
        };

    } catch (e: any) {
        return { error: `Fetch failed: ${e.message}` };
    }
}
