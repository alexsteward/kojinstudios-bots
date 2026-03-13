// netlify/functions/server-status.js
// Returns which KojinStudios bots are in a server and subscription status.
// Without BACKEND_API_URL this returns mock data. Set BACKEND_API_URL to your API
// that implements the contract in BACKEND.md.

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

function mockStatus() {
    return {
        guild_id: null,
        gavel: false,
        tickets: false,
        host: false,
        intella: false,
        subscription: null, // 'free' | 'premium' | null
        error: null,
    };
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' };
    }

    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let guildId = event.queryStringParameters?.guild_id || null;
    if (event.httpMethod === 'POST' && event.body) {
        try {
            const body = JSON.parse(event.body);
            guildId = guildId || body.guild_id;
        } catch (e) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        }
    }

    if (!guildId || !/^\d{17,19}$/.test(String(guildId))) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Valid guild_id (17–19 digits) is required', ...mockStatus() }),
        };
    }

    const backendUrl = process.env.BACKEND_API_URL || process.env.BOT_API_URL;
    if (backendUrl) {
        try {
            const url = `${backendUrl.replace(/\/$/, '')}/server-status?guild_id=${encodeURIComponent(guildId)}`;
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (res.ok) {
                const data = await res.json();
                return { statusCode: 200, headers, body: JSON.stringify({ guild_id: guildId, ...data }) };
            }
        } catch (e) {
            console.error('Backend server-status error:', e.message);
        }
    }

    // No backend or backend failed: return mock so the dashboard still works
    const mock = mockStatus();
    mock.guild_id = guildId;
    return { statusCode: 200, headers, body: JSON.stringify(mock) };
};
