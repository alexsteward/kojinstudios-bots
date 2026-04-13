// List/create/update/delete ticket panels. Proxies to BACKEND_API_URL when set; otherwise returns mock.

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

function mockPanels(guildId) {
    return { panels: [], guild_id: guildId };
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' }, body: '' };
    }

    const guildId = event.queryStringParameters?.guild_id;
    if (!guildId || !/^\d{17,19}$/.test(String(guildId))) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid guild_id required' }) };
    }

    const backend = process.env.DASHBOARD_BACKEND_URL || process.env.BACKEND_API_URL || process.env.BOT_API_URL;
    const path = (event.path || '').replace(/\.netlify\/functions\/panels/, '');
    const isList = event.httpMethod === 'GET' && !event.path.match(/\/panels\/[^/]+/);

    const passthrough = {};
    for (const [k, v] of Object.entries(event.headers || {})) {
        if (!k) continue;
        const key = String(k).toLowerCase();
        if (key.startsWith('x-kojin-')) passthrough[key] = v;
    }

    const fetchOpts = (method, body) => {
        const opts = { method, headers: { 'Content-Type': 'application/json', ...passthrough } };
        if (body) opts.body = body;
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 15000);
        opts.signal = ctrl.signal;
        return opts;
    };
    if (backend && event.httpMethod === 'GET' && isList) {
        try {
            const url = `${backend.replace(/\/$/, '')}/panels?guild_id=${encodeURIComponent(guildId)}`;
            const res = await fetch(url, fetchOpts('GET'));
            if (res.ok) {
                const data = await res.json();
                return { statusCode: 200, headers, body: JSON.stringify(data) };
            }
        } catch (e) {
            console.error('Panels proxy error:', e.message);
        }
    }

    if (event.httpMethod === 'POST') {
        if (!backend) {
            return { statusCode: 503, headers, body: JSON.stringify({ error: 'Panel API not configured. Set DASHBOARD_BACKEND_URL (or BACKEND_API_URL) and implement POST /panels.' }) };
        }
        try {
            const body = typeof event.body === 'string' ? event.body : '{}';
            const url = `${backend.replace(/\/$/, '')}/panels?guild_id=${encodeURIComponent(guildId)}`;
            const res = await fetch(url, fetchOpts('POST', JSON.stringify({ guild_id: guildId, ...JSON.parse(body) })));
            const data = await res.json().catch(() => ({}));
            return { statusCode: res.status || 200, headers, body: JSON.stringify(data) };
        } catch (e) {
            console.error('Panels create proxy error:', e.message);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Backend unavailable. Is the bot server running? Use http or https in DASHBOARD_BACKEND_URL.' }) };
        }
    }

    if (event.httpMethod === 'PATCH' || event.httpMethod === 'DELETE') {
        const panelId = event.queryStringParameters?.panel_id || event.path?.match(/\/panels\/(\d+)/)?.[1];
        if (!panelId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'panel_id required' }) };
        }
        if (!backend) {
            return { statusCode: 503, headers, body: JSON.stringify({ error: 'Panel API not configured. Set DASHBOARD_BACKEND_URL (or BACKEND_API_URL).' }) };
        }
        try {
            const url = `${backend.replace(/\/$/, '')}/panels/${panelId}?guild_id=${encodeURIComponent(guildId)}`;
            const res = await fetch(url, fetchOpts(event.httpMethod, event.httpMethod === 'PATCH' && event.body ? event.body : undefined));
            const data = await res.json().catch(() => ({}));
            return { statusCode: res.status || 200, headers, body: JSON.stringify(data) };
        } catch (e) {
            console.error('Panels update/delete proxy error:', e.message);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Backend unavailable.' }) };
        }
    }

    return { statusCode: 200, headers, body: JSON.stringify(mockPanels(guildId)) };
};
