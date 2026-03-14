// Generic proxy for all dashboard API endpoints.
// Routes: /config, /roles, /categories, /quick-responses, /analytics
// The specific endpoint is passed via ?endpoint= query param.

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

function fetchOpts(method, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = body;
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 15000);
    opts.signal = ctrl.signal;
    return opts;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' }, body: '' };
    }

    const backend = process.env.DASHBOARD_BACKEND_URL || process.env.BACKEND_API_URL || process.env.BOT_API_URL;
    if (!backend) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'DASHBOARD_BACKEND_URL not configured.' }) };
    }

    const endpoint = event.queryStringParameters?.endpoint;
    if (!endpoint) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'endpoint query param required (e.g. config, roles, analytics).' }) };
    }

    const allowed = ['config', 'roles', 'categories', 'quick-responses', 'analytics', 'panel-limits', 'app-panels', 'appeal-panels'];
    if (!allowed.includes(endpoint)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid endpoint. Allowed: ${allowed.join(', ')}` }) };
    }

    const params = new URLSearchParams(event.queryStringParameters || {});
    params.delete('endpoint');
    const qs = params.toString() ? `?${params.toString()}` : '';
    const url = `${backend.replace(/\/$/, '')}/${endpoint}${qs}`;

    try {
        const method = event.httpMethod;
        const body = (method === 'POST' || method === 'PATCH' || method === 'DELETE') && event.body ? event.body : undefined;
        const res = await fetch(url, fetchOpts(method, body));
        const data = await res.json().catch(() => ({}));
        return { statusCode: res.status || 200, headers, body: JSON.stringify(data) };
    } catch (e) {
        console.error(`Dashboard API proxy (${endpoint}):`, e.message);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Backend unavailable.' }) };
    }
};
