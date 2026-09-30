import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker, { signSession, verifySession } from '../src/main';

describe('SSO and Shared Login Authentication', () => {
    const mockEnv = {
        AUTH_USERNAME: 'testuser',
        AUTH_PASSWORD: 'supersecretpassword123',
    };

    it('signs and verifies HMAC session tokens correctly', async () => {
        const token = await signSession('testuser', mockEnv.AUTH_PASSWORD);
        expect(token).toContain('.');

        const verified = await verifySession(token, mockEnv.AUTH_PASSWORD);
        expect(verified).toBe('testuser');

        // Invalid password fails
        const invalid = await verifySession(token, 'wrongpassword');
        expect(invalid).toBeNull();

        // Tampered token fails
        const tampered = token.slice(0, -4) + 'abcd';
        const invalidTampered = await verifySession(tampered, mockEnv.AUTH_PASSWORD);
        expect(invalidTampered).toBeNull();
    });

    it('sets cookie with domain .bforecast.com on successful login', async () => {
        const formData = new FormData();
        formData.append('username', 'testuser');
        formData.append('password', 'supersecretpassword123');
        formData.append('redirect', 'https://bxhub.bforecast.com/accounts');

        const request = new Request('https://pf.bforecast.com/auth', {
            method: 'POST',
            body: formData,
            headers: {
                host: 'pf.bforecast.com',
            },
        });
        const ctx = createExecutionContext();
        const response = await worker.fetch(request, mockEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://bxhub.bforecast.com/accounts');

        const setCookieHeader = response.headers.get('Set-Cookie') || '';
        expect(setCookieHeader).toContain('auth_session=');
        expect(setCookieHeader).toContain('Domain=.bforecast.com');
        expect(setCookieHeader).toContain('HttpOnly');
    });

    it('rejects unsafe external redirects', async () => {
        const formData = new FormData();
        formData.append('username', 'testuser');
        formData.append('password', 'supersecretpassword123');
        formData.append('redirect', 'https://malicious-site.com/steal');

        const request = new Request('https://pf.bforecast.com/auth', {
            method: 'POST',
            body: formData,
            headers: {
                host: 'pf.bforecast.com',
            },
        });
        const ctx = createExecutionContext();
        const response = await worker.fetch(request, mockEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(302);
        // Should fallback to '/'
        expect(response.headers.get('Location')).toBe('/');
    });

    it('verifies session via /api/auth/verify endpoint', async () => {
        const validToken = await signSession('testuser', mockEnv.AUTH_PASSWORD);
        const ctx = createExecutionContext();

        // 1. With valid cookie
        const validReq = new Request('https://pf.bforecast.com/api/auth/verify', {
            headers: {
                cookie: `auth_session=${validToken}`,
            },
        });
        const validRes = await worker.fetch(validReq, mockEnv as any, ctx);
        await waitOnExecutionContext(ctx);
        expect(validRes.status).toBe(200);
        const validJson: any = await validRes.json();
        expect(validJson.authenticated).toBe(true);
        expect(validJson.user).toBe('testuser');

        // 2. With no cookie
        const emptyReq = new Request('https://pf.bforecast.com/api/auth/verify');
        const emptyRes = await worker.fetch(emptyReq, mockEnv as any, ctx);
        expect(emptyRes.status).toBe(401);
        const emptyJson: any = await emptyRes.json();
        expect(emptyJson.authenticated).toBe(false);
    });

    it('skips login page and bounces to redirect target if already logged in', async () => {
        const validToken = await signSession('testuser', mockEnv.AUTH_PASSWORD);
        const ctx = createExecutionContext();

        const req = new Request('https://pf.bforecast.com/login?redirect=https%3A%2F%2Fbxhub.bforecast.com%2Flogs', {
            headers: {
                cookie: `auth_session=${validToken}`,
            },
        });
        const res = await worker.fetch(req, mockEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://bxhub.bforecast.com/logs');
    });

    it('clears domain cookie upon logout', async () => {
        const req = new Request('https://pf.bforecast.com/logout', {
            headers: {
                host: 'pf.bforecast.com',
            },
        });
        const ctx = createExecutionContext();
        const res = await worker.fetch(req, mockEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('/login');

        const setCookieHeader = res.headers.get('Set-Cookie') || '';
        expect(setCookieHeader).toContain('Domain=.bforecast.com');
        expect(setCookieHeader).toContain('Max-Age=0');
    });
});
