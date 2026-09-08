import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updatePrices } from '../src/db';
import * as yahoo from '../src/yahoo';

describe('Incremental Price Updates (D1 Free Tier Optimization)', () => {
    // Generate 300 mock trading days from 2025-01-01 to 2025-10-31
    const mockPrices: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
    const baseDate = new Date('2025-01-01');
    for (let i = 0; i < 300; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        mockPrices.push({
            date: d.toISOString().split('T')[0],
            open: 100 + i * 0.1,
            high: 105 + i * 0.1,
            low: 95 + i * 0.1,
            close: 102 + i * 0.1,
            volume: 1000000
        });
    }

    beforeEach(() => {
        vi.spyOn(yahoo, 'fetchYahooPrices').mockResolvedValue(mockPrices as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('performs incremental update (inserts only rows on/after maxDate) when history exists', async () => {
        const existingMaxDate = mockPrices[297].date;
        let batchStatements: any[] = [];

        const mockEnv = {
            DB: {
                prepare: vi.fn((query: string) => {
                    if (query.includes('max(date) as maxDate')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                first: vi.fn().mockResolvedValue({
                                    maxDate: existingMaxDate,
                                    count: 260
                                })
                            })
                        };
                    }
                    if (query.includes('INSERT OR REPLACE INTO stock_prices')) {
                        return {
                            bind: vi.fn().mockImplementation((...args) => ({
                                query: 'INSERT',
                                args
                            }))
                        };
                    }
                    if (query.includes('SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 400')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                all: vi.fn().mockResolvedValue({
                                    results: mockPrices.slice(-200)
                                })
                            })
                        };
                    }
                    return {
                        bind: vi.fn().mockReturnValue({
                            all: vi.fn().mockResolvedValue({ results: [] }),
                            first: vi.fn().mockResolvedValue(null),
                            run: vi.fn().mockResolvedValue({ success: true })
                        })
                    };
                }),
                batch: vi.fn(async (stmts: any[]) => {
                    batchStatements.push(...stmts);
                    return stmts.map(() => ({ success: true }));
                })
            }
        };

        const result = await updatePrices(mockEnv as any, 'AAPL', false);

        expect(result.message).toBe('Success');
        expect(result.count).toBe(3);
        expect(batchStatements.length).toBe(3);
    });

    it('performs full backfill when symbol has no existing records', async () => {
        let batchStatements: any[] = [];

        const mockEnv = {
            DB: {
                prepare: vi.fn((query: string) => {
                    if (query.includes('max(date) as maxDate')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                first: vi.fn().mockResolvedValue({
                                    maxDate: null,
                                    count: 0
                                })
                            })
                        };
                    }
                    if (query.includes('INSERT OR REPLACE INTO stock_prices')) {
                        return {
                            bind: vi.fn().mockImplementation((...args) => ({
                                query: 'INSERT',
                                args
                            }))
                        };
                    }
                    if (query.includes('SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 400')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                all: vi.fn().mockResolvedValue({
                                    results: mockPrices
                                })
                            })
                        };
                    }
                    return {
                        bind: vi.fn().mockReturnValue({
                            all: vi.fn().mockResolvedValue({ results: [] }),
                            first: vi.fn().mockResolvedValue(null),
                            run: vi.fn().mockResolvedValue({ success: true })
                        })
                    };
                }),
                batch: vi.fn(async (stmts: any[]) => {
                    batchStatements.push(...stmts);
                    return stmts.map(() => ({ success: true }));
                })
            }
        };

        const result = await updatePrices(mockEnv as any, 'NEWCO', false);

        expect(result.message).toBe('Success');
        expect(result.count).toBe(300);
        expect(batchStatements.length).toBe(300);
    });

    it('forces full backfill when force is true even if history exists', async () => {
        const existingMaxDate = mockPrices[297].date;
        let batchStatements: any[] = [];

        const mockEnv = {
            DB: {
                prepare: vi.fn((query: string) => {
                    if (query.includes('max(date) as maxDate')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                first: vi.fn().mockResolvedValue({
                                    maxDate: existingMaxDate,
                                    count: 260
                                })
                            })
                        };
                    }
                    if (query.includes('INSERT OR REPLACE INTO stock_prices')) {
                        return {
                            bind: vi.fn().mockImplementation((...args) => ({
                                query: 'INSERT',
                                args
                            }))
                        };
                    }
                    if (query.includes('SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 400')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                all: vi.fn().mockResolvedValue({
                                    results: mockPrices
                                })
                            })
                        };
                    }
                    return {
                        bind: vi.fn().mockReturnValue({
                            all: vi.fn().mockResolvedValue({ results: [] }),
                            first: vi.fn().mockResolvedValue(null),
                            run: vi.fn().mockResolvedValue({ success: true })
                        })
                    };
                }),
                batch: vi.fn(async (stmts: any[]) => {
                    batchStatements.push(...stmts);
                    return stmts.map(() => ({ success: true }));
                })
            }
        };

        const result = await updatePrices(mockEnv as any, 'SPLIT_STOCK', true);

        expect(result.message).toBe('Success');
        expect(result.count).toBe(300);
        expect(batchStatements.length).toBe(300);
    });
});

describe('US Market Holidays & getLastTradingDate', () => {
    it('identifies key US market holidays accurately', async () => {
        const { isUSMarketHoliday } = await import('../src/db');
        // Labor Day 2026
        expect(isUSMarketHoliday('2026-09-07')).toBe(true);
        // Independence Day 2026 (observed)
        expect(isUSMarketHoliday('2026-07-03')).toBe(true);
        // Regular trading days
        expect(isUSMarketHoliday('2026-09-04')).toBe(false);
        expect(isUSMarketHoliday('2026-09-08')).toBe(false);
    });

    it('rolls back to previous trading day when invoked on a holiday', async () => {
        const { getLastTradingDate } = await import('../src/db');
        // On Labor Day (2026-09-07 20:00:00 EST), last trading date must roll back to Friday 2026-09-04
        const laborDayEvening = new Date('2026-09-07T20:00:00-04:00');
        expect(getLastTradingDate(laborDayEvening)).toBe('2026-09-04');

        // On Tuesday pre-market after Labor Day (2026-09-08 09:30:00 EST), must still roll back to 2026-09-04
        const tuesdayMorning = new Date('2026-09-08T09:30:00-04:00');
        expect(getLastTradingDate(tuesdayMorning)).toBe('2026-09-04');

        // On Tuesday post-market (2026-09-08 16:30:00 EST), must return today 2026-09-08
        const tuesdayEvening = new Date('2026-09-08T16:30:00-04:00');
        expect(getLastTradingDate(tuesdayEvening)).toBe('2026-09-08');
    });
});

