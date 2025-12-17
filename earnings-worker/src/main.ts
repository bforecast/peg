import { Hono } from 'hono';
import { Bindings } from './types';
import dashboardRoutes from './routes/dashboard';
import adminRoutes from './routes/admin';
import legacyRoutes from './routes/legacy';
import { scheduled } from './cron';

console.log('Worker Environment (main.ts) v1.2');

const app = new Hono<{ Bindings: Bindings }>();

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
