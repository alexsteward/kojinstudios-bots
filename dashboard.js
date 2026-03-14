// Dashboard — Tickets bot only, Discord-style layout

const STORAGE_USER = 'kojin_dashboard_user';
const STORAGE_GUILDS = 'kojin_dashboard_guilds';
const BASE_URL = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://bots.kojinstudios.com';

document.addEventListener('DOMContentLoaded', () => {
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

    const buyBtn = document.getElementById('detail-get-tickets-btn');
    if (buyBtn) buyBtn.addEventListener('click', (e) => { if (selectedGuildId) { e.preventDefault(); window.location.href = `${BASE_URL}/index.html?buy=tickets&guild_id=${encodeURIComponent(selectedGuildId)}`; } });
    document.getElementById('detail-create-panel-btn')?.addEventListener('click', () => openPanelEditor(null));
    document.getElementById('panel-editor-back')?.addEventListener('click', closePanelEditor);
    document.getElementById('panel-editor-cancel')?.addEventListener('click', closePanelEditor);
    document.getElementById('panel-add-category')?.addEventListener('click', addCategoryRow);
    document.getElementById('panel-editor-form')?.addEventListener('submit', submitPanelForm);
});

let selectedGuildId = null;
let selectedGuild = null;
let editingPanelId = null;
const DEFAULT_CATEGORY = { emoji: '🎫', name: 'General Support', description: 'General questions and support' };

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
    document.getElementById('dashboard-content').style.display = 'flex';

    const avatarEl = document.getElementById('dashboard-user-avatar');
    const initialEl = document.getElementById('dashboard-user-initial');
    if (avatarEl && user.avatar) {
        avatarEl.src = user.avatar;
        avatarEl.alt = user.username;
        avatarEl.style.display = 'block';
        if (initialEl) initialEl.style.display = 'none';
    } else if (initialEl) {
        initialEl.textContent = (user.username || '?').charAt(0).toUpperCase();
        initialEl.style.display = 'flex';
    }

    const allGuilds = Array.isArray(guilds.guildsWithBot) ? guilds.guildsWithBot : (guilds.guilds || []);
    const other = Array.isArray(guilds.otherGuilds) ? guilds.otherGuilds : [];
    const combined = [...allGuilds, ...other];
    const hasBotSet = new Set((allGuilds || []).map(g => g.id));

    const listEl = document.getElementById('dashboard-guild-list');
    const noServersEl = document.getElementById('discord-no-servers');
    if (combined.length === 0) {
        if (listEl) listEl.innerHTML = '';
        if (noServersEl) noServersEl.style.display = 'block';
    } else {
        if (noServersEl) noServersEl.style.display = 'none';
        if (listEl) {
            listEl.innerHTML = combined.map(g => {
                const hasBot = hasBotSet.has(g.id);
                const active = selectedGuildId === g.id ? ' active' : '';
                return `<button type="button" class="dashboard-guild-item${active}" data-guild-id="${escapeAttr(g.id)}" title="${escapeAttr(g.name)}">
                    ${g.icon ? `<img src="${escapeAttr(g.icon)}" alt="">` : `<span class="dashboard-guild-initial">${escapeHtml((g.name || '?').charAt(0))}</span>`}
                    <span class="dashboard-guild-name">${escapeHtml(g.name)}</span>
                    ${hasBot ? '<span class="dashboard-guild-badge">Tickets</span>' : ''}
                </button>`;
            }).join('');
            listEl.querySelectorAll('.dashboard-guild-item').forEach(btn => {
                const g = combined.find(x => x.id === btn.getAttribute('data-guild-id'));
                if (g) btn.addEventListener('click', () => selectServer(g));
            });
        }
    }
}

function selectServer(guild) {
    selectedGuildId = guild.id;
    selectedGuild = guild;
    document.getElementById('discord-welcome').style.display = 'none';
    const detail = document.getElementById('dashboard-server-detail');
    detail.style.display = 'block';

    const nameEl = document.getElementById('detail-server-name');
    const idEl = document.getElementById('detail-server-id');
    const iconEl = document.getElementById('detail-server-icon');
    const initialEl = document.getElementById('detail-server-initial');

    nameEl.textContent = guild.name;
    idEl.textContent = guild.id;
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

    document.querySelectorAll('.dashboard-guild-item').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-guild-id') === guild.id);
    });
}

function backToServerList() {
    selectedGuildId = null;
    selectedGuild = null;
    document.getElementById('discord-welcome').style.display = 'flex';
    document.getElementById('dashboard-server-detail').style.display = 'none';
    document.querySelectorAll('.dashboard-guild-item').forEach(btn => btn.classList.remove('active'));
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
        renderServerStatus({ tickets: false, subscription: null });
    }

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
}

function renderServerStatus(data) {
    const inServer = data.tickets === true;
    const statusEl = document.getElementById('detail-tickets-status');
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="discord-status-item ${inServer ? 'in-server' : ''}">
                <span class="discord-status-dot"></span>
                <span>${inServer ? 'Tickets is in this server' : 'Tickets is not in this server'}</span>
            </div>
        `;
    }

    const subEl = document.getElementById('detail-subscription');
    const sub = data.subscription;
    if (sub === 'premium') {
        subEl.innerHTML = '<span class="discord-sub-badge premium">Premium</span> Full access to Tickets in this server.';
    } else if (sub === 'free') {
        subEl.innerHTML = '<span class="discord-sub-badge free">Free</span> Upgrade for unlimited panels and premium features.';
    } else {
        subEl.innerHTML = '<span class="discord-sub-badge none">No subscription</span> Add Tickets and complete checkout to activate.';
    }

    const buyBtn = document.getElementById('detail-get-tickets-btn');
    if (buyBtn && selectedGuildId) {
        buyBtn.href = `${BASE_URL}/index.html?buy=tickets&guild_id=${encodeURIComponent(selectedGuildId)}`;
        buyBtn.textContent = inServer ? 'Manage subscription' : 'Get Tickets';
    }

    fetchPanels(selectedGuildId);
}

async function fetchPanels(guildId) {
    const loadingEl = document.getElementById('detail-panels-loading');
    const listEl = document.getElementById('detail-panels-list');
    if (!listEl) return;
    loadingEl.style.display = 'block';
    listEl.innerHTML = '';
    try {
        const res = await fetch(`/.netlify/functions/panels?guild_id=${encodeURIComponent(guildId)}`);
        const data = await res.json();
        const panels = data.panels || [];
        if (panels.length === 0) {
            listEl.innerHTML = '<li class="discord-panels-empty">No panels yet. Create one to post a ticket panel in a channel.</li>';
        } else {
            panels.forEach(p => {
                const li = document.createElement('li');
                li.className = 'discord-panels-item';
                const title = p.title || (typeof p.panel_data === 'string' ? (() => { try { const d = JSON.parse(p.panel_data); return d.title || 'Panel'; } catch { return 'Panel'; } })() : 'Panel');
                li.innerHTML = `
                    <span class="discord-panels-item-title">${escapeHtml(title)}</span>
                    <span class="discord-panels-item-meta">#${p.channel_id || '—'}</span>
                    <div class="discord-panels-item-actions">
                        <button type="button" class="discord-panels-btn discord-panels-edit" data-panel-id="${p.id}">Edit</button>
                    </div>
                `;
                li.querySelector('.discord-panels-edit').addEventListener('click', () => openPanelEditor(p));
                listEl.appendChild(li);
            });
        }
    } catch (e) {
        listEl.innerHTML = '<li class="discord-panels-empty">Could not load panels. Try again later.</li>';
    }
    loadingEl.style.display = 'none';
}

function openPanelEditor(panel) {
    editingPanelId = panel ? panel.id : null;
    document.getElementById('dashboard-server-detail').style.display = 'none';
    document.getElementById('dashboard-panel-editor').style.display = 'block';
    document.getElementById('panel-editor-title').textContent = panel ? 'Edit panel' : 'Create panel';
    document.getElementById('panel-editor-subtitle').textContent = panel ? 'Update and republish to Discord' : 'Configure and publish to Discord';
    document.getElementById('panel-editor-submit').textContent = panel ? 'Update in Discord' : 'Publish to Discord';

    document.getElementById('panel-title').value = panel ? (panel.title || '') : '';
    document.getElementById('panel-description').value = '';
    document.getElementById('panel-channel-id').value = '';
    const container = document.getElementById('panel-categories-container');
    container.innerHTML = '';

    if (panel && panel.panel_data) {
        try {
            const data = typeof panel.panel_data === 'string' ? JSON.parse(panel.panel_data) : panel.panel_data;
            if (data.description) document.getElementById('panel-description').value = data.description;
            if (panel.channel_id) document.getElementById('panel-channel-id').value = String(panel.channel_id);
            const cats = data.categories || [];
            if (cats.length) cats.forEach(c => addCategoryRow(c)); else addCategoryRow();
        } catch (_) {
            addCategoryRow();
            addCategoryRow();
        }
    } else {
        addCategoryRow(DEFAULT_CATEGORY);
        addCategoryRow({ emoji: '🔧', name: 'Technical Support', description: 'Technical issues and bugs' });
    }

    loadChannelsIntoSelect();
}

function closePanelEditor() {
    document.getElementById('dashboard-panel-editor').style.display = 'none';
    document.getElementById('dashboard-server-detail').style.display = 'block';
    editingPanelId = null;
}

async function loadChannelsIntoSelect() {
    const select = document.getElementById('panel-channel');
    select.innerHTML = '<option value="">Loading...</option>';
    if (!selectedGuildId) { select.innerHTML = '<option value="">Select a server first</option>'; return; }
    try {
        const res = await fetch(`/.netlify/functions/channels?guild_id=${encodeURIComponent(selectedGuildId)}`);
        const data = await res.json();
        const channels = data.channels || [];
        select.innerHTML = '<option value="">— Choose a channel —</option>' + channels.map(ch => `<option value="${escapeAttr(ch.id)}"># ${escapeHtml(ch.name || ch.id)}</option>`).join('');
    } catch (_) {
        select.innerHTML = '<option value="">Could not load channels (use Channel ID below)</option>';
    }
}

function addCategoryRow(cat) {
    const container = document.getElementById('panel-categories-container');
    const id = 'cat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const row = document.createElement('div');
    row.className = 'discord-category-row';
    row.dataset.id = id;
    row.innerHTML = `
        <input type="text" class="discord-cat-emoji" placeholder="🎫" value="${escapeAttr((cat && cat.emoji) || '')}" maxlength="10" aria-label="Emoji">
        <input type="text" class="discord-cat-name" placeholder="Category name" value="${escapeAttr((cat && cat.name) || '')}" required>
        <input type="text" class="discord-cat-desc" placeholder="Short description (optional)" value="${escapeAttr((cat && cat.description) || '')}">
        <button type="button" class="discord-cat-remove" aria-label="Remove category">&times;</button>
    `;
    row.querySelector('.discord-cat-remove').addEventListener('click', () => row.remove());
    container.appendChild(row);
}

function submitPanelForm(e) {
    e.preventDefault();
    const channelSelect = document.getElementById('panel-channel');
    const channelIdInput = document.getElementById('panel-channel-id').value.trim().replace(/\D/g, '');
    const channelId = channelSelect.value || channelIdInput;
    if (!channelId || channelId.length < 17) {
        alert('Please choose a channel or enter a valid Channel ID (17–19 digits).');
        return;
    }
    const title = document.getElementById('panel-title').value.trim();
    if (!title) {
        alert('Please enter a panel title.');
        return;
    }
    const description = document.getElementById('panel-description').value.trim();
    const rows = document.querySelectorAll('.discord-category-row');
    const categories = [];
    rows.forEach(r => {
        const name = r.querySelector('.discord-cat-name').value.trim();
        if (!name) return;
        categories.push({
            emoji: (r.querySelector('.discord-cat-emoji').value.trim()) || '🎫',
            name,
            description: (r.querySelector('.discord-cat-desc').value.trim()) || '',
            discord_category_id: null,
            ping_role_id: null,
            questions: [],
        });
    });
    if (categories.length === 0) {
        alert('Add at least one category (each becomes a button on the panel).');
        return;
    }
    const payload = { guild_id: selectedGuildId, channel_id: channelId, title, description, categories };
    const btn = document.getElementById('panel-editor-submit');
    btn.disabled = true;
    btn.textContent = 'Publishing...';
    const url = editingPanelId
        ? `/.netlify/functions/panels?guild_id=${encodeURIComponent(selectedGuildId)}&panel_id=${editingPanelId}`
        : `/.netlify/functions/panels?guild_id=${encodeURIComponent(selectedGuildId)}`;
    const method = editingPanelId ? 'PATCH' : 'POST';
    fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
        .then(res => res.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            closePanelEditor();
            fetchPanels(selectedGuildId);
        })
        .catch(err => {
            alert(err.message || 'Failed to save panel. Make sure the bot is in the server and the backend is configured.');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = editingPanelId ? 'Update in Discord' : 'Publish to Discord';
        });
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

function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const menu = document.getElementById('mobile-menu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => menu.classList.toggle('open'));
        menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.remove('open')));
    }
}

window.kojinDashboardStoreAndRedirect = function(user, guilds) {
    try {
        if (user) sessionStorage.setItem(STORAGE_USER, JSON.stringify(user));
        if (guilds) sessionStorage.setItem(STORAGE_GUILDS, JSON.stringify(guilds));
        window.location.replace(window.location.origin + '/dashboard.html');
    } catch (e) {
        console.error(e);
    }
};
