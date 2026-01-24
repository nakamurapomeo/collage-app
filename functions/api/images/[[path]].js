export async function onRequest(context) {
    const { request, env, params } = context;
    // path is array, e.g. ['collage-id', 'filename.jpg']
    const path = params.path;

    if (!path || path.length === 0) {
        return new Response('Not Found', { status: 404 });
    }

    // key = path joined by /
    const key = path.join('/');

    // Get from R2
    const object = await env.COLLAGE_BUCKET.get(key);

    if (!object) {
        return new Response('Not Found', { status: 404 });
    }

    // Return object
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Cache for a long time since images are immutable-ish (timestamped names)
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(object.body, {
        headers,
    });
}
