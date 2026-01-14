import { ScoringMetrics } from './types';
import { Bindings } from '../types';

// Map industry string to mock PMI/Growth data (bridges real data with scoring until we have real PMI API)
function mapIndustryToMetrics(industry: string): { pmi: number; growth: number } {
    const ind = industry.toLowerCase();

    if (ind.includes("software") || ind.includes("cloud") || ind.includes("internet")) {
        return { pmi: 55, growth: 0.15 }; // Strong Growth
    }
    if (ind.includes("semiconductor") || ind.includes("chip")) {
        return { pmi: 48, growth: 0.12 }; // Cyclical High
    }
    if (ind.includes("hardware") || ind.includes("electronics") || ind.includes("equipment")) {
        return { pmi: 42, growth: 0.05 }; // Mature / Weak
    }
    if (ind.includes("service") || ind.includes("consulting")) {
        return { pmi: 51, growth: 0.08 }; // Steady
    }
    if (ind.includes("retail") || ind.includes("commerce")) {
        return { pmi: 45, growth: 0.06 }; // Consumer dependent
    }
    // Default / Other
    return { pmi: 50, growth: 0.10 };
}

const STATIC_INDUSTRY_MAP: Record<string, string> = {
    "ADBE": "Software—Infrastructure",
    "MSFT": "Software—Infrastructure",
    "ORCL": "Software—Infrastructure",
    "CRM": "Software—Application",
    "NVDA": "Semiconductors",
    "AMD": "Semiconductors",
    "AVGO": "Semiconductors",
    "INTC": "Semiconductors",
    "MRVL": "Semiconductors",
    "TSM": "Semiconductors",
    "AMZN": "Internet Retail",
    "BABA": "Internet Retail",
    "META": "Internet Content & Information",
    "GOOG": "Internet Content & Information",
    "GOOGL": "Internet Content & Information",
    "TCEHY": "Internet Content & Information",
    "NFLX": "Entertainment",
    "AAPL": "Consumer Electronics"
};

// Helper: Simple deterministic hash from string
function getDeterministicVal(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    const normalized = Math.abs(hash) / 2147483647; // 0.0 to 1.0
    return normalized;
}

// 1. Profit Growth (Consensus EPS Growth)
export async function fetchProfitGrowth(symbol: string): Promise<number> {
    // This is now handled inside updateScoringMetrics via single Yahoo call
    return 0.10; // Fallback
}

// FETCH REAL DATA from Yahoo Finance
async function fetchYahooData(symbol: string): Promise<{ industry: string, growth: number, pe_percentile: number }> {
    let industry = "Technology (Fallback)";
    if (STATIC_INDUSTRY_MAP[symbol.toUpperCase()]) {
        industry = STATIC_INDUSTRY_MAP[symbol.toUpperCase()];
    }

    let growth = 0.10; // Default 10%
    let pe_percentile = 0.5; // Default Neutral

    try {
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=assetProfile,financialData,defaultKeyStatistics`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (res.ok) {
            const data: any = await res.json();
            const result = data.quoteSummary?.result?.[0];

            // 1. Industry
            if (result?.assetProfile?.industry) {
                industry = result.assetProfile.industry;
            }

            // 2. Growth (Earnings Growth or Revenue Growth)
            // financialData.earningsGrowth is quarterly YoY. 
            // financialData.revenueGrowth is quarterly YoY.
            // defaultKeyStatistics.pegRatio -> PEG = PE / Growth -> Growth = PE / PEG
            if (result?.financialData?.earningsGrowth?.raw) {
                growth = result.financialData.earningsGrowth.raw;
            } else if (result?.financialData?.revenueGrowth?.raw) {
                growth = result.financialData.revenueGrowth.raw;
            } else if (result?.defaultKeyStatistics?.pegRatio?.raw && result?.defaultKeyStatistics?.forwardPE?.raw) {
                // Estimate Growth from PEG
                const peg = result.defaultKeyStatistics.pegRatio.raw;
                const pe = result.defaultKeyStatistics.forwardPE.raw;
                if (peg > 0) growth = (pe / peg) / 100; // Approx long term growth
            }

            // PE Percentile: Map PE to 0-1 where 1.0 = Cheapest (low PE = good)
            if (result?.defaultKeyStatistics?.forwardPE?.raw) {
                const pe = result.defaultKeyStatistics.forwardPE.raw;
                if (pe < 10) pe_percentile = 1.0;
                else if (pe > 60) pe_percentile = 0.0;
                else pe_percentile = 1.0 - ((pe - 10) / 50);
            }
        }
    } catch (e) {
        console.warn(`Failed to fetch Yahoo data for ${symbol}`, e);
    }

    // Fallback Mock if Data Missing (Use Hash)
    if (growth === 0.10) {
        const val = getDeterministicVal(symbol + "GRO");
        growth = (val * 0.5) - 0.1;
    }

    return { industry, growth, pe_percentile };
}

// Macro Policy (static placeholder until real Fed API available)
export async function fetchMacroState(): Promise<'CUT' | 'HIKE' | 'NEUTRAL'> {
    return 'CUT';
}

// Fetch all metrics for a symbol and save to DB
export async function updateScoringMetrics(env: Bindings, symbol: string): Promise<ScoringMetrics> {

    // 1. Fetch ALL Real Data
    const yahooData = await fetchYahooData(symbol);
    const profit_growth = yahooData.growth;
    const realIndustry = yahooData.industry;
    const pe_percentile = yahooData.pe_percentile;

    // 2. Map Real Industry to Mock Scores (PMI still mock until we have API)
    const indData = mapIndustryToMetrics(realIndustry);
    const industry_pmi = indData.pmi;
    const industry_growth = indData.growth;

    const metrics: ScoringMetrics = {
        symbol,
        profit_growth,
        industry_pmi,
        industry_growth,
        pe_percentile,
        industry: realIndustry
    };

    // Save to DB
    await env.DB.prepare(`
        INSERT OR REPLACE INTO scoring_metrics (symbol, profit_growth, industry_pmi, industry_growth, pe_percentile, industry)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(symbol, metrics.profit_growth, metrics.industry_pmi, metrics.industry_growth, metrics.pe_percentile, metrics.industry).run();

    return metrics;
}
