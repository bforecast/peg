import { Superinvestor, Portfolio, PortfolioHolding } from './types';
import { SUPERINVESTORS, CUSIP_MAP } from './sec_data';

const SEC_USER_AGENT = 'ForwardPegSystem admin@bforecast.com';

let _companyTickersCache: { exactMap: Map<string, string>; strippedMap: Map<string, string> } | null = null;
let _companyTickersPromise: Promise<typeof _companyTickersCache> | null = null;

function decodeHtml(html: string): string {
    return html
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

async function getCompanyTickersMap() {
    if (_companyTickersCache) return _companyTickersCache;
    if (_companyTickersPromise) return _companyTickersPromise;

    _companyTickersPromise = (async () => {
        try {
            const res = await fetchWithTimeout('https://www.sec.gov/files/company_tickers.json', {
                headers: { 'User-Agent': SEC_USER_AGENT }
            }, 6000);
            if (!res.ok) return null;
            const data = await res.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
            const exactMap = new Map<string, string>();
            const strippedMap = new Map<string, string>();

            for (const item of Object.values(data)) {
                if (!item.title || !item.ticker) continue;
                const norm = item.title.toUpperCase().replace(/[^A-Z0-9]/g, '');
                exactMap.set(norm, item.ticker);

                const stripped = norm.replace(/(INC|CORP|CORPORATION|CO|COMPANY|PLC|LTD|LIMITED|HOLDINGS|HOLDING|HLDGS|HLDG|DEL|NEW|GROUP|LLC|LP|SA|NV|SPONSORED|SPON|ADS|ADR|CLASS|CL)$/g, '');
                if (stripped.length >= 3) {
                    strippedMap.set(stripped, item.ticker);
                }
            }

            _companyTickersCache = { exactMap, strippedMap };
            return _companyTickersCache;
        } catch (e) {
            console.warn('Could not load SEC company_tickers.json:', e);
            return null;
        } finally {
            _companyTickersPromise = null;
        }
    })();

    return _companyTickersPromise;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

export async function getSuperinvestors(): Promise<Superinvestor[]> {
    return SUPERINVESTORS.map(m => ({
        code: m.code,
        name: m.name
    }));
}

export async function searchSuperinvestors(query: string): Promise<Superinvestor[]> {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
        return getSuperinvestors();
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    // 1. Multi-token local search from predefined list
    const localMatches = SUPERINVESTORS.filter(m => {
        const text = `${m.name} ${m.code} ${m.cik}`.toLowerCase();
        return tokens.every(t => text.includes(t));
    }).map(m => ({
        code: m.code,
        name: m.name
    }));

    // 2. Search SEC EDGAR (active institutions with recent 13F filings)
    const secManagers: Superinvestor[] = [];
    const seenCiks = new Set(SUPERINVESTORS.map(m => m.cik.replace(/^0+/, '')));

    try {
        const eftsUrl = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}`;
        const eRes = await fetchWithTimeout(eftsUrl, {
            headers: { 'User-Agent': SEC_USER_AGENT }
        }, 5000);

        if (eRes.ok) {
            const eData = await eRes.json() as any;
            const hits = eData.hits?.hits || [];
            const candidateCiks: string[] = [];

            for (const h of hits) {
                const ciks = h._source?.ciks || [];
                for (const c of ciks) {
                    const rawCik = String(c).replace(/^0+/, '');
                    if (rawCik && !seenCiks.has(rawCik)) {
                        seenCiks.add(rawCik);
                        candidateCiks.push(rawCik.padStart(10, '0'));
                    }
                }
            }

            // Check candidate CIKs for recent active 13F filings
            for (const cik of candidateCiks.slice(0, 8)) {
                try {
                    const subUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
                    const subRes = await fetchWithTimeout(subUrl, {
                        headers: { 'User-Agent': SEC_USER_AGENT, 'Accept': 'application/json' }
                    }, 4000);
                    if (subRes.ok) {
                        const subData = await subRes.json() as any;
                        const recentForms = subData.filings?.recent?.form || [];
                        const recentDates = subData.filings?.recent?.filingDate || [];
                        const idx = recentForms.findIndex((f: string) => f.startsWith('13F'));
                        if (idx !== -1) {
                            const filingDate = recentDates[idx];
                            // Only include if filed recently (>= 2020) so modern 13F XML exists
                            if (filingDate && filingDate >= '2020-01-01') {
                                secManagers.push({
                                    code: cik,
                                    name: `[SEC 13F] ${subData.name} (${filingDate})`
                                });
                            }
                        }
                    }
                } catch (e) {}
            }
        }
    } catch (e) {
        console.warn('SEC search error:', e);
    }

    return [...localMatches, ...secManagers];
}

async function fetch13FInternal(cik: string, managerName: string, depth = 0): Promise<Portfolio> {
    if (depth > 2) {
        throw new Error(`Too many 13F-NT redirects for ${managerName}`);
    }

    const paddedCik = cik.replace(/\D/g, '').padStart(10, '0');
    const cikInt = parseInt(paddedCik, 10).toString();

    // 1. Fetch Submissions from SEC EDGAR API
    const subUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
    const res = await fetchWithTimeout(subUrl, {
        headers: {
            'User-Agent': SEC_USER_AGENT,
            'Accept': 'application/json'
        }
    }, 8000);

    if (!res.ok) {
        throw new Error(`SEC EDGAR Submissions API returned status ${res.status} for ${managerName}`);
    }

    const subData = await res.json() as any;
    const recent = subData.filings?.recent;
    if (!recent || !recent.form || recent.form.length === 0) {
        throw new Error(`No filings found in SEC EDGAR for ${managerName}`);
    }

    // 2. Check for 13F-HR vs 13F-NT (Notice report)
    let hrIdx = -1;
    let ntIdx = -1;
    for (let i = 0; i < recent.form.length; i++) {
        const form = recent.form[i];
        if (hrIdx === -1 && (form === '13F-HR' || form === '13F-HR/A')) hrIdx = i;
        if (ntIdx === -1 && (form === '13F-NT' || form === '13F-NT/A')) ntIdx = i;
    }

    // If 13F-NT is newer than 13F-HR, follow notice to target reporting manager CIK
    if (ntIdx !== -1 && (hrIdx === -1 || ntIdx < hrIdx)) {
        const ntAcc = recent.accessionNumber[ntIdx].replace(/-/g, '');
        const primaryDocUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${ntAcc}/primary_doc.xml`;
        try {
            const ntRes = await fetchWithTimeout(primaryDocUrl, {
                headers: { 'User-Agent': SEC_USER_AGENT }
            }, 6000);
            if (ntRes.ok) {
                const ntXml = await ntRes.text();
                const matchCik = /<otherManager>[\s\S]*?<cik>([^<]+)<\/cik>/i.exec(ntXml);
                if (matchCik && matchCik[1]) {
                    const targetCik = matchCik[1].trim();
                    console.log(`13F-NT for ${managerName} references reporting CIK ${targetCik}. Following...`);
                    const resolved = await fetch13FInternal(targetCik, managerName, depth + 1);
                    return {
                        ...resolved,
                        manager: managerName
                    };
                }
            }
        } catch (e) {
            console.warn(`Could not resolve 13F-NT for ${managerName}:`, e);
        }
    }

    if (hrIdx === -1) {
        throw new Error(`No 13F filing found in SEC records for ${managerName}`);
    }

    const accessionNumber = recent.accessionNumber[hrIdx];
    const filingDate = recent.filingDate[hrIdx];
    const reportDate = recent.reportDate ? recent.reportDate[hrIdx] : filingDate;
    const accessionNoDash = accessionNumber.replace(/-/g, '');

    if (filingDate && filingDate < '2013-06-01') {
        throw new Error(`The latest 13F report for ${managerName} was filed on ${filingDate}. SEC EDGAR only supports XML format for 13F filings submitted after 2013.`);
    }

    // Determine quarter period e.g. Q2 2026
    let period = '';
    if (reportDate && reportDate.includes('-')) {
        const parts = reportDate.split('-');
        const repMonth = parseInt(parts[1], 10);
        const repYear = parts[0];
        const qNum = Math.ceil(repMonth / 3);
        period = `Q${qNum} ${repYear}`;
    }

    // 3. Find infotable XML in filing directory
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accessionNoDash}/index.json`;
    let xmlFileName = 'infotable.xml';

    try {
        const indexRes = await fetchWithTimeout(indexUrl, {
            headers: { 'User-Agent': SEC_USER_AGENT }
        }, 5000);

        if (indexRes.ok) {
            const indexData = await indexRes.json() as any;
            const items = indexData.directory?.item;
            if (Array.isArray(items)) {
                const infoXml = items.find((it: any) => {
                    const n = String(it.name || '').toLowerCase();
                    return (n.includes('infotable') && n.endsWith('.xml')) ||
                           (n.endsWith('.xml') && !n.includes('primary') && !n.includes('filing') && !n.includes('header'));
                });
                if (infoXml) xmlFileName = infoXml.name;
            }
        }
    } catch (e) {
        console.warn(`Could not read SEC directory index for ${accessionNumber}, defaulting to infotable.xml`, e);
    }

    // 4. Fetch the 13F XML Table and tickers map concurrently
    const [xmlRes, tickersMap] = await Promise.all([
        fetchWithTimeout(`https://www.sec.gov/Archives/edgar/data/${cikInt}/${accessionNoDash}/${xmlFileName}`, {
            headers: { 'User-Agent': SEC_USER_AGENT }
        }, 10000),
        getCompanyTickersMap()
    ]);

    if (!xmlRes.ok) {
        throw new Error(`Failed to download SEC 13F XML for ${managerName} (Filing: ${filingDate}): status ${xmlRes.status}`);
    }

    const xml = await xmlRes.text();

    // 5. Parse 13F Holdings XML (Namespace-agnostic)
    const infoTableRegex = /<(?:\w+:)?infoTable[\s\S]*?<\/(?:\w+:)?infoTable>/gi;
    const rawHoldings: { symbol: string; name: string; value: number; shares: number }[] = [];
    let totalVal = 0;
    let match;

    while ((match = infoTableRegex.exec(xml)) !== null) {
        const block = match[0];
        const issuer = (/<(?:\w+:)?nameOfIssuer>([^<]+)/i.exec(block) || [])[1] || '';
        const titleClass = (/<(?:\w+:)?titleOfClass>([^<]+)/i.exec(block) || [])[1] || '';
        const cusip = (/<(?:\w+:)?cusip>([^<]+)/i.exec(block) || [])[1] || '';
        const value = parseFloat((/<(?:\w+:)?value>([^<]+)/i.exec(block) || [])[1] || '0');
        const shares = parseFloat((/<(?:\w+:)?sshPrnamt>([^<]+)/i.exec(block) || [])[1] || '0');

        let cleanCusip = cusip.trim().toUpperCase();
        let symbol = CUSIP_MAP[cleanCusip] || '';

        if (!symbol) {
            const cleanIssuer = decodeHtml(issuer).trim();
            const normIssuer = cleanIssuer.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const strippedIssuer = normIssuer.replace(/(INC|CORP|CORPORATION|CO|COMPANY|PLC|LTD|LIMITED|HOLDINGS|HOLDING|HLDGS|HLDG|DEL|NEW|GROUP|LLC|LP|SA|NV|SPONSORED|SPON|ADS|ADR|CLASS|CL)$/g, '');
            const upperClass = titleClass.toUpperCase();

            if (normIssuer.includes('ALPHABET') || normIssuer.includes('GOOGLE')) {
                symbol = upperClass.includes('CL C') ? 'GOOG' : 'GOOGL';
            } else if (normIssuer.includes('BERKSHIRE')) {
                symbol = upperClass.includes('CL A') ? 'BRK-A' : 'BRK-B';
            } else if (normIssuer.includes('FOX') && upperClass.includes('CL B')) {
                symbol = 'FOX';
            } else if (normIssuer.includes('FOX') && upperClass.includes('CL A')) {
                symbol = 'FOXA';
            } else if (tickersMap) {
                symbol = tickersMap.exactMap.get(normIssuer) || tickersMap.strippedMap.get(strippedIssuer) || '';
            }

            if (!symbol) {
                symbol = cleanCusip || cleanIssuer.split(/\s+/)[0].toUpperCase();
            }
        }

        totalVal += value;
        rawHoldings.push({
            symbol,
            name: decodeHtml(issuer).trim(),
            value,
            shares
        });
    }

    if (rawHoldings.length === 0) {
        throw new Error(`Parsed 0 holdings from SEC 13F filing for ${managerName}`);
    }

    // 6. Aggregate positions by symbol & compute allocations
    const aggregatedMap = new Map<string, { symbol: string; name: string; value: number; shares: number }>();
    for (const h of rawHoldings) {
        if (aggregatedMap.has(h.symbol)) {
            const existing = aggregatedMap.get(h.symbol)!;
            existing.value += h.value;
            existing.shares += h.shares;
        } else {
            aggregatedMap.set(h.symbol, { ...h });
        }
    }

    const holdings: PortfolioHolding[] = Array.from(aggregatedMap.values()).map(h => ({
        symbol: h.symbol,
        name: h.name,
        allocation: totalVal > 0 ? parseFloat(((h.value / totalVal) * 100).toFixed(2)) : 0
    }));

    // Sort by largest allocation first
    holdings.sort((a, b) => b.allocation - a.allocation);

    return {
        manager: (managerName && managerName !== cik) ? managerName : (subData.name || managerName),
        cik: paddedCik,
        date: reportDate,
        period,
        value: `$${Math.round(totalVal).toLocaleString()}`,
        holdings
    };
}

export async function getPortfolio(code: string): Promise<Portfolio> {
    const cleanCode = code.trim();
    const target = SUPERINVESTORS.find(
        m => m.code.toLowerCase() === cleanCode.toLowerCase() || 
             m.cik === cleanCode || 
             m.cik.replace(/^0+/, '') === cleanCode.replace(/^0+/, '')
    );

    const cik = target ? target.cik : cleanCode;
    const managerName = target ? target.name : cleanCode;

    return fetch13FInternal(cik, managerName);
}
