// List text channels for a guild. Proxies to BACKEND_API_URL when set; otherwise returns empty list.

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
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid guild_id required', channels: [] }) };
    }

    const backend = process.env.BACKEND_API_URL || process.env.BOT_API_URL;
    if (backend) {
        try {
            const url = `${backend.replace(/\/$/, '')}/channels?guild_id=${encodeURIComponent(guildId)}`;
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
            if (res.ok) {
                const data = await res.json();
                return { statusCode: 200, headers, body: JSON.stringify(data) };
            }
        } catch (e) {
            console.error('Channels proxy error:', e.message);
        }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ channels: [], guild_id: guildId }) };
};
