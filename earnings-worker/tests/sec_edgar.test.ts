import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src/main';
import { getSuperinvestors, getPortfolio } from '../src/sec_edgar';
import { SUPERINVESTORS } from '../src/sec_data';

describe('SEC EDGAR 13F API Integration', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('returns the list of 83 Superinvestors from getSuperinvestors', async () => {
        const managers = await getSuperinvestors();
        expect(Array.isArray(managers)).toBe(true);
        expect(managers.length).toBe(SUPERINVESTORS.length);
        expect(managers.some(m => m.code === 'BRK' && m.name.includes('Warren Buffett'))).toBe(true);
        expect(managers.some(m => m.code === 'HC' && m.name.includes('Li Lu'))).toBe(true);
    });

    it('handles /api/superinvestors endpoint correctly', async () => {
        const request = new Request('http://example.com/api/superinvestors', {
            headers: {
                Cookie: 'auth_session=valid_session_token'
            }
        });
        const ctx = createExecutionContext();
        const env = { ALPHA_VANTAGE_KEY: 'test', DB: {} };

        const response = await worker.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const json = await response.json() as any[];
        expect(Array.isArray(json)).toBe(true);
        expect(json.length).toBe(SUPERINVESTORS.length);
    });

    it('fetches and parses real/mocked SEC 13F-HR filings into structured portfolio holdings', async () => {
        const mockSubmissions = {
            name: "BERKSHIRE HATHAWAY INC",
            filings: {
                recent: {
                    form: ["13F-HR", "10-Q"],
                    accessionNumber: ["0001193125-26-352200", "0001193125-26-100000"],
                    filingDate: ["2026-08-14", "2026-08-01"],
                    reportDate: ["2026-06-30", "2026-06-30"]
                }
            }
        };

        const mockDirectory = {
            directory: {
                item: [
                    { name: "0001193125-26-352200.txt" },
                    { name: "infotable.xml" },
                    { name: "primary_doc.xml" }
                ]
            }
        };

        const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
    <ns1:infoTable>
        <ns1:nameOfIssuer>APPLE INC</ns1:nameOfIssuer>
        <ns1:titleOfClass>COM</ns1:titleOfClass>
        <ns1:cusip>037833100</ns1:cusip>
        <ns1:value>23000000000</ns1:value>
        <ns1:shrsOrPrnAmt>
            <ns1:sshPrnamt>80000000</ns1:sshPrnamt>
            <ns1:sshPrnamtType>SH</ns1:sshPrnamtType>
        </ns1:shrsOrPrnAmt>
    </ns1:infoTable>
    <ns1:infoTable>
        <ns1:nameOfIssuer>AMERICAN EXPRESS CO</ns1:nameOfIssuer>
        <ns1:titleOfClass>COM</ns1:titleOfClass>
        <ns1:cusip>025816109</ns1:cusip>
        <ns1:value>50000000000</ns1:value>
        <ns1:shrsOrPrnAmt>
            <ns1:sshPrnamt>140000000</ns1:sshPrnamt>
            <ns1:sshPrnamtType>SH</ns1:sshPrnamtType>
        </ns1:shrsOrPrnAmt>
    </ns1:infoTable>
    <ns1:infoTable>
        <ns1:nameOfIssuer>ALPHABET INC</ns1:nameOfIssuer>
        <ns1:titleOfClass>CAP STK CL C</ns1:titleOfClass>
        <ns1:cusip>02079K107</ns1:cusip>
        <ns1:value>27000000000</ns1:value>
        <ns1:shrsOrPrnAmt>
            <ns1:sshPrnamt>70000000</ns1:sshPrnamt>
            <ns1:sshPrnamtType>SH</ns1:sshPrnamtType>
        </ns1:shrsOrPrnAmt>
    </ns1:infoTable>
</ns1:informationTable>`;

        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('data.sec.gov/submissions/')) {
                return Promise.resolve(new Response(JSON.stringify(mockSubmissions), { status: 200 }));
            }
            if (url.includes('/index.json')) {
                return Promise.resolve(new Response(JSON.stringify(mockDirectory), { status: 200 }));
            }
            if (url.endsWith('.xml')) {
                return Promise.resolve(new Response(mockXml, { status: 200 }));
            }
            return Promise.resolve(new Response('Not found', { status: 404 }));
        });

        const portfolio = await getPortfolio('BRK');
        expect(portfolio).toBeDefined();
        expect(portfolio.manager).toContain('Warren Buffett');
        expect(portfolio.date).toBe('2026-06-30');
        expect(portfolio.period).toBe('Q2 2026');
        expect(portfolio.holdings.length).toBe(3);

        // Top allocation should be AXP (50B / 100B = 50%)
        expect(portfolio.holdings[0].symbol).toBe('AXP');
        expect(portfolio.holdings[0].allocation).toBe(50);

        // Second should be GOOG (27B / 100B = 27%)
        expect(portfolio.holdings[1].symbol).toBe('GOOG');
        expect(portfolio.holdings[1].allocation).toBe(27);

        // Third should be AAPL (23B / 100B = 23%)
        expect(portfolio.holdings[2].symbol).toBe('AAPL');
        expect(portfolio.holdings[2].allocation).toBe(23);
    });

    it('formats imported portfolio name with @Period tag', async () => {
        const mockSubmissions = {
            name: "PERSHING SQUARE INC.",
            filings: {
                recent: {
                    form: ["13F-HR"],
                    accessionNumber: ["0001172661-26-003790"],
                    filingDate: ["2026-08-14"],
                    reportDate: ["2026-06-30"]
                }
            }
        };

        const mockDirectory = {
            directory: {
                item: [{ name: "infotable.xml" }]
            }
        };

        const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<informationTable>
    <infoTable>
        <nameOfIssuer>AMAZON COM INC</nameOfIssuer>
        <titleOfClass>COM</titleOfClass>
        <cusip>023135106</cusip>
        <value>2000000000</value>
        <sshPrnamt>8000000</sshPrnamt>
    </infoTable>
</informationTable>`;

        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('data.sec.gov/submissions/')) {
                return Promise.resolve(new Response(JSON.stringify(mockSubmissions), { status: 200 }));
            }
            if (url.includes('/index.json')) {
                return Promise.resolve(new Response(JSON.stringify(mockDirectory), { status: 200 }));
            }
            if (url.endsWith('.xml')) {
                return Promise.resolve(new Response(mockXml, { status: 200 }));
            }
            return Promise.resolve(new Response('Not found', { status: 404 }));
        });

        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    run: vi.fn().mockResolvedValue({ meta: { last_row_id: 101 } }),
                    all: vi.fn().mockResolvedValue({ results: [] }),
                    first: vi.fn().mockResolvedValue(null)
                }),
                run: vi.fn().mockResolvedValue({ meta: { last_row_id: 101 } }),
                all: vi.fn().mockResolvedValue({ results: [] }),
                first: vi.fn().mockResolvedValue(null)
            }),
            batch: vi.fn().mockResolvedValue([])
        };

        const request = new Request('http://example.com/api/import-superinvestor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: 'auth_session=valid_session_token'
            },
            body: JSON.stringify({ code: 'psc' })
        });
        const ctx = createExecutionContext();
        const env = { ALPHA_VANTAGE_KEY: 'test', DB: mockDb };

        const response = await worker.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const json = await response.json() as any;
        expect(json.name).toBe('Bill Ackman - Pershing Square Capital Management@Q2.2026');
    });

    it('searches superinvestors locally and via SEC EDGAR', async () => {
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('efts.sec.gov')) {
                return Promise.resolve(new Response(JSON.stringify({
                    hits: {
                        total: { value: 1 },
                        hits: [{ _source: { ciks: ['0002045724'] } }]
                    }
                }), { status: 200 }));
            }
            if (url.includes('data.sec.gov/submissions/')) {
                return Promise.resolve(new Response(JSON.stringify({
                    name: 'Situational Awareness LP',
                    filings: { recent: { form: ['13F-HR'] } }
                }), { status: 200 }));
            }
            return Promise.resolve(new Response('Not found', { status: 404 }));
        });

        const { searchSuperinvestors } = await import('../src/sec_edgar');
        
        // 1. Search local list for Druckenmiller
        const localRes = await searchSuperinvestors('Druckenmiller');
        expect(localRes.length).toBeGreaterThanOrEqual(1);
        expect(localRes.some(r => r.name.includes('Duquesne'))).toBe(true);

        // 2. Search local list for Aschenbrenner
        const aschRes = await searchSuperinvestors('Aschenbrenner');
        expect(aschRes.length).toBeGreaterThanOrEqual(1);
        expect(aschRes.some(r => r.name.includes('Situational Awareness'))).toBe(true);

        // 3. Search SEC EDGAR
        const secRes = await searchSuperinvestors('Situational Awareness');
        expect(secRes.length).toBeGreaterThanOrEqual(1);
        expect(secRes.some(r => r.name.includes('Situational Awareness'))).toBe(true);
    });
});
