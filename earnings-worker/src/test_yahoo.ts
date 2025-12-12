
import { fetchYahooEstimates } from './yahoo';

async function test() {
    console.log("Testing Yahoo Fetch for AAPL...");
    const result = await fetchYahooEstimates('AAPL');
    console.log("Result:", JSON.stringify(result, null, 2));
}

test();
