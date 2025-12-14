
export interface Superinvestor {
    name: string;
    code: string;
}

export interface PortfolioHolding {
    symbol: string;
    name: string;
    allocation: number;
}

export interface Portfolio {
    manager: string;
    date: string;
    period: string;
    value: string;
    holdings: PortfolioHolding[];
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function getSuperinvestors(): Promise<Superinvestor[]> {
    const url = 'https://www.dataroma.com/m/managers.php';
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Failed to fetch managers: ${res.status}`);
    const html = await res.text();

    const result: Superinvestor[] = [];
    // Regex to find links like <a href="/m/holdings.php?m=AKO" >AKO Capital</a>
    // We look for td class="man" to restrict search
    const regex = /<td class="man"><a href="\/m\/holdings\.php\?m=([^"]+)"\s*>([^<]+)<\/a>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        result.push({
            code: match[1],
            name: match[2].trim()
        });
    }

    return result;
}

export async function getPortfolio(code: string): Promise<Portfolio> {
    const url = `https://www.dataroma.com/m/holdings.php?m=${code}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Failed to fetch portfolio: ${res.status}`);
    const html = await res.text();

    // 1. Manager Name
    const nameMatch = /<div id="f_name">([^<]+)<\/div>/.exec(html);
    const manager = nameMatch ? nameMatch[1].trim() : code;

    // 2. Period, Date, Value
    // <p id="p2">Period: <span>Q3 2025</span><br/>\nPortfolio date: <span>30 Sep 2025</span><br/>\n...Portfolio value: <span>$14,643,294,000</span></p>
    const periodMatch = /Period: <span>([^<]+)<\/span>/.exec(html);
    const dateMatch = /Portfolio date: <span>([^<]+)<\/span>/.exec(html);
    const valueMatch = /Portfolio value: <span>([^<]+)<\/span>/.exec(html);

    const period = periodMatch ? periodMatch[1] : '';
    const date = dateMatch ? dateMatch[1] : '';
    const value = valueMatch ? valueMatch[1] : '';

    // 3. Holdings
    // Row: <td class="stock"><a href="/m/stock.php?sym=UBER">UBER<span> - Uber Technologies Inc.</span></a></td>
    // Allocation: <td>20.25</td> (This is the td after stock td)

    // We can't rely on simple regex for table rows easily because of nesting and newlines.
    // However, the structure is fairly rigid:
    // <td class="stock"><a href="/m/stock.php?sym=SYMBOL">...</a></td>\s*<td>ALLOCATION</td>

    const holdings: PortfolioHolding[] = [];

    // Improved regex approach for holdings
    // Match the stock cell and the next cell (allocation)
    // <td class="stock"><a href="/m/stock.php\?sym=([^"]+)">.*?<\/a><\/td>\s*<td>([0-9.]+)<\/td>
    // Note: The HTML might have newlines or other attributes.
    // Let's iterate through the table body if possible, or use a robust regex.

    // Based on inspection:
    // <td class="stock"><a href="/m/stock.php?sym=UBER">UBER<span> - Uber Technologies Inc.</span></a></td>
    // <td>20.25</td>

    const stockRegex = /<td class="stock"><a href="\/m\/stock\.php\?sym=([^"]+)">([^<]+)(?:<span>\s*-\s*([^<]+)<\/span>)?<\/a><\/td>\s*<td>([0-9.]+)<\/td>/g;

    // Since JS regex doesn't support dotAll (s flag) widely in older envs, we use [\s\S] or just rely on structure.
    // The previous inspection showed newlines. So we need to handle whitespace.
    // Simplified regex:
    // val 1: SYMBOL
    // val 3: Name (in span) - Optional
    // val 4: Allocation

    // Let's construct a regex that handles the multiline nature roughly
    const rowRegex = /href="\/m\/stock\.php\?sym=([^"]+)">.*?(?:<span>\s*-\s*([^<]+)<\/span>)?<\/a><\/td>\s*<td>([0-9.]+)<\/td>/g;

    // Wait, the `td` close and open tags are important anchors.
    // <td class="stock"> ... </a></td> ... <td>ALLOC</td>

    // Let's look at the sample again:
    // <td class="stock"><a href="/m/stock.php?sym=UBER">UBER<span> - Uber Technologies Inc.</span></a></td>
    // <td>20.25</td>

    // We will just match the stock link and the number in the next td.
    // Regex: <a href="/m/stock\.php\?sym=([^"]+)">(?:[^<]*)<span>\s*-\s*([^<]*)<\/span><\/a><\/td>\s*<td>([0-9.]+)<\/td>

    // Testing with the specific string from inspection:
    // <a href="/m/stock.php?sym=UBER">UBER<span> - Uber Technologies Inc.</span></a></td>
    // <td>20.25</td>

    // Refined Regex:
    // sym=([A-Z0-9.-]+)"[^>]*>.*?<span>\s*-\s*([^<]+)<\/span><\/a><\/td>\s*<td>([0-9.]+)<\/td>

    const holdingRegex = /sym=([A-Z0-9.-]+)"[^>]*>.*?<span>\s*-\s*([^<]+)<\/span><\/a><\/td>\s*<td>([0-9.]+)<\/td>/g;

    // Note: The HTML inspection output showed newlines:
    // <td class="stock"><a href="/m/stock.php?sym=UBER">UBER<span> - Uber Technologies Inc.</span></a></td>
    // <td>20.25</td>

    // Using [\s\S]*? is dangerous if greedy, but non-greedy .*? usually stops at newlines in . mode, 
    // but in JS . doesn't match newline. So `[\s\S]*?` or `[^]*?` is needed if newlines are inside.
    // BUT the stock cell seems to be on one line or close. The separation between </td> and <td> might have newlines.

    const complexRegex = /sym=([A-Z0-9.-]+)"[^>]*>.*?<span>\s*-\s*([^<]+)<\/span><\/a><\/td>\s*<td>([0-9.]+)<\/td>/s;
    // 's' flag fits recent JS. If TS target is older, might fail.
    // Let's stick to standard `[\s\S]` for safety if I don't know the exact tsconfig target.
    // Actually, `s` flag is ES2018. Cloudflare Workers supports it.

    // Global regex to loop
    // Note: matching strict "sym=" ensures we don't pick up garbage.
    const loopRegex = /href="\/m\/stock\.php\?sym=([^"]+)"[^>]*>.*?<span>\s*-\s*([^<]+)<\/span><\/a><\/td>\s*<td>([0-9.]+)<\/td>/gs;

    let hMatch;
    while ((hMatch = loopRegex.exec(html)) !== null) {
        let symbol = hMatch[1];
        // Normalize: DataRoma uses '.' (BRK.B), Yahoo uses '-' (BRK-B)
        symbol = symbol.replace(/\./g, '-');

        holdings.push({
            symbol: symbol,
            name: hMatch[2].trim(),
            allocation: parseFloat(hMatch[3])
        });
    }

    return {
        manager,
        date,
        period,
        value,
        holdings
    };
}
