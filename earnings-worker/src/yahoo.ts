
// Helper to manage Yahoo Session
let yahooSession: { cookie: string, crumb: string } | null = null;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getYahooSession() {
    if (yahooSession) return yahooSession;

    try {
        // 1. Get Cookie
        const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': USER_AGENT } });
        // node-fetch might hide set-cookie, but standard fetch usually exposes it in headers if not in browser
        // In CF Workers, headers.get('set-cookie') works.
        const cookie = r1.headers.get('set-cookie');

        if (!cookie) return null;

        // 2. Get Crumb
        const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        });

        if (!r2.ok) return null;

        const crumb = await r2.text();
        if (!crumb) return null;

        yahooSession = { cookie: cookie.split(';')[0], crumb };
        return yahooSession;
    } catch (e) {
        console.error("Yahoo Session Error:", e);
        return null;
    }
}

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fn();
            if (res) return res;
        } catch (e) {
            console.error(`Retry ${i + 1} failed:`, e);
        }
        await delay(backoff * (i + 1));
        // Reset session on failure, might be stale
        yahooSession = null;
    }
    return null;
}

export async function fetchYahooEstimates(symbol: string) {
    return fetchWithRetry(async () => {
        const session = await getYahooSession();
        if (!session) return null;

        const { cookie, crumb } = session;
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=earningsTrend&crumb=${crumb}`;

        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        });

        if (!response.ok) {
            if (response.status === 404) return null; // Not found, don't retry forever
            throw new Error(`Yahoo HTTP ${response.status}`);
        }

        const data: any = await response.json();
        const result = data?.quoteSummary?.result?.[0]?.earningsTrend;

        if (!result) return null;

        const epsCurrent = result.epsTrend?.current;
        if (epsCurrent && epsCurrent.raw) {
            return {
                source: 'epsTrend',
                estimated_eps: parseFloat(epsCurrent.raw),
                fiscal_date_ending: '1970-01-01'
            };
        }

        const trends = result.trend;
        if (trends && Array.isArray(trends) && trends.length > 0) {
            const currentQ = trends.find((t: any) => t.period === '0q') || trends[0];
            return {
                source: 'trend',
                estimated_eps: currentQ.earningsEstimate?.avg?.raw,
                fiscal_date_ending: currentQ.endDate
            };
        }
        return null;
    });
}

export async function fetchYahooPrices(symbol: string) {
    return fetchWithRetry(async () => {
        const session = await getYahooSession();
        if (!session) return null;

        const { cookie, crumb } = session;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=10y&crumb=${crumb}`;

        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`Yahoo Price HTTP ${response.status}`);
        }

        const data: any = await response.json();
        const result = data.chart?.result?.[0];

        if (!result) return null;

        const timestamps = result.timestamp;
        const quote = result.indicators.quote[0];
        const closes = quote.close;
        const opens = quote.open;
        const highs = quote.high;
        const lows = quote.low;
        const volumes = quote.volume;

        if (!timestamps || !closes || timestamps.length !== closes.length) return null;

        const prices = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (closes[i] === null) continue;
            const d = new Date(timestamps[i] * 1000);
            const dateStr = d.toISOString().split('T')[0];

            prices.push({
                date: dateStr,
                open: opens ? opens[i] : null,
                high: highs ? highs[i] : null,
                low: lows ? lows[i] : null,
                close: closes[i],
                volume: volumes ? volumes[i] : null
            });
        }
        return prices;
    }, 3, 2000); // 3 retries, start with 2s delay
}
