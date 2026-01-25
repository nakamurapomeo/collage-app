const BASE_URL = '/api';

const handleResponse = async (res) => {
    if (res.ok) {
        const data = await res.json().catch(() => null);
        return { data, error: null };
    }
    const errorData = await res.json().catch(() => ({ error: 'Unknown API error' }));
    return { data: null, error: errorData.error || 'Request failed' };
};

export const apiClient = {
    auth: {
        login: async (password) => {
            try {
                const res = await fetch(`${BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                return handleResponse(res);
            } catch (e) {
                return { data: null, error: 'Connection error' };
            }
        },
        check: async () => {
            try {
                const res = await fetch(`${BASE_URL}/auth/check`);
                if (res.ok) return res.json();
                return { loggedIn: false };
            } catch (e) {
                return { loggedIn: false };
            }
        }
    },

    collages: {
        list: async () => {
            try {
                const res = await fetch(`${BASE_URL}/collages?t=${Date.now()}`);
                return handleResponse(res);
            } catch (e) {
                return { data: null, error: 'Connection error' };
            }
        },
        get: async (id) => {
            try {
                const res = await fetch(`${BASE_URL}/collages/${id}?t=${Date.now()}`);
                return handleResponse(res);
            } catch (e) {
                return { data: null, error: 'Connection error' };
            }
        },
        save: async (id, name, items) => {
            try {
                const res = await fetch(`${BASE_URL}/collages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, name, items })
                });
                return handleResponse(res);
            } catch (e) {
                return { data: null, error: 'Connection error' };
            }
        },
        delete: async (id) => {
            try {
                const res = await fetch(`${BASE_URL}/collages/${id}`, { method: 'DELETE' });
                if (res.ok) return { data: true, error: null };
                return { data: null, error: 'Delete failed' };
            } catch (e) {
                return { data: null, error: 'Connection error' };
            }
        }
    },

    storage: {
        upload: async (file, path) => {
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('path', path);

                const res = await fetch(`${BASE_URL}/upload`, {
                    method: 'POST',
                    body: formData
                });

                if (res.ok) {
                    const json = await res.json();
                    return { data: json.publicUrl, error: null };
                }
                return { data: null, error: 'Upload failed' };
            } catch (e) {
                return { data: null, error: 'Connection error' };
            }
        }
    }
}
