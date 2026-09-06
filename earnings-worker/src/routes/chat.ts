import { Hono } from 'hono';
import { Bindings } from '../types';
import { generateNvidiaResponse } from '../ai/nvidia';
import { generateCloudflareAIResponse } from '../ai/cloudflare';
import { getLatestQuotes, regenerateStats } from '../db';

const chatRoutes = new Hono<{ Bindings: Bindings }>();

const SYSTEM_PROMPT = `
You are the "Investment AI expert", a specialized assistant for the Forward Peg System used by bforecast.
You act as three experts rolled into one:
1. Investment Expert: Analyzes portfolio allocations, diversification, and risks.
2. Value Investing Expert: Evaluates valuations using PEG, Forward PE, and Earnings Growth.
   - Ideal PEG is around 1.0. < 1.5 is potentially undervalued. > 2.5 is expensive unless growth is massive.
   - Loves consistent earnings growth.
3. Technical Analyst: Looks at Price vs SMA (20/50/200) and RS Rank.
   - RS Rank (1-99) above 80 is Strong.
   - Price > 20SMA > 50SMA is a strong uptrend.

Context Handling:
- The user might supply a "Context" like a specific Stock Symbol or Portfolio Name.
- Use the provided data to evaluate metrics. DO NOT Hallucinate prices.
- If the user asks about a stock, ALWAYS consider its valuation and technical data first.

Language & Tone:
- ALWAYS respond in Simplified Chinese (简体中文) by default with professional financial terminology, unless the user explicitly requests another language.
- Tone: Professional, Insightful, yet Concise. Use markdown tables and lists for clear formatting.
`;

chatRoutes.post('/api/chat', async (c) => {
    try {
        const body = await c.req.json();
        let { message, context, history, model, lang } = body;

        // Default to Cloudflare Workers AI Gemma-4-26B if not specified
        const selectedModel = (model === 'nemotron-3-super-120b-a12b' || model === 'nemotron')
            ? 'nemotron-3-super-120b-a12b'
            : '@cf/google/gemma-4-26b-a4b-it';

        console.log(`[Chat] Selected model: ${selectedModel} (received: ${model}, lang: ${lang})`);

        // Prepare message with context
        let fullMessage = message;
        if (context) {
            console.log('[NVIDIA Chat] Incoming Context:', JSON.stringify(context, null, 2));
            let contextStr = '';
            if (typeof context === 'string') {
                contextStr = context;
            } else if (context.portfolioName) {
                contextStr = `Portfolio: ${context.portfolioName}`;
            } else {
                contextStr = JSON.stringify(context);
            }
            fullMessage = `[Context: ${contextStr}] ${message}`;
        } else {
            console.log('[NVIDIA Chat] No Context provided');
        }

        // Parse @mentions to fetch local portfolio data
        const mentionRegex = /@(?:'([^']+)'|"([^"]+)"|([\p{L}\p{N}\s&'_\-]+?)(?=\s*(?:[@?:!.,]|$)|(?<=\s)[a-z]))/gu;
        const mentions: string[] = [];
        let match;
        while ((match = mentionRegex.exec(message)) !== null) {
            const name = (match[1] || match[2] || match[3]).trim();
            if (name.length > 0) {
                mentions.push(name);
            }
        }

        // Also check context for portfolio name (from holdings page)
        if (context && typeof context === 'object' && context.portfolioName) {
            if (!mentions.includes(context.portfolioName)) {
                mentions.push(context.portfolioName);
            }
        }

        // Detect "all portfolios" queries - explicitly include "analyze this"
        const allPortfoliosRegex = /\b(all|every|compare\s+all)\s+(portfolios?|groups?)|analyze\s+this|valuation\s+check|technical\s+trend/i;
        const wantsAllPortfolios = allPortfoliosRegex.test(message);

        // Check if user mentioned a specific stock symbol (e.g., @NVDA, @AAPL)
        const stockSymbolMatch = message.match(/@([A-Za-z]{1,5})\b/);
        let targetSymbol: string | null = null;
        if (stockSymbolMatch) {
            targetSymbol = stockSymbolMatch[1].toUpperCase();
            console.log('[NVIDIA Chat] User mentioned stock symbol:', targetSymbol);
        }

        console.log('[NVIDIA Chat] Parsed mentions:', mentions, 'all:', wantsAllPortfolios, 'targetSymbol:', targetSymbol);

        let localDataContext = '';

        // Handle Translation requests
        const isTranslationToEnglish = /translate.*(?:into|to)?\s*english|翻译.*(?:成|为)?\s*(?:英文|英语)/i.test(message);
        const isTranslationToChinese = /translate.*(?:into|to)?\s*(?:simplified\s+chinese|chinese|zh)|翻译.*(?:成|为)?\s*(?:中文|简体中文)/i.test(message);
        const isTranslationRequest = isTranslationToEnglish || isTranslationToChinese || /translate.*previous|翻译|translation/i.test(message);
        let enhancedMessage = message;

        if (isTranslationRequest) {
            console.log('[Chat] Translation request detected.');
            localDataContext = ''; // No context for translation
            if (history && Array.isArray(history)) {
                const reversedHistory = [...history].reverse();
                // Match standard assistant roles
                const lastAssistantMsg = reversedHistory.find(h => h.role === 'model' || h.role === 'assistant' || h.role === 'bot');
                if (lastAssistantMsg && lastAssistantMsg.content) {
                    const targetLang = isTranslationToEnglish ? 'English' : 'Simplified Chinese';
                    console.log(`[Chat] Injecting ${lastAssistantMsg.content.length} chars for translation to ${targetLang}`);
                    enhancedMessage = `Please translate the following text into ${targetLang}. Do NOT search the web or provide new analysis -- strictly translate the text:\n\n"""\n${lastAssistantMsg.content}\n"""`;
                } else {
                    console.log('[Chat] WARNING: No assistant message found for translation.');
                    enhancedMessage = message + `\n\n[System Note: The user requested translation of the previous response, but the server implementation could not locate a previous assistant message in the history.]`;
                }
            }
        } else {
            enhancedMessage = message;
        }

        // Fetch Local Context
        const symbolToAnalyze = isTranslationRequest ? null : (targetSymbol || (context && context.symbol ? context.symbol.toUpperCase() : null));

        if (symbolToAnalyze) {
            const stockContext = await fetchStockContext(c, c.env.DB, symbolToAnalyze);
            if (stockContext) {
                localDataContext += stockContext;
            }
        } else if (wantsAllPortfolios) {
            try {
                const db = c.env.DB;
                const allGroups = await db.prepare(
                    `SELECT g.id, g.name,
                            ps.cagr, ps.sharpe, ps.sortino, ps.max_drawdown
                     FROM groups g
                     LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                     ORDER BY ps.sharpe DESC`
                ).all();

                if (allGroups.results && allGroups.results.length > 0) {
                    localDataContext += `\n\n### All Portfolios Comparison\n`;
                    localDataContext += `| Portfolio | CAGR | Sharpe | Sortino | Max DD |\n`;
                    localDataContext += `|-----------|------|--------|---------|--------|\n`;
                    for (const g of allGroups.results as any[]) {
                        localDataContext += `| ${g.name} | ${g.cagr?.toFixed(1) || 'N/A'}% | ${g.sharpe?.toFixed(2) || 'N/A'} | ${g.sortino?.toFixed(2) || 'N/A'} | ${g.max_drawdown?.toFixed(1) || 'N/A'}% |\n`;
                    }
                }
            } catch (dbError) {
                console.error('Error fetching all portfolios:', dbError);
            }
        } else if (mentions.length > 0 || (context && context.portfolioId)) {
            try {
                const db = c.env.DB;
                const portfoliosToFetch: { type: 'id' | 'name', value: string | number }[] = [];

                if (context && context.portfolioId) {
                    portfoliosToFetch.push({ type: 'id', value: context.portfolioId });
                }

                for (const m of mentions) {
                    if (context && context.portfolioName && m === context.portfolioName) continue;
                    portfoliosToFetch.push({ type: 'name', value: m });
                }

                for (const target of portfoliosToFetch) {
                    let group: any;
                    if (target.type === 'id') {
                        group = await db.prepare(
                            `SELECT g.id, g.name, g.description,
                                    ps.cagr, ps.std_dev, ps.max_drawdown, ps.sharpe, ps.sortino, ps.correlation_spy
                             FROM groups g
                             LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                             WHERE g.id = ?`
                        ).bind(target.value).first();
                    } else {
                        group = await db.prepare(
                            `SELECT g.id, g.name, g.description,
                                    ps.cagr, ps.std_dev, ps.max_drawdown, ps.sharpe, ps.sortino, ps.correlation_spy
                             FROM groups g
                             LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                             WHERE LOWER(g.name) LIKE LOWER(?)`
                        ).bind(`%${target.value}%`).first();
                    }

                    if (group) {
                        const memberSymbols = await db.prepare(
                            `SELECT symbol FROM group_members WHERE group_id = ?`
                        ).bind(group.id).all();

                        if (memberSymbols.results && memberSymbols.results.length > 0) {
                            const symbols = memberSymbols.results.map((r: any) => r.symbol);
                            await getLatestQuotes(c.env, symbols);
                            for (const s of symbols) {
                                await regenerateStats(c.env, s);
                            }
                        }

                        const formattedContext = await fetchPortfolioContext(c.env.DB, group.id, group.name);
                        if (formattedContext) {
                            localDataContext += formattedContext;
                        } else {
                            localDataContext += `\n(No holdings data available)\n`;
                        }
                    }
                }
            } catch (dbError) {
                console.error('Error fetching portfolio data:', dbError);
            }
        }

        // Merge user query and system data context
        if (!isTranslationRequest) {
            enhancedMessage = fullMessage;
        }
        if (localDataContext) {
            console.log('[NVIDIA Chat] Injecting Local Context (Length: ' + localDataContext.length + ')');
            enhancedMessage = `${fullMessage}\n\n--- LOCAL PORTFOLIO DATA FROM DATABASE ---${localDataContext}\n--- END OF LOCAL DATA ---\n\nUse the above local data to answer the question.`;
        }

        // Determine active response language
        let activeLang = lang || 'zh';
        if (isTranslationToEnglish) activeLang = 'en';
        if (isTranslationToChinese) activeLang = 'zh';

        const langRule = (activeLang === 'en')
            ? 'Language Rule: You MUST respond in English with professional financial terminology. Do not use Chinese.'
            : 'Language Rule: You MUST respond in Simplified Chinese (简体中文) with professional financial terminology.';

        const dynamicSystemPrompt = `${SYSTEM_PROMPT}\n\n[Active Language Requirement]\n${langRule}`;

        // Construct standard message array
        const nvidiaMessages: { role: 'system' | 'user' | 'assistant', content: string }[] = [
            { role: 'system', content: dynamicSystemPrompt }
        ];

        // Format history
        if (history && Array.isArray(history)) {
            const recentHistory = history.slice(-6); // Limit to last 6 turns to keep context clean
            let lastRole = 'system';
            let hasFirstUser = false;
            for (const h of recentHistory) {
                if (h.role && h.content) {
                    const currentRole = h.role === 'user' ? 'user' : 'assistant';
                    if (!hasFirstUser && currentRole === 'assistant') continue;
                    if (currentRole === 'user') hasFirstUser = true;
                    if (currentRole === lastRole) continue;
                    nvidiaMessages.push({
                        role: currentRole,
                        content: h.content
                    });
                    lastRole = currentRole;
                }
            }
            if (nvidiaMessages.length > 1 && nvidiaMessages[nvidiaMessages.length - 1].role === 'user') {
                nvidiaMessages.pop();
            }
        }

        // Add current message
        nvidiaMessages.push({ role: 'user', content: enhancedMessage });

        let result = '';
        if (selectedModel.startsWith('@cf/')) {
            result = await generateCloudflareAIResponse(c.env.AI, selectedModel, nvidiaMessages);
        } else {
            if (!c.env.NVIDIA_API_KEY) {
                return c.json({ error: 'NVIDIA_API_KEY is not configured on the Cloudflare Workers backend. Please set it using `wrangler secret put NVIDIA_API_KEY`.' }, 500);
            }
            result = await generateNvidiaResponse(c.env.NVIDIA_API_KEY, selectedModel, nvidiaMessages);
        }

        return c.json({ response: result, model: selectedModel });

    } catch (e: any) {
        console.error("Chat Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Slash Command Handlers (mockup/simple implementation)
chatRoutes.get('/api/search/portfolios', async (c) => {
    // In a real app, verify DB. For now, return static list or simple DB query
    // We already have 'group_members' table, but maybe not a clean 'portfolios' table with names
    // We can assume distinct groups or hardcoded for this demo if DB structure is limited
    // Let's return the hardcoded list from the mockup for consistency + "Growth Fund" from DB 
    return c.json([
        { id: 'bill_gates', name: 'Bill Gates Trust', desc: '12 Stocks', code: 'BG' },
        { id: 'warren_buffett', name: 'Warren Buffett', desc: 'Berkshire', code: 'WB' },
        { id: 'growth_fund', name: 'Growth Fund', desc: 'My Portfolio', code: 'GF' }
    ]);
});

export default chatRoutes;

// Shared helper function to fetch and format portfolio context
async function fetchPortfolioContext(db: any, portfolioId: string | number, portfolioName?: string): Promise<string | null> {
    try {
        // 1. Fetch top 20 holdings and their stats directly using indexes (no full table GROUP BY)
        const holdingsRes = await db.prepare(
            `SELECT gm.symbol, gm.allocation, 
                    ss.change_ytd, ss.change_1y, ss.sma_20, ss.sma_50, ss.sma_200, ss.rs_rank_1m
             FROM group_members gm
             LEFT JOIN stock_stats ss ON gm.symbol = ss.symbol
             WHERE gm.group_id = ?
             ORDER BY gm.allocation DESC
             LIMIT 20`
        ).bind(portfolioId).all();

        const holdingsList: any[] = holdingsRes.results || [];

        // 2. Fetch quotes for these top 20 symbols within recent 14 days (fast index lookup)
        if (holdingsList.length > 0) {
            const symbols = holdingsList.map((h: any) => h.symbol);
            const placeholders = symbols.map(() => '?').join(',');
            const recentCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const quotesRes = await db.prepare(
                `SELECT symbol, price, forward_pe, pe_ratio, eps_current_year, eps_next_year
                 FROM stock_quotes
                 WHERE symbol IN (${placeholders}) AND date >= ?
                 ORDER BY date ASC`
            ).bind(...symbols, recentCutoff).all();

            const quoteMap = new Map<string, any>();
            if (quotesRes.results) {
                for (const q of quotesRes.results as any[]) {
                    quoteMap.set(q.symbol, q);
                }
            }

            for (const h of holdingsList) {
                const q = quoteMap.get(h.symbol);
                h.price = q?.price;
                h.forward_pe = q?.forward_pe;
                h.pe_ratio = q?.pe_ratio;
                h.eps_current_year = q?.eps_current_year;
                h.eps_next_year = q?.eps_next_year;
            }
        }

        if (holdingsList.length > 0) {
            let contextStr = `\n\n### Portfolio: ${portfolioName || 'Selected Portfolio'}\n`;
            contextStr += `Total Holdings: ${holdingsList.length}\n\n`;

            // Performance & Risk Stats (from portfolio_stats)
            const statsRow: any = await db.prepare(
                `SELECT cagr, std_dev, max_drawdown, sharpe, sortino, correlation_spy, dr, change_1d FROM portfolio_stats WHERE group_id = ?`
            ).bind(portfolioId).first();

            if (statsRow) {
                contextStr += `**Performance & Risk Metrics (QQQ Benchmark):**\n`;
                contextStr += `- Annualized Return (CAGR): ${statsRow.cagr?.toFixed(2) || 'N/A'}%\n`;
                contextStr += `- Annualized Volatility: ${statsRow.std_dev?.toFixed(2) || 'N/A'}%\n`;
                contextStr += `- Max Drawdown: ${statsRow.max_drawdown?.toFixed(2) || 'N/A'}%\n`;
                contextStr += `- Sharpe Ratio: ${statsRow.sharpe?.toFixed(2) || 'N/A'}\n`;
                contextStr += `- Sortino Ratio: ${statsRow.sortino?.toFixed(2) || 'N/A'}\n`;
                if (statsRow.cagr && statsRow.max_drawdown && Math.abs(statsRow.max_drawdown) > 0.01) {
                    const calmar = statsRow.cagr / Math.abs(statsRow.max_drawdown);
                    contextStr += `- Calmar Ratio: ${calmar.toFixed(2)}\n`;
                }
                contextStr += `\n`;
            }

            for (const h of holdingsList) {
                const priceVsSma = h.price && h.sma_20 && h.sma_50 && h.sma_200
                    ? (h.price > h.sma_20 && h.sma_20 > h.sma_50 ? 'Uptrend' : h.price < h.sma_200 ? 'Downtrend' : 'Neutral')
                    : 'N/A';

                const epsCurrent = h.eps_current_year;
                const epsNext = h.eps_next_year;
                let growthStr = 'N/A';
                let pegStr = 'N/A';

                if (epsCurrent !== null && epsNext !== null && epsCurrent !== 0) {
                    const g = ((epsNext - epsCurrent) / Math.abs(epsCurrent)) * 100;
                    growthStr = g.toFixed(1) + '%';
                    if (h.forward_pe && g > 0) {
                        pegStr = (h.forward_pe / g).toFixed(2);
                    }
                }

                // Parse RS Rank safely
                let rsRank = 'N/A';
                const rawRsRank = h.rs_rank_1m;
                if (rawRsRank && typeof rawRsRank === 'string') {
                    if (rawRsRank.includes('data-score=')) {
                        const match = rawRsRank.match(/data-score="(\d+)"/);
                        rsRank = match ? match[1] : 'N/A';
                    } else if (!rawRsRank.startsWith('<svg')) {
                        rsRank = rawRsRank;
                    }
                } else if (typeof rawRsRank === 'number') {
                    rsRank = rawRsRank.toString();
                }

                contextStr += `- **${h.symbol}**: ${h.allocation?.toFixed(1) || 0}% alloc, Price: $${h.price?.toFixed(2) || 'N/A'}, Forward PE: ${h.forward_pe?.toFixed(1) || 'N/A'}, PEG: ${pegStr}, Growth: ${growthStr}, PE: ${h.pe_ratio?.toFixed(1) || 'N/A'}, RS Rank: ${rsRank}, Trend: ${priceVsSma}, YTD: ${h.change_ytd?.toFixed(1) || 'N/A'}%, 1Y: ${h.change_1y?.toFixed(1) || 'N/A'}%\n`;
            }
            return contextStr;
        }
        return null;
    } catch (e) {
        console.error('Error in fetchPortfolioContext:', e);
        return null; // Fail gracefully
    }
}

// Shared helper function to fetch single stock context
async function fetchStockContext(c: any, db: any, symbol: string): Promise<string | null> {
    try {
        console.log('[Shared] Fetching context for single stock:', symbol);

        // Lazy Fetch: Ensure we have quote data
        await getLatestQuotes(c.env, [symbol]);

        // Regenerate stats if needed
        await regenerateStats(c.env, symbol);

        // Fetch Quote & Stats via point lookups (1 row each via indexes, 0ms)
        const quoteRow = await db.prepare(
            `SELECT * FROM stock_quotes WHERE symbol = ? ORDER BY date DESC LIMIT 1`
        ).bind(symbol).first();
        const statsRow = await db.prepare(
            `SELECT * FROM stock_stats WHERE symbol = ?`
        ).bind(symbol).first();

        const quote: any = quoteRow ? { ...quoteRow, ...statsRow } : null;

        let context = '';

        if (quote) {
            context += `\n\n### Stock Analysis: ${symbol}\n`;
            context += `- Price: $${quote.price}\n`;
            context += `- Market Cap: $${(quote.market_cap ? (quote.market_cap / 1000000000).toFixed(2) + 'B' : 'N/A')}\n`;
            context += `- Dividend Yield: ${(quote.dividend_yield ? (quote.dividend_yield * 100).toFixed(2) : '0.00')}%\n`;
            context += `- P/S Ratio: ${quote.ps_ratio}\n`;
            context += `- Change 1Y: ${(quote.change_1y || 0).toFixed(2)}%\n`;
            context += `- Change YTD: ${(quote.change_ytd || 0).toFixed(2)}%\n`;
            context += `- Forward PE: ${quote.forward_pe}\n`;
            context += `- PEG Ratio: ${((quote.forward_pe && quote.eps_next_year && quote.eps_current_year) ? (quote.forward_pe / (((quote.eps_next_year - quote.eps_current_year) / Math.abs(quote.eps_current_year)) * 100)).toFixed(2) : 'N/A')}\n`;

            // Parse RS Score
            let rsRank = 'N/A';
            const rawRsRank = quote.rs_rank_1m;
            if (rawRsRank && typeof rawRsRank === 'string') {
                if (rawRsRank.includes('data-score=')) {
                    const match = rawRsRank.match(/data-score="(\d+)"/);
                    rsRank = match ? `${match[1]}/100` : 'See Chart';
                } else if (rawRsRank.startsWith('<svg')) {
                    rsRank = 'See Chart';
                } else {
                    rsRank = rawRsRank;
                }
            }
            context += `- RS Rank (1M): ${rsRank}\n`;
            context += `- 20 SMA: ${quote.sma_20}\n`;
            context += `- 50 SMA: ${quote.sma_50}\n`;
            context += `- 200 SMA: ${quote.sma_200}\n`;
            context += `- Technical Status: ${(quote.price > quote.sma_20 && quote.sma_20 > quote.sma_50) ? 'Strong Uptrend' : 'Neutral/Mixed'}\n`;

            // Earnings History (from earnings_estimates table using PK symbol)
            const earnings = await db.prepare(
                `SELECT fiscal_date_ending, estimated_eps, reported_eps, surprise_percentage
                 FROM earnings_estimates
                 WHERE symbol = ?
                 ORDER BY fiscal_date_ending DESC LIMIT 4`
            ).bind(symbol).all();

            if (earnings.results && earnings.results.length > 0) {
                context += `\n**Recent Earnings:**\n`;
                context += `| Date | Est | Rep | Surprise |\n`;
                context += `|------|-----|-----|----------|\n`;
                for (const e of earnings.results as any[]) {
                    context += `| ${e.fiscal_date_ending} | ${e.estimated_eps} | ${e.reported_eps} | ${e.surprise_percentage}% |\n`;
                }
            }

            // Holdings check
            const holdings = await db.prepare(
                `SELECT g.name, gm.allocation
                 FROM group_members gm
                 JOIN groups g ON gm.group_id = g.id
                 WHERE gm.symbol = ?`
            ).bind(symbol).all();

            if (holdings.results && holdings.results.length > 0) {
                context += `\n**Your Holdings:**\n`;
                for (const h of holdings.results as any[]) {
                    context += `- Held in **${h.name}** (${h.allocation}%)\n`;
                }
            } else {
                context += `\n(Not currently held in any active portfolios)\n`;
            }

            console.log('[Shared] Final Context for ' + symbol + ' (Length: ' + context.length + ')');
            return context;
        } else {
            return `\n\n### Stock Context: ${symbol}\n(No local data found in DB, please use web search.)\n`;
        }
    } catch (e) {
        console.error('Error fetching single stock context:', e);
        return null;
    }
}
