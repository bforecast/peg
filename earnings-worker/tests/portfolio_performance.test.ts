import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import worker from '../src/main';
import { calculatePortfolioPerformance } from '../src/portfolio';

describe('Portfolio Performance & Statistics (2025~Present with QQQ Benchmark)', () => {

    it('calculates return & risk parameters accurately for a portfolio', async () => {
        // Generate mock trading days starting from 2025-01-02 (50 trading days)
        const dates: string[] = [];
        const baseDate = new Date('2025-01-02');
        for (let i = 0; i < 60; i++) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + i);
            if (d.getDay() !== 0 && d.getDay() !== 6) { // skip weekends
                dates.push(d.toISOString().split('T')[0]);
            }
            if (dates.length >= 40) break;
        }

        // Mock QQQ Prices: starts at 500, steadily goes to 550 (10% return)
        const qqqPrices = dates.map((date, idx) => ({
            symbol: 'QQQ',
            date,
            close: 500 * (1 + (idx / (dates.length - 1)) * 0.10)
        }));

        // Mock NVDA Prices: starts at 100, drops to 90 (drawdown), then climbs to 130 (+30% return)
        const nvdaPrices = dates.map((date, idx) => {
            let mult = 1.0;
            if (idx < 10) mult = 1.0 - (idx / 10) * 0.10; // drops to 0.90
            else mult = 0.90 + ((idx - 10) / (dates.length - 11)) * 0.40; // rises to 1.30
            return {
                symbol: 'NVDA',
                date,
                close: 100 * mult
            };
        });

        // Mock MSFT Prices: starts at 400, rises to 440 (+10% return)
        const msftPrices = dates.map((date, idx) => ({
            symbol: 'MSFT',
            date,
            close: 400 * (1 + (idx / (dates.length - 1)) * 0.10)
        }));

        const allPrices = [...qqqPrices, ...nvdaPrices, ...msftPrices];

        const mockEnv = {
            DB: {
                prepare: vi.fn((query: string) => {
                    if (query.includes('FROM groups WHERE id = ?')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                first: vi.fn().mockResolvedValue({
                                    id: 1,
                                    name: 'Tech Growth',
                                    type: 'Personal',
                                    created_at: '2025-01-01'
                                })
                            })
                        };
                    }
                    if (query.includes('FROM group_members WHERE group_id = ?')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                all: vi.fn().mockResolvedValue({
                                    results: [
                                        { symbol: 'NVDA', allocation: 50 },
                                        { symbol: 'MSFT', allocation: 50 }
                                    ]
                                })
                            })
                        };
                    }
                    if (query.includes('FROM stock_prices')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                all: vi.fn().mockResolvedValue({
                                    results: allPrices
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
                })
            }
        };

        const result = await calculatePortfolioPerformance(mockEnv as any, 1, {
            startDate: '2025-01-01',
            benchmark: 'QQQ'
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.groupId).toBe(1);
        expect(result.groupName).toBe('Tech Growth');
        expect(result.benchmarkSymbol).toBe('QQQ');
        expect(result.createdAt).toBe('2025-01-01');
        expect(result.totalTradingDays).toBe(dates.length);

        // Portfolio Return: 50% NVDA (+30%) + 50% MSFT (+10%) = +20%
        expect(result.stats.totalReturn).toBeCloseTo(20.0, 0);
        // Benchmark QQQ Return: +10%
        expect(result.stats.benchmarkReturn).toBeCloseTo(10.0, 0);

        // Annualized Return (CAGR) should be positive
        expect(result.stats.annualizedReturn).toBeGreaterThan(0);
        // Annualized Volatility should be positive
        expect(result.stats.annualizedVolatility).toBeGreaterThan(0);
        // Max Drawdown should be negative
        expect(result.stats.maxDrawdown).toBeLessThan(0);
        // Sharpe Ratio should be a valid number
        expect(typeof result.stats.sharpeRatio).toBe('number');
        // Calmar Ratio should be CAGR / |MaxDD|
        expect(result.stats.calmarRatio).toBeGreaterThan(0);
        // Sortino Ratio should be a valid number
        expect(typeof result.stats.sortinoRatio).toBe('number');

        // History series
        expect(result.history.length).toBe(dates.length);
        expect(result.history[0].portfolio).toBe(0);
        expect(result.history[0].benchmark).toBe(0);
        expect(result.history[result.history.length - 1].portfolio).toBeCloseTo(20.0, 0);

        // Test with period = 'created'
        const resultCreated = await calculatePortfolioPerformance(mockEnv as any, 1, {
            period: 'created',
            benchmark: 'QQQ'
        });
        expect(resultCreated).not.toBeNull();
        expect(resultCreated?.createdAt).toBe('2025-01-01');
    });

    it('handles /api/portfolio-performance/:id endpoint', async () => {
        const request = new Request('http://example.com/api/portfolio-performance/1?period=2025&benchmark=QQQ', {
            headers: {
                Cookie: 'auth_session=valid_session_token'
            }
        });
        const ctx = createExecutionContext();

        const dates = [
            '2025-01-02', '2025-01-03', '2025-01-06', '2025-01-07', '2025-01-08',
            '2025-01-09', '2025-01-10', '2025-01-13', '2025-01-14', '2025-01-15',
            '2025-01-16', '2025-01-17', '2025-01-20', '2025-01-21', '2025-01-22'
        ];
        const prices = [
            ...dates.map((d, i) => ({ symbol: 'QQQ', date: d, close: 500 + i })),
            ...dates.map((d, i) => ({ symbol: 'AAPL', date: d, close: 220 + i * 2 }))
        ];

        const mockEnv = {
            AUTH_USERNAME: 'admin',
            AUTH_PASSWORD: 'password',
            DB: {
                prepare: vi.fn((query: string) => {
                    if (query.includes('FROM groups WHERE id = ?')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                first: vi.fn().mockResolvedValue({ id: 1, name: 'Apple Holdings', type: 'Personal' })
                            })
                        };
                    }
                    if (query.includes('FROM group_members WHERE group_id = ?')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                all: vi.fn().mockResolvedValue({
                                    results: [{ symbol: 'AAPL', allocation: 100 }]
                                })
                            })
                        };
                    }
                    if (query.includes('FROM stock_prices')) {
                        return {
                            bind: vi.fn().mockReturnValue({
                                all: vi.fn().mockResolvedValue({ results: prices })
                            })
                        };
                    }
                    return {
                        bind: vi.fn().mockReturnValue({
                            all: vi.fn().mockResolvedValue({ results: [] }),
                            first: vi.fn().mockResolvedValue(null)
                        })
                    };
                })
            }
        };

        const response = await worker.fetch(request, mockEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const data: any = await response.json();
        expect(data.groupName).toBe('Apple Holdings');
        expect(data.benchmarkSymbol).toBe('QQQ');
        expect(data.stats).toBeDefined();
        expect(data.history.length).toBe(dates.length);
    });

    it('returns 400 for invalid portfolio ID', async () => {
        const request = new Request('http://example.com/api/portfolio-performance/invalid_id', {
            headers: {
                Cookie: 'auth_session=valid_session_token'
            }
        });
        const ctx = createExecutionContext();
        const mockEnv = { DB: {} };

        const response = await worker.fetch(request, mockEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(400);
    });
});
