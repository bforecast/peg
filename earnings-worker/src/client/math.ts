/**
 * Types for Stock Data used in calculations
 */
export interface StockData {
    allocation: number; // 0-100
    pe?: number | null;
    ps?: number | null;
    peg?: number | null;
    changeYTD?: number | null;
    change1Y?: number | null;
    quote?: {
        epsCurrentYear?: number;
        epsNextYear?: number;
    } | null;
    growth?: number; // Calculated field
}

export interface WeightedAverages {
    avgPE: string;
    avgPS: string;
    avgGrowth: string;
    avgPEG: string;
    avgYTD: string;
    avg1Y: string;
}

/**
 * Calculates weighted averages for a portfolio of stocks.
 * @param stocks List of stock data
 * @returns Formatted string values for averages
 */
export function calculateWeightedAverages(stocks: StockData[]): WeightedAverages {
    let wTotalPE = 0, wTotalGrowth = 0, wTotalPS = 0, wTotalPEG = 0, wTotalYTD = 0, wTotal1Y = 0;
    let totalAllocPE = 0, totalAllocGrowth = 0, totalAllocPS = 0, totalAllocPEG = 0, totalAllocYTD = 0, totalAlloc1Y = 0;

    stocks.forEach(stock => {
        const alloc = stock.allocation || 0;

        // Calculate Growth (Mutation: adding growth property if missing, but we should probably avoid mutation in pure function)
        // For this function, we assume input might need calculation or comes pre-calculated.
        // Let's replicate the logic from renderTable
        const epsC = stock.quote?.epsCurrentYear || 0;
        const epsN = stock.quote?.epsNextYear || 0;
        let growth = stock.growth || 0;

        // If growth wasn't pre-calculated, calculate it here
        if (stock.growth === undefined && epsC !== 0) {
            growth = ((epsN - epsC) / Math.abs(epsC)) * 100;
        }

        if (stock.pe && alloc > 0) { wTotalPE += stock.pe * alloc; totalAllocPE += alloc; }
        // Filter out extreme growth outliers for the average
        if (Math.abs(growth) < 1000 && alloc > 0) { wTotalGrowth += growth * alloc; totalAllocGrowth += alloc; }
        if (stock.ps && alloc > 0) { wTotalPS += stock.ps * alloc; totalAllocPS += alloc; }
        if (stock.peg && alloc > 0) { wTotalPEG += stock.peg * alloc; totalAllocPEG += alloc; }
        if (stock.changeYTD != null && alloc > 0) { wTotalYTD += stock.changeYTD * alloc; totalAllocYTD += alloc; }
        if (stock.change1Y != null && alloc > 0) { wTotal1Y += stock.change1Y * alloc; totalAlloc1Y += alloc; }
    });

    return {
        avgPS: totalAllocPS > 0 ? (wTotalPS / totalAllocPS).toFixed(2) : '-',
        avgPE: totalAllocPE > 0 ? (wTotalPE / totalAllocPE).toFixed(2) : '-',
        avgGrowth: totalAllocGrowth > 0 ? (wTotalGrowth / totalAllocGrowth).toFixed(1) + '%' : '-',
        avgPEG: totalAllocPEG > 0 ? (wTotalPEG / totalAllocPEG).toFixed(2) : '-',
        avgYTD: totalAllocYTD > 0 ? (wTotalYTD / totalAllocYTD).toFixed(1) + '%' : '-',
        avg1Y: totalAlloc1Y > 0 ? (wTotal1Y / totalAlloc1Y).toFixed(1) + '%' : '-'
    };
}
