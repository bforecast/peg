import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { Bindings } from './types';
import dashboardRoutes from './routes/dashboard';
import adminRoutes from './routes/admin';
import legacyRoutes from './routes/legacy';
import { scheduled } from './cron';

console.log('Worker Environment (main.ts) v1.3');

const app = new Hono<{ Bindings: Bindings }>();

// Security Middleware
app.use('/*', async (c, next) => {
    // Check if auth is configured
    const username = c.env.AUTH_USERNAME || 'admin';
    const password = c.env.AUTH_PASSWORD || 'password';

    // Allow public access to status summary for debugging
    const url = new URL(c.req.url);
    if (url.pathname === '/api/cron-summary' || url.pathname === '/api/health') {
        await next();
    } else {
        const auth = basicAuth({
            username,
            password,
        });
        return auth(c, next);
    }
});

// Mount routes
// Note: We mount them at root because they define their own paths (/api/...)
app.route('/', dashboardRoutes);
app.route('/', adminRoutes);
app.route('/', legacyRoutes);

// Export Worker Entry Point
export default {
    fetch: app.fetch,
    scheduled
};
