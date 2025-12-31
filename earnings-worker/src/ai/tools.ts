import { Bindings } from '../types';
import { getDashboardData } from '../db';
import { StockQuote } from '../types';

// Tool Definition Interface (Gemini format)
export interface ToolDefinition {
    name: string;
    description: string;
    parameters?: object;
}

// ---------------------------------------------------------
// 1. Investment Tools (Portfolio, Allocation)
// ---------------------------------------------------------
export const investmentTools: ToolDefinition[] = [
    {
        name: "get_portfolio_summary",
        description: "Get a summary of the current portfolio, including total value, allocations, and list of holdings.",
        parameters: { type: "object", properties: {}, required: [] }
    },
    {
        name: "check_allocation_balance",
        description: "Check if the current portfolio allocation deviates significantly from target weights.",
        parameters: { type: "object", properties: {}, required: [] }
    },
    {
        name: "compare_portfolios",
        description: "Compare all available portfolios based on aggregated fundamental metrics (PEG, PE, Growth, Sharpe Ratio) and allocations. Useful for finding the 'best', 'cheapest', or 'highest risk-adjusted' portfolio.",
        parameters: { type: "object", properties: {}, required: [] }
    }
];

export async function handleInvestmentTool(name: string, args: any, env: Bindings): Promise<any> {
    if (name === "get_portfolio_summary") {
        // Fetch real data
        const data = await getDashboardData(env);
        const summary = data.map(d => ({
            symbol: d.symbol,
            price: d.price,
            allocation: d.allocation, // Assuming 'allocation' field exists and is populated
            value_metrics: { peg: d.peg, growth: d.peg ? (d.quote?.forward_pe! / d.peg).toFixed(1) + '%' : 'N/A' }
        }));
        return {
            total_stocks: summary.length,
            holdings: summary
        };
    }

    if (name === "compare_portfolios") {
        // 1. Fetch all groups
        const { results: groups } = await env.DB.prepare("SELECT * FROM groups").all();
        if (!groups || groups.length === 0) return { error: "No portfolios found." };

        const comparison = [];

        for (const g of groups) {
            const group = g as any;
            // 2. Fetch members for this group
            const { results: members } = await env.DB.prepare("SELECT symbol, allocation FROM group_members WHERE group_id = ?").bind(group.id).all();

            if (!members || members.length === 0) {
                comparison.push({ name: group.name, note: "Empty portfolio" });
                continue;
            }

            // 3. Fetch quotes for these members (reuse existing db helper if possible, or fetch raw)
            // We need quotes to calculate weighted metrics.
            // Let's use getDashboardData passing groupID to get everything processed!
            // This reuses the logic in db.ts which is robust.
            const data = await getDashboardData(env, group.id.toString());

            // 3.5 Fetch Portfolio Risk Stats
            const pStats = await env.DB.prepare("SELECT * FROM portfolio_stats WHERE group_id = ?").bind(group.id).first() as any;

            // 4. Aggregate Metrics
            let weightedPEG = 0;
            let totalWeightForPEG = 0;
            let weightedPE = 0;
            let totalWeightForPE = 0;
            let weightedGrowth = 0;
            let totalAlloc = 0;
            let weightedSharpe = 0;
            let totalWeightForSharpe = 0;

            for (const stock of data) {
                const alloc = stock.allocation || 0;
                totalAlloc += alloc;

                if (stock.pe) {
                    weightedPE += stock.pe * alloc;
                    totalWeightForPE += alloc;
                }

                // Growth Rate implied derived from PEG
                // growth = PE / PEG. 
                // If we have stats, use those. 
                // Let's use the 'peg' value we calculated
                if (stock.peg && stock.peg > 0) {
                    weightedPEG += stock.peg * alloc;
                    totalWeightForPEG += alloc;

                    // Implied Growth (approx)
                    if (stock.quote?.forwardPE) {
                        const growth = stock.quote.forwardPE / stock.peg;
                        weightedGrowth += growth * alloc;
                    }
                }

                // Sharpe Accumulation (Fallback)
                if (stock.sharpeRatio1Y !== undefined) {
                    weightedSharpe += stock.sharpeRatio1Y * alloc;
                    totalWeightForSharpe += alloc;
                }
            }

            const avgPEG = totalWeightForPEG > 0 ? (weightedPEG / totalWeightForPEG).toFixed(2) : "N/A";
            const avgPE = totalWeightForPE > 0 ? (weightedPE / totalWeightForPE).toFixed(1) : "N/A";
            const avgGrowth = totalWeightForPEG > 0 ? (weightedGrowth / totalWeightForPEG).toFixed(1) + "%" : "N/A";

            // Use pre-calculated Portfolio Stats if available
            let sharpe = pStats?.sharpe ? pStats.sharpe.toFixed(2) : "N/A";
            const sortino = pStats?.sortino ? pStats.sortino.toFixed(2) : "N/A";
            const cagr = pStats?.cagr ? (pStats.cagr * 100).toFixed(1) + "%" : "N/A";

            // Fallback to Weighted Average Sharpe if DB stats are missing
            if (sharpe === "N/A" && totalWeightForSharpe > 0) {
                sharpe = (weightedSharpe / totalWeightForSharpe).toFixed(2) + "*"; // * indicates estimated
            }

            comparison.push({
                id: group.id,
                name: group.name,
                stock_count: data.length,
                avg_peg: avgPEG,
                avg_pe: avgPE,
                avg_growth: avgGrowth,
                sharpe_ratio: sharpe,
                sortino: sortino,
                cagr: cagr,
                top_holding: data.sort((a, b) => b.allocation - a.allocation)[0]?.symbol || "None"
            });
        }

        return {
            portfolio_count: groups.length,
            comparison: comparison
        };
    }
    return { error: "Tool not found" };
}

// ---------------------------------------------------------
// 2. Value Tools (PEG, Valuation)
// ---------------------------------------------------------
export const valueTools: ToolDefinition[] = [
    {
        name: "get_valuation_metrics",
        description: "Get detailed valuation metrics for a specific stock (PEG, PE, Forward PE, Growth Rate).",
        parameters: {
            type: "object",
            properties: {
                symbol: { type: "string", description: "The stock ticker symbol (e.g., AAPL)" }
            },
            required: ["symbol"]
        }
    }
];

export async function handleValueTool(name: string, args: any, env: Bindings): Promise<any> {
    if (name === "get_valuation_metrics") {
        const symbol = args.symbol.toUpperCase();
        const data = await getDashboardData(env);
        const stock = data.find(d => d.symbol === symbol);

        if (!stock) return { error: `Stock ${symbol} not found in system.` };

        return {
            symbol: stock.symbol,
            price: stock.price,
            forward_pe: stock.peg && stock.quote?.forward_pe ? stock.quote.forward_pe : "N/A",
            peg_ratio: stock.peg || "N/A",
            growth_rate_implied: stock.peg && stock.quote?.forward_pe ? (stock.quote.forward_pe / stock.peg).toFixed(2) + "%" : "N/A",
            valuation_bias: (stock.peg && stock.peg < 1.5) ? "UNDERVALUED" : (stock.peg && stock.peg > 2.5) ? "OVERVALUED" : "FAIR"
        };
    }
    return { error: "Tool not found" };
}

// ---------------------------------------------------------
// 3. Technical Tools (Trends, SMA, RS)
// ---------------------------------------------------------
export const technicalTools: ToolDefinition[] = [
    {
        name: "get_technical_analysis",
        description: "Get technical analysis indicators including SMA status and Relative Strength (RS) Rank.",
        parameters: {
            type: "object",
            properties: {
                symbol: { type: "string", description: "The stock ticker symbol" }
            },
            required: ["symbol"]
        }
    }
];

export async function handleTechnicalTool(name: string, args: any, env: Bindings): Promise<any> {
    if (name === "get_technical_analysis") {
        const symbol = args.symbol.toUpperCase();
        const data = await getDashboardData(env);
        const stock = data.find(d => d.symbol === symbol);

        if (!stock) return { error: `Stock ${symbol} not found.` };

        // Determine trend
        let trend = "NEUTRAL";
        if (stock.sma20 && stock.sma50 && stock.sma200) trend = "STRONG UPTREND";
        else if (!stock.sma20 && !stock.sma50 && !stock.sma200) trend = "STRONG DOWNTREND";
        else if (stock.sma20 && !stock.sma50) trend = "SHORT-TERM RECOVERY";

        return {
            symbol: stock.symbol,
            trend_summary: trend,
            above_sma_20: stock.sma20,
            above_sma_50: stock.sma50,
            above_sma_200: stock.sma200,
            rs_rank_1m: stock.rsRank1M || "N/A",
            delta_52w_high: stock.delta52wHigh
        };
    }
    return { error: "Tool not found" };
}

// Aggregator
export const ALL_TOOLS = [
    ...investmentTools,
    ...valueTools,
    ...technicalTools
];

export async function dispatchToolCall(name: string, args: any, env: Bindings) {
    // Simple dispatcher
    if (investmentTools.find(t => t.name === name)) return handleInvestmentTool(name, args, env);
    if (valueTools.find(t => t.name === name)) return handleValueTool(name, args, env);
    if (technicalTools.find(t => t.name === name)) return handleTechnicalTool(name, args, env);
    return { error: "Unknown tool" };
}
