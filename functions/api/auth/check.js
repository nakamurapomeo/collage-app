import { jwtVerify } from 'jose';
import { parse } from 'cookie';

export async function onRequest(context) {
    const { request, env } = context;
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return new Response(JSON.stringify({ loggedIn: false }), { headers: { 'Content-Type': 'application/json' } });

    const cookies = parse(cookieHeader);
    const token = cookies.auth_token;
    if (!token) return new Response(JSON.stringify({ loggedIn: false }), { headers: { 'Content-Type': 'application/json' } });

    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        await jwtVerify(token, secret);
        return new Response(JSON.stringify({ loggedIn: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ loggedIn: false }), { headers: { 'Content-Type': 'application/json' } });
    }
}
