// Dashboard — KojinStudios Bots
// Handles Discord OAuth login state and server list

const STORAGE_USER = 'kojin_dashboard_user';
const STORAGE_GUILDS = 'kojin_dashboard_guilds';

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
});

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
    const card = document.createElement('div');
    card.className = 'dashboard-guild-card';
    card.innerHTML = `
        <div class="dashboard-guild-icon">${guild.icon ? `<img src="${escapeAttr(guild.icon)}" alt="">` : '<span class="dashboard-guild-initial">' + (guild.name.charAt(0) || '?') + '</span>'}</div>
        <div class="dashboard-guild-info">
            <strong>${escapeHtml(guild.name)}</strong>
            <span class="dashboard-guild-badge ${hasBot ? 'has-bot' : ''}">${hasBot ? 'Bot in server' : 'No bot'}</span>
        </div>
    `;
    return card;
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
