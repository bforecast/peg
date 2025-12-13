
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getYahooSession() {
    try {
        console.log("Fetching Cookie...");
        const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': USER_AGENT } });
        const cookie = r1.headers.get('set-cookie');

        if (!cookie) {
            console.log("No cookie found");
            return null;
        }
        console.log("Cookie obtained:", cookie.split(';')[0]);

        console.log("Fetching Crumb...");
        const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        });

        if (!r2.ok) {
            console.log("Crumb fetch failed:", r2.status);
            return null;
        }

        const crumb = await r2.text();
        console.log("Crumb obtained:", crumb);
        return { cookie: cookie.split(';')[0], crumb };
    } catch (e) {
        console.error("Session Error:", e);
        return null;
    }
}

async function run() {
    const session = await getYahooSession();
    if (!session) return;

    // Test v10 with crumb
    const urlV10 = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/NVDA?modules=summaryDetail,financialData,defaultKeyStatistics&crumb=${session.crumb}`;
    console.log("Fetching v10 with Crumb...");

    try {
        const res = await fetch(urlV10, {
            headers: {
                'User-Agent': USER_AGENT,
                'Cookie': session.cookie
            }
        });

        if (res.ok) {
            const data = await res.json();
            const summary = data.quoteSummary.result[0];
            console.log("v10 Found!");
            console.log("Market Cap (summaryDetail):", summary.summaryDetail?.marketCap);
            console.log("P/S (summaryDetail):", summary.summaryDetail?.priceToSalesTrailing12Months);
        } else {
            console.log("v10 Failed:", res.status);
            const text = await res.text();
            console.log("Response:", text);
        }
    } catch (e) {
        console.error(e);
    }
}

run();
