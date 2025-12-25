
const symbols = ["NVDA"];
// Test v6
const urlV6 = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbols.join(',')}`;
// Test v10 quoteSummary
const urlV10 = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/NVDA?modules=summaryDetail,financialData,defaultKeyStatistics`;

async function run() {
    console.log("Testing v6 Quote...");
    try {
        const res6 = await fetch(urlV6, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res6.ok) {
            const data = await res6.json();
            console.log("v6 Result:", data.quoteResponse?.result ? "Found" : "Empty");
            if (data.quoteResponse?.result) console.log(data.quoteResponse.result[0]);
        } else {
            console.log("v6 Failed:", res6.status);
        }
    } catch (e) { console.log("v6 Error", e.message); }

    console.log("\nTesting v10 quoteSummary...");
    try {
        const res10 = await fetch(urlV10, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res10.ok) {
            const data = await res10.json();
            console.log("v10 Result:", data.quoteSummary?.result ? "Found" : "Empty");
            if (data.quoteSummary?.result) {
                const summary = data.quoteSummary.result[0];
                console.log("Market Cap (summaryDetail):", summary.summaryDetail?.marketCap);
                console.log("P/S (summaryDetail):", summary.summaryDetail?.priceToSalesTrailing12Months);
                console.log("P/S (defaultKeyStatistics):", summary.defaultKeyStatistics?.priceToSalesTrailing12Months);
            }
        } else {
            console.log("v10 Failed:", res10.status);
        }
    } catch (e) { console.log("v10 Error", e.message); }
}

run();
