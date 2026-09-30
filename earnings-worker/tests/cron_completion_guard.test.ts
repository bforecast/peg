import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduled, invalidateCronCompletionCache } from '../src/cron';
import * as dbModule from '../src/db';

describe('Cron Completion Guard (Zero-Cost Idle Optimization)', () => {
    const fixedCutoff = '2026-09-30 16:00:00';

    beforeEach(() => {
        invalidateCronCompletionCache();
        vi.spyOn(dbModule, 'getLastTradingDate').mockReturnValue('2026-09-30');
    });

    afterEach(() => {
        invalidateCronCompletionCache();
        vi.restoreAllMocks();
    });

    it('Level 2 Fast-Path: skips full check and recovers memory cache if cron_logs shows recent completion', async () => {
        const prepareMock = vi.fn();

        // Level 2 query returns a recent SKIP log
        prepareMock.mockImplementation((query: string) => {
            if (query.includes('FROM cron_logs ORDER BY timestamp DESC LIMIT 1')) {
                return {
                    first: vi.fn().mockResolvedValue({
                        status: 'SKIP',
                        details: `Cutoff: ${fixedCutoff}`,
                        timestamp: '2026-09-30 16:15:00'
                    })
                };
            }
            throw new Error(`Unexpected query: ${query}`);
        });

        const mockEnv = { DB: { prepare: prepareMock } } as any;
        const mockCtx = { waitUntil: vi.fn() } as any;
        const event = { cron: '*/1 * * * *', type: 'scheduled', scheduledTime: Date.now() } as any;

        // Run 1: Cold start -> hits Level 2 fast-path (only queries cron_logs LIMIT 1)
        await scheduled(event, mockEnv, mockCtx);

        expect(prepareMock).toHaveBeenCalledTimes(1);
        expect(prepareMock.mock.calls[0][0]).toContain('FROM cron_logs ORDER BY timestamp DESC LIMIT 1');
        expect(mockCtx.waitUntil).not.toHaveBeenCalled();

        // Run 2: Warm container -> hits Level 1 memory cache (0 DB queries)
        prepareMock.mockClear();
        await scheduled(event, mockEnv, mockCtx);

        expect(prepareMock).not.toHaveBeenCalled();
        expect(mockCtx.waitUntil).not.toHaveBeenCalled();
    });

    it('Level 1 Memory Guard: subsequent runs do 0 DB queries when already completed', async () => {
        const prepareMock = vi.fn();

        // First run: cold start, no SKIP in cron_logs, but Phase 1 discovers all fresh
        prepareMock.mockImplementation((query: string) => {
            if (query.includes('FROM cron_logs ORDER BY timestamp DESC LIMIT 1')) {
                return { first: vi.fn().mockResolvedValue(null) };
            }
            if (query.includes('FROM group_members')) {
                return { all: vi.fn().mockResolvedValue({ results: [{ symbol: 'AAPL' }] }) };
            }
            if (query.includes('FROM stock_stats WHERE updated_at > ?')) {
                return {
                    bind: vi.fn().mockReturnValue({
                        all: vi.fn().mockResolvedValue({ results: [{ symbol: 'AAPL' }, { symbol: 'SPY' }] })
                    })
                };
            }
            if (query.includes('FROM groups g')) {
                return {
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue({ count: 0 })
                    })
                };
            }
            if (query.includes('SELECT timestamp FROM cron_logs WHERE status IN')) {
                return { first: vi.fn().mockResolvedValue({ timestamp: '2026-09-30 16:20:00' }) };
            }
            throw new Error(`Unexpected query in test: ${query}`);
        });

        const mockEnv = { DB: { prepare: prepareMock } } as any;
        let backgroundPromise: Promise<void> | null = null;
        const mockCtx = {
            waitUntil: vi.fn((p) => { backgroundPromise = p; })
        } as any;
        const event = { cron: '*/1 * * * *', type: 'scheduled', scheduledTime: Date.now() } as any;

        // Run 1: Evaluates and marks fresh
        await scheduled(event, mockEnv, mockCtx);
        if (backgroundPromise) await backgroundPromise;

        // Run 2: Next minute trigger -> Level 1 in-memory guard must short-circuit with 0 DB queries!
        prepareMock.mockClear();
        const mockCtx2 = { waitUntil: vi.fn() } as any;
        await scheduled(event, mockEnv, mockCtx2);

        expect(prepareMock).not.toHaveBeenCalled();
        expect(mockCtx2.waitUntil).not.toHaveBeenCalled();
    });

    it('Cache Invalidation: invalidateCronCompletionCache forces full re-check', async () => {
        const prepareMock = vi.fn();

        prepareMock.mockImplementation((query: string) => {
            if (query.includes('FROM cron_logs ORDER BY timestamp DESC LIMIT 1')) {
                return {
                    first: vi.fn().mockResolvedValue({
                        status: 'SKIP',
                        details: `Cutoff: ${fixedCutoff}`,
                        timestamp: '2026-09-30 16:15:00'
                    })
                };
            }
            throw new Error(`Unexpected query: ${query}`);
        });

        const mockEnv = { DB: { prepare: prepareMock } } as any;
        const mockCtx = { waitUntil: vi.fn() } as any;
        const event = { cron: '*/1 * * * *', type: 'scheduled', scheduledTime: Date.now() } as any;

        // Run 1: sets memory cache
        await scheduled(event, mockEnv, mockCtx);
        expect(prepareMock).toHaveBeenCalledTimes(1);

        // Run 2: memory cache hit
        prepareMock.mockClear();
        await scheduled(event, mockEnv, mockCtx);
        expect(prepareMock).not.toHaveBeenCalled();

        // Invalidate cache
        invalidateCronCompletionCache();

        // Run 3: after invalidation, must re-check DB
        prepareMock.mockClear();
        await scheduled(event, mockEnv, mockCtx);
        expect(prepareMock).toHaveBeenCalledTimes(1);
    });

    it('Manual Trigger: bypasses completion cache entirely', async () => {
        const prepareMock = vi.fn();

        prepareMock.mockImplementation((query: string) => {
            if (query.includes('FROM group_members')) {
                return { all: vi.fn().mockResolvedValue({ results: [{ symbol: 'AAPL' }] }) };
            }
            if (query.includes('FROM stock_stats WHERE updated_at > ?')) {
                return {
                    bind: vi.fn().mockReturnValue({
                        all: vi.fn().mockResolvedValue({ results: [{ symbol: 'AAPL' }] })
                    })
                };
            }
            if (query.includes('FROM groups g')) {
                return {
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue({ count: 0 })
                    })
                };
            }
            if (query.includes('SELECT timestamp FROM cron_logs WHERE status IN')) {
                return { first: vi.fn().mockResolvedValue({ timestamp: '2026-09-30 16:20:00' }) };
            }
            return {
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null),
                    all: vi.fn().mockResolvedValue({ results: [] }),
                    run: vi.fn().mockResolvedValue({})
                }),
                all: vi.fn().mockResolvedValue({ results: [] }),
                run: vi.fn().mockResolvedValue({})
            };
        });

        const mockEnv = { DB: { prepare: prepareMock } } as any;
        const mockCtx = { waitUntil: vi.fn() } as any;

        // Manual trigger event
        const manualEvent = { cron: 'MANUAL', type: 'scheduled', scheduledTime: Date.now() } as any;
        await scheduled(manualEvent, mockEnv, mockCtx);

        // Should NOT call cron_logs LIMIT 1 fast-path, and SHOULD proceed to getTrackedSymbols
        expect(prepareMock).toHaveBeenCalled();
        const queries = prepareMock.mock.calls.map((c: any) => c[0]);
        expect(queries.some((q: string) => q.includes('FROM group_members'))).toBe(true);
    });
});
