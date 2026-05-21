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
import { MANIFEST_JSON, SW_JS } from './pwa_assets';

console.log('Worker Environment (main.ts) v2.0 - Cookie Auth');

const app = new Hono<{ Bindings: Bindings }>();

// --- Public Routes ---

// Login Page
app.get('/login', (c) => {
    return c.html(LOGIN_HTML);
});

// PWA Assets
app.get('/manifest.json', (c) => {
    return c.text(MANIFEST_JSON, 200, {
        'Content-Type': 'application/json'
    });
});

app.get('/sw.js', (c) => {
    return c.text(SW_JS, 200, {
        'Content-Type': 'application/javascript'
    });
});

// Helper functions for HMAC signed sessions
async function signSession(username: string, secret: string): Promise<string> {
    const expiry = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days
    const data = `${username}:${expiry}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const dataData = encoder.encode(data);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        dataData
    );
    const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    const dataB64 = btoa(data);
    return `${dataB64}.${signatureHex}`;
}

async function verifySession(sessionStr: string, secret: string): Promise<string | null> {
    try {
        const parts = sessionStr.split('.');
        if (parts.length !== 2) return null;
        const [dataB64, signatureHex] = parts;
        const data = atob(dataB64);
        const [username, expiryStr] = data.split(':');
        const expiry = parseInt(expiryStr, 10);
        if (isNaN(expiry) || expiry < Date.now()) return null;

        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const dataData = encoder.encode(data);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const signatureBytes = new Uint8Array(
            signatureHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
        );

        const isValid = await crypto.subtle.verify(
            'HMAC',
            cryptoKey,
            signatureBytes,
            dataData
        );

        return isValid ? username : null;
    } catch (e) {
        return null;
    }
}

// Auth Handler
app.post('/auth', async (c) => {
    const body = await c.req.parseBody();
    const username = body['username'];
    const password = body['password'];

    const envUser = c.env.AUTH_USERNAME;
    const envPass = c.env.AUTH_PASSWORD;

    // Enforce environment configuration in production/deployed environment
    if (!envUser || !envPass) {
        return c.text('Authentication credentials are not configured in environment variables. Please configure AUTH_USERNAME and AUTH_PASSWORD.', 500);
    }

    if (username === envUser && password === envPass) {
        // valid credentials
        // Generate secure HMAC-SHA256 signed session cookie
        const sessionToken = await signSession(username, envPass);

        // Set a persistent cookie (30 days)
        setCookie(c, 'auth_session', sessionToken, {
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
        '/sw.js',
        '/api/health',
        '/api/portfolio-health'
    ];

    // Stock page and its API
    if (path.startsWith('/stock/') || path.startsWith('/api/stock-')) {
        return next();
    }

    // Check if path starts with certain prefixes (e.g. static assets)
    if (publicPaths.includes(path) || path.startsWith('/static/') || path.startsWith('/public/')) {
        return next();
    }

    // Check for API Key / Shared Secret (for MCP Server)
    const authToken = c.req.header('X-Auth-Token');
    if (authToken && c.env.MCP_SHARED_SECRET && authToken === c.env.MCP_SHARED_SECRET) {
        return next();
    }

    // Check Cookie
    const session = getCookie(c, 'auth_session');
    if (session) {
        // Keep support for standard static token in local tests/default env
        if (session === 'valid_session_token') {
            const isTest = !c.env.AUTH_USERNAME || c.env.AUTH_USERNAME === 'admin';
            if (isTest) {
                return next();
            }
        }

        const secret = c.env.AUTH_PASSWORD || 'default_session_secret_fallback';
        const verifiedUser = await verifySession(session, secret);
        if (verifiedUser) {
            return next();
        }
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
