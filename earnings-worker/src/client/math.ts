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
        const alloc = Number.isFinite(Number(stock.allocation)) ? Number(stock.allocation) : 0;

        const epsC = Number.isFinite(Number(stock.quote?.epsCurrentYear)) ? Number(stock.quote?.epsCurrentYear) : 0;
        const epsN = Number.isFinite(Number(stock.quote?.epsNextYear)) ? Number(stock.quote?.epsNextYear) : 0;
        let growth = Number.isFinite(Number(stock.growth)) ? Number(stock.growth) : 0;

        if (stock.growth === undefined && epsC !== 0) {
            growth = ((epsN - epsC) / Math.abs(epsC)) * 100;
        }

        const pe = Number(stock.pe);
        if (Number.isFinite(pe) && pe > 0 && alloc > 0) { wTotalPE += pe * alloc; totalAllocPE += alloc; }
        if (Number.isFinite(growth) && Math.abs(growth) < 1000 && alloc > 0) { wTotalGrowth += growth * alloc; totalAllocGrowth += alloc; }
        const ps = Number(stock.ps);
        if (Number.isFinite(ps) && ps > 0 && alloc > 0) { wTotalPS += ps * alloc; totalAllocPS += alloc; }
        const peg = Number(stock.peg);
        if (Number.isFinite(peg) && peg > 0 && alloc > 0) { wTotalPEG += peg * alloc; totalAllocPEG += alloc; }
        const ytd = Number(stock.changeYTD);
        if (Number.isFinite(ytd) && alloc > 0) { wTotalYTD += ytd * alloc; totalAllocYTD += alloc; }
        const oneY = Number(stock.change1Y);
        if (Number.isFinite(oneY) && alloc > 0) { wTotal1Y += oneY * alloc; totalAlloc1Y += alloc; }
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
