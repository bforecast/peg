import { Hono } from 'hono';
import { Bindings } from '../types';
import { chatWithGemini } from '../ai/gemini';
import { generatePerplexityResponse } from '../ai/perplexity';
import { getLatestQuotes } from '../db';

const chatRoutes = new Hono<{ Bindings: Bindings }>();

const SYSTEM_PROMPT = `
You are the "Forward PEG AI Expert", a specialized assistant for the Forward Peg System used by bforecast.
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
        const { message, context, history, model } = body;
        // model: 'gemini' (default) or 'perplexity'

        // Prepare message with context
        let fullMessage = message;
        if (context) {
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
        }

        // Route to selected model
        if (model === 'perplexity') {
            // Parse @mentions to fetch local portfolio data
            // Match @Name until next @ or common delimiters (-, ?, :, lowercase word boundary)
            const mentionRegex = /@([A-Z][A-Za-z0-9\s]*?)(?=\s*[@?:-]|\s+[a-z]|$)/g;
            const mentions: string[] = [];
            let match;
            while ((match = mentionRegex.exec(message)) !== null) {
                const name = match[1].trim();
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

            // Detect "all portfolios" queries
            const allPortfoliosRegex = /\b(all|every|compare\s+all)\s+(portfolios?|groups?)/i;
            const wantsAllPortfolios = allPortfoliosRegex.test(message);

            console.log('[Perplexity] Parsed mentions:', mentions, 'all:', wantsAllPortfolios);

            // Fetch portfolio data for mentioned portfolios
            let localDataContext = '';

            // If user asks for "all portfolios", fetch all stats
            if (wantsAllPortfolios) {
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
            } else if (mentions.length > 0) {
                try {
                    const db = c.env.DB;
                    for (const portfolioName of mentions) {
                        console.log('[Perplexity] Looking up portfolio:', portfolioName);

                        // Find group by name (case-insensitive partial match)
                        const group = await db.prepare(
                            `SELECT g.id, g.name, g.description,
                                    ps.cagr, ps.std_dev, ps.max_drawdown, ps.sharpe, ps.sortino, ps.correlation_spy
                             FROM groups g
                             LEFT JOIN portfolio_stats ps ON g.id = ps.group_id
                             WHERE LOWER(g.name) LIKE LOWER(?)`
                        ).bind(`%${portfolioName}%`).first();

                        if (group) {
                            console.log('[Perplexity] Found portfolio:', group.name);
                            // Get holdings with valuation and technical data
                            const holdings = await db.prepare(
                                `SELECT gm.symbol, gm.allocation, 
                                        sq.price, sq.forward_pe, sq.pe_ratio,
                                        ss.change_ytd, ss.change_1y, ss.sma_20, ss.sma_50, ss.sma_200, ss.rs_rank_1m
                                 FROM group_members gm
                                 LEFT JOIN stock_quotes sq ON gm.symbol = sq.symbol
                                 LEFT JOIN stock_stats ss ON gm.symbol = ss.symbol
                                 WHERE gm.group_id = ?
                                 ORDER BY gm.allocation DESC
                                 LIMIT 10`
                            ).bind(group.id).all();

                            localDataContext += `\n\n### Portfolio: ${group.name}\n`;
                            localDataContext += `**Description**: ${group.description || 'N/A'}\n`;
                            localDataContext += `**Stats**: CAGR: ${group.cagr?.toFixed(1) || 'N/A'}%, Sharpe: ${group.sharpe?.toFixed(2) || 'N/A'}, Sortino: ${group.sortino?.toFixed(2) || 'N/A'}, Max DD: ${group.max_drawdown?.toFixed(1) || 'N/A'}%\n`;
                            localDataContext += `**Top Holdings (with Valuation & Technicals)**:\n`;
                            if (holdings.results && holdings.results.length > 0) {
                                for (const h of holdings.results as any[]) {
                                    const priceVsSma = h.price && h.sma_20 && h.sma_50 && h.sma_200
                                        ? (h.price > h.sma_20 && h.sma_20 > h.sma_50 ? 'Uptrend' : h.price < h.sma_200 ? 'Downtrend' : 'Neutral')
                                        : 'N/A';
                                    localDataContext += `- **${h.symbol}**: ${h.allocation?.toFixed(1)}% alloc, Price: $${h.price?.toFixed(2) || 'N/A'}, Forward PE: ${h.forward_pe?.toFixed(1) || 'N/A'}, PE: ${h.pe_ratio?.toFixed(1) || 'N/A'}, RS Rank: ${h.rs_rank_1m || 'N/A'}, Trend: ${priceVsSma}, YTD: ${h.change_ytd?.toFixed(1) || 'N/A'}%, 1Y: ${h.change_1y?.toFixed(1) || 'N/A'}%\n`;
                                }
                            } else {
                                localDataContext += `- No holdings data available\n`;
                            }
                        }
                    }
                } catch (dbError) {
                    console.error('Error fetching portfolio data:', dbError);
                }
            }

            // Enhance message with local data
            let enhancedMessage = fullMessage;
            if (localDataContext) {
                enhancedMessage = `${fullMessage}\n\n--- LOCAL PORTFOLIO DATA FROM DATABASE ---${localDataContext}\n--- END OF LOCAL DATA ---\n\nUse the above local data to answer the question. Combine with web search if needed.`;
            }

            // Use Perplexity API for real-time web search
            const result = await generatePerplexityResponse(c.env, enhancedMessage, SYSTEM_PROMPT);
            return c.json({ response: result, model: 'perplexity' });
        }

        // Default: Use Gemini
        // Prepare initial messages for Gemini
        const geminiMessages: any[] = [];

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
            parts: [{ text: fullMessage }]
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
