import { Hono } from 'hono';
import { Bindings } from '../types';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/earnings', async (c) => {
    const symbol = c.req.query('symbol')?.toUpperCase();
    if (!symbol) return c.json({ error: 'Missing symbol parameter' }, 400);

    const { results } = await c.env.DB.prepare(
        `SELECT * FROM earnings_estimates WHERE symbol = ? ORDER BY fiscal_date_ending DESC`
    ).bind(symbol).all();

    return c.json({ results });
});

app.get('/api/prices', async (c) => {
    const symbol = c.req.query('symbol')?.toUpperCase();
    if (!symbol) return c.json({ error: 'Missing symbol parameter' }, 400);

    const { results } = await c.env.DB.prepare(
        `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 2500`
    ).bind(symbol).all();

    return c.json({ results });
});

export default app;
