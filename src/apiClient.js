/**
 * API Client replacement for Supabase
 */

const BASE_URL = '/api';

export const apiClient = {
    auth: {
        login: async (password) => {
            const res = await fetch(`${BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            if (res.ok) return { data: await res.json(), error: null };
            return { data: null, error: await res.json() };
        },
        check: async () => {
            const res = await fetch(`${BASE_URL}/auth/check`);
            if (res.ok) return res.json();
            return { loggedIn: false };
        }
    },

    collages: {
        list: async () => {
            const res = await fetch(`${BASE_URL}/collages`);
            if (res.ok) return { data: await res.json(), error: null };
            return { data: null, error: 'Failed to fetch' };
        },
        get: async (id) => {
            const res = await fetch(`${BASE_URL}/collages/${id}`);
            if (res.ok) return { data: await res.json(), error: null };
            return { data: null, error: 'Failed to fetch' };
        },
        save: async (id, name, items) => {
            const res = await fetch(`${BASE_URL}/collages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name, items })
            });
            if (res.ok) return { data: await res.json(), error: null };
            return { data: null, error: 'Failed to save' };
        },
        delete: async (id) => {
            const res = await fetch(`${BASE_URL}/collages/${id}`, { method: 'DELETE' });
            return res.ok;
        }
    },

    storage: {
        upload: async (file, path) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', path);

            const res = await fetch(`${BASE_URL}/upload`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const json = await res.json();
                return json.publicUrl;
            }
            return null;
        }
    }
}
