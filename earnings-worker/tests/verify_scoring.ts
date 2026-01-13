import { calculateStockScore } from '../src/scoring/calculator';
import { optimizePortfolioWeights } from '../src/scoring/optimizer';
import { ScoringMetrics } from '../src/scoring/types';

// Mock Data
const stocks: ScoringMetrics[] = [
    { symbol: 'AAPL', profit_growth: 0.25, industry_pmi: 55, industry_growth: 0.12, pe_percentile: 0.8 }, // Good
    { symbol: 'GOOGL', profit_growth: 0.12, industry_pmi: 55, industry_growth: 0.05, pe_percentile: 0.4 }, // Mid
    { symbol: 'TSLA', profit_growth: -0.05, industry_pmi: 45, industry_growth: 0.02, pe_percentile: 0.9 }, // Bad
    { symbol: 'NVDA', profit_growth: 0.50, industry_pmi: 60, industry_growth: 0.20, pe_percentile: 0.6 }, // Great
];

console.log("--- 1. Testing Stock Scoring ---");
stocks.forEach(s => {
    const score = calculateStockScore(s);
    console.log(`Stock: ${s.symbol}, Growth: ${(s.profit_growth * 100).toFixed(1)}%, PMI: ${s.industry_pmi}`);
    console.log(`   -> Profit Score: ${score.profitScore}`);
    console.log(`   -> Industry Score: ${score.industryScore}`);
    console.log(`   -> Total Forward: ${score.total}`);
});

console.log("\n--- 2. Testing Optimization ---");
// Setup initial weights (Equal)
const currentWeights = new Map<string, number>();
stocks.forEach(s => currentWeights.set(s.symbol, 0.25));

const result = optimizePortfolioWeights(stocks, currentWeights, { maxWeight: 0.40, minWeight: 0 }); // Allow 40% max to see concentration

console.log("Optimized Weights:");
result.optimizedWeights.forEach((w, s) => {
    console.log(`   ${s}: ${(w * 100).toFixed(1)}%`);
});
console.log(`Score: ${result.optimizedScore.toFixed(2)}`);

if (result.optimizedWeights.get('NVDA')! > 0.25) {
    console.log("SUCCESS: Optimizer increased weight of high-scoring NVDA.");
} else {
    console.error("FAIL: Optimizer did not favor high-scoring NVDA.");
}
