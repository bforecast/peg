
import { fetchYahooEstimates } from './yahoo';

// We need to access the internal session logic or just replicate it for the test.
// Since we can't easily import non-exported functions, I'll replicate the fetch logic briefly here 
// using the same structure as src/yahoo.ts just to verify the ENDPOINT works.

// Yahoo Session Helper (Replicated for standalone test)
let yahooSession: { cookie: string, crumb: string } | null = null;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getYahooSession() {
    if (yahooSession) return yahooSession;
    try {
        const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': USER_AGENT } });
        const cookie = r1.headers.get('set-cookie');
        if (!cookie) return null;
        const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        });
        if (!r2.ok) return null;
        const crumb = await r2.text();
        yahooSession = { cookie: cookie.split(';')[0], crumb };
        return yahooSession;
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function testPriceFetch(symbol: string) {
    const session = await getYahooSession();
    if (!session) {
        console.log("Session failed");
        return;
    }

    // Range: 10 years, Interval: 1 day
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=10y&crumb=${session.crumb}`;

    console.log(`Fetching prices for ${symbol}...`);
    const resp = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Cookie': session.cookie
        }
    });

    if (!resp.ok) {
        console.log("Error:", resp.status, resp.statusText);
        const text = await resp.text();
        console.log(text);
        return;
    }

    const data: any = await resp.json();
    const result = data.chart.result[0];

    if (!result) {
        console.log("No result found");
        return;
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    console.log(`Got ${timestamps.length} price points.`);
    console.log("First point:", new Date(timestamps[0] * 1000).toISOString(), closes[0]);
    console.log("Last point:", new Date(timestamps[timestamps.length - 1] * 1000).toISOString(), closes[closes.length - 1]);
}

testPriceFetch('AAPL');
