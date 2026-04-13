// ─── Dashboard — Tickets bot web configuration ──────────────────────────────

const STORAGE_USER  = 'kojin_dashboard_user';
const STORAGE_GUILDS = 'kojin_dashboard_guilds';
const BASE = typeof window !== 'undefined' ? window.location.origin : '';

let selectedGuildId = null;
let selectedGuild   = null;
let editingPanelId  = null;
let editingAppPanelId = null;
let editingAppealPanelId = null;
let cachedChannels  = [];
let cachedRoles     = [];
let cachedGuildEmojis = [];
let editingCustomEmbedId = null;
let lastConfigSaveTime = 0;

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initNavScroll();

    const user   = stored(STORAGE_USER);
    const guilds = stored(STORAGE_GUILDS);
    const wip = false;
    if (wip) {
        showLogin();
        $('dashboard-content').style.display = 'none';
    } else if (user && guilds) showDashboard(user, guilds);
    else showLogin();

    on('dashboard-login-btn',       'click', redirectToDiscordLogin);
    on('dashboard-logout',          'click', logout);
    on('dashboard-back-to-servers', 'click', backToServers);
    on('detail-create-panel-btn',   'click', () => openPanelEditor(null));
    on('panel-editor-close',        'click', closePanelEditor);
    on('panel-editor-cancel',       'click', closePanelEditor);
    on('panel-add-category',        'click', () => addCatRow());
    on('panel-editor-form',         'submit', submitPanel);
    on('create-app-panel-btn',      'click', () => openAppPanelEditor());
    on('app-panel-editor-close',    'click', closeAppPanelEditor);
    on('app-panel-editor-cancel',   'click', closeAppPanelEditor);
    on('app-panel-add-type',        'click', () => addTypeRow('app-panel-types-container', null, { mode: 'app' }));
    on('app-panel-editor-form',     'submit', submitAppPanel);
    on('create-appeal-panel-btn',   'click', () => openAppealPanelEditor());
    on('appeal-panel-editor-close', 'click', closeAppealPanelEditor);
    on('appeal-panel-editor-cancel','click', closeAppealPanelEditor);
    on('appeal-panel-add-cat',      'click', () => addTypeRow('appeal-panel-cats-container', null, { mode: 'appeal' }));
    on('appeal-panel-editor-form',  'submit', submitAppealPanel);
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

    on('analytics-refresh-btn', 'click', () => {
        const active = document.querySelector('.dash-period-btn.active');
        const days = active?.dataset?.days || '30';
        if (selectedGuildId) fetchAnalytics(selectedGuildId, days);
        else toast('Select a server first.', 'error');
    });

    on('create-custom-embed-btn', 'click', () => openCustomEmbedEditor(null));
    on('custom-embed-editor-close', 'click', closeCustomEmbedEditor);
    on('custom-embed-editor-cancel', 'click', closeCustomEmbedEditor);
    on('custom-embed-editor-form', 'submit', submitCustomEmbed);
    const ceb = document.querySelector('#dash-custom-embed-editor .dash-panel-editor-backdrop');
    if (ceb) ceb.addEventListener('click', closeCustomEmbedEditor);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if ($('dash-panel-editor')?.style.display === 'flex') { closePanelEditor(); return; }
        if ($('app-panel-editor')?.style.display === 'flex') { closeAppPanelEditor(); return; }
        if ($('appeal-panel-editor')?.style.display === 'flex') { closeAppealPanelEditor(); return; }
        if ($('dash-custom-embed-editor')?.style.display === 'flex') { closeCustomEmbedEditor(); return; }
    });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function on(id, evt, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
}
function $(id) { return document.getElementById(id); }

function isPremiumPlan() {
    return !!(panelLimits && panelLimits.premium);
}

function maxItemsForPanel(kind) {
    if (isPremiumPlan()) return 25;
    if (kind === 'app') return 2;
    if (kind === 'appeal') return 4;
    return 3;
}

function maxTypesForPlan() {
    const isPremium = !!(panelLimits && panelLimits.premium);
    return isPremium ? 25 : 3;
}

function validateDirectImageUrl(rawUrl) {
    const url = (rawUrl || '').trim();
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (!/^https?:$/i.test(parsed.protocol)) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}
function stored(k) {
    try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : null; }
    catch { return null; }
}
function esc(t)  { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function escA(t) { return String(t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function kojinActorHeaders() {
    const h = {};
    const user = stored(STORAGE_USER) || null;
    if (user?.id) {
        h['X-Kojin-Actor-Id'] = String(user.id);
        if (user.username) h['X-Kojin-Actor-Name'] = String(user.username);
        h['X-Kojin-Source'] = 'dashboard';
    }
    return h;
}

// ─── Smooth modal close helper ───────────────────────────────────────────────
function smoothCloseModal(editor) {
    if (!editor) return;
    const dialog = editor.querySelector('.dash-panel-editor-dialog, .dash-custom-embed-dialog')?.closest('[class*=dialog]') || editor.querySelector('[class*=dialog]');
    const backdrop = editor.querySelector('[class*=backdrop]');
    const inner = dialog || editor.lastElementChild;
    if (inner) { inner.style.transition = 'opacity 0.2s, transform 0.2s'; inner.style.opacity = '0'; inner.style.transform = 'translateY(12px) scale(0.97)'; }
    if (backdrop) { backdrop.style.transition = 'opacity 0.2s'; backdrop.style.opacity = '0'; }
    setTimeout(() => {
        editor.style.display = 'none';
        if (inner) { inner.style.opacity = ''; inner.style.transform = ''; }
        if (backdrop) { backdrop.style.opacity = ''; }
    }, 220);
}

// ─── Toast notifications ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
    const container = $('dash-toasts');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `dash-toast ${type}`;
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    const bar = document.createElement('div');
    bar.className = 'dash-toast-bar';
    el.appendChild(bar);
    container.appendChild(el);
    requestAnimationFrame(() => { bar.style.width = '0%'; });
    setTimeout(() => {
        el.classList.add('removing');
        setTimeout(() => el.remove(), 300);
    }, 3800);
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

    const welcome = $('dash-welcome');
    const server = $('dash-server');

    welcome.style.transition = 'opacity 0.2s';
    welcome.style.opacity = '0';
    setTimeout(() => {
        welcome.style.display = 'none';
        server.style.display  = 'block';
        server.style.opacity = '0';
        server.style.transition = 'opacity 0.35s';
        requestAnimationFrame(() => { server.style.opacity = '1'; });
    }, 200);

    $('detail-server-name').textContent = guild.name;

    document.querySelectorAll('.dash-guild-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.id === guild.id)
    );

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
    $('dash-loading').style.opacity = '0';
    requestAnimationFrame(() => { $('dash-loading').style.transition = 'opacity 0.3s'; $('dash-loading').style.opacity = '1'; });
    document.querySelectorAll('.dash-tab-content').forEach(c => {
        if (c.classList.contains('active')) { c.style.transition = 'opacity 0.3s'; c.style.opacity = '0.4'; }
    });
    try {
        const [status, config, channels, roles, emojis] = await Promise.allSettled([
            api('server-status', { guild_id: selectedGuildId }),
            apiDash('config', 'GET', { guild_id: selectedGuildId }),
            api('channels', { guild_id: selectedGuildId }),
            apiDash('roles', 'GET', { guild_id: selectedGuildId }),
            api('emojis', { guild_id: selectedGuildId }),
        ]);

        const statusData  = status.status === 'fulfilled' ? status.value : {};
        const configData  = config.status === 'fulfilled' ? config.value : {};
        const channelData = channels.status === 'fulfilled' ? channels.value : {};
        const roleData    = roles.status === 'fulfilled' ? roles.value : {};

        cachedChannels = channelData.channels || [];
        cachedRoles    = roleData.roles || [];
        cachedGuildEmojis = emojis.status === 'fulfilled' ? (emojis.value.emojis || []) : [];

        renderOverview(statusData);
        renderConfig(configData);
        fetchPanelLimits();
        fetchPanels();
        fetchAppPanels();
        fetchAppealPanels();
        fetchCustomEmbeds();
        fetchQR();
        fetchAnalytics(selectedGuildId, 30);

        const failed = [status, config, channels, roles, emojis].filter(r => r.status === 'rejected');
        if (failed.length === 4) {
            toast('Could not reach the bot server. Check that the bot is running.', 'error');
        } else if (failed.length > 0) {
            toast(`Loaded with ${failed.length} warning(s) — some data may be incomplete.`, 'error');
        }
    } catch (e) {
        console.error(e);
        toast('Failed to load server data. Is the bot online?', 'error');
    }
    $('dash-loading').style.transition = 'opacity 0.25s';
    $('dash-loading').style.opacity = '0';
    setTimeout(() => { $('dash-loading').style.display = 'none'; }, 250);
    document.querySelectorAll('.dash-tab-content').forEach(c => { c.style.transition = 'opacity 0.35s'; c.style.opacity = '1'; });
}

async function api(endpoint, params) {
    const qs  = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE}/.netlify/functions/${endpoint}?${qs}`);
    return res.json();
}

async function apiDash(endpoint, method, params, body) {
    const p   = { endpoint, ...params };
    const qs  = new URLSearchParams(p).toString();
    const user = stored(STORAGE_USER) || null;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (user && user.id) {
        opts.headers['X-Kojin-Actor-Id'] = String(user.id);
        if (user.username) opts.headers['X-Kojin-Actor-Name'] = String(user.username);
        opts.headers['X-Kojin-Source'] = 'dashboard';
    }
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}/.netlify/functions/dashboard-api?${qs}`, opts);
    return res.json();
}

// ─── Overview ────────────────────────────────────────────────────────────────
function animateCount(el, target, duration = 500) {
    if (!el) return;
    const start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    if (start === target) return;
    const startTime = performance.now();
    el.classList.add('counting');
    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (target - start) * eased);
        el.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
        else el.classList.remove('counting');
    }
    requestAnimationFrame(step);
}

function renderOverview(data) {
    const inServer = data.tickets === true;
    $('overview-bot-status').innerHTML = inServer
        ? '<span class="dash-status-dot green"></span> Online'
        : '<span class="dash-status-dot red"></span> Not in server';

    const lat = $('overview-latency');
    if (lat) {
        const ms = data.latency_ms;
        if (typeof ms === 'number') {
            const ok = ms < 150;
            lat.innerHTML = `<span class="dash-latency-val ${ok ? 'good' : 'warn'}">${ms} ms</span>`;
        } else lat.textContent = '—';
    }

    const sub = data.subscription;
    $('overview-subscription').innerHTML = sub === 'premium'
        ? '<span class="dash-badge-sm premium">Premium</span>'
        : sub === 'free'
            ? '<span class="dash-badge-sm free">Free</span>'
            : '<span class="dash-badge-sm none">Unknown</span>';

    if (typeof data.ticket_count === 'number') animateCount($('overview-ticket-count'), data.ticket_count);
    else $('overview-ticket-count').textContent = '—';

    if (typeof data.open_tickets === 'number') animateCount($('overview-open-tickets'), data.open_tickets);
    else $('overview-open-tickets').textContent = '—';

    const members = $('overview-members');
    if (members) {
        if (typeof data.member_count === 'number') animateCount(members, data.member_count);
        else members.textContent = '—';
    }

    const panels = $('overview-panel-count');
    if (panels) {
        if (typeof data.panel_count === 'number') {
            animateCount(panels, data.panel_count);
            if (panelLimits) {
                const t = panelLimits.ticket_panels || {};
                const a = panelLimits.application_panels || {};
                const ap = panelLimits.appeal_panels || {};
                const ce = panelLimits.custom_embed_panels || {};
                panels.title = `🎫 Tickets: ${t.count ?? 0}/${t.max === -1 ? '∞' : t.max ?? '?'}\n📋 Applications: ${a.count ?? 0}/${a.max === -1 ? '∞' : a.max ?? '?'}\n⚖️ Appeals: ${ap.count ?? 0}/${ap.max === -1 ? '∞' : ap.max ?? '?'}\n🎨 Custom: ${ce.count ?? 0}/${ce.max === -1 ? '∞' : ce.max ?? '?'}`;
            }
        } else panels.textContent = '—';
    }

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

async function refreshOverviewStats() {
    if (!selectedGuildId) return;
    try {
        const data = await api('server-status', { guild_id: selectedGuildId });
        renderOverview(data);
    } catch { /* ignore */ }
}

async function syncPanelCounts() {
    await Promise.allSettled([fetchPanelLimits(), refreshOverviewStats()]);
}

function renderOverviewTrend(byDay, error) {
    const chart = $('overview-trend-chart');
    const hint = $('overview-trend-hint');
    const totalEl = $('overview-trend-total');
    const link = $('overview-trend-analytics-link');
    if (!chart) return;
    if (link) {
        link.href = '#';
        link.onclick = (e) => { e.preventDefault(); document.querySelector('[data-tab="analytics"]')?.click(); };
    }
    if (error) {
        chart.innerHTML = '';
        if (totalEl) totalEl.textContent = '—';
        if (hint) hint.textContent = 'Could not load trend.';
        return;
    }
    if (!byDay || !byDay.length) {
        chart.innerHTML = '<div class="dash-trend-empty"><span class="dash-trend-empty-icon">📊</span><p>No ticket activity yet</p><span class="dash-trend-empty-sub">Tickets will appear here once created</span></div>';
        if (totalEl) totalEl.textContent = '0';
        if (hint) hint.textContent = 'No tickets in the last 7 days.';
        return;
    }
    const total = byDay.reduce((a, d) => a + d.count, 0);
    const max = Math.max(...byDay.map(d => d.count), 1);
    if (totalEl) totalEl.textContent = total.toLocaleString();
    chart.innerHTML = `<div class="dash-trend-bars">${byDay.map(d => {
        const pct = Math.max((d.count / max) * 100, 6);
        return `<div class="dash-trend-bar-wrap" title="${d.date}: ${d.count} ticket${d.count !== 1 ? 's' : ''}">
            <div class="dash-trend-bar" style="--h:${pct}%">
                <span class="dash-trend-bar-value">${d.count}</span>
            </div>
            <span class="dash-trend-bar-label">${d.date}</span>
        </div>`;
    }).join('')}</div>`;
    if (hint) hint.textContent = total === 0 ? 'No tickets created.' : `${total} ticket${total !== 1 ? 's' : ''} created this week.`;
}

// ─── Searchable Select Component ─────────────────────────────────────────────
const ssInstances = {};

function createSearchableSelect(id, options, selectedValue, mode) {
    const container = $(id);
    if (!container) return;
    const isMulti = mode === 'multi';
    const placeholder = container.dataset.placeholder || 'Search...';

    let selected = isMulti
        ? new Set((Array.isArray(selectedValue) ? selectedValue : []).map(String))
        : (selectedValue ? String(selectedValue) : '');

    container.innerHTML = '';
    container.classList.remove('open');

    const trigger = document.createElement('div');
    trigger.className = 'dash-ss-trigger';
    container.appendChild(trigger);

    const dropdown = document.createElement('div');
    dropdown.className = 'dash-ss-dropdown';
    dropdown.innerHTML = `<input type="text" class="dash-ss-search" placeholder="${escA(placeholder)}"><div class="dash-ss-options"></div>`;
    container.appendChild(dropdown);

    const searchInput = dropdown.querySelector('.dash-ss-search');
    const optionsContainer = dropdown.querySelector('.dash-ss-options');

    function renderTrigger() {
        if (isMulti) {
            if (!selected.size) {
                trigger.innerHTML = `<span class="dash-ss-placeholder">${esc(placeholder)}</span>`;
            } else {
                trigger.innerHTML = '';
                selected.forEach(val => {
                    const opt = options.find(o => String(o.id) === val);
                    if (!opt) return;
                    const chip = document.createElement('span');
                    chip.className = 'dash-ss-chip';
                    chip.innerHTML = `${esc(opt.name)} <span class="dash-ss-chip-x" data-val="${escA(val)}">&times;</span>`;
                    chip.querySelector('.dash-ss-chip-x').addEventListener('click', (e) => {
                        e.stopPropagation();
                        selected.delete(val);
                        renderTrigger();
                        renderOptions(searchInput.value);
                    });
                    trigger.appendChild(chip);
                });
            }
        } else {
            const opt = options.find(o => String(o.id) === selected);
            trigger.innerHTML = opt
                ? `<span class="dash-ss-value-text"><span class="dash-ss-opt-prefix">#</span> ${esc(opt.name)}</span>`
                : `<span class="dash-ss-placeholder">None</span>`;
        }
    }

    function renderOptions(filter) {
        const q = (filter || '').toLowerCase();
        const filtered = options.filter(o => o.name.toLowerCase().includes(q));
        if (!filtered.length) {
            optionsContainer.innerHTML = `<div class="dash-ss-empty">${q ? 'No matches' : 'No options available'}</div>`;
            return;
        }
        optionsContainer.innerHTML = '';
        if (!isMulti && !q) {
            const noneOpt = document.createElement('div');
            noneOpt.className = `dash-ss-opt${!selected ? ' selected' : ''}`;
            noneOpt.innerHTML = `<span style="color:var(--d-text-3)">None</span>`;
            noneOpt.addEventListener('click', () => {
                selected = '';
                renderTrigger();
                renderOptions('');
                closeDropdown();
            });
            optionsContainer.appendChild(noneOpt);
        }
        filtered.forEach(o => {
            const isSelected = isMulti ? selected.has(String(o.id)) : String(o.id) === selected;
            const el = document.createElement('div');
            el.className = `dash-ss-opt${isSelected ? ' selected' : ''}`;
            const prefix = o._type === 'role' ? '@' : '#';
            el.innerHTML = isMulti
                ? `<span class="dash-ss-opt-check">${isSelected ? '✓' : ''}</span><span class="dash-ss-opt-prefix">${prefix}</span> ${esc(o.name)}`
                : `<span class="dash-ss-opt-prefix">${prefix}</span> ${esc(o.name)}`;
            el.addEventListener('click', () => {
                if (isMulti) {
                    isSelected ? selected.delete(String(o.id)) : selected.add(String(o.id));
                    renderTrigger();
                    renderOptions(searchInput.value);
                } else {
                    selected = String(o.id);
                    renderTrigger();
                    closeDropdown();
                }
            });
            optionsContainer.appendChild(el);
        });
    }

    function openDropdown() {
        document.querySelectorAll('.dash-ss.open').forEach(el => {
            if (el !== container) el.classList.remove('open');
        });
        container.classList.add('open');
        searchInput.value = '';
        renderOptions('');
        setTimeout(() => searchInput.focus(), 50);
    }

    function closeDropdown() {
        container.classList.remove('open');
        searchInput.value = '';
    }

    trigger.addEventListener('click', () => {
        container.classList.contains('open') ? closeDropdown() : openDropdown();
    });

    searchInput.addEventListener('input', () => renderOptions(searchInput.value));
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) closeDropdown();
    });

    renderTrigger();

    ssInstances[id] = {
        getValue: () => isMulti ? Array.from(selected) : selected,
        setValue: (v) => {
            selected = isMulti ? new Set((Array.isArray(v) ? v : []).map(String)) : (v ? String(v) : '');
            renderTrigger();
        },
    };
}

function ssGetValue(id) {
    return ssInstances[id] ? ssInstances[id].getValue() : (ssInstances[id]?.getValue?.() ?? null);
}

// ─── Configuration ───────────────────────────────────────────────────────────
function renderConfig(cfg) {
    if (!cfg || !cfg.configured) {
        if (cfg && cfg.error) toast('Config: ' + cfg.error, 'error');
        return;
    }

    const chOpts = cachedChannels.map(ch => ({ id: ch.id, name: ch.name, _type: 'channel' }));
    const rOpts  = cachedRoles.map(r => ({ id: r.id, name: r.name, _type: 'role' }));

    createSearchableSelect('cfg-log-channel', chOpts, cfg.log_channel_id, 'single');
    createSearchableSelect('cfg-app-log-channel', chOpts, cfg.application_log_channel_id, 'single');
    createSearchableSelect('cfg-appeal-log-channel', chOpts, cfg.appeal_log_channel_id, 'single');
    createSearchableSelect('cfg-admin-log-channel', chOpts, cfg.admin_logs_channel_id, 'single');
    createSearchableSelect('cfg-staff-roles', rOpts, cfg.staff_role_ids || [], 'multi');
    createSearchableSelect('cfg-admin-roles', rOpts, cfg.admin_role_ids || [], 'multi');
    createSearchableSelect('cfg-support-roles', rOpts, cfg.support_role_ids || [], 'multi');

    $('cfg-emoji-style').value = cfg.emoji_style || 'heavy';
}

async function saveConfig() {
    const now = Date.now();
    const cooldown = 10000;
    if (now - lastConfigSaveTime < cooldown) {
        const remaining = Math.ceil((cooldown - (now - lastConfigSaveTime)) / 1000);
        toast(`Please wait ${remaining}s before saving again.`, 'error');
        return;
    }
    lastConfigSaveTime = now;
    const btn    = $('cfg-save-btn');
    const status = $('cfg-save-status');
    btn.disabled = true;
    btn.innerHTML = '<div class="dash-spinner-sm" style="width:16px;height:16px;border-width:2px"></div> Saving...';
    status.textContent = '';

    const body = {
        log_channel_id:             ssGetValue('cfg-log-channel') || null,
        application_log_channel_id: ssGetValue('cfg-app-log-channel') || null,
        appeal_log_channel_id:      ssGetValue('cfg-appeal-log-channel') || null,
        admin_logs_channel_id:      ssGetValue('cfg-admin-log-channel') || null,
        staff_role_ids:             ssGetValue('cfg-staff-roles') || [],
        admin_role_ids:             ssGetValue('cfg-admin-roles') || [],
        support_role_ids:           ssGetValue('cfg-support-roles') || [],
        emoji_style:                $('cfg-emoji-style').value,
    };

    try {
        const res = await apiDash('config', 'PATCH', { guild_id: selectedGuildId }, body);
        if (res.ok) {
            toast('Configuration saved! A confirmation was sent to your server.', 'success');
            status.textContent = '✓ Saved';
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
            list.innerHTML = panels.map((p, i) => {
                const title = p.title || 'Untitled Panel';
                let catCount = 0;
                try { catCount = (JSON.parse(p.panel_data).categories || []).length; } catch {}
                const ch     = cachedChannels.find(c => String(c.id) === String(p.channel_id));
                const chName = ch ? `# ${esc(ch.name)}` : `Channel ${p.channel_id}`;
                return `<div class="dash-panel-card" data-id="${p.id}" style="animation-delay:${i * 0.05}s">
                    <div class="dash-panel-card-top">
                        <h4>${esc(title)}</h4>
                        <div style="display:flex; gap:.5rem; align-items:center;">
                            <button class="dash-panel-edit-btn" data-id="${p.id}">Edit</button>
                            <button class="dash-panel-del-btn" data-id="${p.id}" title="Delete panel">Delete</button>
                        </div>
                    </div>
                    <div class="dash-panel-card-meta">${chName} · ${catCount} button${catCount !== 1 ? 's' : ''}</div>
                </div>`;
            }).join('');

            list.querySelectorAll('.dash-panel-edit-btn').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => openPanelEditor(p));
            });
            list.querySelectorAll('.dash-panel-del-btn').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => deletePanel(p));
            });
        }
    } catch {
        if (list) list.innerHTML = '<p class="dash-empty">Could not load panels.</p>';
    }
    if (loading) loading.style.display = 'none';
}

async function deletePanel(panel) {
    if (!panel || !selectedGuildId) return;
    const title = panel.title || 'Untitled Panel';
    if (!confirm(`Delete panel "${title}"?\n\nThis removes the Discord message when possible and deletes the panel record (same as /panels in Discord).`)) return;
    try {
        const res = await fetch(`${BASE}/.netlify/functions/panels?guild_id=${encodeURIComponent(selectedGuildId)}&panel_id=${encodeURIComponent(panel.id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', ...kojinActorHeaders() },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
            toast('Panel deleted.', 'success');
            fetchPanels();
            await syncPanelCounts();
        } else {
            toast(data.error || 'Failed to delete panel.', 'error');
        }
    } catch {
        toast('Failed to delete panel.', 'error');
    }
}

async function deleteAppPanel(panel) {
    if (!panel || !selectedGuildId) return;
    const title = panel.title || 'Untitled';
    if (!confirm(`Delete application panel "${title}"?\n\nThis removes the Discord message when possible and deletes the panel record.`)) return;
    try {
        const data = await apiDash('app-panels', 'DELETE', { guild_id: selectedGuildId, panel_id: panel.id });
        if (data && data.ok) {
            toast('Application panel deleted.', 'success');
            fetchAppPanels();
            await syncPanelCounts();
        } else {
            toast(data?.error || 'Failed to delete application panel.', 'error');
        }
    } catch {
        toast('Failed to delete application panel.', 'error');
    }
}

async function deleteAppealPanel(panel) {
    if (!panel || !selectedGuildId) return;
    const title = panel.title || 'Untitled';
    if (!confirm(`Delete appeal panel "${title}"?\n\nThis removes the Discord message when possible and marks the panel inactive in the database.`)) return;
    try {
        const data = await apiDash('appeal-panels', 'DELETE', { guild_id: selectedGuildId, panel_id: panel.id });
        if (data && data.ok) {
            toast('Appeal panel deleted.', 'success');
            fetchAppealPanels();
            await syncPanelCounts();
        } else {
            toast(data?.error || 'Failed to delete appeal panel.', 'error');
        }
    } catch {
        toast('Failed to delete appeal panel.', 'error');
    }
}

function openPanelEditor(panel) {
    if (!panel && !canCreatePanel('ticket_panels')) {
        toast('Ticket panel limit reached. Upgrade to Premium for unlimited panels!', 'error');
        return;
    }
    editingPanelId = panel ? panel.id : null;
    $('dash-panel-editor').style.display = 'flex';
    $('panel-editor-title').textContent  = panel ? 'Edit panel' : 'Create panel';
    $('panel-editor-submit').textContent  = panel ? 'Update in Discord' : 'Publish to Discord';
    $('panel-title').value      = panel ? (panel.title || '') : '';
    $('panel-description').value = '';
    const pei = $('panel-embed-image');
    if (pei) pei.value = '';
    $('panel-channel-id').value  = '';

    const container = $('panel-categories-container');
    container.innerHTML = '';

    if (panel && panel.panel_data) {
        try {
            const d = typeof panel.panel_data === 'string' ? JSON.parse(panel.panel_data) : panel.panel_data;
            if (d.description) $('panel-description').value = d.description;
            if (pei) pei.value = d.embed_image_url || d.image_url || d.banner_image_url || '';
            if (panel.channel_id) $('panel-channel-id').value = String(panel.channel_id);
            (d.categories || []).forEach(c => addCatRow(c, { ignoreLimit: true }));
            if (!d.categories?.length) addCatRow();
        } catch { addCatRow(); }
    } else {
        addCatRow({ emoji: '🎫', name: 'General Support', description: 'General questions' });
        addCatRow({ emoji: '🔧', name: 'Technical Support', description: 'Technical issues' });
    }
    loadChannelSelect(panel ? String(panel.channel_id) : null);
}

function closePanelEditor() {
    smoothCloseModal($('dash-panel-editor'));
    editingPanelId = null;
}

function loadChannelSelect(selectedId) {
    const sel = $('panel-channel');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Choose a channel —</option>' + cachedChannels.map(ch => {
        const s = selectedId && String(ch.id) === selectedId ? ' selected' : '';
        return `<option value="${escA(ch.id)}"${s}># ${esc(ch.name)}</option>`;
    }).join('');
    sel.onchange = () => {
        const input = $('panel-channel-id');
        if (input && sel.value) input.value = sel.value;
    };
}

const EMOJI_QUICK_PICKS = ['🎫', '🔧', '💬', '📋', '⚖️', '🐛', '❓', '💡', '🎮', '📝', '✅', '🔒'];
const APP_QUESTION_PRESETS = {
    custom: [],
    _deprecated: true,
    staff: [
        { question: 'What is your experience with Discord moderation?', required: false, type: 'paragraph' },
        { question: 'Why do you want to be staff?', required: false, type: 'paragraph' },
        { question: 'What timezone are you in?', required: false, type: 'short' },
    ],
    support: [
        { question: 'How would you handle an upset user?', required: false, type: 'paragraph' },
        { question: 'How many hours per week can you help?', required: false, type: 'short' },
    ],
    designer: [
        { question: 'What design software do you use?', required: false, type: 'short' },
        { question: 'Share your portfolio or examples of work.', required: false, type: 'paragraph' },
    ],
    developer: [
        { question: 'What languages/frameworks do you use?', required: false, type: 'short' },
        { question: 'Share your GitHub or code samples.', required: false, type: 'paragraph' },
    ],
};

function addCatRow(cat, options = {}) {
    const container = $('panel-categories-container');
    if (!container) return;
    const max = maxItemsForPanel('ticket');
    if (!options.ignoreLimit && container.querySelectorAll('.dash-cat-row').length >= max) {
        toast(`This plan supports up to ${max} ticket categories per panel.`, 'error');
        return;
    }
    const row = document.createElement('div');
    row.className = 'dash-cat-row';
    row.innerHTML = `
        <div class="dash-cat-emoji-cell">
            <input type="text" class="dash-cat-emoji" placeholder="🎫 or &lt;:name:id&gt;" value="${escA(cat?.emoji || '')}" maxlength="90" title="Unicode or Discord custom emoji &lt;:name:id&gt; — use server emoji row below or paste from Discord">
            <div class="dash-emoji-picks">${EMOJI_QUICK_PICKS.map(e => `<button type="button" class="dash-emoji-pick" data-emoji="${escA(e)}" title="Insert ${escA(e)}">${e}</button>`).join('')}</div>
        </div>
        <input type="text" class="dash-cat-name" placeholder="Button label" value="${escA(cat?.name || '')}" required>
        <input type="text" class="dash-cat-desc" placeholder="Description (optional)" value="${escA(cat?.description || '')}">
        <div class="dash-cat-extras">
            <select class="dash-cat-ping-role dash-select" title="Role to ping for tickets created with this category">
                <option value="">— Ping role (optional) —</option>
            </select>
            <textarea class="dash-cat-welcome dash-textarea" placeholder="Customer welcome message (Discord markdown allowed). Optional." rows="2"></textarea>
        </div>
        <button type="button" class="dash-cat-remove">&times;</button>
    `;
    bindEmojiPicks(row);
    // Populate ping role select from cached roles (exclude @everyone)
    const sel = row.querySelector('.dash-cat-ping-role');
        if (sel) {
        const rid = cat?.ping_role_id;
        const selected = rid != null && rid !== '' ? String(rid).replace(/\D/g, '') : '';
        const opts = (cachedRoles || []).map(r => `<option value="${escA(r.id)}"${String(r.id).replace(/\D/g, '') === selected ? ' selected' : ''}>@ ${esc(r.name)}</option>`).join('');
        sel.insertAdjacentHTML('beforeend', opts);
    }
    const welcome = row.querySelector('.dash-cat-welcome');
    if (welcome) welcome.value = (cat?.ticket_welcome_message || '').toString();
    row.querySelector('.dash-cat-remove').addEventListener('click', () => row.remove());
    container.appendChild(row);
}

function insertAtCursor(input, text) {
    if (!input || text == null) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const val = input.value;
    input.value = val.slice(0, start) + text + val.slice(end);
    input.focus();
    const pos = start + text.length;
    input.selectionStart = input.selectionEnd = pos;
}

function bindGuildEmojiChips(row) {
    const cell = row.querySelector('.dash-cat-emoji-cell');
    const emojiInput = row.querySelector('.dash-cat-emoji');
    if (!cell || !emojiInput) return;
    let wrap = cell.querySelector('.dash-emoji-guild-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'dash-emoji-guild-wrap';
        cell.appendChild(wrap);
    }
    wrap.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'dash-emoji-guild-label';
    label.textContent = 'This server';
    wrap.appendChild(label);
    if (!cachedGuildEmojis.length) {
        const hint = document.createElement('span');
        hint.className = 'dash-hint-sm';
        hint.innerHTML = 'No emojis loaded — paste <code>&lt;:name:id&gt;</code> from Discord';
        wrap.appendChild(hint);
        return;
    }
    const scroll = document.createElement('div');
    scroll.className = 'dash-emoji-chip-scroll';
    cachedGuildEmojis.slice(0, 72).forEach(emo => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dash-emoji-chip';
        b.title = (emo.name || '') + ' — insert';
        const tag = emo.tag || '';
        b.innerHTML = `<img src="${escA(emo.url)}" alt="" loading="lazy" width="22" height="22">`;
        b.addEventListener('click', (ev) => {
            ev.preventDefault();
            insertAtCursor(emojiInput, tag);
        });
        scroll.appendChild(b);
    });
    wrap.appendChild(scroll);
}

function bindEmojiPicks(row) {
    const emojiInput = row.querySelector('.dash-cat-emoji');
    row.querySelectorAll('.dash-emoji-pick').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            insertAtCursor(emojiInput, btn.dataset.emoji || '');
        });
    });
    bindGuildEmojiChips(row);
}

async function submitPanel(e) {
    e.preventDefault();
    const channelId = $('panel-channel').value || $('panel-channel-id').value.trim().replace(/\D/g, '');
    if (!channelId || channelId.length < 17) { toast('Choose a channel or enter a valid Channel ID.', 'error'); return; }

    const title = $('panel-title').value.trim();
    if (!title) { toast('Enter a panel title.', 'error'); return; }

    const description = $('panel-description').value.trim();
    const embed_image_url = ($('panel-embed-image')?.value || '').trim();
    const categories  = [];
    ($('panel-categories-container') || document).querySelectorAll('.dash-cat-row').forEach(r => {
        const name = r.querySelector('.dash-cat-name').value.trim();
        if (!name) return;
        const pingRaw = (r.querySelector('.dash-cat-ping-role')?.value || '').trim();
        const pingDigits = pingRaw.replace(/\D/g, '');
        const ping_role_id = pingDigits && /^\d{17,20}$/.test(pingDigits) ? pingDigits : null;
        const ticket_welcome_message = (r.querySelector('.dash-cat-welcome')?.value || '').trim();
        categories.push({
            emoji:       r.querySelector('.dash-cat-emoji').value.trim() || '🎫',
            name,
            description: r.querySelector('.dash-cat-desc')?.value.trim() || '',
            ping_role_id,
            ticket_welcome_message,
        });
    });
    if (!categories.length) { toast('Add at least one category.', 'error'); return; }
    const maxTicketCats = maxItemsForPanel('ticket');
    if (categories.length > maxTicketCats) {
        toast(`This plan supports up to ${maxTicketCats} ticket categories per panel.`, 'error');
        return;
    }
    const normalizedImageUrl = validateDirectImageUrl(embed_image_url);
    if (embed_image_url && !normalizedImageUrl) {
        toast('Banner image must be a valid http(s) direct image URL.', 'error');
        return;
    }

    const btn = $('panel-editor-submit');
    btn.disabled = true;
    btn.textContent = 'Publishing...';

    const url = editingPanelId
        ? `${BASE}/.netlify/functions/panels?guild_id=${encodeURIComponent(selectedGuildId)}&panel_id=${editingPanelId}`
        : `${BASE}/.netlify/functions/panels?guild_id=${encodeURIComponent(selectedGuildId)}`;

    try {
        const res  = await fetch(url, {
            method:  editingPanelId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json', ...kojinActorHeaders() },
            body:    JSON.stringify({
                guild_id: selectedGuildId,
                channel_id: channelId,
                title,
                description,
                embed_image_url: normalizedImageUrl || null,
                image_url: normalizedImageUrl || null,
                banner_image_url: normalizedImageUrl || null,
                categories
            }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        closePanelEditor();
        fetchPanels();
        await syncPanelCounts();
        toast(editingPanelId ? 'Panel updated!' : 'Panel published to Discord!');
    } catch (err) {
        toast(err.message || 'Failed to save panel.', 'error');
    }
    btn.disabled    = false;
    btn.textContent = editingPanelId ? 'Update in Discord' : 'Publish to Discord';
}

// ─── Panel Limits ────────────────────────────────────────────────────────────
let panelLimits = null;

async function fetchPanelLimits() {
    try {
        panelLimits = await apiDash('panel-limits', 'GET', { guild_id: selectedGuildId });
    } catch { panelLimits = null; }
    renderPanelLimits();
}

function renderPanelLimits() {
    const banner = $('panel-limits-banner');
    if (!banner || !panelLimits) { if (banner) banner.style.display = 'none'; return; }
    const l = panelLimits;
    const isPremium = l.premium;
    const mkBadge = (info, label) => {
        const max = info.max === -1 ? '∞' : info.max;
        const atLimit = info.max !== -1 && info.count >= info.max;
        return `<span class="dash-limit-badge${atLimit ? ' at-limit' : ''}">${label}: <strong>${info.count}</strong> / <strong>${max}</strong></span>`;
    };
    const ceBadge = l.custom_embed_panels ? mkBadge(l.custom_embed_panels, 'Custom embed') : '';
    const qrBadge = l.quick_responses ? mkBadge(l.quick_responses, 'Responses') : '';
    banner.innerHTML = `
        <div class="dash-limits-row">
            <span class="dash-plan-tag ${isPremium ? 'premium' : 'free'}">${isPremium ? '⭐ Premium' : 'Free Plan'}</span>
            ${mkBadge(l.ticket_panels, 'Ticket')}
            ${mkBadge(l.application_panels, 'Application')}
            ${mkBadge(l.appeal_panels, 'Appeal')}
            ${ceBadge}
            ${qrBadge}
            ${!isPremium ? '<a href="/#pricing" class="dash-upgrade-link">Upgrade for unlimited →</a>' : ''}
        </div>`;
    banner.style.display = '';

    const setCount = (id, info) => {
        const el = $(id);
        if (!el) return;
        const max = info.max === -1 ? '∞' : info.max;
        el.textContent = `${info.count} / ${max}`;
        el.className = 'dash-panel-count' + (info.max !== -1 && info.count >= info.max ? ' at-limit' : '');
    };
    setCount('ticket-panel-count', l.ticket_panels);
    setCount('app-panel-count', l.application_panels);
    setCount('appeal-panel-count', l.appeal_panels);
    if (l.custom_embed_panels) setCount('custom-embed-panel-count', l.custom_embed_panels);
}

function canCreatePanel(type) {
    if (!panelLimits) return true;
    const info = panelLimits[type];
    if (!info || info.max === -1) return true;
    return info.count < info.max;
}

// ─── Application Panels ─────────────────────────────────────────────────────
async function fetchAppPanels() {
    const loading = $('app-panels-loading');
    const list    = $('app-panels-list');
    if (loading) loading.style.display = 'flex';
    if (list) list.innerHTML = '';
    try {
        const data   = await apiDash('app-panels', 'GET', { guild_id: selectedGuildId });
        const panels = data.panels || [];
        if (!panels.length) {
            list.innerHTML = '<p class="dash-empty">No application panels yet.</p>';
        } else {
            list.innerHTML = panels.map((p, i) => {
                const title = p.title || 'Untitled';
                let typeCount = 0;
                try { typeCount = (JSON.parse(p.panel_data).application_types || []).length; } catch {}
                const ch     = cachedChannels.find(c => String(c.id) === String(p.channel_id));
                const chName = ch ? `# ${esc(ch.name)}` : `Channel ${p.channel_id}`;
                return `<div class="dash-panel-card app-type" data-id="${p.id}" style="animation-delay:${i * 0.05}s">
                    <div class="dash-panel-card-top">
                        <h4>📋 ${esc(title)}</h4>
                        <div style="display:flex; gap:.5rem; align-items:center;">
                            <span class="dash-panel-badge">${p.is_active ? 'Active' : 'Inactive'}</span>
                            <button type="button" class="dash-panel-edit-btn dash-app-panel-edit-btn" data-id="${p.id}">Edit</button>
                            <button type="button" class="dash-panel-del-btn dash-app-panel-del-btn" data-id="${p.id}" title="Delete panel">Delete</button>
                        </div>
                    </div>
                    <div class="dash-panel-card-meta">${chName} · ${typeCount} type${typeCount !== 1 ? 's' : ''}</div>
                </div>`;
            }).join('');
            list.querySelectorAll('.dash-app-panel-edit-btn').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => openAppPanelEditor(p));
            });
            list.querySelectorAll('.dash-app-panel-del-btn').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => deleteAppPanel(p));
            });
        }
    } catch {
        if (list) list.innerHTML = '<p class="dash-empty">Could not load application panels.</p>';
    }
    if (loading) loading.style.display = 'none';
}

function openAppPanelEditor(panel) {
    if (!panel && !canCreatePanel('application_panels')) {
        toast('Application panel limit reached. Upgrade to Premium for unlimited panels!', 'error');
        return;
    }
    editingAppPanelId = panel ? panel.id : null;
    $('app-panel-editor').style.display = 'flex';
    $('app-panel-title').value = panel?.title || '';
    $('app-panel-description').value = panel?.description || '';
    $('app-panel-embed-image').value = '';
    $('app-panel-channel-id').value = panel?.channel_id ? String(panel.channel_id) : '';
    const container = $('app-panel-types-container');
    container.innerHTML = '';
    let types = [];
    try {
        const d = typeof panel?.panel_data === 'string' ? JSON.parse(panel.panel_data) : (panel?.panel_data || {});
        types = d.application_types || [];
        $('app-panel-embed-image').value = d.embed_image_url || d.image_url || d.banner_image_url || '';
    } catch { /* ignore parse errors */ }
    if (types.length) types.forEach(t => addTypeRow('app-panel-types-container', t, { ignoreLimit: true, mode: 'app' }));
    else addTypeRow('app-panel-types-container', {
        emoji: '📋',
        name: '',
        description: '',
        questions: [],
    }, { mode: 'app' });
    loadEditorChannelSelect('app-panel-channel', panel?.channel_id ? String(panel.channel_id) : null);
    $('app-panel-editor-submit').textContent = editingAppPanelId ? 'Update in Discord' : 'Publish to Discord';
}

function closeAppPanelEditor() {
    smoothCloseModal($('app-panel-editor'));
    editingAppPanelId = null;
}

async function submitAppPanel(e) {
    e.preventDefault();
    const channelId = $('app-panel-channel').value || ($('app-panel-channel-id')?.value?.trim().replace(/\D/g, '') || '');
    if (!channelId || channelId.length < 17) { toast('Choose a channel or enter a valid Channel ID.', 'error'); return; }
    const title = $('app-panel-title').value.trim();
    if (!title) { toast('Enter a title.', 'error'); return; }
    const description = $('app-panel-description').value.trim();
    const embed_image_url = ($('app-panel-embed-image')?.value || '').trim();
    const normalizedImageUrl = validateDirectImageUrl(embed_image_url);
    if (embed_image_url && !normalizedImageUrl) { toast('Banner image must be a valid http(s) URL.', 'error'); return; }
    const categories = [];
    $('app-panel-types-container').querySelectorAll('.dash-cat-row').forEach(r => {
        const name = r.querySelector('.dash-cat-name').value.trim();
        if (!name) return;
        const pingRaw = (r.querySelector('.dash-app-ping-role')?.value || '').trim();
        const pingDigits = pingRaw.replace(/\D/g, '');
        const ping_role_id = pingDigits && /^\d{17,20}$/.test(pingDigits) ? pingDigits : null;
        const application_welcome_message = (r.querySelector('.dash-app-welcome')?.value || '').trim();
        const questions = [];
        r.querySelectorAll('.dash-question-row').forEach(qr => {
            const question = qr.querySelector('.dash-q-text')?.value.trim();
            if (!question) return;
            questions.push({
                question,
                type: qr.querySelector('.dash-q-type')?.value || 'paragraph',
                required: !!qr.querySelector('.dash-q-required')?.checked,
            });
        });
        categories.push({
            emoji: r.querySelector('.dash-cat-emoji').value.trim() || '📋',
            name,
            description: r.querySelector('.dash-cat-desc')?.value.trim() || '',
            ping_role_id,
            application_welcome_message,
            questions,
        });
    });
    if (!categories.length) { toast('Add at least one application type.', 'error'); return; }
    const maxAppTypes = maxItemsForPanel('app');
    if (categories.length > maxAppTypes) {
        toast(`This plan supports up to ${maxAppTypes} application types per panel.`, 'error');
        return;
    }

    const btn = $('app-panel-editor-submit');
    const isEdit = !!editingAppPanelId;
    btn.disabled = true; btn.textContent = isEdit ? 'Updating...' : 'Publishing...';
    try {
        if (isEdit) {
            const del = await apiDash('app-panels', 'DELETE', { guild_id: selectedGuildId, panel_id: editingAppPanelId });
            if (del?.error) throw new Error(del.error);
        }
        const data = await apiDash('app-panels', 'POST', { guild_id: selectedGuildId }, {
            guild_id: selectedGuildId,
            channel_id: channelId,
            title,
            description,
            embed_image_url: normalizedImageUrl || null,
            image_url: normalizedImageUrl || null,
            banner_image_url: normalizedImageUrl || null,
            categories,
        });
        if (data.error) throw new Error(data.error);
        closeAppPanelEditor();
        fetchAppPanels();
        await syncPanelCounts();
        toast(isEdit ? 'Application panel updated in Discord!' : 'Application panel published to Discord!');
    } catch (err) { toast(err.message || 'Failed to save application panel.', 'error'); }
    btn.disabled = false; btn.textContent = 'Publish to Discord';
}

// ─── Appeal Panels ───────────────────────────────────────────────────────────
async function fetchAppealPanels() {
    const loading = $('appeal-panels-loading');
    const list    = $('appeal-panels-list');
    if (loading) loading.style.display = 'flex';
    if (list) list.innerHTML = '';
    try {
        const data   = await apiDash('appeal-panels', 'GET', { guild_id: selectedGuildId });
        const panels = data.panels || [];
        if (!panels.length) {
            list.innerHTML = '<p class="dash-empty">No appeal panels yet.</p>';
        } else {
            list.innerHTML = panels.map((p, i) => {
                const title = p.title || 'Untitled';
                let catCount = 0;
                try { catCount = (JSON.parse(p.panel_data).appeal_categories || []).length; } catch {}
                const ch     = cachedChannels.find(c => String(c.id) === String(p.channel_id));
                const chName = ch ? `# ${esc(ch.name)}` : `Channel ${p.channel_id}`;
                return `<div class="dash-panel-card appeal-type" data-id="${p.id}" style="animation-delay:${i * 0.05}s">
                    <div class="dash-panel-card-top">
                        <h4>⚖️ ${esc(title)}</h4>
                        <div style="display:flex; gap:.5rem; align-items:center;">
                            <span class="dash-panel-badge">${p.is_active ? 'Active' : 'Inactive'}</span>
                            <button type="button" class="dash-panel-edit-btn dash-appeal-panel-edit-btn" data-id="${p.id}">Edit</button>
                            <button type="button" class="dash-panel-del-btn dash-appeal-panel-del-btn" data-id="${p.id}" title="Delete panel">Delete</button>
                        </div>
                    </div>
                    <div class="dash-panel-card-meta">${chName} · ${catCount} categor${catCount !== 1 ? 'ies' : 'y'}</div>
                </div>`;
            }).join('');
            list.querySelectorAll('.dash-appeal-panel-edit-btn').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => openAppealPanelEditor(p));
            });
            list.querySelectorAll('.dash-appeal-panel-del-btn').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => deleteAppealPanel(p));
            });
        }
    } catch {
        if (list) list.innerHTML = '<p class="dash-empty">Could not load appeal panels.</p>';
    }
    if (loading) loading.style.display = 'none';
}

function openAppealPanelEditor(panel) {
    if (!panel && !canCreatePanel('appeal_panels')) {
        toast('Appeal panel limit reached. Upgrade to Premium for unlimited panels!', 'error');
        return;
    }
    editingAppealPanelId = panel ? panel.id : null;
    $('appeal-panel-editor').style.display = 'flex';
    $('appeal-panel-title').value = panel?.title || '';
    $('appeal-panel-description').value = panel?.description || '';
    $('appeal-panel-embed-image').value = '';
    $('appeal-panel-channel-id').value = panel?.channel_id ? String(panel.channel_id) : '';
    const container = $('appeal-panel-cats-container');
    container.innerHTML = '';
    let cats = [];
    try {
        const d = typeof panel?.panel_data === 'string' ? JSON.parse(panel.panel_data) : (panel?.panel_data || {});
        cats = d.appeal_categories || [];
        $('appeal-panel-embed-image').value = d.embed_image_url || d.image_url || d.banner_image_url || '';
    } catch { /* ignore parse errors */ }
    if (cats.length) cats.forEach(c => addTypeRow('appeal-panel-cats-container', c, { ignoreLimit: true, mode: 'appeal' }));
    else addTypeRow('appeal-panel-cats-container', { emoji: '⚖️', name: 'Ban Appeal', description: 'Appeal a ban or punishment' }, { mode: 'appeal' });
    loadEditorChannelSelect('appeal-panel-channel', panel?.channel_id ? String(panel.channel_id) : null);
    $('appeal-panel-editor-submit').textContent = editingAppealPanelId ? 'Update in Discord' : 'Publish to Discord';
}

function closeAppealPanelEditor() {
    smoothCloseModal($('appeal-panel-editor'));
    editingAppealPanelId = null;
}

async function submitAppealPanel(e) {
    e.preventDefault();
    const channelId = $('appeal-panel-channel').value || ($('appeal-panel-channel-id')?.value?.trim().replace(/\D/g, '') || '');
    if (!channelId || channelId.length < 17) { toast('Choose a channel or enter a valid Channel ID.', 'error'); return; }
    const title = $('appeal-panel-title').value.trim();
    if (!title) { toast('Enter a title.', 'error'); return; }
    const description = $('appeal-panel-description').value.trim();
    const embed_image_url = ($('appeal-panel-embed-image')?.value || '').trim();
    const normalizedImageUrl = validateDirectImageUrl(embed_image_url);
    if (embed_image_url && !normalizedImageUrl) { toast('Banner image must be a valid http(s) URL.', 'error'); return; }
    const categories = [];
    $('appeal-panel-cats-container').querySelectorAll('.dash-cat-row').forEach(r => {
        const name = r.querySelector('.dash-cat-name').value.trim();
        if (!name) return;
        const questions = [];
        r.querySelectorAll('.dash-question-row').forEach(qr => {
            const question = qr.querySelector('.dash-q-text')?.value.trim();
            if (!question) return;
            questions.push({
                question,
                type: qr.querySelector('.dash-q-type')?.value || 'paragraph',
                required: !!qr.querySelector('.dash-q-required')?.checked,
            });
        });
        categories.push({
            emoji: r.querySelector('.dash-cat-emoji').value.trim() || '⚖️',
            name,
            description: r.querySelector('.dash-cat-desc')?.value.trim() || '',
            questions,
        });
    });
    if (!categories.length) { toast('Add at least one appeal category.', 'error'); return; }
    const maxAppealCats = maxItemsForPanel('appeal');
    if (categories.length > maxAppealCats) {
        toast(`This plan supports up to ${maxAppealCats} appeal categories per panel.`, 'error');
        return;
    }

    const btn = $('appeal-panel-editor-submit');
    const isEdit = !!editingAppealPanelId;
    btn.disabled = true; btn.textContent = isEdit ? 'Updating...' : 'Publishing...';
    try {
        if (isEdit) {
            const del = await apiDash('appeal-panels', 'DELETE', { guild_id: selectedGuildId, panel_id: editingAppealPanelId });
            if (del?.error) throw new Error(del.error);
        }
        const data = await apiDash('appeal-panels', 'POST', { guild_id: selectedGuildId }, {
            guild_id: selectedGuildId, channel_id: channelId, title, description, categories,
            embed_image_url: normalizedImageUrl || null, image_url: normalizedImageUrl || null, banner_image_url: normalizedImageUrl || null,
        });
        if (data.error) throw new Error(data.error);
        closeAppealPanelEditor();
        fetchAppealPanels();
        await syncPanelCounts();
        toast(isEdit ? 'Appeal panel updated in Discord!' : 'Appeal panel published to Discord!');
    } catch (err) { toast(err.message || 'Failed to save appeal panel.', 'error'); }
    btn.disabled = false; btn.textContent = 'Publish to Discord';
}

// ─── Custom embeds (standalone rich messages, no buttons) ─────────────────
async function fetchCustomEmbeds() {
    const loading = $('custom-embed-panels-loading');
    const list = $('custom-embed-panels-list');
    if (loading) loading.style.display = 'flex';
    if (list) list.innerHTML = '';
    try {
        const data = await api('custom-embed-panels', { guild_id: selectedGuildId });
        const panels = data.panels || [];
        if (!panels.length) {
            if (list) list.innerHTML = '<p class="dash-empty">No custom embeds yet. Post a rich message with markdown and an optional banner image—no ticket buttons.</p>';
        } else if (list) {
            list.innerHTML = panels.map((p, i) => {
                const title = p.title || 'Untitled';
                const ch = cachedChannels.find(c => String(c.id) === String(p.channel_id));
                const chName = ch ? `# ${esc(ch.name)}` : `Channel ${p.channel_id}`;
                return `<div class="dash-panel-card custom-embed-type" data-id="${p.id}" style="animation-delay:${i * 0.05}s">
                    <div class="dash-panel-card-top">
                        <h4>📎 ${esc(title)}</h4>
                        <div style="display:flex; gap:.5rem; align-items:center;">
                            <button type="button" class="dash-panel-edit-btn custom-embed-edit" data-id="${p.id}">Edit</button>
                            <button type="button" class="dash-panel-del-btn custom-embed-del" data-id="${p.id}" title="Delete">Delete</button>
                        </div>
                    </div>
                    <div class="dash-panel-card-meta">${chName} · Rich embed</div>
                </div>`;
            }).join('');
            list.querySelectorAll('.custom-embed-edit').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => openCustomEmbedEditor(p));
            });
            list.querySelectorAll('.custom-embed-del').forEach(btn => {
                const p = panels.find(x => String(x.id) === btn.dataset.id);
                if (p) btn.addEventListener('click', () => deleteCustomEmbed(p));
            });
        }
    } catch {
        if (list) list.innerHTML = '<p class="dash-empty">Could not load custom embeds.</p>';
    }
    if (loading) loading.style.display = 'none';
}

async function deleteCustomEmbed(panel) {
    if (!panel || !selectedGuildId) return;
    const title = panel.title || 'Untitled';
    if (!confirm(`Remove custom embed "${title}" from the dashboard?\n\nThe Discord message will stay unless you delete it manually.`)) return;
    try {
        const url = `${BASE}/.netlify/functions/custom-embed-panels?guild_id=${encodeURIComponent(selectedGuildId)}&panel_id=${panel.id}`;
        const res = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...kojinActorHeaders() } });
        const data = await res.json().catch(() => ({}));
        if (data.error) throw new Error(data.error);
        toast('Custom embed removed from dashboard.', 'success');
        fetchCustomEmbeds();
        await syncPanelCounts();
    } catch (e) {
        toast(e.message || 'Failed to delete.', 'error');
    }
}

function openCustomEmbedEditor(panel) {
    if (!panel && !canCreatePanel('custom_embed_panels')) {
        toast('Custom embed limit reached for your plan.', 'error');
        return;
    }
    editingCustomEmbedId = panel ? panel.id : null;
    const overlay = $('dash-custom-embed-editor');
    if (!overlay) return;
    overlay.style.display = 'flex';
    const h = $('custom-embed-editor-title');
    if (h) h.textContent = panel ? 'Edit custom embed' : 'Create custom embed';
    const sub = $('custom-embed-editor-submit');
    if (sub) sub.textContent = panel ? 'Update in Discord' : 'Publish to Discord';
    $('custom-embed-title').value = '';
    $('custom-embed-description').value = '';
    $('custom-embed-image').value = '';
    $('custom-embed-footer').value = '';
    $('custom-embed-color').value = '';
    let ch = '';
    if (panel && panel.panel_data) {
        try {
            const d = typeof panel.panel_data === 'string' ? JSON.parse(panel.panel_data) : panel.panel_data;
            $('custom-embed-title').value = d.title || panel.title || '';
            $('custom-embed-description').value = d.description || '';
            $('custom-embed-image').value = d.image_url || '';
            $('custom-embed-footer').value = d.footer || '';
            if (d.color != null && d.color !== '') $('custom-embed-color').value = String(d.color);
            ch = panel.channel_id ? String(panel.channel_id) : '';
        } catch { /* ignore */ }
    }
    loadEditorChannelSelect('custom-embed-channel', ch || null);
}

function closeCustomEmbedEditor() {
    smoothCloseModal($('dash-custom-embed-editor'));
    editingCustomEmbedId = null;
}

async function submitCustomEmbed(e) {
    e.preventDefault();
    const channelEl = $('custom-embed-channel');
    const channelId = (channelEl?.value || '').replace(/\D/g, '') || '';
    if (!channelId || channelId.length < 17) { toast('Choose a valid channel.', 'error'); return; }
    const title = $('custom-embed-title').value.trim();
    const description = $('custom-embed-description').value.trim();
    const image_url = ($('custom-embed-image').value || '').trim();
    const footer = ($('custom-embed-footer').value || '').trim();
    const colorRaw = ($('custom-embed-color').value || '').trim();
    let color = null;
    if (colorRaw) {
        let n;
        if (colorRaw.startsWith('#')) n = parseInt(colorRaw.slice(1), 16);
        else n = parseInt(colorRaw, colorRaw.toLowerCase().startsWith('0x') ? 16 : 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 0xffffff) color = n;
    }
    if (!title && !description && !image_url) {
        toast('Add at least a title, description, or image URL.', 'error');
        return;
    }
    const body = {
        guild_id: selectedGuildId,
        channel_id: channelId,
        title: title || undefined,
        description,
        image_url: image_url || null,
        footer: footer || null,
        color,
    };
    const btn = $('custom-embed-editor-submit');
    const wasEdit = !!editingCustomEmbedId;
    if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
    const method = editingCustomEmbedId ? 'PATCH' : 'POST';
    const url = editingCustomEmbedId
        ? `${BASE}/.netlify/functions/custom-embed-panels?guild_id=${encodeURIComponent(selectedGuildId)}&panel_id=${editingCustomEmbedId}`
        : `${BASE}/.netlify/functions/custom-embed-panels?guild_id=${encodeURIComponent(selectedGuildId)}`;
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...kojinActorHeaders() },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (data.error) throw new Error(data.error);
        closeCustomEmbedEditor();
        fetchCustomEmbeds();
        await syncPanelCounts();
        toast(editingCustomEmbedId ? 'Custom embed updated in Discord!' : 'Published to Discord!');
    } catch (err) {
        toast(err.message || 'Failed to save.', 'error');
    }
    if (btn) {
        btn.disabled = false;
        btn.textContent = wasEdit ? 'Update in Discord' : 'Publish to Discord';
    }
}

// ─── Shared panel editor helpers ─────────────────────────────────────────────

function buildQuestionRow(q) {
    const qRow = document.createElement('div');
    qRow.className = 'dash-question-row';
    qRow.innerHTML = `
        <input type="text" class="dash-q-text dash-input" placeholder="Enter a question…" value="${escA(q?.question || '')}" maxlength="256" required>
        <select class="dash-q-type dash-select" title="Answer type">
            <option value="paragraph"${q?.type === 'paragraph' || !q?.type ? ' selected' : ''}>Long answer</option>
            <option value="short"${q?.type === 'short' ? ' selected' : ''}>Short answer</option>
        </select>
        <label class="dash-q-req-label"><input type="checkbox" class="dash-q-required" ${q?.required ? 'checked' : ''}> Required</label>
        <button type="button" class="dash-q-remove" title="Remove question">&times;</button>
    `;
    qRow.querySelector('.dash-q-remove').addEventListener('click', () => qRow.remove());
    return qRow;
}

function addTypeRow(containerId, cat, options = {}) {
    const container = $(containerId);
    if (!container) return;
    const mode = options.mode || (containerId.includes('app-panel') ? 'app' : 'appeal');
    const max = maxItemsForPanel(mode);
    if (!options.ignoreLimit && container.querySelectorAll('.dash-cat-row').length >= max) {
        const label = mode === 'app' ? 'application types' : 'appeal categories';
        toast(`This plan supports up to ${max} ${label} per panel.`, 'error');
        return;
    }
    const row = document.createElement('div');
    row.className = 'dash-cat-row';
    const showExtras = (mode === 'app' || mode === 'appeal');
    row.innerHTML = `
        <div class="dash-cat-emoji-cell">
            <input type="text" class="dash-cat-emoji" placeholder="📋 or &lt;:name:id&gt;" value="${escA(cat?.emoji || '')}" maxlength="90" title="Unicode or custom emoji — use picker below or paste from Discord">
            <div class="dash-emoji-picks">${EMOJI_QUICK_PICKS.map(e => `<button type="button" class="dash-emoji-pick" data-emoji="${escA(e)}" title="Insert ${escA(e)}">${e}</button>`).join('')}</div>
        </div>
        <input type="text" class="dash-cat-name" placeholder="Button label" value="${escA(cat?.name || '')}" required>
        <input type="text" class="dash-cat-desc" placeholder="Description (optional)" value="${escA(cat?.description || '')}">
        ${showExtras ? `
        <div class="dash-cat-extras">
            ${mode === 'app' ? `
            <select class="dash-app-ping-role dash-select" title="Role to ping when this application is submitted">
                <option value="">— Ping role (optional) —</option>
            </select>
            <textarea class="dash-app-welcome dash-textarea" placeholder="Applicant welcome message (optional)." rows="2"></textarea>
            ` : ''}
            <div class="dash-questions-section">
                <div class="dash-questions-header">
                    <span class="dash-questions-label">Questions</span>
                    <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm dash-add-question-btn">
                        <span class="dash-plus-mark">+</span> Add question
                    </button>
                </div>
                <div class="dash-questions-list"></div>
            </div>
        </div>` : ''}
        <button type="button" class="dash-cat-remove">&times;</button>
    `;
    bindEmojiPicks(row);
    if (showExtras) {
        if (mode === 'app') {
            const roleSel = row.querySelector('.dash-app-ping-role');
            if (roleSel) {
                const selected = (cat?.ping_role_id != null ? String(cat.ping_role_id) : '').replace(/\D/g, '');
                const opts = (cachedRoles || []).map(r => `<option value="${escA(r.id)}"${String(r.id).replace(/\D/g, '') === selected ? ' selected' : ''}>@ ${esc(r.name)}</option>`).join('');
                roleSel.insertAdjacentHTML('beforeend', opts);
            }
            const welcome = row.querySelector('.dash-app-welcome');
            if (welcome) welcome.value = (cat?.application_welcome_message || '').toString();
        }
        const qList = row.querySelector('.dash-questions-list');
        const addBtn = row.querySelector('.dash-add-question-btn');
        if (addBtn) addBtn.addEventListener('click', () => qList.appendChild(buildQuestionRow()));
        if (Array.isArray(cat?.questions) && cat.questions.length) {
            cat.questions.forEach(q => qList.appendChild(buildQuestionRow(q)));
        }
    }
    row.querySelector('.dash-cat-remove').addEventListener('click', () => row.remove());
    container.appendChild(row);
}

function loadEditorChannelSelect(selectId, selectedId) {
    const sel = $(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Choose a channel —</option>' + cachedChannels.map(ch => {
        const s = selectedId && String(ch.id) === selectedId ? ' selected' : '';
        return `<option value="${escA(ch.id)}"${s}># ${esc(ch.name)}</option>`;
    }).join('');
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
    if (panelLimits && panelLimits.quick_responses) {
        const info = panelLimits.quick_responses;
        if (info.max !== -1 && info.count >= info.max) {
            toast(`Quick response limit reached (${info.count}/${info.max}). Upgrade for more!`, 'error');
            return;
        }
    }
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
        await fetchPanelLimits();
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
        await fetchPanelLimits();
        toast('Quick response deleted.');
    } catch {
        toast('Failed to delete.', 'error');
    }
}

// ─── Analytics ───────────────────────────────────────────────────────────────
async function fetchAnalytics(guildId, days) {
    const statsEl = $('analytics-stats');
    const catsEl = $('analytics-categories');
    const chartEl = $('analytics-chart');
    if (statsEl) statsEl.innerHTML = '<div class="dash-skeleton dash-skeleton-stat"></div>'.repeat(4);
    try {
        const data = await apiDash('analytics', 'GET', { guild_id: guildId, period: days });
        const avgLabel = data.avg_close_hours != null
            ? (data.avg_close_hours < 1 ? `${Math.round(data.avg_close_hours * 60)}m` : `${data.avg_close_hours}h`)
            : '—';
        if (statsEl) statsEl.innerHTML = `
            <div class="dash-stat-card" style="animation-delay:0s">
                <div class="dash-stat-icon" style="--c:#5865f2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                <div><span class="dash-stat-label">Total tickets</span><div class="dash-stat-value">${data.total || 0}</div></div>
            </div>
            <div class="dash-stat-card" style="animation-delay:.06s">
                <div class="dash-stat-icon" style="--c:#22c55e"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div>
                <div><span class="dash-stat-label">Open</span><div class="dash-stat-value">${data.open || 0}</div></div>
            </div>
            <div class="dash-stat-card" style="animation-delay:.12s">
                <div class="dash-stat-icon" style="--c:#f87171"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                <div><span class="dash-stat-label">Closed</span><div class="dash-stat-value">${data.closed || 0}</div></div>
            </div>
            <div class="dash-stat-card" style="animation-delay:.18s">
                <div class="dash-stat-icon" style="--c:#f59e0b"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
                <div><span class="dash-stat-label">Avg. close time</span><div class="dash-stat-value">${avgLabel}</div></div>
            </div>
        `;
        renderChart(data.by_day || []);
        const cats = data.by_category || [];
        if (catsEl) catsEl.innerHTML = cats.length
            ? cats.map((c, i) => `<div class="dash-cat-stat" style="animation-delay:${i * 0.04}s"><span>${esc(c.name)}</span><span class="dash-cat-count">${c.count}</span></div>`).join('')
            : '<p class="dash-empty">No category data for this period.</p>';
        const byDay = data.by_day || [];
        renderOverviewTrend(byDay.slice(-7));
    } catch {
        if (statsEl) statsEl.innerHTML = '<p class="dash-empty">Could not load analytics. Is the bot online?</p>';
        renderOverviewTrend(null, true);
    }
}

function renderChart(days) {
    const chart = $('analytics-chart');
    if (!chart) return;
    if (!days.length) { chart.innerHTML = '<p class="dash-empty">No ticket activity in this period.</p>'; return; }
    const max = Math.max(...days.map(d => d.count), 1);
    chart.innerHTML = `<div class="dash-bar-chart">${days.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, 3);
        return `<div class="dash-bar-col" title="${d.date}: ${d.count} ticket${d.count !== 1 ? 's' : ''}">
            <div class="dash-bar" style="height:${pct}%;--bar-i:${i}"></div>
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
