/// <reference lib="dom" />
import { calculateWeightedAverages, StockData } from './math';

// We need to declare the global functions we rely on, or attach them to window
declare global {
    interface Window {
        dashboardData: any[]; // The data loaded by legacy scripts
        renderTable: any; // Use legacy or replace?
    }
}

console.log('Client Module Loaded (v2.0)');

/**
 * Hook into the existing renderTable or provide a helper function
 * that the legacy script calls.
 * 
 * Strategy: We expose a global function `updateFooterAverages(data)` 
 * that the legacy `renderTable` calls at the end.
 */
(window as any).updateFooterAverages = function (data: any[]) {
    // Convert untyped data to StockData
    const stocks: StockData[] = data.map(d => ({
        allocation: parseFloat(d.allocation) || 0,
        pe: parseFloat(d.pe),
        ps: parseFloat(d.ps),
        peg: parseFloat(d.peg),
        changeYTD: parseFloat(d.changeYTD),
        change1Y: parseFloat(d.change1Y),
        quote: d.quote,
        growth: d.growth // Legacy script calculates this mutation
    }));

    const avgs = calculateWeightedAverages(stocks);

    const setText = (id: string, val: string) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setText('avgPS', avgs.avgPS);
    setText('avgPE', avgs.avgPE);
    setText('avgGrowth', avgs.avgGrowth);
    setText('avgPEG', avgs.avgPEG);
    setText('avgYTD', avgs.avgYTD);
    setText('avg1Y', avgs.avg1Y);
};
