import { describe, it, expect } from 'vitest';
import { calculateWeightedAverages, StockData } from '../src/client/math';

describe('Client Math: calculateWeightedAverages', () => {
    it('calculates correct weighted averages', () => {
        const stocks: StockData[] = [
            { allocation: 50, ps: 10, pe: 20, peg: 1.5, changeYTD: 10, change1Y: 20 },
            { allocation: 50, ps: 20, pe: 30, peg: 2.5, changeYTD: 20, change1Y: 40 }
        ];

        const result = calculateWeightedAverages(stocks);

        // Expected: (10*50 + 20*50) / 100 = 15
        expect(result.avgPS).toBe('15.00');
        // Expected: (20*50 + 30*50) / 100 = 25
        expect(result.avgPE).toBe('25.00');
        // Expected: (1.5*50 + 2.5*50) / 100 = 2.0
        expect(result.avgPEG).toBe('2.00');
        expect(result.avgYTD).toBe('15.0%');
        expect(result.avg1Y).toBe('30.0%');
    });

    it('handles missing or zero allocation', () => {
        const stocks: StockData[] = [
            { allocation: 0, ps: 100, pe: 100 }, // Should be ignored
            { allocation: 100, ps: 10, pe: 10 }
        ];

        const result = calculateWeightedAverages(stocks);
        expect(result.avgPS).toBe('10.00');
        expect(result.avgPE).toBe('10.00');
    });

    it('calculates growth from inputs if missing', () => {
        const stocks: StockData[] = [
            {
                allocation: 100,
                quote: { epsCurrentYear: 100, epsNextYear: 110 }
            }
        ];
        // Growth = (110 - 100) / 100 = 10%
        const result = calculateWeightedAverages(stocks);
        expect(result.avgGrowth).toBe('10.0%');
    });
});
