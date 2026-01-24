import { Hono } from 'hono';
import { Bindings } from '../types';
import { chatWithGemini } from '../ai/gemini';
import { generatePerplexityResponse } from '../ai/perplexity';
import { getLatestQuotes, regenerateStats } from '../db';

const chatRoutes = new Hono<{ Bindings: Bindings }>();

const SYSTEM_PROMPT = `
You are the "Investment AI expert", a specialized assistant for the Forward Peg System used by bforecast.
You act as three experts rolled into one:
1. Investment Expert: Analyzes portfolio allocations, diversification, and risks.
2. Value Investing Expert: Evaluates valuations using PEG, Forward PE, and Earnings Growth.
   - Ideal PEG is around 1.0. < 1.5 is potentially undervalued. > 2.5 is expensive unless growth is massive.
   - Loves consistant earnings growth.
3. Technical Analyst: Looks at Price vs SMA (20/50/200) and RS Rank.
   - RS Rank (1-99) above 80 is Strong.
   - Price > 20SMA > 50SMA is a strong uptrend.

Context Handling:
- The user might supply a "Context" like a specific Stock Symbol or Portfolio Name.
- Use the available TOOLS to fetch real data. DO NOT Hallucinate prices.
- If the user asks about a stock, ALWAYS fetch its valuation and technical data first.

Tone: Professional, Insightful, yet Concise. Use markdown for formatting.
`;

chatRoutes.post('/api/chat', async (c) => {
    try {
        const body = await c.req.json();
        let { message, context, history, model } = body;
        // model: 'gemini' (default) or 'perplexity'

        // Prepare message with context
        let fullMessage = message;
        if (context) {
            console.log('[Perplexity] Incoming Context:', JSON.stringify(context, null, 2));
            // Extract meaningful context string
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
            console.log('[Perplexity] No Context provided');
        }

        // Route to selected model
        if (model === 'perplexity') {
            // Parse @mentions to fetch local portfolio data
            // Updated to support Quoted names ('Name') or Standard names (stopped by lowercase command)
            const mentionRegex = /@(?:'([^']+)'|"([^"]+)"|([\p{L}\p{N}\s&'_\-]+?)(?=\s*(?:[@?:!.,]|$)|(?<=\s)[a-z]))/gu;
            const mentions: string[] = [];
            let match;
            while ((match = mentionRegex.exec(message)) !== null) {
                // match[1] = single quoted, match[2] = double quoted, match[3] = standard
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
            // This overrides the page context
            const stockSymbolMatch = message.match(/@([A-Za-z]{1,5})\b/);
            let targetSymbol: string | null = null;
            if (stockSymbolMatch) {
                targetSymbol = stockSymbolMatch[1].toUpperCase();
                console.log('[Perplexity] User mentioned stock symbol:', targetSymbol);
            }

            console.log('[Perplexity] Parsed mentions:', mentions, 'all:', wantsAllPortfolios, 'targetSymbol:', targetSymbol);

            // Fetch portfolio data for mentioned portfolios
            let localDataContext = '';

            // This is a translation request - skip context injection & inject prior response
            const isTranslationRequest = /translate.*previous|翻译|translation/i.test(message);
            let enhancedMessage = message; // Initialize enhancedMessage

            if (isTranslationRequest) {
                console.log('[Perplexity] Translation request detected.');
                localDataContext = ''; // Ensure no context is injected

                if (history && Array.isArray(history)) {
                    // Find actual last assistant message (skip user messages)
                    const reversedHistory = [...history].reverse();
                    const lastAssistantMsg = reversedHistory.find(h => h.role === 'model' || h.role === 'assistant');

                    if (lastAssistantMsg && lastAssistantMsg.content) {
                        console.log('[Perplexity] Injecting ' + lastAssistantMsg.content.length + ' chars for translation');
                        // REWRITE the user message to be self-contained
                        enhancedMessage = `Please translate the following text into Simplified Chinese. Do NOT search the web or provide new analysis -- strictly translate the text:\n\n"""\n${lastAssistantMsg.content}\n"""`;
                    } else {
                        console.log('[Perplexity] WARNING: No assistant message found for translation. History Len:', history.length);
                        // Fallback: Try to translate the LAST message if it's not the current one?
                        // Or just let it fail but with context.
                        // We will append a system note so the AI knows why.
                        enhancedMessage = message + `\n\n[System Note: The user requested translation of the previous response, but the server implementation could not locate a previous 'model' or 'assistant' message in the provided history. History Length: ${history.length}. Roles: ${history.map(h => h.role).join(',')}.]`;
                    }
                }
            } else {
                enhancedMessage = message;
            }
            // Priority: 1. User's @mention, 2. Page context (isSingleStock)
            // But skip for translation requests
            const symbolToAnalyze = isTranslationRequest ? null : (targetSymbol || (context && context.symbol ? context.symbol.toUpperCase() : null));

            // Handle Single Stock Context first
            if (symbolToAnalyze) {
                const symbol = symbolToAnalyze;
                const stockContext = await fetchStockContext(c, c.env.DB, symbol);
                if (stockContext) {
                    localDataContext += stockContext;
                    console.log('[Perplexity] Final Context for ' + symbol + ' (Length: ' + stockContext.length + ')');
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

                    // 1. Context Portfolio (ID is most reliable)
                    if (context && context.portfolioId) {
                        portfoliosToFetch.push({ type: 'id', value: context.portfolioId });
                    }

                    // 2. Mentioned Portfolios (by Name)
                    for (const m of mentions) {
                        // Avoid duplicate if context name is same
                        if (context && context.portfolioName && m === context.portfolioName) continue;
                        portfoliosToFetch.push({ type: 'name', value: m });
                    }

                    for (const target of portfoliosToFetch) {
                        let group;
                        if (target.type === 'id') {
                            console.log('[Perplexity] Looking up portfolio by ID:', target.value);
                            group = await db.prepare(
                                `SELECT g.id, g.name, g.description,
                                        ps.cagr, ps.std_dev, ps.max_drawdown, ps.sharpe, ps.sortino, ps.correlation_spy
                                 FROM groups g
                                 LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                                 WHERE g.id = ?`
                            ).bind(target.value).first();
                        } else {
                            console.log('[Perplexity] Looking up portfolio by Name:', target.value);
                            group = await db.prepare(
                                `SELECT g.id, g.name, g.description,
                                        ps.cagr, ps.std_dev, ps.max_drawdown, ps.sharpe, ps.sortino, ps.correlation_spy
                                 FROM groups g
                                 LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                                 WHERE LOWER(g.name) LIKE LOWER(?)`
                            ).bind(`%${target.value}%`).first();
                        }



                        if (group) {
                            console.log('[Perplexity] Found portfolio:', group.name);

                            // 1. Get Symbols first to ensure data freshness
                            const memberSymbols = await db.prepare(
                                `SELECT symbol FROM group_members WHERE group_id = ?`
                            ).bind(group.id).all();

                            if (memberSymbols.results && memberSymbols.results.length > 0) {
                                const symbols = memberSymbols.results.map((r: any) => r.symbol);
                                // Lazy Fetch quotes & Regen Stats if needed
                                await getLatestQuotes(c.env, symbols);
                                for (const s of symbols) {
                                    await regenerateStats(c.env, s);
                                }
                            }

                            // 2. Get holdings with now-guaranteed valuation and technical data
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

            // Enhance message with local data
            if (!isTranslationRequest) {
                enhancedMessage = fullMessage;
            }
            if (localDataContext) {
                console.log('[Perplexity] Injecting Local Context:\n', localDataContext);
                enhancedMessage = `${fullMessage}\n\n--- LOCAL PORTFOLIO DATA FROM DATABASE ---${localDataContext}\n--- END OF LOCAL DATA ---\n\nUse the above local data to answer the question. Combine with web search if needed.`;
            }

            // Use Perplexity API for real-time web search
            const perplexityMessages: { role: 'system' | 'user' | 'assistant', content: string }[] = [
                { role: 'system', content: SYSTEM_PROMPT }
            ];

            // Include recent chat history (for translation/follow-up questions)
            // Sanitize to ensure: 1) First non-system is 'user', 2) Alternating roles
            if (history && Array.isArray(history)) {
                const recentHistory = history.slice(-6); // Last 6 messages
                let lastRole = 'system';
                let hasFirstUser = false;
                for (const h of recentHistory) {
                    if (h.role && h.content) {
                        const currentRole = h.role === 'user' ? 'user' : 'assistant';
                        // First message after system MUST be 'user'
                        if (!hasFirstUser && currentRole === 'assistant') continue;
                        if (currentRole === 'user') hasFirstUser = true;
                        // Skip if same role as previous (avoid consecutive)
                        if (currentRole === lastRole) continue;
                        perplexityMessages.push({
                            role: currentRole,
                            content: h.content
                        });
                        lastRole = currentRole;
                    }
                }
                // If last message in history is 'user', remove it (we'll add our own)
                if (perplexityMessages.length > 1 && perplexityMessages[perplexityMessages.length - 1].role === 'user') {
                    perplexityMessages.pop();
                }
            }

            // Add current message
            perplexityMessages.push({ role: 'user', content: enhancedMessage });

            const result = await generatePerplexityResponse(c.env.PERPLEXITY_API_KEY, perplexityMessages);
            return c.json({ response: result, model: 'perplexity' });
        }

        // Default: Use Gemini
        // Prepare initial messages for Gemini
        const geminiMessages: any[] = [];

        // Fetch portfolio data for Gemini (similar to Perplexity logic)
        let geminiLocalContext = '';

        // 1. Single Stock Context (Priority)
        // Detect symbol from message or context
        const geminiStockMatch = message.match(/@([A-Za-z]{1,5})\b/);
        const geminiSymbol = geminiStockMatch ? geminiStockMatch[1].toUpperCase() : (context && context.symbol ? context.symbol.toUpperCase() : null);

        if (geminiSymbol) {
            const stockContext = await fetchStockContext(c, c.env.DB, geminiSymbol);
            if (stockContext) {
                geminiLocalContext = stockContext;
            }
        }
        // 2. Portfolio Context (Fallback if no single stock)
        else if (context && context.portfolioId) {
            try {
                const results = await fetchPortfolioContext(c.env.DB, context.portfolioId, context.portfolioName);
                if (results) geminiLocalContext = results;
            } catch (e) {
                console.error('[Gemini] Error fetching portfolio data:', e);
            }
        }

        // Build enhanced message for Gemini
        let geminiEnhancedMessage = fullMessage;
        if (geminiLocalContext) {
            console.log('[Gemini] Injecting Local Context');
            geminiEnhancedMessage = `${fullMessage}\n\n--- LOCAL PORTFOLIO DATA ---${geminiLocalContext}\n--- END OF LOCAL DATA ---\n\nAnalyze the above portfolio data to answer the question.`;
        }

        // Add Chat History (limit to last 10 to save tokens)
        if (history && Array.isArray(history)) {
            history.slice(-10).forEach(h => {
                geminiMessages.push({
                    role: h.role === 'user' ? 'user' : 'model',
                    parts: [{ text: h.content }]
                });
            });
        }

        // Add Current Message
        geminiMessages.push({
            role: 'user',
            parts: [{ text: geminiEnhancedMessage }]
        });

        // Call Gemini
        const result = await chatWithGemini(geminiMessages, c.env, SYSTEM_PROMPT);

        if (result.error) {
            return c.json({ error: result.error }, 500);
        }

        return c.json({ response: result.text, model: 'gemini' });

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
        const holdings = await db.prepare(
            `SELECT gm.symbol, gm.allocation, 
                    sq.price, sq.forward_pe, sq.pe_ratio, sq.eps_current_year, sq.eps_next_year,
                    ss.change_ytd, ss.change_1y, ss.sma_20, ss.sma_50, ss.sma_200, ss.rs_rank_1m
                FROM group_members gm
                LEFT JOIN (
                    SELECT * FROM stock_quotes WHERE rowid IN (
                        SELECT MAX(rowid) FROM stock_quotes GROUP BY symbol
                    )
                ) sq ON gm.symbol = sq.symbol
                LEFT JOIN (
                    SELECT * FROM stock_stats WHERE rowid IN (
                        SELECT MAX(rowid) FROM stock_stats GROUP BY symbol
                    )
                ) ss ON gm.symbol = ss.symbol
                WHERE gm.group_id = ?
                ORDER BY gm.allocation DESC
                LIMIT 20`
        ).bind(portfolioId).all();

        if (holdings.results && holdings.results.length > 0) {
            let contextStr = `\n\n### Portfolio: ${portfolioName || 'Selected Portfolio'}\n`;
            contextStr += `Total Holdings: ${holdings.results.length}\n\n`;

            for (const h of holdings.results as any[]) {
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

        // Fetch Quote & Stats
        const quote = await db.prepare(
            `SELECT sq.*, ss.* 
             FROM stock_quotes sq
             LEFT JOIN (SELECT * FROM stock_stats WHERE rowid IN (SELECT MAX(rowid) FROM stock_stats GROUP BY symbol)) ss ON sq.symbol = ss.symbol
             WHERE sq.symbol = ? ORDER BY sq.updated_at DESC LIMIT 1`
        ).bind(symbol).first();

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

            // Earnings History
            const earnings = await db.prepare(
                `SELECT fiscal_date_ending, estimated_eps, reported_eps, surprise_percentage
                 FROM stock_earnings
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
