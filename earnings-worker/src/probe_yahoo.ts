
import { fetch } from 'undici';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function main() {
    const symbol = 'NVDA';
    console.log(`Probing Yahoo Finance for ${symbol}...`);

    try {
        // 1. Get Cookie/Crumb
        const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': USER_AGENT } });
        const cookieHeader = r1.headers.get('set-cookie');
        if (!cookieHeader) throw new Error('No cookie');
        const cookie = cookieHeader.split(';')[0];

        const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        });
        const crumb = await r2.text();
        console.log('Crumb:', crumb);

        // 2. Fetch Earnings Trend
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=earningsTrend&crumb=${crumb}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
        });
        const data: any = await res.json();

        const trend = data?.quoteSummary?.result?.[0]?.earningsTrend?.trend;

        if (trend) {
            console.log("\n--- Earnings Trend Data ---");
            trend.forEach((t: any) => {
                console.log(`Period: ${t.period}, EndDate: ${t.endDate}`);
                console.log(`  Growth: ${t.growth?.fmt}`);
                console.log(`  Earnings Estimate:`, t.earningsEstimate);
                console.log(`  Revenue Estimate:`, t.revenueEstimate);
                console.log("---------------------------");
            });

            const currentYear = trend.find((t: any) => t.period === '0y');
            const nextYear = trend.find((t: any) => t.period === '+1y');

            if (currentYear && nextYear) {
                const epsCurrent = currentYear.earningsEstimate?.avg?.raw;
                const epsNext = nextYear.earningsEstimate?.avg?.raw;
                console.log("EPS This Year (0y):", epsCurrent);
                console.log("EPS Next Year (+1y):", epsNext);
                if (epsCurrent && epsNext) {
                    const growth = ((epsNext - epsCurrent) / epsCurrent) * 100;
                    console.log(`Calculated Growth: ${growth.toFixed(2)}%`);
                }
            }
        } else {
            console.log("No earnings trend found.");
        }

    } catch (e) {
        console.error(e);
    }
}

main();
