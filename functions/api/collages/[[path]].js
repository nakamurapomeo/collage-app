export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(p => p);

    // /api/collages -> API to List
    // /api/collages/:id -> CRUD
    // pathParts[0] = 'api', [1] = 'collages', [2] = id?

    // But `functions/api/collages/[[path]].js` maps everything under /api/collages here.
    const path = context.params.path; // path is Array of segments relative to this file
    // If /api/collages -> path is undefined or empty
    // If /api/collages/123 -> path is ['123']

    if (request.method === 'GET') {
        if (!path || path.length === 0) {
            // List all collages (from KV list)
            // Note: KV list is eventual consistent.
            // We'll treat `collage_list` key as the index.
            const listVal = await env.COLLAGE_KV.get('collage_list', { type: 'json' });
            return new Response(JSON.stringify(listVal || []), { headers: { 'Content-Type': 'application/json' } });
        } else {
            // Get specific collage
            const id = path[0];
            const data = await env.COLLAGE_KV.get(`collage:${id}`, { type: 'json' });
            if (!data) return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
            return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
        }
    }

    if (request.method === 'POST') {
        const body = await request.json();
        const id = body.id || crypto.randomUUID();
        const now = new Date().toISOString();

        // Update basic info or full items
        // We'll store: { id, name, items: [...] }

        // 1. Get current list to update name/timestamp if needed
        let list = await env.COLLAGE_KV.get('collage_list', { type: 'json' }) || [];

        // Check if exists
        const existingIdx = list.findIndex(c => c.id === id);
        if (existingIdx >= 0) {
            // Update metadata
            if (body.name) list[existingIdx].name = body.name;
            list[existingIdx].updated_at = now;
        } else {
            // Create new
            list.push({ id, name: body.name || 'New Collage', created_at: now, updated_at: now });
        }

        await env.COLLAGE_KV.put('collage_list', JSON.stringify(list));

        // 2. Save Full Data (Items)
        // If body has items, save them. If not (just rename), we might need to fetch existing? 
        // Or client sends full object always? Client usually updates items separately in Supabase.
        // Here we can accept `items` in body.

        // If partial update (rename only), we need to fetch existing data to not lose items?
        // KV is key-value. 
        // Strategy: 
        // - `collage_list`: metadata only (lightweight)
        // - `collage:{id}`: full data (items + metadata)

        let fullData = await env.COLLAGE_KV.get(`collage:${id}`, { type: 'json' }) || { id, name: body.name, items: [] };
        if (body.name) fullData.name = body.name;
        if (body.items) fullData.items = body.items; // Full replace of items

        await env.COLLAGE_KV.put(`collage:${id}`, JSON.stringify(fullData));

        return new Response(JSON.stringify(fullData), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE') {
        if (!path || path.length === 0) return new Response('ID required', { status: 400 });
        const id = path[0];

        // Remove from list
        let list = await env.COLLAGE_KV.get('collage_list', { type: 'json' }) || [];
        list = list.filter(c => c.id !== id);
        await env.COLLAGE_KV.put('collage_list', JSON.stringify(list));

        // Remove data
        await env.COLLAGE_KV.delete(`collage:${id}`);

        return new Response('Deleted', { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
}
