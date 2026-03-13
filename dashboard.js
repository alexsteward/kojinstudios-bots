// Dashboard — KojinStudios Bots
// Handles Discord OAuth login state, server list, and server detail with status

const STORAGE_USER = 'kojin_dashboard_user';
const STORAGE_GUILDS = 'kojin_dashboard_guilds';
const BASE_URL = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://bots.kojinstudios.com';

document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initMobileMenu();
    const user = getStoredUser();
    const guilds = getStoredGuilds();

    if (user && guilds) {
        showDashboard(user, guilds);
    } else {
        showLogin();
    }

    document.getElementById('dashboard-login-btn')?.addEventListener('click', redirectToDiscordLogin);
    document.getElementById('dashboard-logout')?.addEventListener('click', logout);
    document.getElementById('dashboard-back-to-servers')?.addEventListener('click', backToServerList);
    document.querySelectorAll('.dashboard-buy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const bot = e.currentTarget.getAttribute('data-bot');
            if (bot && selectedGuildId) {
                e.preventDefault();
                window.location.href = `${BASE_URL}/index.html?buy=${encodeURIComponent(bot)}&guild_id=${encodeURIComponent(selectedGuildId)}`;
            }
        });
    });
});

let selectedGuildId = null;
let selectedGuild = null;

function getStoredUser() {
    try {
        const raw = sessionStorage.getItem(STORAGE_USER);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function getStoredGuilds() {
    try {
        const raw = sessionStorage.getItem(STORAGE_GUILDS);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function showLogin() {
    document.getElementById('dashboard-login').style.display = 'block';
    document.getElementById('dashboard-content').style.display = 'none';
}

function showDashboard(user, guilds) {
    document.getElementById('dashboard-login').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'block';

    const usernameEl = document.getElementById('dashboard-username');
    const avatarEl = document.getElementById('dashboard-user-avatar');
    if (usernameEl) {
        const name = user.username + (user.discriminator && user.discriminator !== '0' ? '#' + user.discriminator : '');
        usernameEl.textContent = name;
    }
    if (avatarEl) {
        if (user.avatar) {
            avatarEl.src = user.avatar;
            avatarEl.alt = user.username;
            avatarEl.style.display = 'block';
        }
    }

    const listEl = document.getElementById('dashboard-guild-list');
    if (listEl) {
        const allGuilds = Array.isArray(guilds.guildsWithBot) ? guilds.guildsWithBot : (guilds.guilds || []);
        const other = Array.isArray(guilds.otherGuilds) ? guilds.otherGuilds : [];
        if (allGuilds.length === 0 && other.length === 0) {
            listEl.innerHTML = '<p class="dashboard-no-servers">No servers found. Make sure you have "Manage Server" in at least one server.</p>';
        } else {
            listEl.innerHTML = '';
            if (allGuilds.length > 0) {
                allGuilds.forEach(g => listEl.appendChild(createGuildCard(g, true)));
            }
            if (other.length > 0) {
                other.forEach(g => listEl.appendChild(createGuildCard(g, false)));
            }
        }
    }
}

function createGuildCard(guild, hasBot) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'dashboard-guild-card dashboard-guild-card-clickable';
    card.innerHTML = `
        <div class="dashboard-guild-icon">${guild.icon ? `<img src="${escapeAttr(guild.icon)}" alt="">` : '<span class="dashboard-guild-initial">' + (guild.name.charAt(0) || '?') + '</span>'}</div>
        <div class="dashboard-guild-info">
            <strong>${escapeHtml(guild.name)}</strong>
            <span class="dashboard-guild-badge ${hasBot ? 'has-bot' : ''}">${hasBot ? 'Bot in server' : 'No bot'}</span>
        </div>
        <span class="dashboard-guild-chevron" aria-hidden="true">&rarr;</span>
    `;
    card.addEventListener('click', () => openServerDetail(guild));
    return card;
}

function openServerDetail(guild) {
    selectedGuildId = guild.id;
    selectedGuild = guild;
    document.getElementById('dashboard-servers-card').style.display = 'none';
    const detail = document.getElementById('dashboard-server-detail');
    detail.style.display = 'block';

    const nameEl = document.getElementById('detail-server-name');
    const idEl = document.getElementById('detail-server-id');
    const iconEl = document.getElementById('detail-server-icon');
    const initialEl = document.getElementById('detail-server-initial');

    nameEl.textContent = guild.name;
    idEl.textContent = `Server ID: ${guild.id}`;
    if (guild.icon) {
        iconEl.src = guild.icon;
        iconEl.alt = guild.name;
        iconEl.style.display = 'block';
        initialEl.style.display = 'none';
    } else {
        initialEl.textContent = (guild.name || '?').charAt(0).toUpperCase();
        initialEl.style.display = 'flex';
        iconEl.style.display = 'none';
    }

    document.getElementById('detail-content').style.display = 'none';
    document.getElementById('detail-loading').style.display = 'flex';
    fetchServerStatus(guild.id);
}

function backToServerList() {
    selectedGuildId = null;
    selectedGuild = null;
    document.getElementById('dashboard-server-detail').style.display = 'none';
    document.getElementById('dashboard-servers-card').style.display = 'block';
}

async function fetchServerStatus(guildId) {
    const loadingEl = document.getElementById('detail-loading');
    const contentEl = document.getElementById('detail-content');

    try {
        const res = await fetch(`/.netlify/functions/server-status?guild_id=${encodeURIComponent(guildId)}`);
        const data = await res.json();
        renderServerStatus(data);
    } catch (e) {
        console.error(e);
        renderServerStatus({ error: 'Could not load status', gavel: false, tickets: false, host: false, intella: false, subscription: null });
    }

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
}

function renderServerStatus(data) {
    const bots = [
        { key: 'gavel', name: 'Gavel', label: 'Moderation' },
        { key: 'tickets', name: 'Tickets', label: 'Support' },
        { key: 'host', name: 'Host', label: 'Engagement' },
        { key: 'intella', name: 'Intella', label: 'Trading' },
    ];
    const grid = document.getElementById('detail-bot-grid');
    grid.innerHTML = bots.map(b => {
        const inServer = data[b.key] === true;
        return `
            <div class="dashboard-bot-item ${inServer ? 'in-server' : ''}">
                <span class="dashboard-bot-status" aria-label="${b.name}: ${inServer ? 'In server' : 'Not in server'}">${inServer ? '✓' : '—'}</span>
                <div>
                    <strong>${escapeHtml(b.name)}</strong>
                    <span class="dashboard-bot-label">${escapeHtml(b.label)}</span>
                </div>
            </div>
        `;
    }).join('');

    const subEl = document.getElementById('detail-subscription');
    const sub = data.subscription;
    if (sub === 'premium') {
        subEl.innerHTML = '<span class="dashboard-subscription-badge premium">Premium</span> Full access to all bots in this server.';
    } else if (sub === 'free') {
        subEl.innerHTML = '<span class="dashboard-subscription-badge free">Free</span> Upgrade for unlimited panels and premium features.';
    } else {
        subEl.innerHTML = '<span class="dashboard-subscription-badge none">No subscription</span> Add a bot and complete checkout to activate.';
    }

    const detailEl = document.getElementById('dashboard-server-detail');
    if (detailEl) {
        detailEl.querySelectorAll('.dashboard-buy-btn[data-bot]').forEach(btn => {
            const bot = btn.getAttribute('data-bot');
            const href = `${BASE_URL}/index.html?buy=${encodeURIComponent(bot)}&guild_id=${encodeURIComponent(selectedGuildId)}`;
            if (btn.tagName.toLowerCase() === 'a') btn.setAttribute('href', href);
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function redirectToDiscordLogin() {
    try {
        const base = window.location.origin;
        const url = `${base}/.netlify/functions/discord-oauth?from_dashboard=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.authUrl) {
            window.location.href = data.authUrl;
        } else {
            alert(data.error || 'Login not available. Try again later.');
        }
    } catch (e) {
        console.error(e);
        alert('Could not start login. Try again later.');
    }
}

function logout() {
    sessionStorage.removeItem(STORAGE_USER);
    sessionStorage.removeItem(STORAGE_GUILDS);
    window.location.reload();
}

function initNav() {
    const nav = document.getElementById('navbar');
    if (!nav) return;
    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 50);
    });
}

function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const menu = document.getElementById('mobile-menu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => menu.classList.toggle('open'));
        menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.remove('open')));
    }
}

// Expose for index.html callback: store dashboard data and redirect here
window.kojinDashboardStoreAndRedirect = function(user, guilds) {
    try {
        if (user) sessionStorage.setItem(STORAGE_USER, JSON.stringify(user));
        if (guilds) sessionStorage.setItem(STORAGE_GUILDS, JSON.stringify(guilds));
        window.location.replace(window.location.origin + '/dashboard.html');
    } catch (e) {
        console.error(e);
    }
};
