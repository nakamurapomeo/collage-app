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

    // Construct Public URL
    // Option 1: R2 Public Bucket URL (configured in dash) -> env.R2_PUBLIC_URL 
    // Option 2: Serve via Worker (GET /api/images/...)
    // Let's assume Option 1 is easiest for performance, OR we return a relative URL if we serve it ourselves.
    // User plan: "R2 public bucket URL".
    // We'll create a variable for the base URL.

    const baseUrl = env.R2_PUBLIC_URL || '';
    // If not set, maybe we just return the path and frontend handles it? 
    // Or we assume a standard domain.
    // For now, let's assume valid R2_PUBLIC_URL in env.

    // If R2_PUBLIC_URL is hidden/private, we might need a GET handler?
    // Let's add a simple GET handler in a separate file if needed.
    // But for now, let's assume we can form the URL.

    const publicUrl = `${baseUrl}/${path}`;

    return new Response(JSON.stringify({ publicUrl }), { headers: { 'Content-Type': 'application/json' } });
}
