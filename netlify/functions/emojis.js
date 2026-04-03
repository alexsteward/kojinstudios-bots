// Guild custom emojis for dashboard emoji picker. Proxies GET /emojis on the bot API.

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const guildId = event.queryStringParameters?.guild_id;
    if (!guildId || !/^\d{17,19}$/.test(String(guildId))) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid guild_id required', emojis: [] }) };
    }

    const backend = process.env.DASHBOARD_BACKEND_URL || process.env.BACKEND_API_URL || process.env.BOT_API_URL;
    if (!backend) {
        return { statusCode: 200, headers, body: JSON.stringify({ emojis: [], guild_id: guildId }) };
    }

    try {
        const url = `${backend.replace(/\/$/, '')}/emojis?guild_id=${encodeURIComponent(guildId)}`;
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
        });
        if (res.ok) {
            const data = await res.json();
            return { statusCode: 200, headers, body: JSON.stringify(data) };
        }
    } catch (e) {
        console.error('Emojis proxy error:', e.message);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ emojis: [], guild_id: guildId }) };
};
