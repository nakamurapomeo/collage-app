/**
 * Collage Sync API - Cloudflare Workers
 * R2ストレージを使用したクラウド同期API
 */

// CORS設定
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Password',
};

// SHA-256ハッシュ生成
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// レスポンスヘルパー
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
        },
    });
}

function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
}

export default {
    async fetch(request, env, ctx) {
        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // パスワード認証
        const password = request.headers.get('X-Sync-Password');
        if (!password) {
            return errorResponse('Password required', 401);
        }

        const userHash = await hashPassword(password);
        const userFolder = `users/${userHash}`;

        try {
            // 保存済み一覧取得
            if (path === '/api/sync/list' && request.method === 'GET') {
                const list = await env.COLLAGE_BUCKET.list({ prefix: `${userFolder}/` });
                const saves = list.objects.map(obj => ({
                    name: obj.key.replace(`${userFolder}/`, '').replace('.zip', ''),
                    size: obj.size,
                    uploaded: obj.uploaded,
                }));
                return jsonResponse({ saves });
            }

            // アップロード
            if (path === '/api/sync/upload' && request.method === 'POST') {
                const formData = await request.formData();
                const file = formData.get('file');
                const name = formData.get('name');

                if (!file || !name) {
                    return errorResponse('File and name required');
                }

                const key = `${userFolder}/${name}.zip`;
                await env.COLLAGE_BUCKET.put(key, file.stream(), {
                    httpMetadata: { contentType: 'application/zip' },
                });

                return jsonResponse({ success: true, key });
            }

            // ダウンロード
            if (path === '/api/sync/download' && request.method === 'GET') {
                const name = url.searchParams.get('name');
                if (!name) {
                    return errorResponse('Name required');
                }

                const key = `${userFolder}/${name}.zip`;
                const object = await env.COLLAGE_BUCKET.get(key);

                if (!object) {
                    return errorResponse('Not found', 404);
                }

                return new Response(object.body, {
                    headers: {
                        'Content-Type': 'application/zip',
                        'Content-Disposition': `attachment; filename="${name}.zip"`,
                        ...corsHeaders,
                    },
                });
            }

            // 削除
            if (path === '/api/sync/delete' && request.method === 'DELETE') {
                const name = url.searchParams.get('name');
                if (!name) {
                    return errorResponse('Name required');
                }

                const key = `${userFolder}/${name}.zip`;
                await env.COLLAGE_BUCKET.delete(key);

                return jsonResponse({ success: true });
            }

            return errorResponse('Not found', 404);

        } catch (err) {
            console.error('API Error:', err);
            return errorResponse('Internal server error', 500);
        }
    },
};
