export async function onRequestPost(context) {
    const { request, env } = context;

    // Check valid request
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
        return new Response('Content-Type must be multipart/form-data', { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const path = formData.get('path'); // e.g. "collage-id/filename.jpg"

    if (!file || !path) {
        return new Response('File and path required', { status: 400 });
    }

    // R2 Upload
    // env.COLLAGE_BUCKET must be bound
    await env.COLLAGE_BUCKET.put(path, file);

    // Return URL via our new Worker Proxy
    // We can use a relative URL since it's same origin
    const publicUrl = `/api/images/${path}`;

    return new Response(JSON.stringify({ publicUrl }), { headers: { 'Content-Type': 'application/json' } });
}
