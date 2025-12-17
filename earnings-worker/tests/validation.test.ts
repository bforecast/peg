import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import worker from '../src/main';

// Mock the Yahoo Finance module
vi.mock('../src/yahoo_finance', () => {
    return {
        fetchQuotes: vi.fn(),
    };
});

import { fetchQuotes } from '../src/yahoo_finance';

describe('Validation Endpoint', () => {
    it('validates a correct symbol', async () => {
        // Setup Mock
        (fetchQuotes as any).mockResolvedValue([
            { symbol: 'MSFT', shortName: 'Microsoft Corp', price: 100 }
        ]);

        const request = new Request('http://example.com/api/validate/MSFT');
        const ctx = createExecutionContext();

        // Minimal env mock
        const env = { ALPHA_VANTAGE_KEY: 'test', DB: {} };

        const response = await worker.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.valid).toBe(true);
        expect(json.symbol).toBe('MSFT');
    });

    it('rejects an invalid symbol', async () => {
        // Setup Mock to return empty/null
        (fetchQuotes as any).mockResolvedValue([]);

        const request = new Request('http://example.com/api/validate/INVALID');
        const ctx = createExecutionContext();
        const env = { ALPHA_VANTAGE_KEY: 'test', DB: {} };

        const response = await worker.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.valid).toBe(false);
    });
});
