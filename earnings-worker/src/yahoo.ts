
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let yahooSession: { cookie: string, crumb: string } | null = null;
let sessionPromise: Promise<{ cookie: string, crumb: string } | null> | null = null;

async function fetchWithTimeout(url: string, options: any = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function getYahooSession(): Promise<{ cookie: string, crumb: string } | null> {
    if (yahooSession) return yahooSession;
    if (sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
        try {
            // Get Cookie
            const r1 = await fetchWithTimeout('https://fc.yahoo.com', { headers: { 'User-Agent': USER_AGENT } }, 5000);
            const cookieHeader = r1.headers.get('set-cookie');
            if (!cookieHeader) return null;
            const cookie = cookieHeader.split(';')[0];

            // Get Crumb
            const r2 = await fetchWithTimeout('https://query1.finance.yahoo.com/v1/test/getcrumb', {
                headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
            }, 5000);
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

// Robust Retry Helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function fetchWithRetry(fn: () => Promise<any>, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fn();
            if (res) return res;
        } catch (e) {
            console.error(`Retry ${i + 1} failed:`, e);
            yahooSession = null; // Reset session on failure
        }
        await delay(backoff * (i + 1));
    }
    return null;
}

export interface YahooQuote {
    symbol: string;
    shortName: string;
    regularMarketPrice: number;
    marketCap: number;
    priceToSalesTrailing12Months?: number;
    trailingPE?: number;
    forwardPE?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekHighChangePercent?: number;
    regularMarketChangePercent?: number;
    epsCurrentYear?: number;
    epsNextYear?: number;
    dividendYield?: number;
    regularMarketOpen?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    regularMarketVolume?: number;
}

async function fetchQuotesInternal(symbols: string[]): Promise<YahooQuote[]> {
    if (!symbols.length) return [];
    const session = await getYahooSession();
    if (!session) return [];

    const BATCH_SIZE = 5;
    const results: YahooQuote[] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (symbol) => {
            const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,price,earningsTrend,defaultKeyStatistics&crumb=${session.crumb}`;
            try {
                const res = await fetchWithTimeout(url, {
                    headers: { 'User-Agent': USER_AGENT, 'Cookie': session.cookie }
                }, 5000);
                if (res.status === 401 || res.status === 403) {
                    yahooSession = null;
                    return null;
                }
                if (!res.ok) return null;

                const data: any = await res.json();
                const result = data.quoteSummary?.result?.[0];
                if (!result) return null;

                const summary = result.summaryDetail || {};
                const financial = result.financialData || {};
                const price = result.price || {};
                const trend = result.earningsTrend?.trend || [];

                let epsCurrentYear, epsNextYear;
                const trendCurrent = trend.find((t: any) => t.period === '0y');
                const trendNext = trend.find((t: any) => t.period === '+1y');
                if (trendCurrent?.earningsEstimate) epsCurrentYear = trendCurrent.earningsEstimate.avg?.raw;
                if (trendNext?.earningsEstimate) epsNextYear = trendNext.earningsEstimate.avg?.raw;

                const currentPrice = price.regularMarketPrice?.raw || financial.currentPrice?.raw || 0;
                const high52 = summary.fiftyTwoWeekHigh?.raw || 0;
                let deltaHigh = (high52) ? (currentPrice - high52) / high52 : 0;

                // PS ratio: summaryDetail is correct for same-currency stocks,
                // but wrong for ADRs (e.g. TSM: revenue in TWD, price in USD → PS=0.52 instead of ~16)
                const financialCurrency = financial.financialCurrency || price.currency || '';
                const priceCurrency = price.currency || '';
                const marketCap = summary.marketCap?.raw || price.marketCap?.raw || 0;
                const totalRevenue = financial.totalRevenue?.raw || 0;
                let psRatio = summary.priceToSalesTrailing12Months?.raw || 0;

                if (financialCurrency && priceCurrency && financialCurrency !== priceCurrency
                    && marketCap > 0 && totalRevenue > 0) {
                    // Currency mismatch (ADR) — fetch exchange rate and compute correctly
                    try {
                        const fxPair = `${financialCurrency}${priceCurrency}=X`;
                        const fxRes = await fetchWithTimeout(
                            `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${fxPair}?modules=price&crumb=${session.crumb}`,
                            { headers: { 'User-Agent': USER_AGENT, 'Cookie': session.cookie } }, 5000
                        );
                        if (fxRes.ok) {
                            const fxData: any = await fxRes.json();
                            const rate = fxData.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw;
                            if (rate && rate > 0) {
                                const revenueInPriceCurrency = totalRevenue * rate;
                                psRatio = marketCap / revenueInPriceCurrency;
                            }
                        }
                    } catch (_) { /* keep summaryDetail fallback */ }
                }

                return {
                    symbol,
                    shortName: price.shortName || price.longName || symbol,
                    regularMarketPrice: currentPrice,
                    marketCap: summary.marketCap?.raw || price.marketCap?.raw || 0,
                    priceToSalesTrailing12Months: psRatio,
                    trailingPE: summary.trailingPE?.raw || 0,
                    forwardPE: summary.forwardPE?.raw || 0,
                    fiftyTwoWeekHigh: high52,
                    fiftyTwoWeekHighChangePercent: deltaHigh,
                    regularMarketChangePercent: price.regularMarketChangePercent?.raw || 0,
                    epsCurrentYear, epsNextYear,
                    dividendYield: summary.dividendYield?.raw || 0,
                    regularMarketOpen: price.regularMarketOpen?.raw || summary.open?.raw,
                    regularMarketDayHigh: price.regularMarketDayHigh?.raw || summary.dayHigh?.raw,
                    regularMarketDayLow: price.regularMarketDayLow?.raw || summary.dayLow?.raw,
                    regularMarketVolume: price.regularMarketVolume?.raw || summary.volume?.raw,
                };
            } catch (e) { return null; }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(r => { if (r) results.push(r); });
        if (i + BATCH_SIZE < symbols.length) await delay(200);
    }
    return results;
}

export async function fetchQuotes(symbols: string[], maxAttempts = 2): Promise<YahooQuote[]> {
    const allResults: YahooQuote[] = [];
    let pending = [...symbols];
    let attempt = 1;

    while (pending.length > 0 && attempt <= maxAttempts) {
        if (attempt > 1) await delay(attempt * 1000);
        const quotes = await fetchQuotesInternal(pending);
        allResults.push(...quotes);
        const successSymbols = quotes.map(q => q.symbol);
        pending = pending.filter(s => !successSymbols.includes(s));
        attempt++;
    }
    return allResults;
}

// Better OHLCV Price Fetcher
export async function fetchYahooPrices(symbol: string, retries = 1) {
    return fetchWithRetry(async () => {
        const session = await getYahooSession();
        if (!session) return null;

        const { cookie, crumb } = session;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=10y&crumb=${crumb}`;

        const response = await fetchWithTimeout(url, {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        }, 5000);

        if (!response.ok) {
            if (response.status === 404) return null;
            if (response.status === 401 || response.status === 403) yahooSession = null;
            throw new Error(`Yahoo Price HTTP ${response.status}`);
        }

        const data: any = await response.json();
        const result = data.chart?.result?.[0];
        if (!result) return null;

        const timestamps = result.timestamp;
        const quote = result.indicators?.quote?.[0];
        if (!timestamps || !quote) return null;

        const closes = quote.close;
        const opens = quote.open;
        const highs = quote.high;
        const lows = quote.low;
        const volumes = quote.volume;

        if (!closes || timestamps.length !== closes.length) return null;

        const prices = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (closes[i] === null) continue;
            const d = new Date(timestamps[i] * 1000);
            prices.push({
                date: d.toISOString().split('T')[0],
                open: opens ? opens[i] : null,
                high: highs ? highs[i] : null,
                low: lows ? lows[i] : null,
                close: closes[i],
                volume: volumes ? volumes[i] : null
            });
        }
        return prices;
    }, retries, 1000);
}

// Alias for migration
export async function fetchPriceHistory(symbol: string) {
    return fetchYahooPrices(symbol);
}

export async function fetchYahooEstimates(symbol: string, retries = 1) {
    return fetchWithRetry(async () => {
        const session = await getYahooSession();
        if (!session) return null;

        const { cookie, crumb } = session;
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=earningsTrend,earningsHistory&crumb=${crumb}`;

        const response = await fetchWithTimeout(url, {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        }, 5000);

        if (!response.ok) {
            if (response.status === 404) return null;
            if (response.status === 401 || response.status === 403) yahooSession = null;
            throw new Error(`Yahoo HTTP ${response.status}`);
        }

        const data: any = await response.json();
        const result = data?.quoteSummary?.result?.[0];
        if (!result) return null;

        const trend = result.earningsTrend?.trend || [];
        const history = result.earningsHistory?.history || [];
        const currentEstimate = trend.find((t: any) => t.period === '0q') || (trend.length > 0 ? trend[0] : null);

        const estimates = [];
        if (currentEstimate) {
            estimates.push({
                fiscal_date_ending: currentEstimate.endDate,
                estimated_eps: currentEstimate.earningsEstimate?.avg?.raw || null,
                reported_eps: null,
                source: 'trend'
            });
        }
        for (const h of history) {
            if (h.quarter?.fmt) {
                estimates.push({
                    fiscal_date_ending: h.quarter.fmt,
                    estimated_eps: h.epsEstimate?.raw || null,
                    reported_eps: h.epsActual?.raw || null,
                    source: 'history'
                });
            }
        }
        return estimates.length > 0 ? estimates : null;
    }, retries, 1000);
}
