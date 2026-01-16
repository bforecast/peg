import { Hono } from 'hono';
import { Bindings } from '../types';
import { fetchQuotes } from '../yahoo_finance';
import { updatePrices, updateTicker } from '../db';

const app = new Hono<{ Bindings: Bindings }>();

// Helper to check and backfill (similar to admin.ts logic)
async function checkAndBackfill(env: Bindings, symbol: string, ctx: ExecutionContext) {
    // We can just trigger updatePrices and updateTicker
    // Or we can use the logic from admin.ts if exposed.
    // For now, let's just trigger price update and ticker update.
    try {
        await updatePrices(env, symbol);
        // We might want to do this in background if it takes too long
        ctx.waitUntil(updateTicker(env, symbol));
    } catch (e) {
        console.error(`Backfill failed for ${symbol}`, e);
    }
}

app.post('/api/import-x', async (c) => {
    try {
        const body = await c.req.json();
        const { url } = body;

        if (!url || !url.includes('x.com') && !url.includes('twitter.com')) {
            return c.json({ error: 'Invalid URL. Please provide a valid X/Twitter link.' }, 400);
        }

        // Extract ID
        // Pattern: .../status/1234567890
        const match = url.match(/status\/(\d+)/);
        if (!match) {
            return c.json({ error: 'Could not extract tweet ID from URL.' }, 400);
        }
        const tweetId = match[1];

        // Fetch from fxtwitter/fixupx
        const apiUrl = `https://api.fxtwitter.com/i/status/${tweetId}`; // Generic user 'i' usually works or we need username
        // Actually fxtwitter supports /user/status/id but let's try with the one from the url if possible or just use ANY user
        // The API documentation says: https://api.fxtwitter.com/status/:id (redirects) or https://api.fxtwitter.com/:user/status/:id
        // Let's parse user from URL too to be safe.
        // https://x.com/patientinvestt/status/2007451889965633860
        const userMatch = url.match(/x\.com\/([^\/]+)\/status/);
        const username = userMatch ? userMatch[1] : 'twitter';
        const fetchUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;

        console.log(`Fetching X post: ${fetchUrl}`);

        const res = await fetch(fetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)'
            }
        });

        if (!res.ok) {
            return c.json({ error: `Failed to fetch tweet. Upstream: ${res.status}` }, 502);
        }

        const data = await res.json();
        const tweet = data.tweet;

        if (!tweet) {
            return c.json({ error: 'No tweet data found in response.' }, 404);
        }

        const text = tweet.text || '';
        const fullText = text; // fxtwitter usually returns full text

        // Extract Symbols
        // Logic: specific pattern mentioned by user "$AAPL"
        // Also looked like "Arm Holdings $ARM:" in example.
        // Regex for $SYMBOL
        const symbolRegex = /\$([A-Z]{1,5})\b/g;
        // Use matchAll or simple replace logic
        const potentialSymbols = [];
        let m;
        while ((m = symbolRegex.exec(fullText)) !== null) {
            potentialSymbols.push(m[1]);
        }

        const uniqueSymbols = [...new Set(potentialSymbols)];

        if (uniqueSymbols.length === 0) {
            return c.json({ error: 'No stock symbols (e.g. $AAPL) found in the post.' }, 400);
        }

        // Validate Symbols with Yahoo (optional but good practice)
        // We will just add them. The system cleans up valid ones usually.

        // Create Group
        // Name: First line of post, truncated
        const dateStr = new Date().toISOString().split('T')[0];
        let nameChunk = fullText.split('\n')[0].trim();
        if (nameChunk.length > 50) nameChunk = nameChunk.substring(0, 47) + '...';
        if (nameChunk.length === 0) nameChunk = `X Import ${dateStr}`;

        const name = nameChunk;
        const description = fullText;

        const { meta } = await c.env.DB.prepare(
            'INSERT INTO groups (name, description, type, reference) VALUES (?, ?, ?, ?)'
        ).bind(name, description, 'X', url).run();

        const groupId = meta.last_row_id;

        // Add Members
        const stmt = c.env.DB.prepare('INSERT INTO group_members (group_id, symbol, allocation) VALUES (?, ?, ?)');
        const allocation = uniqueSymbols.length > 0 ? (100 / uniqueSymbols.length) : 0;
        const batch = uniqueSymbols.map(sym => stmt.bind(groupId, sym, allocation));
        await c.env.DB.batch(batch);

        // Trigger Background Updates
        c.executionCtx.waitUntil((async () => {
            for (const sym of uniqueSymbols) {
                await checkAndBackfill(c.env, sym, c.executionCtx);
            }
        })());

        return c.json({
            success: true,
            id: groupId,
            name,
            symbolCount: uniqueSymbols.length,
            symbols: uniqueSymbols
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
