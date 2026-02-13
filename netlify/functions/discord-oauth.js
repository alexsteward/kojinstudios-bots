// netlify/functions/discord-oauth.js
// KojinStudios Bots — Discord OAuth for server selection
// Filters to only servers where the bot is present

async function fetchWithTimeout(url, options = {}, timeout = 3000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

async function getBotGuilds(botClientId, botClientSecret) {
    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'bot' }),
        });

        if (!tokenResponse.ok) {
            const botToken = process.env.BOT_TOKEN;
            if (botToken) {
                const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
                    headers: { 'Authorization': `Bot ${botToken}` },
                });
                if (guildsResponse.ok) {
                    const guilds = await guildsResponse.json();
                    return guilds.map(g => g.id);
                }
            }
            return null;
        }

        const tokenData = await tokenResponse.json();
        const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        });

        if (guildsResponse.ok) {
            const guilds = await guildsResponse.json();
            return guilds.map(g => g.id);
        }
    } catch (error) {
        console.log('Could not get bot guilds:', error.message);
    }
    return null;
}

async function checkBotInServer(botApiUrl, botName, guildId, botClientId, botClientSecret) {
    if (botClientId && botClientSecret) {
        const botGuilds = await getBotGuilds(botClientId, botClientSecret);
        if (botGuilds && botGuilds.length > 0) {
            return botGuilds.includes(guildId);
        }
    }

    try {
        const checkUrl = `${botApiUrl}/check-server?guild_id=${guildId}&bot_name=${botName}`;
        const response = await fetchWithTimeout(checkUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } }, 3000);
        if (response.ok) {
            const data = await response.json();
            return data.exists === true || data.in_server === true || data.present === true;
        }
        return await checkBotInServerList(botApiUrl, botName, guildId);
    } catch (error) {
        console.log(`Could not check bot membership for ${guildId}:`, error.message);
        return false;
    }
}

async function checkBotInGuildViaAPI(botId, guildId, userAccessToken) {
    try {
        if (!userAccessToken) return false;
        const memberResponse = await fetch(`https://discord.com/api/guilds/${guildId}/members/${botId}`, {
            headers: { 'Authorization': `Bearer ${userAccessToken}` },
        });
        if (memberResponse.ok) return true;
        if (memberResponse.status === 404) return false;
        return false;
    } catch (error) {
        return false;
    }
}

async function checkBotInServerList(botApiUrl, botName, guildId) {
    try {
        const response = await fetchWithTimeout(`${botApiUrl}/servers?bot_name=${botName}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        }, 3000);
        if (response.ok) {
            const data = await response.json();
            const serverIds = data.servers || data.guilds || [];
            return serverIds.includes(guildId) || serverIds.some(s => s.id === guildId || s.guild_id === guildId);
        }
    } catch (error) {
        console.log('Could not fetch bot server list:', error.message);
    }
    return false;
}

exports.handler = async (event, context) => {
    const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
    // Redirect URI must EXACTLY match one of the URLs in Discord Developer Portal → OAuth2 → Redirects (no trailing slash)
    const REDIRECT_URI = (process.env.DISCORD_REDIRECT_URI || event.headers.origin || 'https://bots.kojinstudios.com').replace(/\/$/, '');
    const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:5000/api';
    const BOT_CLIENT_ID = process.env.BOT_CLIENT_ID;
    const BOT_CLIENT_SECRET = process.env.BOT_CLIENT_SECRET;

    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Discord OAuth not configured.', authUrl: null }),
        };
    }

    // Handle OAuth callback
    if (event.httpMethod === 'GET' && event.queryStringParameters?.code) {
        const code = event.queryStringParameters.code;
        let botName = null;

        if (event.queryStringParameters?.state) {
            try {
                const state = JSON.parse(decodeURIComponent(event.queryStringParameters.state));
                botName = state.bot_name;
            } catch (e) {
                botName = event.queryStringParameters.state;
            }
        }
        botName = botName || event.queryStringParameters.bot_name;

        try {
            const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: DISCORD_CLIENT_ID,
                    client_secret: DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: REDIRECT_URI,
                }),
            });

            if (!tokenResponse.ok) throw new Error('Failed to exchange code for token');

            const tokenData = await tokenResponse.json();
            const accessToken = tokenData.access_token;

            const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });

            if (!guildsResponse.ok) throw new Error('Failed to fetch guilds');

            const guilds = await guildsResponse.json();
            const manageableGuilds = guilds.filter(guild => {
                const permissions = BigInt(guild.permissions);
                return (permissions & BigInt(0x20)) === BigInt(0x20);
            });

            let filteredGuilds = manageableGuilds;

            if (botName) {
                try {
                    const botIdMap = {
                        'gavel': process.env.BOT_GAVEL_ID,
                        'tickets': process.env.BOT_TICKETS_ID,
                        'kojinhost': process.env.BOT_HOST_ID,
                        'host': process.env.BOT_HOST_ID,
                        'bundle': null
                    };

                    if (botName === 'bundle') {
                        const bundleBotIds = [process.env.BOT_GAVEL_ID, process.env.BOT_TICKETS_ID, process.env.BOT_HOST_ID].filter(Boolean);
                        if (bundleBotIds.length > 0) {
                            const checked = await Promise.all(manageableGuilds.map(async (guild) => {
                                for (const botId of bundleBotIds) {
                                    if (await checkBotInGuildViaAPI(botId, guild.id, accessToken)) return guild;
                                }
                                return null;
                            }));
                            filteredGuilds = checked.filter(Boolean);
                        }
                    } else {
                        const botId = botIdMap[botName];
                        if (botId) {
                            const checked = await Promise.all(manageableGuilds.map(async (guild) => {
                                return (await checkBotInGuildViaAPI(botId, guild.id, accessToken)) ? guild : null;
                            }));
                            filteredGuilds = checked.filter(Boolean);
                        } else {
                            const checked = await Promise.all(manageableGuilds.map(async (guild) => {
                                return (await checkBotInServer(BOT_API_URL, botName, guild.id, BOT_CLIENT_ID, BOT_CLIENT_SECRET)) ? guild : null;
                            }));
                            filteredGuilds = checked.filter(Boolean);
                        }
                    }

                    if (filteredGuilds.length === 0) filteredGuilds = manageableGuilds;
                } catch (error) {
                    console.error('Bot check failed:', error.message);
                    filteredGuilds = manageableGuilds;
                }
            }

            const toGuild = (guild) => ({
                id: guild.id,
                name: guild.name,
                icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
            });
            const guildsWithBot = filteredGuilds.map(toGuild);
            const filteredIds = new Set(filteredGuilds.map(g => g.id));
            const otherGuilds = manageableGuilds.filter(g => !filteredIds.has(g.id)).map(toGuild);

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: true,
                    guilds: guildsWithBot,
                    guildsWithBot,
                    otherGuilds,
                }),
            };
        } catch (error) {
            console.error('Discord OAuth error:', error);
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: error.message }),
            };
        }
    }

    // Return OAuth URL
    if (event.httpMethod === 'GET' && !event.queryStringParameters?.code) {
        const botName = event.queryStringParameters?.bot_name;
        const scopes = 'identify guilds';

        let finalRedirectUri = REDIRECT_URI;
        try {
            new URL(finalRedirectUri);
        } catch (e) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Invalid redirect URI configuration' }),
            };
        }

        const state = botName ? encodeURIComponent(JSON.stringify({ bot_name: botName })) : '';
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(finalRedirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}${state ? `&state=${state}` : ''}`;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ authUrl }),
        };
    }

    return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Method not allowed' }),
    };
};
