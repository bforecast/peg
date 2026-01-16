import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { Bindings } from './types';
import dashboardRoutes from './routes/dashboard';
import adminRoutes from './routes/admin';
import legacyRoutes from './routes/legacy';
import chatRoutes from './routes/chat';
import scoringRoutes from './routes/scoring';
import { scheduled } from './cron';
import { LOGIN_HTML } from './login_html';

console.log('Worker Environment (main.ts) v2.0 - Cookie Auth');

const app = new Hono<{ Bindings: Bindings }>();

// --- Public Routes ---

// Login Page
app.get('/login', (c) => {
    return c.html(LOGIN_HTML);
});

// Auth Handler
app.post('/auth', async (c) => {
    const body = await c.req.parseBody();
    const username = body['username'];
    const password = body['password'];

    const envUser = c.env.AUTH_USERNAME || 'admin';
    const envPass = c.env.AUTH_PASSWORD || 'password';

    if (username === envUser && password === envPass) {
        // valid credentials
        // Set a persistent cookie (30 days)
        setCookie(c, 'auth_session', 'valid_session_token', {
            path: '/',
            secure: true,
            httpOnly: true,
            maxAge: 60 * 60 * 24 * 30, // 30 Days
            sameSite: 'Lax',
        });
        return c.redirect('/');
    } else {
        return c.redirect('/login?error=1');
    }
});

// --- Middleware ---

app.use('/*', async (c, next) => {
    const url = new URL(c.req.url);
    const path = url.pathname;

    // List of public paths to bypass auth
    const publicPaths = [
        '/login',
        '/auth',
        '/favicon.ico',
        '/manifest.json',
        '/api/health'        // Debug
    ];

    // Check if path starts with certain prefixes (e.g. static assets)
    if (publicPaths.includes(path) || path.startsWith('/static/') || path.startsWith('/public/')) {
        return next();
    }

    // Check Cookie
    const session = getCookie(c, 'auth_session');
    if (session === 'valid_session_token') {
        return next();
    }

    // Not authenticated -> Redirect to login
    return c.redirect('/login');
});



// --- Protected Routes ---
app.route('/', dashboardRoutes);
app.route('/', adminRoutes);
app.route('/', legacyRoutes);
app.route('/', chatRoutes);
app.route('/', scoringRoutes);
import importRoutes from './routes/import';
app.route('/', importRoutes);

// Export Worker Entry Point
export default {
    fetch: app.fetch,
    scheduled
};
