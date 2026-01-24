import { SignJWT } from 'jose';
import { serialize } from 'cookie';

export async function onRequestPost(context) {
    const { request, env } = context;

    // Helpers
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    if (!secret) return new Response('Server Config Error', { status: 500 });

    try {
        const { password } = await request.json();

        if (password !== env.AUTH_PASSWORD) {
            return new Response(JSON.stringify({ error: 'Wrong password' }), { status: 401 });
        }

        // Generate JWT
        const token = await new SignJWT({ role: 'admin' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('30d') // Long session
            .sign(secret);

        // Set Cookie
        const cookie = serialize('auth_token', token, {
            httpOnly: true,
            secure: true, // Requires HTTPS (localhost usually ok with secure:false if not https, but Pages is https)
            // For local dev via http, we might need secure: false. Let's try secure: true first as CF Pages is HTTPS.
            // But localhost might fail if not https? Vite preview is http.
            // We'll relax it slightly or detect. For now simple.
            secure: url.protocol === 'https:',
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            sameSite: 'Strict',
        });

        const url = new URL(request.url); // Re-declare URL for secure check logic above if needed, wait...
        // Let's just rely on context.request.url
        const isHttps = new URL(request.url).protocol === 'https:';

        const finalCookie = serialize('auth_token', token, {
            httpOnly: true,
            secure: isHttps,
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
            sameSite: 'Lax' // Lax is better for navigation
        });

        return new Response(JSON.stringify({ success: true }), {
            headers: {
                'Set-Cookie': finalCookie,
                'Content-Type': 'application/json'
            }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
