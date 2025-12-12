
// Yahoo Finance Crumb Fetcher Test

async function getCrumbAndCookie() {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // 1. Get Cookie
    console.log("Fetching Cookie from fc.yahoo.com...");
    const response1 = await fetch('https://fc.yahoo.com', {
        headers: {
            'User-Agent': userAgent
        }
    });

    // fc.yahoo.com usually returns 302 or 404 but sets the cookie.
    // We need to extract 'set-cookie' header.
    // Note: Node fetch API might handle cookies differently or we need to look at raw headers.
    const cookie = response1.headers.get('set-cookie');

    if (!cookie) {
        console.error("Failed to get cookie from fc.yahoo.com");
        return null;
    }
    console.log("Got Cookie:", cookie.split(';')[0]);

    // 2. Get Crumb
    console.log("Fetching Crumb...");
    const crumbUrl = 'https://query1.finance.yahoo.com/v1/test/getcrumb';
    const response2 = await fetch(crumbUrl, {
        headers: {
            'User-Agent': userAgent,
            'Cookie': cookie
        }
    });

    if (!response2.ok) {
        console.error(`Failed to get crumb: ${response2.status}`);
        const text = await response2.text();
        console.error(text);
        return null;
    }

    const crumb = await response2.text();
    console.log("Got Crumb:", crumb);

    return { cookie, crumb };
}

async function testFetch(symbol: string) {
    const session = await getCrumbAndCookie();
    if (!session) return;

    const { cookie, crumb } = session;

    console.log(`Fetching Data for ${symbol} with Crumb...`);
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=earningsTrend&crumb=${crumb}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': cookie
        }
    });

    if (!response.ok) {
        console.error(`Status: ${response.status}`);
        return;
    }

    const data = await response.json();
    console.log("Success! Data preview:");
    // Print just the relevant part
    const trend = (data as any).quoteSummary.result[0].earningsTrend.trend.find((t: any) => t.period === '0q');
    console.log(JSON.stringify(trend, null, 2));
}

testFetch('AAPL');
