/**
 * 验证新评分系统 - 基于 scoring.md 测试案例
 * 
 * 测试案例:
 * Stock A: PE=24, PEG=1.2, R=35%, σ=22%, MaxDD=-18%, w=40%
 * Stock B: PE=45, PEG=0.8, R=80%, σ=35%, MaxDD=-32%, w=30%
 * Stock C: PE=12, PEG=0.6, R=5%,  σ=12%, MaxDD=-8%,  w=30%
 * 
 * 预期:
 * Stock A: Score=69
 * Stock B: Score=67
 * Stock C: Score=76
 * Holdings_quality = 70.5
 * Performance_port = 67.5
 * Score_port = 68.5-69
 */

import { calculateStockScore } from '../src/scoring/calculator';
import { StockMetricsInput } from '../src/scoring/types';

// 生成模拟价格序列
function generateMockPrices(return1Y: number, volatility: number, maxDD: number): number[] {
    // 简化: 生成252天的价格序列，满足近似的收益率和波动率
    const prices: number[] = [100]; // 起始价格
    const targetEnd = 100 * (1 + return1Y);

    // 线性插值 + 加入噪声
    for (let i = 1; i <= 252; i++) {
        const progress = i / 252;
        const basePrice = 100 + (targetEnd - 100) * progress;
        // 添加一些波动 (简化版)
        const noise = (Math.random() - 0.5) * volatility * 10;
        prices.push(Math.max(1, basePrice + noise));
    }

    return prices;
}

// Test Data based on scoring.md
const stockA: StockMetricsInput = {
    symbol: 'A',
    weight: 0.40,
    forwardPE: 24,
    peg: 1.2,
    prices: generateMockPrices(0.35, 0.22, -0.18)
};

const stockB: StockMetricsInput = {
    symbol: 'B',
    weight: 0.30,
    forwardPE: 45,
    peg: 0.8,
    prices: generateMockPrices(0.80, 0.35, -0.32)
};

const stockC: StockMetricsInput = {
    symbol: 'C',
    weight: 0.30,
    forwardPE: 12,
    peg: 0.6,
    prices: generateMockPrices(0.05, 0.12, -0.08)
};

console.log("=== 新评分系统验证 ===\n");

console.log("--- 1. 单股评分测试 ---");
[stockA, stockB, stockC].forEach(stock => {
    const result = calculateStockScore(stock);
    console.log(`\nStock ${stock.symbol}:`);
    console.log(`  PE=${stock.forwardPE}, PEG=${stock.peg}`);
    console.log(`  Value Score: ${result.components.value.toFixed(1)}`);
    console.log(`  Momentum Score: ${result.components.momentum.toFixed(1)}`);
    console.log(`  Risk Score: ${result.components.risk.toFixed(1)}`);
    console.log(`  Total Score: ${result.components.total.toFixed(1)}`);
    console.log(`  原始指标: Return=${(result.raw.return1Y * 100).toFixed(1)}%, Vol=${(result.raw.volatility * 100).toFixed(1)}%, MaxDD=${(result.raw.maxDrawdown * 100).toFixed(1)}%`);
});

console.log("\n--- 2. 预期对比 ---");
console.log("预期: Stock A ≈ 69, Stock B ≈ 67, Stock C ≈ 76");
console.log("注: 由于价格序列是模拟生成，实际分数可能略有差异");

console.log("\n=== 验证完成 ===");
