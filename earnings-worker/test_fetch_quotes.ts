
const symbols = ["NVDA", "WDC"];
const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;

async function run() {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const data: any = await response.json();
        const result = data.quoteResponse.result[0];

        console.log("Keys available:", Object.keys(result));
        console.log("Market Cap:", result.marketCap);
        console.log("P/S:", result.priceToSalesTrailing12Months);

        // Check for other potential names
        console.log("Full Object:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
