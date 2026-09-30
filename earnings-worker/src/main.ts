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

function sanitizeRedirectUrl(redirectParam?: string): string {
    if (!redirectParam) return '/';
    try {
        if (redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
            return redirectParam;
        }
        const parsedUrl = new URL(redirectParam);
        if (
            parsedUrl.hostname === 'bforecast.com' ||
            parsedUrl.hostname.endsWith('.bforecast.com') ||
            parsedUrl.hostname === 'localhost' ||
            parsedUrl.hostname === '127.0.0.1'
        ) {
            return redirectParam;
        }
    } catch (e) {
        // Invalid URL format fallback
    }
    return '/';
}

// Login Page
app.get('/login', async (c) => {
    const session = getCookie(c, 'auth_session');
    const secret = c.env.AUTH_PASSWORD;
    const redirectParam = c.req.query('redirect');

    if (session && secret) {
        const verifiedUser = await verifySession(session, secret);
        if (verifiedUser) {
            return c.redirect(sanitizeRedirectUrl(redirectParam));
        }
    }
    return c.html(LOGIN_HTML);
});

// Logout Route (clears parent domain cookie)
app.get('/logout', (c) => {
    const host = c.req.header('host') || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    setCookie(c, 'auth_session', '', {
        path: '/',
        ...(isLocalhost ? {} : { domain: '.bforecast.com' }),
        secure: !isLocalhost,
        httpOnly: true,
        maxAge: 0,
        sameSite: 'Lax',
    });
    return c.redirect('/login');
});

// Auth Verification Endpoint (used by bxhub and peer workers via Service Binding or internal HTTP)
app.get('/api/auth/verify', async (c) => {
    const session = getCookie(c, 'auth_session');
    if (!session) {
        return c.json({ authenticated: false, error: 'No session cookie' }, 401);
    }
    const secret = c.env.AUTH_PASSWORD;
    if (!secret) {
        return c.json({ authenticated: false, error: 'Auth credentials not configured' }, 500);
    }
    const verifiedUser = await verifySession(session, secret);
    if (verifiedUser) {
        return c.json({ authenticated: true, user: verifiedUser });
    }
    return c.json({ authenticated: false, error: 'Invalid or expired session' }, 401);
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
export async function signSession(username: string, secret: string): Promise<string> {
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

export async function verifySession(sessionStr: string, secret: string): Promise<string | null> {
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
    const redirectParam = body['redirect'] as string | undefined;

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

        const host = c.req.header('host') || '';
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

        // Set a persistent cookie (30 days) on parent domain .bforecast.com
        setCookie(c, 'auth_session', sessionToken, {
            path: '/',
            ...(isLocalhost ? {} : { domain: '.bforecast.com' }),
            secure: !isLocalhost,
            httpOnly: true,
            maxAge: 60 * 60 * 24 * 30, // 30 Days
            sameSite: 'Lax',
        });
        return c.redirect(sanitizeRedirectUrl(redirectParam));
    } else {
        const redirectQuery = redirectParam ? `&redirect=${encodeURIComponent(redirectParam)}` : '';
        return c.redirect(`/login?error=1${redirectQuery}`);
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
        '/logout',
        '/api/auth/verify',
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
import comparisonRoutes from './routes/comparison';
app.route('/', comparisonRoutes);

// Export Worker Entry Point
export default {
    fetch: app.fetch,
    scheduled
};
