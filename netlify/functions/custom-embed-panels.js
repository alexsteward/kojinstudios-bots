// Custom rich embed messages (no buttons). Proxies bot API /custom-embed-panels.

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

function passthroughKojinHeaders(event) {
    const out = {};
    for (const [k, v] of Object.entries(event.headers || {})) {
        if (!k) continue;
        const key = String(k).toLowerCase();
        if (key.startsWith('x-kojin-')) out[key] = v;
    }
    return out;
}

/** Netlify may send base64-encoded bodies; always return a UTF-8 string for JSON.parse */
function decodeEventBody(event) {
    if (event.body == null || event.body === '') return '{}';
    let raw = typeof event.body === 'string' ? event.body : '{}';
    if (event.isBase64Encoded) {
        raw = Buffer.from(raw, 'base64').toString('utf8');
    }
    return raw;
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
    const fetchOpts = (method, body) => {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json', ...passthroughKojinHeaders(event) },
        };
        if (body) opts.body = body;
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 20000);
        opts.signal = ctrl.signal;
        return opts;
    };

    if (!backend) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Panel API not configured.' }) };
    }

    const base = backend.replace(/\/$/, '');

    if (event.httpMethod === 'GET') {
        try {
            const url = `${base}/custom-embed-panels?guild_id=${encodeURIComponent(guildId)}`;
            const res = await fetch(url, fetchOpts('GET'));
            const data = await res.json().catch(() => ({}));
            return { statusCode: res.status || 200, headers, body: JSON.stringify(data) };
        } catch (e) {
            console.error('custom-embed-panels GET:', e.message);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Backend unavailable.' }) };
        }
    }

    if (event.httpMethod === 'POST') {
        let parsed = {};
        try {
            parsed = JSON.parse(decodeEventBody(event));
        } catch (e) {
            console.error('custom-embed-panels POST JSON:', e.message);
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        }
        try {
            const url = `${base}/custom-embed-panels?guild_id=${encodeURIComponent(guildId)}`;
            const merged = { guild_id: guildId, ...parsed };
            const res = await fetch(url, fetchOpts('POST', JSON.stringify(merged)));
            const data = await res.json().catch(() => ({}));
            return { statusCode: res.status || 200, headers, body: JSON.stringify(data) };
        } catch (e) {
            console.error('custom-embed-panels POST:', e.message);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Backend unavailable.' }) };
        }
    }

    if (event.httpMethod === 'PATCH' || event.httpMethod === 'DELETE') {
        const panelId = event.queryStringParameters?.panel_id || event.path?.match(/\/custom-embed-panels\/(\d+)/)?.[1];
        if (!panelId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'panel_id required' }) };
        }
        try {
            const url = `${base}/custom-embed-panels/${panelId}?guild_id=${encodeURIComponent(guildId)}`;
            let patchBody;
            if (event.httpMethod === 'PATCH' && event.body) {
                try {
                    patchBody = decodeEventBody(event);
                    JSON.parse(patchBody);
                } catch (e) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
                }
            }
            const res = await fetch(url, fetchOpts(event.httpMethod, patchBody));
            const data = await res.json().catch(() => ({}));
            return { statusCode: res.status || 200, headers, body: JSON.stringify(data) };
        } catch (e) {
            console.error('custom-embed-panels PATCH/DELETE:', e.message);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Backend unavailable.' }) };
        }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
