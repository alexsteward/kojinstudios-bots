// ─── Dashboard — Tickets bot web configuration ──────────────────────────────

const STORAGE_USER  = 'kojin_dashboard_user';
const STORAGE_GUILDS = 'kojin_dashboard_guilds';
const BASE = typeof window !== 'undefined' ? window.location.origin : '';

let selectedGuildId = null;
let selectedGuild   = null;
let editingPanelId  = null;
let cachedChannels  = [];
let cachedRoles     = [];

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initNavScroll();

    const user   = stored(STORAGE_USER);
    const guilds = stored(STORAGE_GUILDS);
    if (user && guilds) showDashboard(user, guilds);
    else showLogin();

    on('dashboard-login-btn',       'click', redirectToDiscordLogin);
    on('dashboard-logout',          'click', logout);
    on('dashboard-back-to-servers', 'click', backToServers);
    on('detail-create-panel-btn',   'click', () => openPanelEditor(null));
    on('panel-editor-close',        'click', closePanelEditor);
    on('panel-editor-cancel',       'click', closePanelEditor);
    on('panel-add-category',        'click', () => addCatRow());
    on('panel-editor-form',         'submit', submitPanel);
    on('cfg-save-btn',              'click', saveConfig);
    on('qr-add-btn',               'click', showQRForm);
    on('qr-save-btn',              'click', saveQR);
    on('qr-cancel-btn',            'click', hideQRForm);

    // Close panel editor on backdrop click
    const backdrop = document.querySelector('.dash-panel-editor-backdrop');
    if (backdrop) backdrop.addEventListener('click', closePanelEditor);

    // Tabs
    document.querySelectorAll('.dash-tab').forEach(t =>
        t.addEventListener('click', () => switchTab(t.dataset.tab))
    );

    // Analytics period buttons
    document.querySelectorAll('.dash-period-btn').forEach(b =>
        b.addEventListener('click', () => {
            document.querySelectorAll('.dash-period-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            fetchAnalytics(selectedGuildId, b.dataset.days);
        })
    );
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function on(id, evt, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
}
function $(id) { return document.getElementById(id); }
function stored(k) {
    try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : null; }
    catch { return null; }
}
function esc(t)  { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function escA(t) { return String(t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ─── Toast notifications ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
    const container = $('dash-toasts');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `dash-toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('removing');
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

// ─── Auth ────────────────────────────────────────────────────────────────────
function showLogin() {
    $('dashboard-login').style.display = 'block';
    $('dashboard-content').style.display = 'none';
}

function showDashboard(user, guilds) {
    $('dashboard-login').style.display = 'none';
    $('dashboard-content').style.display = 'block';
    const av  = $('dashboard-user-avatar');
    const ini = $('dashboard-user-initial');
    const nm  = $('dashboard-user-name');
    if (av && user.avatar) {
        av.src = user.avatar; av.style.display = 'block';
        if (ini) ini.style.display = 'none';
    } else if (ini) {
        ini.textContent = (user.username || '?')[0].toUpperCase();
        ini.style.display = 'flex';
    }
    if (nm) nm.textContent = user.username || '';
    renderGuildList(guilds);
}

function renderGuildList(guilds) {
    const withBot = Array.isArray(guilds.guildsWithBot) ? guilds.guildsWithBot : (guilds.guilds || []);
    const other   = Array.isArray(guilds.otherGuilds) ? guilds.otherGuilds : [];
    const all     = [...withBot, ...other];
    const botSet  = new Set(withBot.map(g => g.id));
    const list    = $('dashboard-guild-list');
    const noSrv   = $('discord-no-servers');

    if (!all.length) {
        if (list)  list.innerHTML = '';
        if (noSrv) noSrv.style.display = 'block';
        return;
    }
    if (noSrv) noSrv.style.display = 'none';
    if (!list) return;

    list.innerHTML = all.map(g => {
        const has = botSet.has(g.id);
        return `<button class="dash-guild-btn${selectedGuildId === g.id ? ' active' : ''}" data-id="${escA(g.id)}">
            ${g.icon ? `<img src="${escA(g.icon)}" alt="">` : `<span class="dash-guild-initial">${esc((g.name || '?')[0])}</span>`}
            <span class="dash-guild-name">${esc(g.name)}</span>
            ${has ? '<span class="dash-guild-badge">Tickets</span>' : ''}
        </button>`;
    }).join('');

    list.querySelectorAll('.dash-guild-btn').forEach(btn => {
        const g = all.find(x => x.id === btn.dataset.id);
        if (g) btn.addEventListener('click', () => selectServer(g));
    });
}

async function redirectToDiscordLogin() {
    const btn = $('dashboard-login-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Redirecting...'; }
    try {
        const res  = await fetch(`${BASE}/.netlify/functions/discord-oauth?from_dashboard=1`);
        const data = await res.json();
        if (data.authUrl) window.location.href = data.authUrl;
        else { toast(data.error || 'Login unavailable.', 'error'); if (btn) btn.disabled = false; }
    } catch {
        toast('Could not start login.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="24" height="18" viewBox="0 0 71 55" fill="currentColor"><path d="M60.1 4.9C55.6 2.8 50.7 1.3 45.7.4c-.1 0-.2 0-.2.1-.6 1.1-1.3 2.6-1.8 3.7-5.5-.8-10.9-.8-16.3 0-.5-1.2-1.2-2.6-1.8-3.7 0-.1-.1-.1-.2-.1-5.1.9-9.9 2.4-14.4 4.5 0 0 0 0-.1.1C1.6 18.7-.9 32.1.3 45.4v.2c6.1 4.5 12 7.2 17.7 9 .1 0 .2 0 .2-.1 1.4-1.9 2.6-3.8 3.6-5.9.1-.1 0-.3-.1-.3-2-.7-3.8-1.6-5.6-2.7-.1-.1-.1-.3 0-.4.4-.3.8-.6 1.1-.9.1-.1.1-.1.2-.1 10.9 5 22.7 5 33.5 0h.2c.4.3.7.6 1.1.9.1.1.1.3 0 .4-1.7 1-3.5 1.9-5.6 2.7-.1.1-.2.2-.1.3 1.1 2.1 2.3 4.1 3.6 5.9.1.1.2.1.2.1 5.8-1.8 11.6-4.5 17.7-9 0 0 .1-.1.1-.2 1.5-15.3-2.5-28.6-10.5-40.4 0 0 0 0-.1-.1zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.4 3.2 6.4 7.2 0 4-2.9 7.2-6.4 7.2zm17.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.4 3.2 6.4 7.2 0 4-2.9 7.2-6.4 7.2z"/></svg> Login with Discord'; }
    }
}

function logout() {
    sessionStorage.removeItem(STORAGE_USER);
    sessionStorage.removeItem(STORAGE_GUILDS);
    location.reload();
}

window.kojinDashboardStoreAndRedirect = function(user, guilds) {
    try {
        if (user)   sessionStorage.setItem(STORAGE_USER, JSON.stringify(user));
        if (guilds) sessionStorage.setItem(STORAGE_GUILDS, JSON.stringify(guilds));
        location.replace(BASE + '/dashboard.html');
    } catch {}
};

// ─── Server selection ────────────────────────────────────────────────────────
function selectServer(guild) {
    selectedGuildId = guild.id;
    selectedGuild   = guild;

    $('dash-welcome').style.display = 'none';
    $('dash-server').style.display  = 'block';

    $('detail-server-name').textContent = guild.name;
    $('detail-server-id').textContent   = `ID: ${guild.id}`;

    const icon = $('detail-server-icon');
    const ini  = $('detail-server-initial');
    if (guild.icon) {
        icon.src = guild.icon; icon.style.display = 'block'; ini.style.display = 'none';
    } else {
        ini.textContent = (guild.name || '?')[0].toUpperCase();
        ini.style.display = 'flex'; icon.style.display = 'none';
    }

    document.querySelectorAll('.dash-guild-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.id === guild.id)
    );

    // Close mobile sidebar after selection
    const sidebar = document.querySelector('.dash-sidebar');
    if (sidebar) sidebar.classList.remove('open');

    switchTab('overview');
    loadServerData();
}

function backToServers() {
    selectedGuildId = null;
    selectedGuild   = null;
    $('dash-welcome').style.display = 'flex';
    $('dash-server').style.display  = 'none';

    document.querySelectorAll('.dash-guild-btn').forEach(b => b.classList.remove('active'));
}

function switchTab(tab) {
    document.querySelectorAll('.dash-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === tab)
    );
    document.querySelectorAll('.dash-tab-content').forEach(c => {
        const isTarget = c.dataset.tab === tab;
        c.classList.toggle('active', isTarget);
        if (isTarget) {
            c.style.animation = 'none';
            c.offsetHeight; // force reflow
            c.style.animation = '';
        }
    });
}

// ─── Data loading ────────────────────────────────────────────────────────────
async function loadServerData() {
    $('dash-loading').style.display = 'flex';
    document.querySelectorAll('.dash-tab-content').forEach(c => {
        if (c.classList.contains('active')) c.style.opacity = '0.5';
    });
    try {
        const [status, config, channels, roles] = await Promise.allSettled([
            api('server-status', { guild_id: selectedGuildId }),
            apiDash('config', 'GET', { guild_id: selectedGuildId }),
            api('channels', { guild_id: selectedGuildId }),
            apiDash('roles', 'GET', { guild_id: selectedGuildId }),
        ]);

        const statusData  = status.status === 'fulfilled' ? status.value : {};
        const configData  = config.status === 'fulfilled' ? config.value : {};
        const channelData = channels.status === 'fulfilled' ? channels.value : {};
        const roleData    = roles.status === 'fulfilled' ? roles.value : {};

        cachedChannels = channelData.channels || [];
        cachedRoles    = roleData.roles || [];

        renderOverview(statusData);
        renderConfig(configData);
        fetchPanels();
        fetchQR();
        fetchAnalytics(selectedGuildId, 30);

        const failed = [status, config, channels, roles].filter(r => r.status === 'rejected');
        if (failed.length === 4) {
            toast('Could not reach the bot server. Check that the bot is running.', 'error');
        } else if (failed.length > 0) {
            toast(`Loaded with ${failed.length} warning(s) — some data may be incomplete.`, 'error');
        }
    } catch (e) {
        console.error(e);
        toast('Failed to load server data. Is the bot online?', 'error');
    }
    $('dash-loading').style.display = 'none';
    document.querySelectorAll('.dash-tab-content').forEach(c => c.style.opacity = '1');
}

async function api(endpoint, params) {
    const qs  = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE}/.netlify/functions/${endpoint}?${qs}`);
    return res.json();
}

async function apiDash(endpoint, method, params, body) {
    const p   = { endpoint, ...params };
    const qs  = new URLSearchParams(p).toString();
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}/.netlify/functions/dashboard-api?${qs}`, opts);
    return res.json();
}

// ─── Overview ────────────────────────────────────────────────────────────────
function renderOverview(data) {
    const inServer = data.tickets === true;
    $('overview-bot-status').innerHTML = inServer
        ? '<span class="dash-status-dot green"></span> Online'
        : '<span class="dash-status-dot red"></span> Not in server';

    const sub = data.subscription;
    $('overview-subscription').innerHTML = sub === 'premium'
        ? '<span class="dash-badge-sm premium">Premium</span>'
        : sub === 'free'
            ? '<span class="dash-badge-sm free">Free</span>'
            : '<span class="dash-badge-sm none">Unknown</span>';

    $('overview-ticket-count').textContent = typeof data.ticket_count === 'number' ? data.ticket_count.toLocaleString() : '—';
    $('overview-open-tickets').textContent = typeof data.open_tickets === 'number' ? data.open_tickets.toLocaleString() : '—';

    const members = $('overview-members');
    if (members) members.textContent = typeof data.member_count === 'number' ? data.member_count.toLocaleString() : '—';

    const name = $('overview-guild-name');
    if (name && data.guild_name) name.textContent = data.guild_name;

    const btn = $('detail-get-tickets-btn');
    if (btn && selectedGuildId) {
        btn.href = `${BASE}/index.html?buy=tickets&guild_id=${encodeURIComponent(selectedGuildId)}`;
        btn.innerHTML = inServer
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Manage subscription'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Get Tickets';
    }
}

// ─── Configuration ───────────────────────────────────────────────────────────
function renderConfig(cfg) {
    if (!cfg || !cfg.configured) {
        if (cfg && cfg.error) {
            toast('Config: ' + cfg.error, 'error');
        }
        return;
    }
    populateChannelSelect('cfg-log-channel', cachedChannels, cfg.log_channel_id);
    populateChannelSelect('cfg-app-log-channel', cachedChannels, cfg.application_log_channel_id);
    populateChannelSelect('cfg-appeal-log-channel', cachedChannels, cfg.appeal_log_channel_id);
    populateRoleSelect('cfg-staff-roles', cachedRoles, cfg.staff_role_ids || []);
    populateRoleSelect('cfg-admin-roles', cachedRoles, cfg.admin_role_ids || []);
    populateRoleSelect('cfg-support-roles', cachedRoles, cfg.support_role_ids || []);
    $('cfg-ping-support').checked = !!cfg.ping_support_on_ticket;
    $('cfg-emoji-style').value = cfg.emoji_style || 'heavy';

    if (!cachedChannels.length) {
        ['cfg-log-channel', 'cfg-app-log-channel', 'cfg-appeal-log-channel'].forEach(id => {
            const sel = $(id);
            if (sel) sel.innerHTML = '<option value="">Bot unreachable — channels unavailable</option>';
        });
    }
    if (!cachedRoles.length) {
        ['cfg-staff-roles', 'cfg-admin-roles', 'cfg-support-roles'].forEach(id => {
            const sel = $(id);
            if (sel) sel.innerHTML = '<option value="">Bot unreachable — roles unavailable</option>';
        });
    }
}

function populateChannelSelect(id, channels, selected) {
    const sel = $(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">None</option>' + channels.map(ch =>
        `<option value="${escA(ch.id)}"${selected && String(ch.id) === String(selected) ? ' selected' : ''}># ${esc(ch.name)}</option>`
    ).join('');
}

function populateRoleSelect(id, roles, selectedIds) {
    const sel = $(id);
    if (!sel) return;
    const set = new Set(selectedIds.map(String));
    sel.innerHTML = roles.map(r =>
        `<option value="${escA(r.id)}"${set.has(String(r.id)) ? ' selected' : ''}>${esc(r.name)}</option>`
    ).join('');
}

async function saveConfig() {
    const btn    = $('cfg-save-btn');
    const status = $('cfg-save-status');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;animation:spin .7s linear infinite"><circle cx="12" cy="12" r="10"/></svg> Saving...';
    status.textContent = '';

    const body = {
        log_channel_id:             $('cfg-log-channel').value || null,
        application_log_channel_id: $('cfg-app-log-channel').value || null,
        appeal_log_channel_id:      $('cfg-appeal-log-channel').value || null,
        staff_role_ids:   getSelectedValues('cfg-staff-roles'),
        admin_role_ids:   getSelectedValues('cfg-admin-roles'),
        support_role_ids: getSelectedValues('cfg-support-roles'),
        ping_support_on_ticket: $('cfg-ping-support').checked,
        emoji_style: $('cfg-emoji-style').value,
    };

    try {
        const res = await apiDash('config', 'PATCH', { guild_id: selectedGuildId }, body);
        if (res.ok) {
            toast('Configuration saved!');
            status.textContent = 'Saved!';
            status.className = 'dash-save-status success';
        } else {
            toast(res.error || 'Failed to save.', 'error');
            status.textContent = res.error || 'Failed';
            status.className = 'dash-save-status error';
        }
    } catch {
        toast('Error saving configuration.', 'error');
        status.textContent = 'Error saving.';
        status.className = 'dash-save-status error';
    }

    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save configuration';
    setTimeout(() => { status.textContent = ''; }, 4000);
}

function getSelectedValues(id) {
    const sel = $(id);
    if (!sel) return [];
    return Array.from(sel.selectedOptions).map(o => o.value);
}

// ─── Panels ──────────────────────────────────────────────────────────────────
async function fetchPanels() {
    const loading = $('detail-panels-loading');
    const list    = $('detail-panels-list');
    if (loading) loading.style.display = 'flex';
    if (list) list.innerHTML = '';

    try {
        const data   = await api('panels', { guild_id: selectedGuildId });
        const panels = data.panels || [];
        if (!panels.length) {
            list.innerHTML = '<p class="dash-empty">No panels yet. Create one to get started.</p>';
        } else {
            list.innerHTML = panels.map(p => {
                const title = p.title || 'Untitled Panel';
                let catCount = 0;
                try { catCount = (JSON.parse(p.panel_data).categories || []).length; } catch {}
                const ch     = cachedChannels.find(c => String(c.id) === String(p.channel_id));
                const chName = ch ? `# ${esc(ch.name)}` : `Channel ${p.channel_id}`;
                return `<div class="dash-panel-card" data-id="${p.id}">
                    <div class="dash-panel-card-top">
                        <h4>${esc(title)}</h4>
                        <button class="dash-panel-edit-btn" data-id="${p.id}">Edit</button>
                    </div>
                    <div class="dash-panel-card-meta">${chName} · ${catCount} button${catCount !== 1 ? 's' : ''}</div>
                </div>`;
            }).join('');

            list.querySelectorAll('.dash-panel-edit-btn').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => openPanelEditor(p));
            });
        }
    } catch {
        if (list) list.innerHTML = '<p class="dash-empty">Could not load panels.</p>';
    }
    if (loading) loading.style.display = 'none';
}

function openPanelEditor(panel) {
    editingPanelId = panel ? panel.id : null;
    $('dash-panel-editor').style.display = 'flex';
    $('panel-editor-title').textContent  = panel ? 'Edit panel' : 'Create panel';
    $('panel-editor-submit').textContent  = panel ? 'Update in Discord' : 'Publish to Discord';
    $('panel-title').value      = panel ? (panel.title || '') : '';
    $('panel-description').value = '';
    $('panel-channel-id').value  = '';

    const container = $('panel-categories-container');
    container.innerHTML = '';

    if (panel && panel.panel_data) {
        try {
            const d = typeof panel.panel_data === 'string' ? JSON.parse(panel.panel_data) : panel.panel_data;
            if (d.description) $('panel-description').value = d.description;
            if (panel.channel_id) $('panel-channel-id').value = String(panel.channel_id);
            (d.categories || []).forEach(c => addCatRow(c));
            if (!d.categories?.length) addCatRow();
        } catch { addCatRow(); }
    } else {
        addCatRow({ emoji: '🎫', name: 'General Support', description: 'General questions' });
        addCatRow({ emoji: '🔧', name: 'Technical Support', description: 'Technical issues' });
    }
    loadChannelSelect(panel ? String(panel.channel_id) : null);
}

function closePanelEditor() {
    $('dash-panel-editor').style.display = 'none';
    editingPanelId = null;
}

function loadChannelSelect(selectedId) {
    const sel = $('panel-channel');
    sel.innerHTML = '<option value="">— Choose a channel —</option>' + cachedChannels.map(ch => {
        const s = selectedId && String(ch.id) === selectedId ? ' selected' : '';
        return `<option value="${escA(ch.id)}"${s}># ${esc(ch.name)}</option>`;
    }).join('');
}

function addCatRow(cat) {
    const container = $('panel-categories-container');
    const row = document.createElement('div');
    row.className = 'dash-cat-row';
    row.innerHTML = `
        <input type="text" class="dash-cat-emoji" placeholder="🎫" value="${escA(cat?.emoji || '')}" maxlength="64" title="Unicode or Discord custom emoji">
        <input type="text" class="dash-cat-name" placeholder="Button label" value="${escA(cat?.name || '')}" required>
        <input type="text" class="dash-cat-desc" placeholder="Description (optional)" value="${escA(cat?.description || '')}">
        <button type="button" class="dash-cat-remove">&times;</button>
    `;
    row.querySelector('.dash-cat-remove').addEventListener('click', () => row.remove());
    container.appendChild(row);
}

async function submitPanel(e) {
    e.preventDefault();
    const channelId = $('panel-channel').value || $('panel-channel-id').value.trim().replace(/\D/g, '');
    if (!channelId || channelId.length < 17) { toast('Choose a channel or enter a valid Channel ID.', 'error'); return; }

    const title = $('panel-title').value.trim();
    if (!title) { toast('Enter a panel title.', 'error'); return; }

    const description = $('panel-description').value.trim();
    const categories  = [];
    document.querySelectorAll('.dash-cat-row').forEach(r => {
        const name = r.querySelector('.dash-cat-name').value.trim();
        if (!name) return;
        categories.push({
            emoji:       r.querySelector('.dash-cat-emoji').value.trim() || '🎫',
            name,
            description: r.querySelector('.dash-cat-desc')?.value.trim() || '',
        });
    });
    if (!categories.length) { toast('Add at least one category.', 'error'); return; }

    const btn = $('panel-editor-submit');
    btn.disabled = true;
    btn.textContent = 'Publishing...';

    const url = editingPanelId
        ? `${BASE}/.netlify/functions/panels?guild_id=${encodeURIComponent(selectedGuildId)}&panel_id=${editingPanelId}`
        : `${BASE}/.netlify/functions/panels?guild_id=${encodeURIComponent(selectedGuildId)}`;

    try {
        const res  = await fetch(url, {
            method:  editingPanelId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ guild_id: selectedGuildId, channel_id: channelId, title, description, categories }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        closePanelEditor();
        fetchPanels();
        toast(editingPanelId ? 'Panel updated!' : 'Panel published to Discord!');
    } catch (err) {
        toast(err.message || 'Failed to save panel.', 'error');
    }
    btn.disabled    = false;
    btn.textContent = editingPanelId ? 'Update in Discord' : 'Publish to Discord';
}

// ─── Quick Responses ─────────────────────────────────────────────────────────
async function fetchQR() {
    const list = $('qr-list');
    if (!list) return;
    try {
        const data = await apiDash('quick-responses', 'GET', { guild_id: selectedGuildId });
        const qr   = data.responses || [];
        if (!qr.length) {
            list.innerHTML = '<p class="dash-empty">No quick responses yet.</p>';
        } else {
            list.innerHTML = qr.map(r => `<div class="dash-qr-item">
                <div class="dash-qr-label">${esc(r.label)}</div>
                <div class="dash-qr-msg">${esc(r.message)}</div>
                <button class="dash-qr-delete" data-name="${escA(r.label)}">&times;</button>
            </div>`).join('');
            list.querySelectorAll('.dash-qr-delete').forEach(btn =>
                btn.addEventListener('click', () => deleteQR(btn.dataset.name))
            );
        }
    } catch {
        list.innerHTML = '<p class="dash-empty">Could not load responses.</p>';
    }
}

function showQRForm() {
    $('qr-form-card').style.display = 'block';
    $('qr-label').value   = '';
    $('qr-message').value = '';
    $('qr-label').focus();
}

function hideQRForm() {
    $('qr-form-card').style.display = 'none';
}

async function saveQR() {
    const label   = $('qr-label').value.trim();
    const message = $('qr-message').value.trim();
    if (!label || !message) { toast('Label and message are required.', 'error'); return; }
    try {
        const res = await apiDash('quick-responses', 'POST', { guild_id: selectedGuildId }, { guild_id: selectedGuildId, label, message });
        if (res.error) throw new Error(res.error);
        hideQRForm();
        fetchQR();
        toast('Quick response added!');
    } catch (err) {
        toast(err.message || 'Failed to save.', 'error');
    }
}

async function deleteQR(name) {
    if (!confirm(`Delete quick response "${name}"?`)) return;
    try {
        await apiDash('quick-responses', 'DELETE', { guild_id: selectedGuildId, name });
        fetchQR();
        toast('Quick response deleted.');
    } catch {
        toast('Failed to delete.', 'error');
    }
}

// ─── Analytics ───────────────────────────────────────────────────────────────
async function fetchAnalytics(guildId, days) {
    try {
        const data = await apiDash('analytics', 'GET', { guild_id: guildId, period: days });
        $('analytics-stats').innerHTML = `
            <div class="dash-stat-card"><span class="dash-stat-label">Total</span><div class="dash-stat-value">${data.total || 0}</div></div>
            <div class="dash-stat-card"><span class="dash-stat-label">Open</span><div class="dash-stat-value">${data.open || 0}</div></div>
            <div class="dash-stat-card"><span class="dash-stat-label">Closed</span><div class="dash-stat-value">${data.closed || 0}</div></div>
        `;
        renderChart(data.by_day || []);
        const cats = data.by_category || [];
        $('analytics-categories').innerHTML = cats.length
            ? cats.map(c => `<div class="dash-cat-stat"><span>${esc(c.name)}</span><span class="dash-cat-count">${c.count}</span></div>`).join('')
            : '<p class="dash-empty">No data for this period.</p>';
    } catch {
        $('analytics-stats').innerHTML = '<p class="dash-empty">Could not load analytics.</p>';
    }
}

function renderChart(days) {
    const chart = $('analytics-chart');
    if (!chart || !days.length) { if (chart) chart.innerHTML = '<p class="dash-empty">No data.</p>'; return; }
    const max = Math.max(...days.map(d => d.count), 1);
    chart.innerHTML = `<div class="dash-bar-chart">${days.map(d => {
        const pct = Math.max((d.count / max) * 100, 2);
        return `<div class="dash-bar-col" title="${d.date}: ${d.count}">
            <div class="dash-bar" style="height:${pct}%"></div>
            <span class="dash-bar-label">${d.date}</span>
        </div>`;
    }).join('')}</div>`;
}

// ─── Nav & Mobile ────────────────────────────────────────────────────────────
function initMobileMenu() {
    const toggle = $('mobile-toggle');
    const menu   = $('mobile-menu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => menu.classList.toggle('open'));
        menu.querySelectorAll('a').forEach(a =>
            a.addEventListener('click', () => menu.classList.remove('open'))
        );
    }
}

function initNavScroll() {
    const nav = document.getElementById('navbar');
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}
