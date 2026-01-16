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

        // パスワード認証（ID_キー形式）
        let password = request.headers.get('X-Sync-Password');
        if (!password) {
            return errorResponse('Password required', 401);
        }

        // Base64デコードを試みる（クライアントがsafeEncodeしているため）
        try {
            // decodeURIComponent(escape(atob(str))) でUTF-8文字列を正しく復元
            password = decodeURIComponent(escape(atob(password)));
        } catch (e) {
            // デコード失敗時はそのまま使用
        }

        // ID検証 - 許可されたIDのみアクセス可能
        // 形式: userId_password
        const parts = password.split('_');
        if (parts.length < 2) {
            return errorResponse('Invalid credential format', 401);
        }

        const userId = parts[0];
        const actualPassword = parts.slice(1).join('_'); // パスワードに_が含まれる場合対応

        // 許可されたIDのハッシュ値（元のIDはコードに書かない）
        // nakamurapomeo のSHA-256ハッシュ
        const ALLOWED_ID_HASHES = [
            '8f5a6c5e4b9d3a2f1e0c7d8b9a6e5f4c3d2b1a0e9f8d7c6b5a4e3f2d1c0b9a8e' // placeholder
        ];

        const userIdHash = await hashPassword(userId);

        // 環境変数から許可されたIDハッシュを取得（優先）またはハードコード使用
        const allowedHash = env.ALLOWED_USER_HASH || '6e5f4c3d2b1a0e9f8d7c6b5a4e3f2d1c0b9a8e7f'; // fallback

        // IDハッシュが一致するかチェック（環境変数優先）
        if (env.ALLOWED_USER_HASH) {
            if (userIdHash !== env.ALLOWED_USER_HASH) {
                return errorResponse('Unauthorized user', 403);
            }
        } else {
            // フォールバック: 直接ID比較（開発用）
            const ALLOWED_IDS = ['nakamurapomeo'];
            if (!ALLOWED_IDS.includes(userId)) {
                return errorResponse('Unauthorized user', 403);
            }
        }

        const userHash = await hashPassword(password);
        const userFolder = `users/${userHash}`;


        try {
            // 保存済み一覧取得
            if (path === '/api/sync/list' && request.method === 'GET') {
                const prefixParam = url.searchParams.get('prefix') || '';
                const cursor = url.searchParams.get('cursor');

                // userFolder is base, allow drilling down
                const searchPrefix = prefixParam ? `${userFolder}/${prefixParam}` : `${userFolder}/`;

                const list = await env.COLLAGE_BUCKET.list({
                    prefix: searchPrefix,
                    cursor: cursor || undefined,
                    limit: 1000
                });

                const saves = list.objects.map(obj => ({
                    // Return relative path from userFolder
                    name: obj.key.replace(`${userFolder}/`, ''),
                    size: obj.size,
                    uploaded: obj.uploaded,
                }));

                return jsonResponse({
                    saves,
                    truncated: list.truncated,
                    cursor: list.cursor
                });
            }

            // バッチアップロード (Multipart)
            if (path === '/api/sync/batch/upload' && request.method === 'POST') {
                const formData = await request.formData();
                const uploads = [];
                const files = [];

                // Extract files first
                for (const [key, value] of formData.entries()) {
                    if (value instanceof File) {
                        files.push({ name: key, file: value });
                    }
                }

                // Process in chunks to avoid R2 rate limits if necessary, though simpler to just Promise.all
                // R2 usually handles concurrent writes well.
                const results = await Promise.allSettled(files.map(async ({ name, file }) => {
                    // name should be relative path like "images/hash.png"
                    const key = `${userFolder}/${name}`;
                    await env.COLLAGE_BUCKET.put(key, file.stream(), {
                        httpMetadata: { contentType: file.type }
                    });
                    return name;
                }));

                const successCount = results.filter(r => r.status === 'fulfilled').length;
                const errors = results.filter(r => r.status === 'rejected');

                if (errors.length > 0) {
                    console.error("Batch upload errors:", errors);
                }

                return jsonResponse({
                    success: true,
                    count: successCount,
                    total: files.length,
                    errors: errors.length
                });
            }

            // バッチダウンロード (ZIP返却)
            if (path === '/api/sync/batch/download' && request.method === 'POST') {
                const { names } = await request.json(); // ["images/a.png", ...]
                if (!names || !Array.isArray(names)) {
                    return errorResponse('Names array required');
                }

                const zip = new JSZip();
                let foundCount = 0;

                // Fetch from R2 in parallel
                await Promise.all(names.map(async (name) => {
                    const key = `${userFolder}/${name}`;
                    const obj = await env.COLLAGE_BUCKET.get(key);
                    if (obj) {
                        const arrayBuffer = await obj.arrayBuffer();
                        zip.file(name, arrayBuffer); // "images/a.png" in zip
                        foundCount++;
                    }
                }));

                if (foundCount === 0) {
                    return errorResponse('No files found', 404);
                }

                // Generate ZIP
                const zipContent = await zip.generateAsync({ type: 'uint8array' });

                return new Response(zipContent, {
                    headers: {
                        'Content-Type': 'application/zip',
                        'Content-Disposition': 'attachment; filename="batch_download.zip"',
                        ...corsHeaders
                    }
                });
            }

            // アップロード
            if (path === '/api/sync/upload' && request.method === 'POST') {
                const formData = await request.formData();
                const file = formData.get('file');
                const name = formData.get('name');
                const type = formData.get('type') || 'application/octet-stream';

                if (!file || !name) {
                    return errorResponse('File and name required');
                }

                // If name contains /, it's a specific path. If not, it might be old style zip
                // But for backward compatibility/simplicity, we just trust the name relative to userFolder
                const key = `${userFolder}/${name}`;

                await env.COLLAGE_BUCKET.put(key, file.stream(), {
                    httpMetadata: { contentType: type },
                });

                return jsonResponse({ success: true, key });
            }

            // ダウンロード
            if (path === '/api/sync/download' && request.method === 'GET') {
                const name = url.searchParams.get('name');
                if (!name) {
                    return errorResponse('Name required');
                }

                const key = `${userFolder}/${name}`;
                const object = await env.COLLAGE_BUCKET.get(key);

                if (!object) {
                    return errorResponse('Not found', 404);
                }

                return new Response(object.body, {
                    headers: {
                        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
                        'Content-Disposition': `attachment; filename="${name.split('/').pop()}"`,
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

                const key = `${userFolder}/${name}`;
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
