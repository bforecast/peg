
// Yahoo Finance API implementation with Session (Crumb/Cookie) support
// Uses v10/quoteSummary for detailed metrics (P/S, Market Cap)

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let yahooSession: { cookie: string, crumb: string } | null = null;
let sessionPromise: Promise<{ cookie: string, crumb: string } | null> | null = null;

async function getYahooSession(): Promise<{ cookie: string, crumb: string } | null> {
    if (yahooSession) return yahooSession;
    if (sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
        try {
            // 1. Get Cookie
            const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': USER_AGENT } });
            const cookieHeader = r1.headers.get('set-cookie');

            if (!cookieHeader) return null;
            const cookie = cookieHeader.split(';')[0];

            // 2. Get Crumb
            const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
                headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
            });

            if (!r2.ok) return null;

            const crumb = await r2.text();
            if (!crumb) return null;

            yahooSession = { cookie, crumb };
            return yahooSession;
        } catch (e) {
            console.error("Yahoo Session Error:", e);
            return null;
        } finally {
            sessionPromise = null;
        }
    })();

    return sessionPromise;
}

export interface YahooEarningsData {
    symbol: string;
    currentQuarterEstimate: number | null;
    fiscalQuarterEnd: string | null;
}

export async function fetchCurrentEarnings(symbol: string): Promise<YahooEarningsData | { error: string }> {
    // Existing logic for earnings... simplified to reuse session if needed, but currentEarnings uses v10 public?
    // Let's assume currentEarnings logic was working fine via v10 public, but we can upgrade it to use crumb if needed.
    // For now, keep it as is if it works? Actually, v10 public might be flaky. 
    // Let's use session for robustness.

    const session = await getYahooSession();
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    let url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=earningsTrend`;

    if (session) {
        headers['Cookie'] = session.cookie;
        url += `&crumb=${session.crumb}`;
    }

    try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            return { error: `HTTP Error: ${response.status}` };
        }

        const data: any = await response.json();

        if (!data?.quoteSummary?.result?.[0]?.earningsTrend) {
            return { error: 'No earnings data available' };
        }

        const trend = data.quoteSummary.result[0].earningsTrend.trend;
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

export interface YahooQuote {
    symbol: string;
    shortName: string;
    regularMarketPrice: number;
    marketCap: number;
    priceToSalesTrailing12Months: number;
    trailingPE: number;
    forwardPE: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekHighChangePercent: number;
    regularMarketChangePercent: number; // Today's change
    epsCurrentYear?: number;
    epsNextYear?: number;
}

export async function fetchQuotes(symbols: string[]): Promise<YahooQuote[]> {
    if (!symbols.length) return [];

    const session = await getYahooSession();
    if (!session) {
        console.error("Failed to get Yahoo Session for quotes");
        return [];
    }

    // Process in batches of 5 to avoid Rate Limiting
    const BATCH_SIZE = 5;
    const results: YahooQuote[] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (symbol) => {
            const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,price,earningsTrend&crumb=${session.crumb}`;

            try {
                const res = await fetch(url, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Cookie': session.cookie
                    }
                });

                if (!res.ok) return null;

                const data: any = await res.json();
                const result = data.quoteSummary?.result?.[0];
                if (!result) return null;

                const summary = result.summaryDetail || {};
                const financial = result.financialData || {};
                const price = result.price || {};
                const trend = result.earningsTrend?.trend || [];

                // Extract EPS Estimates
                let epsCurrentYear, epsNextYear;
                const trendCurrent = trend.find((t: any) => t.period === '0y');
                const trendNext = trend.find((t: any) => t.period === '+1y');

                if (trendCurrent && trendCurrent.earningsEstimate) {
                    epsCurrentYear = trendCurrent.earningsEstimate.avg?.raw;
                }
                if (trendNext && trendNext.earningsEstimate) {
                    epsNextYear = trendNext.earningsEstimate.avg?.raw;
                }

                // Calc 52w High Change % if missing
                let deltaHigh = 0;
                const currentPrice = price.regularMarketPrice?.raw || financial.currentPrice?.raw || 0;
                const high52 = summary.fiftyTwoWeekHigh?.raw || 0;

                if (high52) {
                    deltaHigh = (currentPrice - high52) / high52;
                }

                return {
                    symbol,
                    shortName: price.shortName || price.longName || symbol,
                    regularMarketPrice: currentPrice,
                    marketCap: summary.marketCap?.raw || price.marketCap?.raw || 0,
                    priceToSalesTrailing12Months: summary.priceToSalesTrailing12Months?.raw || 0,
                    trailingPE: summary.trailingPE?.raw || 0,
                    forwardPE: summary.forwardPE?.raw || 0,
                    fiftyTwoWeekHigh: high52,
                    fiftyTwoWeekHighChangePercent: deltaHigh,
                    regularMarketChangePercent: price.regularMarketChangePercent?.raw || 0,
                    epsCurrentYear,
                    epsNextYear
                };

            } catch (e) {
                console.error(`Error fetching quote for ${symbol}:`, e);
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(r => {
            if (r) results.push(r);
        });

        // Delay between batches (200ms)
        if (i + BATCH_SIZE < symbols.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    return results;
}

export async function fetchPriceHistory(symbol: string): Promise<any[]> {
    try {
        const session = await getYahooSession();
        if (!session) throw new Error('Failed to get Yahoo Session');

        const { crumb, cookie } = session;
        const period1 = Math.floor((Date.now() - 31536000000 * 2) / 1000); // 2 years ago (safe buffer)
        const period2 = Math.floor(Date.now() / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?symbol=${symbol}&period1=${period1}&period2=${period2}&interval=1d&crumb=${crumb}`;

        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        });

        if (!response.ok) {
            console.error(`Yahoo History Error for ${symbol}: ${response.status} ${response.statusText}`);
            return [];
        }

        const data: any = await response.json();
        const result = data.chart?.result?.[0];

        if (!result) return [];

        const timestamps = result.timestamp;
        const closes = result.indicators?.quote?.[0]?.close;

        if (!timestamps || !closes || timestamps.length === 0) return [];

        const prices = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (closes[i] !== null && closes[i] !== undefined) {
                // Convert timestamp to YYYY-MM-DD
                const d = new Date(timestamps[i] * 1000);
                const dateStr = d.toISOString().split('T')[0];
                prices.push({
                    date: dateStr,
                    close: parseFloat(closes[i].toFixed(2)),
                    open: 0, high: 0, low: 0, volume: 0 // Simplification for now
                });
            }
        }
        return prices;

    } catch (e) {
        console.error(`Failed to fetch history for ${symbol}`, e);
        return [];
    }
}
