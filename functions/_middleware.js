import { jwtVerify } from 'jose';
import { parse } from 'cookie';

export async function onRequest(context) {
    const { request, next, env } = context;
    const url = new URL(request.url);

    // Allow Auth routes
    if (url.pathname.startsWith('/api/auth/')) {
        return next();
    }

    // Only protect /api/ endpoints (frontend is public, but API needs auth)
    if (!url.pathname.startsWith('/api/')) {
        return next();
    }

    // Check Cookie
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const cookies = parse(cookieHeader);
    const token = cookies.auth_token;

    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        await jwtVerify(token, secret);
        // Valid token
        return next();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid Token' }), { status: 401 });
    }
}

// Force rebuild
