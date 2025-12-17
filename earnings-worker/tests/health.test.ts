import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import worker from '../src/main';

describe('Health Check', () => {
    it('returns healthy status', async () => {
        const request = new Request('http://example.com/api/health');
        const ctx = createExecutionContext();

        // Mock the Environment
        const env = {
            ALPHA_VANTAGE_KEY: 'test-key',
            DB: {
                prepare: vi.fn(() => ({
                    first: vi.fn().mockResolvedValue({ val: 1, timestamp: '2024-01-01' }),
                    all: vi.fn().mockResolvedValue({ results: [] })
                }))
            }
        };

        const response = await worker.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.status).toBe('healthy');
        expect(json.checks.db).toBe('ok');
        expect(json.checks.env.ALPHA_VANTAGE).toBe('set');
    });
});
