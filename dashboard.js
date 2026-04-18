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
let guildsDataCache = null;
let previousDashTab = null;
let qrEditingOriginalLabel = null;
let qrCache = [];
/** Synced with Analytics period; drives Overview ticket trend slice + refetch. */
let overviewTrendDays = 7;

const TAB_LABELS = {
    overview: 'Overview',
    config: 'Configuration',
    panels: 'Panels',
    responses: 'Quick responses',
    analytics: 'Analytics',
};

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initNavScroll();
    initOverviewFeedLayoutSync();
    initDashboardSidebar();

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
    on('qr-modal-backdrop',       'click', hideQRForm);
    on('qr-modal-close',          'click', hideQRForm);

    // Close panel editor on backdrop click
    const backdrop = document.querySelector('.dash-panel-editor-backdrop');
    if (backdrop) backdrop.addEventListener('click', closePanelEditor);

    document.querySelectorAll('.dash-nav-tab').forEach(t =>
        t.addEventListener('click', () => {
            if (!selectedGuildId) {
                toast('Select a server from the menu first.', 'error');
                return;
            }
            switchTab(t.dataset.tab);
            closeMobileSidebar();
        })
    );

    initServerDropdowns();

    // Quick-action tab shortcuts (overview)
    document.querySelectorAll('[data-go-tab]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(a.dataset.goTab);
            closeMobileSidebar();
        });
    });

    // Analytics period buttons (kept in sync with Overview ticket trend)
    document.querySelectorAll('.dash-period-btn').forEach(b =>
        b.addEventListener('click', () => {
            document.querySelectorAll('.dash-period-btn').forEach(x => {
                x.classList.remove('active');
                x.setAttribute('aria-selected', 'false');
            });
            b.classList.add('active');
            b.setAttribute('aria-selected', 'true');
            overviewTrendDays = parseInt(b.dataset.days, 10) || 7;
            syncOverviewTrendPeriodButtons(overviewTrendDays);
            fetchAnalytics(selectedGuildId, b.dataset.days);
        })
    );

    document.querySelectorAll('.dash-overview-trend-period').forEach(b =>
        b.addEventListener('click', () => {
            overviewTrendDays = parseInt(b.dataset.days, 10) || 7;
            syncOverviewTrendPeriodButtons(overviewTrendDays);
            document.querySelectorAll('#tab-analytics .dash-period-btn').forEach(x => {
                const on = x.dataset.days === String(overviewTrendDays);
                x.classList.toggle('active', on);
                x.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            if (selectedGuildId) fetchAnalytics(selectedGuildId, String(overviewTrendDays));
            else toast('Select a server first.', 'error');
        })
    );

    on('analytics-refresh-btn', 'click', () => {
        const active = document.querySelector('#tab-analytics .dash-period-btn.active')
            || document.querySelector('.dash-period-btn.active');
        const days = active?.dataset?.days || '7';
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
        closeMobileSidebar();
        closeServerMenus();
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
    if (panelLimits) {
        const key = kind === 'app' ? 'application_panels' : kind === 'appeal' ? 'appeal_panels' : 'ticket_panels';
        const info = panelLimits[key];
        if (info && typeof info.max_categories === 'number' && info.max_categories !== -1) return info.max_categories;
    }
    return 3;
}

function maxTypesForPlan() {
    return isPremiumPlan() ? 25 : 3;
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

/** Inclusive UTC calendar window for analytics (matches `webhook_server.handle_analytics`). */
function analyticsUtcRangeForPeriod(nDays) {
    const n = Math.max(1, Math.min(365, Number(nDays) || 7));
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (n - 1));
    return { start, end, n };
}

function formatUtcMd(d, alwaysYear) {
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const y = d.getUTCFullYear();
    return alwaysYear ? `${m}/${day}/${y}` : `${m}/${day}`;
}

/** Clock labels for overview hourly bottom axis (UTC). */
function formatUtcHourAxis12(h) {
    const n = Number(h);
    if (n === 0 || n === 24) return '12a';
    if (n < 12) return `${n}a`;
    if (n === 12) return '12p';
    return `${n - 12}p`;
}

/** M/D (or M/D–M/D) UTC calendar window for current analytics period. */
function overviewHourlyAnalyticsDateWindowPlain() {
    const n = Math.max(1, Math.min(365, overviewTrendDays || 7));
    const { start, end } = analyticsUtcRangeForPeriod(n);
    const needsYear = start.getUTCFullYear() !== end.getUTCFullYear();
    const a = formatUtcMd(start, needsYear);
    const b = formatUtcMd(end, needsYear);
    if (n === 1 || a === b) return a;
    return `${a}–${b}`;
}

function overviewHourlyDataDatePhrase() {
    return `Dates in data: ${overviewHourlyAnalyticsDateWindowPlain()}`;
}

/** Tooltip for hourly axis tick: UTC bucket + calendar dates included in analytics. */
function overviewHourlyAxisTickTitle(tickHour) {
    const n = Math.max(1, Math.min(365, overviewTrendDays || 7));
    const dateWin = overviewHourlyAnalyticsDateWindowPlain();
    const hh = String(tickHour).padStart(2, '0');
    const useClock = n === 1;
    const bucket = `UTC ${hh}:00–${hh}:59`;
    if (useClock) {
        const clk = formatUtcHourAxis12(tickHour);
        return `${bucket} (${clk}) · Dates in data: ${dateWin}`;
    }
    return `${bucket} · Dates in data: ${dateWin} (${n}d range)`;
}

/** Stacked vertical label (e.g. 0 / 0 for 00) + title with date window. */
function buildOverviewHourlyAxisHtml() {
    const ticks = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
    const useClock = (overviewTrendDays || 7) === 1;
    return ticks.map(h => {
        const label = useClock ? formatUtcHourAxis12(h) : String(h).padStart(2, '0');
        const stacked = label.split('').map(c => `<span class="dash-hourly-axis-c">${esc(c)}</span>`).join('');
        const title = overviewHourlyAxisTickTitle(h);
        return `<span class="dash-hourly-axis-tick" title="${escA(title)}"><span class="dash-hourly-axis-stack">${stacked}</span></span>`;
    }).join('');
}

function setOverviewHourlySubtitle() {
    const sub = $('overview-hourly-subtitle');
    if (!sub) return;
    const n = overviewTrendDays || 7;
    if (n === 1) {
        sub.textContent = 'Opens grouped by UTC hour for the selected calendar day.';
    } else {
        sub.textContent = `UTC clock-hour totals across the full ${n}d range (not a single-day timeline).`;
    }
}

/** Analytics window shown under hourly chart (same UTC range as ticket trend). */
function formatHourlyPeriodFoot() {
    const n = Math.max(1, Math.min(365, overviewTrendDays || 7));
    const { start, end } = analyticsUtcRangeForPeriod(n);
    const needsYear = start.getUTCFullYear() !== end.getUTCFullYear();
    const a = formatUtcMd(start, needsYear);
    const b = formatUtcMd(end, needsYear);
    if (n === 1 || a === b) return `${a} · UTC`;
    return `${a}–${b} · ${n}d · UTC`;
}

function kojinActorHeaders() {
    const h = {};
    const user = stored(STORAGE_USER) || null;
    if (user?.id) {
        h['X-Kojin-Actor-Id'] = String(user.id);
        if (user.username) h['X-Kojin-Actor-Name'] = String(user.username);
        if (user.avatar) h['X-Kojin-Actor-Avatar'] = String(user.avatar);
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
    document.querySelector('.dash-layout')?.classList.add('dash-layout--no-server');
    const av  = $('dashboard-user-avatar');
    const ini = $('dashboard-user-initial');
    const disp = $('dashboard-user-display');
    const handle = $('dashboard-user-handle');
    const uname = user.username || '';
    const gname = user.global_name || '';
    if (av && user.avatar) {
        av.src = user.avatar; av.style.display = 'block';
        if (ini) ini.style.display = 'none';
    } else if (ini) {
        ini.textContent = (uname || '?')[0].toUpperCase();
        ini.style.display = 'flex';
    }
    if (disp) disp.textContent = gname || uname || 'User';
    if (handle) handle.textContent = uname ? `@${uname}` : '';
    renderGuildList(guilds);
}

function renderGuildList(guilds) {
    guildsDataCache = guilds;
    const withBot = Array.isArray(guilds.guildsWithBot) ? guilds.guildsWithBot : (guilds.guilds || []);
    const other   = Array.isArray(guilds.otherGuilds) ? guilds.otherGuilds : [];
    const all     = [...withBot, ...other];
    const botSet  = new Set(withBot.map(g => g.id));
    const sidebarMenu = $('dash-sidebar-server-menu');
    const noSrv   = $('discord-no-servers');

    function guildOptionHtml(g) {
        const has = botSet.has(g.id);
        const mc = g.memberCount != null && g.memberCount > 0
            ? `${Number(g.memberCount).toLocaleString()} members`
            : '';
        let metaLine = '';
        if (mc && has) metaLine = `${mc} · Tickets bot`;
        else if (mc) metaLine = mc;
        else if (has) metaLine = 'Tickets bot connected';
        const active = String(selectedGuildId) === String(g.id);
        return `<button type="button" class="dash-server-picker-option${active ? ' active' : ''}" data-id="${escA(g.id)}" role="option" aria-selected="${active ? 'true' : 'false'}">
            <div class="dash-guild-icon-wrap">
            ${g.icon ? `<img src="${escA(g.icon)}" alt="">` : `<span class="dash-guild-initial">${esc((g.name || '?')[0])}</span>`}
            </div>
            <div class="dash-guild-info">
                <div class="dash-guild-name-row">
                    <span class="dash-guild-name">${esc(g.name)}</span>
                    ${has ? '<span class="dash-guild-badge">Tickets</span>' : ''}
                </div>
                ${metaLine ? `<span class="dash-guild-meta">${esc(metaLine)}</span>` : ''}
            </div>
        </button>`;
    }

    if (!all.length) {
        if (sidebarMenu) { sidebarMenu.innerHTML = ''; sidebarMenu.setAttribute('hidden', ''); }
        if (noSrv) noSrv.style.display = 'block';
        setSidebarServerTriggerPlaceholder();
        return;
    }
    if (noSrv) noSrv.style.display = 'none';

    const menuRows = all.map(g => guildOptionHtml(g)).join('');
    if (sidebarMenu) sidebarMenu.innerHTML = menuRows;

    if (selectedGuild) updateServerPickerButton(selectedGuild);
    else setSidebarServerTriggerPlaceholder();
}

function findGuildById(rawId) {
    if (!guildsDataCache || rawId == null) return null;
    const withBot = Array.isArray(guildsDataCache.guildsWithBot) ? guildsDataCache.guildsWithBot : (guildsDataCache.guilds || []);
    const other = Array.isArray(guildsDataCache.otherGuilds) ? guildsDataCache.otherGuilds : [];
    const all = [...withBot, ...other];
    const sid = String(rawId);
    return all.find(x => String(x.id) === sid) || null;
}

function setSidebarServerTriggerPlaceholder() {
    const lab = $('dash-sidebar-server-trigger-label');
    const ic = $('dash-sidebar-server-trigger-icon');
    if (lab) lab.textContent = 'Select a server';
    if (ic) ic.innerHTML = '';
}

function closeServerMenus() {
    const sidebarMenu = $('dash-sidebar-server-menu');
    const sb = $('dash-sidebar-server-trigger');
    if (sidebarMenu) sidebarMenu.setAttribute('hidden', '');
    if (sb) sb.setAttribute('aria-expanded', 'false');
}

function initServerDropdowns() {
    function bindDropdown(triggerId, menuId, wrapSelector) {
        const btn = $(triggerId);
        const menu = $(menuId);
        const wrap = document.querySelector(wrapSelector);
        if (!btn || !menu) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isClosed = menu.hasAttribute('hidden');
            if (isClosed) {
                menu.removeAttribute('hidden');
                btn.setAttribute('aria-expanded', 'true');
            } else {
                menu.setAttribute('hidden', '');
                btn.setAttribute('aria-expanded', 'false');
            }
        });
        if (wrap) wrap.addEventListener('click', (e) => e.stopPropagation());
    }

    bindDropdown('dash-sidebar-server-trigger', 'dash-sidebar-server-menu', '.dash-sidebar-server-dd');

    function onGuildOptionPick(e) {
        const btn = e.target.closest('.dash-server-picker-option');
        if (!btn?.dataset?.id) return;
        e.preventDefault();
        e.stopPropagation();
        const g = findGuildById(btn.dataset.id);
        if (g) {
            selectServer(g);
            closeServerMenus();
        }
    }
    document.querySelector('.dash-sidebar-server-dd')?.addEventListener('click', onGuildOptionPick);
}

function updateServerPickerButton(guild) {
    const sLab = $('dash-sidebar-server-trigger-label');
    const sIcon = $('dash-sidebar-server-trigger-icon');
    if (sLab) sLab.textContent = guild.name || '—';
    if (sIcon) {
        if (guild.icon) {
            sIcon.innerHTML = `<img src="${escA(guild.icon)}" alt="">`;
        } else {
            sIcon.innerHTML = `<span class="dash-guild-initial">${esc((guild.name || '?')[0])}</span>`;
        }
    }
    document.querySelectorAll('.dash-server-picker-option').forEach(opt => {
        const on = String(opt.dataset.id) === String(guild.id);
        opt.classList.toggle('active', on);
        opt.setAttribute('aria-selected', on ? 'true' : 'false');
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

    document.querySelector('.dash-layout')?.classList.remove('dash-layout--no-server');
    if (guildsDataCache) renderGuildList(guildsDataCache);
    updateServerPickerButton(guild);

    closeMobileSidebar();

    switchTab('overview');
    loadServerData();
}

function backToServers() {
    selectedGuildId = null;
    selectedGuild   = null;
    $('dash-welcome').style.display = 'flex';
    $('dash-server').style.display  = 'none';
    document.querySelector('.dash-layout')?.classList.add('dash-layout--no-server');
    closeServerMenus();
    closeMobileSidebar();
    setSidebarServerTriggerPlaceholder();

}

function isMobileDashboardSidebar() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
}

function closeMobileSidebar() {
    const sidebar = document.querySelector('.dash-sidebar');
    const layout = document.querySelector('.dash-layout');
    const backdrop = $('dash-sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (layout) layout.classList.remove('dash-layout--sidebar-open');
    if (backdrop) {
        backdrop.hidden = true;
        backdrop.setAttribute('aria-hidden', 'true');
    }
    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.setAttribute('aria-label', 'Open navigation menu');
    });
    if (document.body.classList.contains('dash-sidebar-open')) {
        document.body.classList.remove('dash-sidebar-open');
        document.body.style.overflow = '';
    }
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.dash-sidebar');
    const layout = document.querySelector('.dash-layout');
    const backdrop = $('dash-sidebar-backdrop');
    if (!sidebar) return;
    const willOpen = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', willOpen);
    if (layout) layout.classList.toggle('dash-layout--sidebar-open', willOpen);
    if (backdrop) {
        backdrop.hidden = !willOpen;
        backdrop.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
    }
    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach(b => {
        b.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        b.setAttribute('aria-label', willOpen ? 'Close navigation menu' : 'Open navigation menu');
    });
    if (willOpen && isMobileDashboardSidebar()) {
        document.body.classList.add('dash-sidebar-open');
        document.body.style.overflow = 'hidden';
    } else {
        document.body.classList.remove('dash-sidebar-open');
        document.body.style.overflow = '';
    }
}

function initDashboardSidebar() {
    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileSidebar();
        });
    });

    const backdrop = $('dash-sidebar-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            closeMobileSidebar();
        });
    }

    document.addEventListener('click', (e) => {
        closeServerMenus();
        if (!isMobileDashboardSidebar()) return;
        const sidebar = document.querySelector('.dash-sidebar');
        if (!sidebar?.classList.contains('open')) return;
        if (e.target.closest('.dash-sidebar')) return;
        if (e.target.closest('[data-action="toggle-sidebar"]')) return;
        closeMobileSidebar();
    });

    window.addEventListener('resize', () => {
        if (!isMobileDashboardSidebar()) closeMobileSidebar();
    }, { passive: true });
}

function switchTab(tab) {
    const fromTab = previousDashTab;
    previousDashTab = tab;
    document.querySelectorAll('.dash-nav-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === tab)
    );
    const bc = $('dash-breadcrumb-tab');
    if (bc) bc.textContent = TAB_LABELS[tab] || tab;
    document.querySelectorAll('.dash-tab-content').forEach(c => {
        const isTarget = c.dataset.tab === tab;
        c.classList.toggle('active', isTarget);
        if (isTarget) {
            c.style.animation = 'none';
            c.offsetHeight; // force reflow
            c.style.animation = '';
        }
    });
    if (tab === 'overview' && selectedGuildId && fromTab != null && fromTab !== 'overview') {
        refreshOverviewData();
    }
    if (tab === 'overview') {
        requestAnimationFrame(() => syncOverviewFeedLayout());
    }
}

/** Light refresh when returning to Overview so new tickets / analytics show without a full reload. */
async function refreshOverviewData() {
    if (!selectedGuildId) return;
    try {
        const statusData = await api('server-status', { guild_id: selectedGuildId });
        renderOverview(statusData);
        const days = document.querySelector('#tab-analytics .dash-period-btn.active')?.dataset?.days
            || document.querySelector('.dash-period-btn.active')?.dataset?.days
            || '7';
        overviewTrendDays = parseInt(days, 10) || 7;
        syncOverviewTrendPeriodButtons(overviewTrendDays);
        await fetchAnalytics(selectedGuildId, days);
        const [ra, audit] = await Promise.allSettled([
            apiDash('recent-activity', 'GET', { guild_id: selectedGuildId, limit: 14 }),
            apiDash('audit-log', 'GET', { guild_id: selectedGuildId, limit: 18 }),
        ]);
        renderRecentActivity(ra.status === 'fulfilled' ? ra.value : null);
        renderAuditLog(audit.status === 'fulfilled' ? audit.value : null);
    } catch { /* ignore */ }
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
        await fetchPanelLimits();
        fetchPanels();
        fetchAppPanels();
        fetchAppealPanels();
        fetchCustomEmbeds();
        fetchQR();
        const analyticsDays = document.querySelector('#tab-analytics .dash-period-btn.active')?.dataset?.days
            || document.querySelector('.dash-period-btn.active')?.dataset?.days
            || '7';
        overviewTrendDays = parseInt(analyticsDays, 10) || 7;
        syncOverviewTrendPeriodButtons(overviewTrendDays);
        await fetchAnalytics(selectedGuildId, analyticsDays);

        const [ra, audit] = await Promise.allSettled([
            apiDash('recent-activity', 'GET', { guild_id: selectedGuildId, limit: 14 }),
            apiDash('audit-log', 'GET', { guild_id: selectedGuildId, limit: 18 }),
        ]);
        renderRecentActivity(ra.status === 'fulfilled' ? ra.value : null);
        renderAuditLog(audit.status === 'fulfilled' ? audit.value : null);
        if (ra.status === 'fulfilled' && ra.value && ra.value._ok === false && ra.value.error) {
            toast(`Recent activity: ${ra.value.error}`, 'error');
        }
        if (audit.status === 'fulfilled' && audit.value && audit.value._ok === false && audit.value.error) {
            toast(`Audit log: ${audit.value.error}`, 'error');
        }

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
    requestAnimationFrame(() => {
        requestAnimationFrame(() => syncOverviewFeedLayout());
    });
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
        if (user.avatar) opts.headers['X-Kojin-Actor-Avatar'] = String(user.avatar);
        opts.headers['X-Kojin-Source'] = 'dashboard';
    }
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}/.netlify/functions/dashboard-api?${qs}`, opts);
    let data = {};
    try {
        data = await res.json();
    } catch {
        data = { error: 'Invalid response from dashboard API' };
    }
    data._ok = res.ok;
    data._status = res.status;
    if (!res.ok && !data.error) {
        data.error = data.message || `Request failed (${res.status})`;
    }
    return data;
}

// ─── Overview ────────────────────────────────────────────────────────────────
function formatAvgCloseHours(h) {
    if (h == null || Number.isNaN(h)) return '—';
    if (h < 1) return `${Math.round(h * 60)}m`;
    const whole = Math.floor(h);
    const m = Math.round((h - whole) * 60);
    if (m === 0) return `${whole}h`;
    return `${whole}h ${m}m`;
}

function renderUptimeCard(data) {
    const inServer = data && data.tickets === true;
    const bars = $('overview-uptime-bars');
    const meta = $('overview-uptime-meta');
    const state = $('overview-uptime-state');
    const dot = $('overview-uptime-dot');
    if (!bars) return;

    const dayList = Array.isArray(data?.uptime_bars) ? data.uptime_bars : null;
    if (dayList && dayList.length === 30) {
        bars.innerHTML = dayList.map((d, idx) => {
            const st = d.state || 'unknown';
            let extra = '';
            if (st === 'down') extra = ' dash-uptime-bar--warn';
            else if (st === 'unknown') extra = ' dash-uptime-bar--unknown';
            const dayNum = idx + 1;
            const title = `Day ${dayNum} of 30 · ${d.date || '—'} · ${st === 'ok' ? 'Bot reachable' : st === 'down' ? 'Bot not in server when checked' : 'No check that day'}`;
            return `<div class="dash-uptime-bar${extra}" title="${escA(title)}"></div>`;
        }).join('');
    } else {
        bars.innerHTML = Array.from({ length: 30 }, (_, i) =>
            `<div class="dash-uptime-bar${inServer ? '' : ' dash-uptime-bar--warn'}" title="${escA(inServer ? `Day ${i + 1} of 30 · sample ${i + 1} — ${i < 29 ? 'Operational' : 'Today'}` : 'Unavailable')}"></div>`
        ).join('');
    }

    if (meta) {
        const pct = data?.uptime_pct;
        const sub = data?.uptime_sub || '';
        if (typeof pct === 'number' && !Number.isNaN(pct)) {
            meta.textContent = sub ? `${pct}% — last 30 days · ${sub}` : `${pct}% — last 30 days`;
        } else {
            meta.textContent = sub || (inServer ? 'Collecting daily samples when you open the dashboard' : '— last 30 days');
        }
    }
    if (state) {
        state.textContent = inServer ? 'Operational' : 'Unavailable';
        state.classList.toggle('bad', !inServer);
    }
    if (dot) dot.classList.toggle('dash-uptime-dot--bad', !inServer);
}

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
    const statusEl = $('overview-bot-status');
    if (statusEl) {
        statusEl.innerHTML = inServer
            ? '<span class="dash-status-dot green"></span> Online'
            : '<span class="dash-status-dot red"></span> Not in server';
    }

    const lat = $('overview-latency');
    if (lat) {
        const ms = data.latency_ms;
        if (typeof ms === 'number') {
            const ok = ms < 150;
            lat.innerHTML = `<span class="dash-latency-val ${ok ? 'good' : 'warn'}">${ms} ms</span> latency`;
        } else lat.textContent = inServer ? '—' : '—';
    }

    const sub = data.subscription;
    const subEl = $('overview-subscription');
    if (subEl) {
        subEl.innerHTML = sub === 'premium'
            ? '<span class="dash-badge-sm premium">Premium</span>'
            : sub === 'free'
                ? '<span class="dash-badge-sm free">Free</span>'
                : '<span class="dash-badge-sm none">Unknown</span>';
    }
    const planHint = $('overview-plan-hint');
    if (planHint) {
        if (sub === 'premium') planHint.textContent = 'All features unlocked';
        else if (sub === 'free') planHint.textContent = 'Upgrade for higher panel limits';
        else planHint.textContent = '';
    }

    if (typeof data.ticket_count === 'number') animateCount($('overview-ticket-count'), data.ticket_count);
    else {
        const el = $('overview-ticket-count');
        if (el) el.textContent = '—';
    }

    const ticketSub = $('overview-ticket-sub');
    if (ticketSub) {
        const openN = typeof data.open_tickets === 'number' ? data.open_tickets : null;
        const totalN = typeof data.ticket_count === 'number' ? data.ticket_count : null;
        let closedN = null;
        if (openN != null && totalN != null) closedN = Math.max(0, totalN - openN);
        const panels = typeof data.panel_count === 'number' ? data.panel_count : null;
        if (openN != null && closedN != null && panels != null) {
            ticketSub.textContent = `${openN.toLocaleString()} open · ${closedN.toLocaleString()} closed · ${panels} panels`;
        } else if (openN != null && closedN != null) {
            ticketSub.textContent = `${openN.toLocaleString()} open · ${closedN.toLocaleString()} closed`;
        } else if (openN != null) {
            ticketSub.textContent = `${openN.toLocaleString()} open`;
        } else ticketSub.textContent = '—';
        if (panelLimits && typeof data.panel_count === 'number') {
            const t = panelLimits.ticket_panels || {};
            const a = panelLimits.application_panels || {};
            const ap = panelLimits.appeal_panels || {};
            const ce = panelLimits.custom_embed_panels || {};
            ticketSub.title = `🎫 Tickets: ${t.count ?? 0}/${t.max === -1 ? '∞' : t.max ?? '?'}\n📋 Applications: ${a.count ?? 0}/${a.max === -1 ? '∞' : a.max ?? '?'}\n⚖️ Appeals: ${ap.count ?? 0}/${ap.max === -1 ? '∞' : ap.max ?? '?'}\n🎨 Custom: ${ce.count ?? 0}/${ce.max === -1 ? '∞' : ce.max ?? '?'}`;
        } else ticketSub.removeAttribute('title');
    }

    const members = $('overview-members');
    if (members) {
        if (typeof data.member_count === 'number') animateCount(members, data.member_count);
        else members.textContent = '—';
    }

    renderUptimeCard(data);

    const pageGuild = $('overview-page-guild');
    if (pageGuild) pageGuild.textContent = data.guild_name || '—';

    const sideName = $('dash-sidebar-server-trigger-label');
    if (sideName && data.guild_name) sideName.textContent = data.guild_name;

    const btn = $('detail-get-tickets-btn');
    const btnLabel = btn?.querySelector?.('.dash-overview-cta-btn-inner');
    if (btn && selectedGuildId) {
        btn.href = `${BASE}/index.html?buy=tickets&guild_id=${encodeURIComponent(selectedGuildId)}`;
        const label = inServer ? 'Manage subscription' : 'Get Tickets';
        if (btnLabel) btnLabel.textContent = label;
        else btn.textContent = label;
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

function syncOverviewTrendPeriodButtons(days) {
    const d = String(days);
    document.querySelectorAll('.dash-overview-trend-period').forEach(b => {
        const on = b.dataset.days === d;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}

function clearOverviewTrendChartVars(chart) {
    if (!chart) return;
    chart.style.removeProperty('--overview-trend-bars');
    chart.style.removeProperty('--overview-trend-col-w');
    chart.style.removeProperty('--overview-trend-gap');
}

/**
 * 1d ticket trend: 24 UTC-hour columns (opens), axis 12a/2a/… like hourly activity.
 * Returns true if this view handled rendering.
 */
function renderOverviewTrendAsHourly(chart, totalEl, hint, byHour, byDay) {
    if (!Array.isArray(byHour) || byHour.length !== 24) return false;
    const day0 = Array.isArray(byDay) && byDay[0] ? byDay[0] : null;
    const sumH = byHour.reduce((a, b) => a + b, 0);
    const createdDay = day0 ? (day0.created ?? day0.count ?? 0) : sumH;
    const closedDay = day0 ? (day0.closed ?? 0) : 0;
    if (sumH === 0 && createdDay === 0 && closedDay === 0) {
        chart.innerHTML = '<div class="dash-trend-empty"><span class="dash-trend-empty-icon">📊</span><p>No ticket activity yet</p><span class="dash-trend-empty-sub">No opens in the last UTC calendar day</span></div>';
        clearOverviewTrendChartVars(chart);
        if (totalEl) totalEl.textContent = '0';
        if (hint) hint.textContent = 'No tickets in the last UTC day.';
        const subE = $('overview-trend-subtitle');
        if (subE) subE.textContent = 'Opens by UTC hour (UTC day)';
        return true;
    }
    const max = Math.max(1, ...byHour);
    if (totalEl) totalEl.textContent = (createdDay || sumH).toLocaleString();
    const colsHtml = byHour.map((v, i) => {
        const pct = v > 0 ? Math.max((v / max) * 100, 3) : 0;
        const h12 = formatUtcHourAxis12(i);
        const showLab = (i % 2 === 0) || i === 23;
        const h24 = `${String(i).padStart(2, '0')}:00`;
        const a11y = escA(`${h24} UTC · ${v} open${v === 1 ? '' : 's'}`);
        return `<div class="dash-bar-col dash-bar-col--overview-dual dash-bar-col--ov-hourly-trend" aria-label="${a11y}">
            <div class="dash-overview-bar-tip" aria-hidden="true">
                <span class="dash-overview-bar-tip-date">${esc(h12)} UTC</span>
                <span class="dash-overview-bar-tip-stats"><strong>${v}</strong> open${v === 1 ? '' : 's'}</span>
            </div>
            <div class="dash-overview-dual-bar-pair dash-overview-dual-bar-pair--opens-only">
                <div class="dash-bar dash-bar--ov-created" style="height:${pct}%"></div>
            </div>
            <span class="dash-bar-label${showLab ? '' : ' dash-bar-label--faint'}">${showLab ? esc(h12) : '\u00a0'}</span>
        </div>`;
    }).join('');
    chart.innerHTML = `<div class="dash-overview-trend-fit">
        <div class="dash-overview-trend-inner dash-bar-chart dash-bar-chart--overview-dual dash-bar-chart--overview-dual-hours">${colsHtml}</div>
    </div>`;
    clearOverviewTrendChartVars(chart);
    const sub = $('overview-trend-subtitle');
    if (sub) sub.textContent = 'Opens by UTC hour (UTC day)';
    if (hint) {
        hint.textContent = closedDay > 0
            ? `${(createdDay || sumH).toLocaleString()} created · ${closedDay.toLocaleString()} closed this UTC day (opens by hour below).`
            : `${sumH.toLocaleString()} open${sumH === 1 ? '' : 's'} by UTC hour in the selected day.`;
    }
    return true;
}

/** Grouped daily bars (created vs closed), or 24h opens when range is 1d. */
function renderOverviewTrend(byDay, error, byHourOneDay) {
    const chart = $('overview-trend-chart');
    const hint = $('overview-trend-hint');
    const totalEl = $('overview-trend-total');
    const link = $('overview-trend-analytics-link');
    if (!chart) return;
    if (link) {
        link.href = '#';
        link.onclick = (e) => {
            e.preventDefault();
            document.querySelector('.dash-nav-tab[data-tab="analytics"]')?.click();
        };
    }
    const nDays = overviewTrendDays || 7;
    if (error) {
        chart.innerHTML = '';
        clearOverviewTrendChartVars(chart);
        if (totalEl) totalEl.textContent = '—';
        if (hint) hint.textContent = 'Could not load trend.';
        const subErr = $('overview-trend-subtitle');
        if (subErr) subErr.textContent = 'Created vs closed per day';
        return;
    }
    if (!error && nDays === 1 && renderOverviewTrendAsHourly(chart, totalEl, hint, byHourOneDay, byDay)) return;

    if (!byDay || !byDay.length) {
        chart.innerHTML = '<div class="dash-trend-empty"><span class="dash-trend-empty-icon">📊</span><p>No ticket activity yet</p><span class="dash-trend-empty-sub">Tickets will appear here once created</span></div>';
        clearOverviewTrendChartVars(chart);
        if (totalEl) totalEl.textContent = '0';
        if (hint) hint.textContent = `No tickets in the last ${nDays} days.`;
        const sub0 = $('overview-trend-subtitle');
        if (sub0) sub0.textContent = 'Created vs closed per day';
        return;
    }
    const createdSum = byDay.reduce((a, d) => a + (d.created ?? d.count ?? 0), 0);
    const closedSum = byDay.reduce((a, d) => a + (d.closed ?? 0), 0);
    const max = Math.max(1, ...byDay.map(d => {
        const c = d.created ?? d.count ?? 0;
        const cl = d.closed ?? 0;
        return Math.max(c, cl);
    }));
    if (totalEl) totalEl.textContent = createdSum.toLocaleString();

    const n = byDay.length;

    const labelEvery = n > 45 ? Math.max(1, Math.ceil(n / 14))
        : n > 24 ? Math.max(1, Math.ceil(n / 12))
            : n > 14 ? Math.max(1, Math.ceil(n / 10))
                : 1;

    /** 7d: Mon Tue … on axis; 30d/90d: M/D dates; 1d handled above. */
    const useDateOnAxis = nDays > 7;
    const colsHtml = byDay.map((d, i) => {
        const created = d.created ?? d.count ?? 0;
        const closed = d.closed ?? 0;
        const pctC = created > 0 ? Math.max((created / max) * 100, 4) : 0;
        const pctCl = closed > 0 ? Math.max((closed / max) * 100, 4) : 0;
        const datePart = String(d.date || '').trim();
        const wkPart = String(d.label || '').trim();
        const bottomLabel = useDateOnAxis
            ? (datePart || wkPart || '')
            : (wkPart || datePart || '');
        const tipHead = useDateOnAxis && datePart && wkPart
            ? `${datePart} (${wkPart})`
            : (bottomLabel || datePart || wkPart || '—');
        const showLab = (i % labelEvery === 0) || (i === n - 1);
        const a11y = escA(`${tipHead} · ${created} created, ${closed} closed`);
        const tipDate = esc(tipHead);
        return `<div class="dash-bar-col dash-bar-col--overview-dual" aria-label="${a11y}">
            <div class="dash-overview-bar-tip" aria-hidden="true">
                <span class="dash-overview-bar-tip-date">${tipDate}</span>
                <span class="dash-overview-bar-tip-stats"><strong>${created}</strong> created · <strong>${closed}</strong> closed</span>
            </div>
            <div class="dash-overview-dual-bar-pair">
                <div class="dash-bar dash-bar--ov-created" style="height:${pctC}%"></div>
                <div class="dash-bar dash-bar--ov-closed" style="height:${pctCl}%"></div>
            </div>
            <span class="dash-bar-label${showLab ? '' : ' dash-bar-label--faint'}">${showLab ? esc(bottomLabel) : '\u00a0'}</span>
        </div>`;
    }).join('');

    const axisMod = useDateOnAxis ? ' dash-bar-chart--overview-dual-dates' : '';
    chart.innerHTML = `<div class="dash-overview-trend-fit">
        <div class="dash-overview-trend-inner dash-bar-chart dash-bar-chart--overview-dual${axisMod}">${colsHtml}</div>
    </div>`;
    const sub = $('overview-trend-subtitle');
    if (sub) sub.textContent = 'Created vs closed per day';
    if (hint) {
        hint.textContent = createdSum === 0 && closedSum === 0
            ? `No tickets in the last ${nDays} days.`
            : `${createdSum.toLocaleString()} created · ${closedSum.toLocaleString()} closed in this range.`;
    }
}

function renderOverviewHourly(byHour, error) {
    const el = $('overview-hourly-chart');
    const hint = $('overview-hourly-hint');
    if (!el) return;
    if (error) {
        el.className = 'dash-hourly-chart-wrap';
        el.innerHTML = '<p class="dash-empty dash-empty--tight">Could not load hourly activity.</p>';
        if (hint) hint.textContent = '';
        const subE = $('overview-hourly-subtitle');
        if (subE) subE.textContent = 'By hour of day (UTC)';
        return;
    }
    if (!Array.isArray(byHour) || byHour.length !== 24) {
        el.className = 'dash-hourly-chart-wrap';
        el.innerHTML = '<div class="dash-trend-empty" style="min-height:100px"><p>No hourly data</p></div>';
        if (hint) hint.textContent = '';
        const subB = $('overview-hourly-subtitle');
        if (subB) subB.textContent = 'By hour of day (UTC)';
        return;
    }
    const periodN = overviewTrendDays || 7;
    el.className = 'dash-hourly-chart-wrap' + (periodN === 1 ? ' dash-hourly-chart-wrap--1d' : ' dash-hourly-chart-wrap--agg');
    setOverviewHourlySubtitle();
    const sum = byHour.reduce((a, b) => a + b, 0);
    if (hint) {
        hint.textContent = sum === 0
            ? 'No opens in this range — switch period or wait for new tickets.'
            : `${sum.toLocaleString()} opens · ${periodN === 1 ? 'UTC day' : `rolled up across ${periodN}d`}`;
    }
    if (sum === 0) {
        const axisHtml = buildOverviewHourlyAxisHtml();
        const periodHtml = esc(formatHourlyPeriodFoot());
        const egid = 'oh-empty-grad-' + String(selectedGuildId || 'dash').replace(/\W/g, '');
        el.innerHTML = `<div class="dash-hourly-empty-rich">
  <div class="dash-hourly-empty-visual" aria-hidden="true">
    <svg class="dash-hourly-empty-svg" viewBox="0 0 100 48" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${egid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,71,87,0.08)"/>
          <stop offset="100%" stop-color="rgba(255,71,87,0)"/>
        </linearGradient>
      </defs>
      <polygon fill="url(#${egid})" points="0,48 0,42 16,40 32,41 50,38 68,39 84,37 100,36 100,48"/>
      <polyline fill="none" stroke="rgba(148,163,184,0.45)" stroke-width="1" stroke-dasharray="4 3" stroke-linecap="round"
        points="2,42 18,40 34,41 50,38 66,39 82,37 98,36"/>
    </svg>
    <div class="dash-hourly-axis dash-hourly-axis--ghost">${axisHtml}</div>
    <div class="dash-hourly-period-range dash-hourly-period-range--ghost">${periodHtml}</div>
  </div>
  <div class="dash-hourly-empty-msg">
    <p class="dash-hourly-empty-title">Nothing to plot yet</p>
    <p class="dash-hourly-empty-desc">Opens will stack into these UTC hour buckets once tickets come in. <strong>1d</strong> is the tightest slice; <strong>30d / 90d</strong> smooths busy servers.</p>
  </div>
</div>`;
        return;
    }
    const max = Math.max(...byHour, 1);
    const rawPeak = Math.max(...byHour);
    const solePeakHour = rawPeak > 0 && byHour.filter(x => x === rawPeak).length === 1;
    const W = 100;
    const H = 48;
    const pad = 2;
    const linePts = byHour.map((v, i) => {
        const x = pad + (i / 23) * (W - 2 * pad);
        const y = H - pad - (v / max) * (H - 2 * pad) * 0.9;
        return [x, y];
    });
    const polylineAttr = linePts.map(([x, y]) => `${x},${y}`).join(' ');
    const gid = 'ohgrad-' + String(selectedGuildId || 'dash').replace(/\W/g, '') + '-fill';
    const datePhrase = overviewHourlyDataDatePhrase();
    const hourlyColTip = (v, i) => {
        const label = `${String(i).padStart(2, '0')}:00 UTC`;
        const opensPhrase = v === 1 ? '1 open' : `${v} opens`;
        return `<span class="dash-hourly-col-tip" aria-hidden="true">
                <span class="dash-hourly-col-tip-count">${esc(String(v))}</span>
                <span class="dash-hourly-col-tip-meta">${esc(`${opensPhrase} · ${label} · ${datePhrase}`)}</span>
            </span>`;
    };
    const hitLayer = byHour.map((v, i) => {
        const label = `${String(i).padStart(2, '0')}:00 UTC`;
        const opensPhrase = v === 1 ? '1 open' : `${v} opens`;
        const aria = escA(`${label} · ${opensPhrase} · ${datePhrase}`);
        return `<div class="dash-hourly-hit" style="--i:${i}" aria-label="${aria}">${hourlyColTip(v, i)}</div>`;
    }).join('');
    const valuesRow = byHour.map((v, i) => {
        const label = `${String(i).padStart(2, '0')}:00 UTC`;
        const opensPhrase = v === 1 ? '1 open' : `${v} opens`;
        const aria = escA(`${label} · ${opensPhrase} · ${datePhrase}`);
        const z = v === 0 ? ' dash-hourly-val--zero' : '';
        const pk = solePeakHour && v === rawPeak ? ' dash-hourly-val--peak' : '';
        return `<span class="dash-hourly-val${z}${pk}" aria-label="${aria}">${esc(String(v))}${hourlyColTip(v, i)}</span>`;
    }).join('');
    el.innerHTML = `<div class="dash-hourly-svg-wrap">
  <svg class="dash-hourly-svg dash-hourly-svg--fill" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,71,87,0.45)"/>
        <stop offset="100%" stop-color="rgba(255,71,87,0)"/>
      </linearGradient>
    </defs>
    <polygon fill="url(#${gid})" points="0,${H} ${polylineAttr} ${W},${H}" />
    <polyline fill="none" stroke="var(--d-accent)" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" points="${polylineAttr}" />
  </svg>
  <div class="dash-hourly-hit-layer" role="presentation">${hitLayer}</div>
</div>
  <div class="dash-hourly-values-row" aria-hidden="true">${valuesRow}</div>
  <div class="dash-hourly-axis">${buildOverviewHourlyAxisHtml()}</div>
  <div class="dash-hourly-period-range" aria-hidden="true">${esc(formatHourlyPeriodFoot())}</div>`;
}

let overviewFeedLayoutRo = null;
function syncOverviewFeedLayout() {
    const grid = document.querySelector('.dash-overview-bottom-grid');
    const actions = document.querySelector('.dash-overview-col--actions');
    if (!grid || !actions) return;
    const h = Math.round(actions.getBoundingClientRect().height);
    if (h > 0) grid.style.setProperty('--overview-actions-height', `${h}px`);
}

function initOverviewFeedLayoutSync() {
    const actions = document.querySelector('.dash-overview-col--actions');
    if (!actions || overviewFeedLayoutRo) return;
    const run = () => requestAnimationFrame(syncOverviewFeedLayout);
    overviewFeedLayoutRo = new ResizeObserver(run);
    overviewFeedLayoutRo.observe(actions);
    window.addEventListener('resize', run, { passive: true });
    run();
}

function formatRelativeTime(iso) {
    if (!iso) return '—';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '—';
    const diff = Date.now() - t;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

function renderRecentActivity(data) {
    const el = $('overview-recent-activity');
    if (!el) return;
    if (data && data._ok === false && data.error) {
        el.innerHTML = `<div class="dash-feed-empty">Could not load recent activity. ${esc(data.error)}</div>`;
        requestAnimationFrame(() => syncOverviewFeedLayout());
        return;
    }
    const tickets = data?.tickets;
    if (!tickets || !tickets.length) {
        el.innerHTML = '<div class="dash-feed-empty">No recent tickets yet.</div>';
        requestAnimationFrame(() => syncOverviewFeedLayout());
        return;
    }
    el.innerHTML = tickets.map(t => {
        const rel = formatRelativeTime(t.created_at);
        const num = t.ticket_number != null && t.ticket_number !== '' ? String(t.ticket_number) : '—';
        const rawTitle = t.title || 'Ticket';
        const rawCat = t.category || 'General';
        const rawSt = (t.status || 'open').replace(/_/g, ' ');
        const titleLine = esc(rawTitle);
        const cat = esc(rawCat);
        const st = esc(rawSt);
        const rowTitle = escA(`${rawTitle} · #${num} · ${rawCat} · ${rawSt} · ${rel}`);
        return `<div class="dash-feed-row" role="listitem" title="${rowTitle}">
            <div class="dash-feed-row-icon" aria-hidden="true">🎫</div>
            <div class="dash-feed-row-body">
                <div class="dash-feed-row-title">${titleLine}</div>
                <div class="dash-feed-row-meta">
                    <span class="dash-feed-pill dash-feed-pill--ticket">#${esc(num)}</span>
                    <span class="dash-feed-pill">${cat}</span>
                    <span class="dash-feed-pill dash-feed-pill--muted">${st}</span>
                    <span class="dash-feed-time">${esc(rel)}</span>
                </div>
            </div>
        </div>`;
    }).join('');
    requestAnimationFrame(() => syncOverviewFeedLayout());
}

function renderAuditLog(data) {
    const el = $('overview-audit-log');
    if (!el) return;
    if (data && data._ok === false && data.error) {
        el.innerHTML = `<div class="dash-feed-empty">Could not load audit log. ${esc(data.error)}</div>`;
        requestAnimationFrame(() => syncOverviewFeedLayout());
        return;
    }
    const events = data?.events;
    const hint = data?.hint;
    if (Array.isArray(events) && events.length) {
        el.innerHTML = events.map(ev => {
            const tag = esc(ev.type || 'event');
            const who = esc(ev.actor || '—');
            const when = esc(formatRelativeTime(ev.at));
            return `<div class="dash-feed-row dash-feed-row--audit" role="listitem">
                <div class="dash-feed-row-body">
                    <div class="dash-feed-row-title">${esc(ev.message || ev.description || '')}</div>
                    <div class="dash-feed-row-meta">
                        <span class="dash-feed-pill dash-feed-pill--tag">${tag}</span>
                        <span class="dash-feed-pill dash-feed-pill--muted">${who}</span>
                        <span class="dash-feed-time">${when}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
        requestAnimationFrame(() => syncOverviewFeedLayout());
        return;
    }
    el.innerHTML = `<div class="dash-feed-empty dash-feed-empty--soft">${esc(hint || 'No web audit entries yet. Configure log channels in Discord to track admin actions.')}</div>`;
    requestAnimationFrame(() => syncOverviewFeedLayout());
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

    const ping = $('cfg-ping-support');
    const thread = $('cfg-thread-mode');
    const dm = $('cfg-dm-notify');
    const ac = $('cfg-auto-close');
    const hrs = $('cfg-auto-close-hours');
    const hv = $('cfg-auto-close-val');
    const premium = !!cfg.is_premium;
    if (ping) ping.checked = !!cfg.ping_support_on_ticket;
    if (thread) thread.checked = !!cfg.thread_mode;
    if (dm) dm.checked = !!cfg.dm_ticket_notifications;
    if (ac) ac.checked = !!cfg.auto_close_enabled;
    if (hrs) {
        const h = Number(cfg.auto_close_hours);
        hrs.value = Number.isFinite(h) ? String(Math.min(168, Math.max(6, h))) : '48';
    }
    if (hv && hrs) hv.textContent = hrs.value;
    applyConfigPremiumState(premium);
    if (hrs && hv) {
        hrs.oninput = () => { hv.textContent = hrs.value; };
    }
}

function applyConfigPremiumState(premium) {
    const ban = $('cfg-premium-banner');
    if (ban) ban.classList.toggle('is-visible', !premium);
    ['cfg-ping-support', 'cfg-thread-mode', 'cfg-dm-notify', 'cfg-auto-close', 'cfg-auto-close-hours'].forEach(id => {
        const el = $(id);
        if (el) el.disabled = !premium;
    });
    const wrap = $('cfg-auto-close-slider-wrap');
    if (wrap) wrap.classList.toggle('is-disabled', !premium);
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
        ping_support_on_ticket:     !!$('cfg-ping-support')?.checked,
        thread_mode:                !!$('cfg-thread-mode')?.checked,
        dm_ticket_notifications:    !!$('cfg-dm-notify')?.checked,
        auto_close_enabled:         !!$('cfg-auto-close')?.checked,
        auto_close_hours:           parseInt($('cfg-auto-close-hours')?.value || '48', 10) || 48,
    };

    try {
        const res = await apiDash('config', 'PATCH', { guild_id: selectedGuildId }, body);
        if (res._ok && res.ok !== false) {
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

    let panelCount = 0;
    try {
        const data   = await api('panels', { guild_id: selectedGuildId });
        const panels = data.panels || [];
        panelCount = panels.length;
        if (!panels.length) {
            list.innerHTML = '<p class="dash-empty">No panels yet. Create one to get started.</p>';
        } else {
            list.innerHTML = panels.map((p, i) => {
                const title = p.title || 'Untitled Panel';
                let catCount = 0;
                try { catCount = (JSON.parse(p.panel_data).categories || []).length; } catch {}
                const ch     = cachedChannels.find(c => String(c.id) === String(p.channel_id));
                const chName = ch ? `# ${esc(ch.name)}` : `Channel ${p.channel_id}`;
                return `<div class="dash-panel-card ticket-type" data-id="${p.id}" style="animation-delay:${i * 0.05}s">
                    <div class="dash-panel-card-top">
                        <h4>🎫 ${esc(title)}</h4>
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
    updateCountFromList('ticket-panel-count', panelCount, 'ticket_panels');
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
        const data = await apiDash('panel-limits', 'GET', { guild_id: selectedGuildId });
        if (data && data.ticket_panels) {
            panelLimits = data;
        } else {
            console.warn('[Dashboard] panel-limits returned unexpected shape:', data);
        }
    } catch (e) {
        console.warn('[Dashboard] fetchPanelLimits failed:', e);
        panelLimits = null;
    }
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

    updateCountBadge('ticket-panel-count', l.ticket_panels);
    updateCountBadge('app-panel-count', l.application_panels);
    updateCountBadge('appeal-panel-count', l.appeal_panels);
    if (l.custom_embed_panels) updateCountBadge('custom-embed-panel-count', l.custom_embed_panels);
}

function updateCountBadge(id, info) {
    const el = $(id);
    if (!el) return;
    if (!info) { el.textContent = '—'; return; }
    const count = info.count ?? 0;
    const max = info.max === -1 ? '∞' : info.max;
    el.textContent = `${count}/${max}`;
    el.className = 'dash-panel-count' + (info.max !== -1 && count >= info.max ? ' at-limit' : '');
}

const FREE_PANEL_DEFAULTS = { ticket_panels: 2, application_panels: 2, appeal_panels: 2, custom_embed_panels: 1 };
const LIMIT_KEY_TO_BTN = {
    ticket_panels: 'detail-create-panel-btn',
    application_panels: 'create-app-panel-btn',
    appeal_panels: 'create-appeal-panel-btn',
    custom_embed_panels: 'create-custom-embed-btn',
};

function updateCountFromList(id, listCount, limitKey) {
    const info = panelLimits ? panelLimits[limitKey] : null;
    const rawMax = info ? info.max : FREE_PANEL_DEFAULTS[limitKey] ?? 2;
    const max = rawMax === -1 ? '∞' : rawMax;
    const atLimit = rawMax !== -1 && listCount >= rawMax;
    const el = $(id);
    if (el) {
        el.textContent = `${listCount}/${max}`;
        el.className = 'dash-panel-count' + (atLimit ? ' at-limit' : '');
    }
    const btnId = LIMIT_KEY_TO_BTN[limitKey];
    const btn = btnId ? $(btnId) : null;
    if (btn) {
        btn.disabled = atLimit;
        btn.title = atLimit ? `Limit reached (${max}). Upgrade to Premium for unlimited.` : '';
        btn.style.opacity = atLimit ? '0.45' : '';
        btn.style.pointerEvents = atLimit ? 'none' : '';
    }
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
    let panelCount = 0;
    try {
        const data   = await apiDash('app-panels', 'GET', { guild_id: selectedGuildId });
        const panels = data.panels || [];
        panelCount = panels.length;
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
    updateCountFromList('app-panel-count', panelCount, 'application_panels');
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
    let panelCount = 0;
    try {
        const data   = await apiDash('appeal-panels', 'GET', { guild_id: selectedGuildId });
        const panels = data.panels || [];
        panelCount = panels.length;
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
    updateCountFromList('appeal-panel-count', panelCount, 'appeal_panels');
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
    let panelCount = 0;
    try {
        const data = await api('custom-embed-panels', { guild_id: selectedGuildId });
        const panels = data.panels || [];
        panelCount = panels.length;
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
    updateCountFromList('custom-embed-panel-count', panelCount, 'custom_embed_panels');
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
function qrModalOnEscape(e) {
    if (e.key === 'Escape') hideQRForm();
}

function openQRModal() {
    const modal = $('qr-modal');
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', qrModalOnEscape);
}

function closeQRModal() {
    const modal = $('qr-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', qrModalOnEscape);
}

async function fetchQR() {
    const list = $('qr-list');
    const empty = $('qr-empty');
    const sub = $('qr-usage-sub');
    const usageText = $('qr-usage-text');
    const usageFill = $('qr-usage-fill');
    const usageBarWrap = $('qr-usage-bar-wrap');
    const addBtn = $('qr-add-btn');
    if (!list) return;
    try {
        const data = await apiDash('quick-responses', 'GET', { guild_id: selectedGuildId });
        const qr = data.responses || [];
        qrCache = qr;
        const qrMax = panelLimits?.quick_responses?.max ?? 5;
        const unlimited = qrMax === -1;
        const count = panelLimits?.quick_responses != null
            ? (panelLimits.quick_responses.count ?? qr.length)
            : qr.length;
        const pct = unlimited ? 100 : Math.min(100, qrMax > 0 ? (count / qrMax) * 100 : 0);

        if (sub) {
            sub.textContent = unlimited
                ? `${qr.length} response${qr.length === 1 ? '' : 's'}`
                : `${qr.length}/${qrMax} responses used`;
        }
        if (usageText) {
            usageText.textContent = unlimited ? `${count} (unlimited)` : `${count} of ${qrMax}`;
        }
        if (usageFill) {
            usageFill.classList.toggle('dash-qr-usage-fill--unlimited', unlimited);
            usageFill.style.width = unlimited ? '100%' : `${pct}%`;
        }
        if (usageBarWrap) {
            usageBarWrap.setAttribute('aria-valuenow', String(Math.round(pct)));
            usageBarWrap.setAttribute('aria-valuemax', '100');
        }
        if (addBtn) {
            const atLimit = !unlimited && count >= qrMax;
            addBtn.disabled = !!atLimit;
        }

        if (empty) empty.style.display = qr.length ? 'none' : '';

        if (!qr.length) {
            list.innerHTML = '';
        } else {
            const rowIcon = `<div class="dash-qr-row-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>`;
            list.innerHTML = qr.map((r, i) => `
                <div class="dash-qr-row">
                    ${rowIcon}
                    <div class="dash-qr-row-body">
                        <div class="dash-qr-row-top">
                            <span class="dash-qr-label">${esc(r.label)}</span>
                            <span class="dash-qr-used">Used 0×</span>
                        </div>
                        <div class="dash-qr-msg">${esc(r.message || '')}</div>
                    </div>
                    <div class="dash-qr-row-actions">
                        <button type="button" class="dash-qr-edit" data-idx="${i}" title="Edit" aria-label="Edit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" class="dash-qr-delete" data-name="${escA(r.label)}" title="Delete" aria-label="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </div>`).join('');
            list.querySelectorAll('.dash-qr-edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-idx'), 10);
                    openQRModalEdit(Number.isFinite(idx) ? idx : 0);
                });
            });
            list.querySelectorAll('.dash-qr-delete').forEach(btn =>
                btn.addEventListener('click', () => deleteQR(btn.dataset.name))
            );
        }
    } catch {
        qrCache = [];
        if (empty) empty.style.display = 'none';
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
    qrEditingOriginalLabel = null;
    const title = $('qr-modal-title');
    if (title) title.textContent = 'New response';
    const saveBtn = $('qr-save-btn');
    if (saveBtn) saveBtn.textContent = 'Create';
    $('qr-label').value = '';
    $('qr-message').value = '';
    openQRModal();
    $('qr-label').focus();
}

function openQRModalEdit(idx) {
    const r = qrCache[idx];
    if (!r) return;
    qrEditingOriginalLabel = r.label;
    const title = $('qr-modal-title');
    if (title) title.textContent = 'Edit response';
    const saveBtn = $('qr-save-btn');
    if (saveBtn) saveBtn.textContent = 'Save';
    $('qr-label').value = r.label;
    $('qr-message').value = r.message || '';
    openQRModal();
    $('qr-label').focus();
}

function hideQRForm() {
    closeQRModal();
    qrEditingOriginalLabel = null;
}

async function saveQR() {
    const label = $('qr-label').value.trim();
    const message = $('qr-message').value.trim();
    if (!label || !message) { toast('Label and message are required.', 'error'); return; }
    const orig = qrEditingOriginalLabel;
    const btn = $('qr-save-btn');
    if (btn) btn.disabled = true;
    try {
        if (orig && orig !== label) {
            const del = await apiDash('quick-responses', 'DELETE', { guild_id: selectedGuildId, name: orig });
            if (del.error) throw new Error(del.error);
        }
        const res = await apiDash('quick-responses', 'POST', { guild_id: selectedGuildId }, { guild_id: selectedGuildId, label, message });
        if (res.error) throw new Error(res.error);
        hideQRForm();
        fetchQR();
        await fetchPanelLimits();
        toast(orig ? 'Quick response updated!' : 'Quick response added!');
    } catch (err) {
        toast(err.message || 'Failed to save.', 'error');
    } finally {
        if (btn) btn.disabled = false;
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
    const rangeLabel = String(days || '30');
    const periodNum = parseInt(rangeLabel, 10) || overviewTrendDays || 7;
    const headline = $('analytics-headline');
    if (headline) {
        const { start, end } = analyticsUtcRangeForPeriod(periodNum);
        const y0 = start.getUTCFullYear();
        const y1 = end.getUTCFullYear();
        const needsYear = y0 !== y1;
        const span = `${formatUtcMd(start, needsYear)}–${formatUtcMd(end, needsYear)}`;
        headline.textContent = `${span} (${rangeLabel}d, UTC) — tickets opened, categories, and average close time.`;
    }
    if (statsEl) statsEl.innerHTML = '<div class="dash-skeleton dash-skeleton-stat"></div>'.repeat(4);
    try {
        const data = await apiDash('analytics', 'GET', { guild_id: guildId, period: days });
        if (!data._ok) {
            if (statsEl) statsEl.innerHTML = `<p class="dash-empty">${esc(data.error || 'Could not load analytics.')}</p>`;
            const avKpi = $('overview-avg-response');
            if (avKpi) avKpi.textContent = '—';
            renderOverviewTrend(null, true);
            renderOverviewHourly(null, true);
            toast(data.error || 'Analytics unavailable. Set DASHBOARD_BACKEND_URL on Netlify and ensure the bot API is reachable.', 'error');
            return;
        }
        const avgLabel = formatAvgCloseHours(data.avg_close_hours);
        const avKpi = $('overview-avg-response');
        if (avKpi) avKpi.textContent = avgLabel;
        if (statsEl) statsEl.innerHTML = `
            <div class="dash-stat-card dash-kpi-card" style="--c:#5865f2;--i:0">
                <div class="dash-kpi-top">
                    <span class="dash-stat-label">Total tickets</span>
                    <div class="dash-stat-icon dash-kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                </div>
                <div class="dash-kpi-main">
                    <div class="dash-stat-value">${data.total || 0}</div>
                    <p class="dash-stat-sub dash-stat-sub--muted">In selected range</p>
                </div>
            </div>
            <div class="dash-stat-card dash-kpi-card" style="--c:#22c55e;--i:1">
                <div class="dash-kpi-top">
                    <span class="dash-stat-label">Open</span>
                    <div class="dash-stat-icon dash-kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div>
                </div>
                <div class="dash-kpi-main">
                    <div class="dash-stat-value">${data.open || 0}</div>
                    <p class="dash-stat-sub dash-stat-sub--muted">Still open now</p>
                </div>
            </div>
            <div class="dash-stat-card dash-kpi-card" style="--c:#f87171;--i:2">
                <div class="dash-kpi-top">
                    <span class="dash-stat-label">Closed</span>
                    <div class="dash-stat-icon dash-kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                </div>
                <div class="dash-kpi-main">
                    <div class="dash-stat-value">${data.closed || 0}</div>
                    <p class="dash-stat-sub dash-stat-sub--muted">Resolved in range</p>
                </div>
            </div>
            <div class="dash-stat-card dash-kpi-card" style="--c:#f59e0b;--i:3">
                <div class="dash-kpi-top">
                    <span class="dash-stat-label">Avg. close time</span>
                    <div class="dash-stat-icon dash-kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
                </div>
                <div class="dash-kpi-main">
                    <div class="dash-stat-value">${avgLabel}</div>
                    <p class="dash-stat-sub dash-stat-sub--muted">Mean time to close</p>
                </div>
            </div>
        `;
        renderChart(data.by_day || []);
        const cats = data.by_category || [];
        if (catsEl) {
            if (!cats.length) {
                catsEl.innerHTML = '<p class="dash-empty dash-empty--compact">No category data for this period.</p>';
            } else {
                const maxC = Math.max(...cats.map(c => c.count), 1);
                const sum = cats.reduce((s, c) => s + (c.count || 0), 0) || 1;
                catsEl.innerHTML = cats.map((c, i) => {
                    const pctOfTotal = Math.round(((c.count || 0) / sum) * 100);
                    return `
                    <div class="dash-analytics-cat-item" style="animation-delay:${i * 0.04}s">
                        <div class="dash-analytics-cat-top">
                            <span class="dash-analytics-cat-name" title="${escA(c.name)}">${esc(c.name)}</span>
                            <span class="dash-analytics-cat-meta"><span class="dash-analytics-cat-count">${c.count}</span><span class="dash-analytics-cat-pct">${pctOfTotal}%</span></span>
                        </div>
                        <div class="dash-analytics-cat-bar" role="presentation" aria-hidden="true">
                            <div class="dash-analytics-cat-bar-fill" style="width:${(c.count / maxC) * 100}%"></div>
                        </div>
                    </div>`;
                }).join('');
            }
        }
        const td = overviewTrendDays || 7;
        const byDaySlice = (data.by_day || []).slice(-td);
        renderOverviewTrend(byDaySlice, false, data.by_hour);
        renderOverviewHourly(Array.isArray(data.by_hour) && data.by_hour.length === 24 ? data.by_hour : null);
    } catch {
        if (statsEl) statsEl.innerHTML = '<p class="dash-empty">Could not load analytics. Is the bot online?</p>';
        const avKpi = $('overview-avg-response');
        if (avKpi) avKpi.textContent = '—';
        renderOverviewTrend(null, true);
        renderOverviewHourly(null, true);
    }
}

function renderChart(days) {
    const chart = $('analytics-chart');
    if (!chart) return;
    if (!days.length) {
        chart.innerHTML = '<p class="dash-empty dash-empty--compact">No ticket activity in this period.</p>';
        chart.style.removeProperty('--analytics-bars');
        chart.style.removeProperty('--analytics-col-w');
        chart.style.removeProperty('--analytics-gap');
        return;
    }
    const n = days.length;
    const max = Math.max(...days.map(d => d.count), 1);
    const gapPx = 3;
    const colW = n > 75 ? 4 : n > 50 ? 5 : n > 32 ? 6 : n > 18 ? 8 : n > 12 ? 10 : 14;
    chart.style.setProperty('--analytics-bars', String(n));
    chart.style.setProperty('--analytics-col-w', `${colW}px`);
    chart.style.setProperty('--analytics-gap', `${gapPx}px`);

    const labelEvery = n > 45 ? Math.max(1, Math.ceil(n / 14))
        : n > 24 ? Math.max(1, Math.ceil(n / 12))
            : n > 14 ? Math.max(1, Math.ceil(n / 10))
                : 1;

    const barsHtml = days.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, 2);
        const dayLabel = d.label || d.date;
        const showLab = (i % labelEvery === 0) || (i === n - 1);
        return `<div class="dash-bar-col" title="${escA(dayLabel)}: ${d.count} ticket${d.count !== 1 ? 's' : ''}">
            <div class="dash-bar dash-bar--analytics" style="height:${pct}%;--bar-i:${i}"></div>
            <span class="dash-bar-label${showLab ? '' : ' dash-bar-label--faint'}">${showLab ? esc(dayLabel) : '\u00a0'}</span>
        </div>`;
    }).join('');

    const scrollHint = n > 18
        ? '<p class="dash-analytics-chart-hint"><span class="dash-analytics-chart-hint-icon" aria-hidden="true"></span>Scroll horizontally to see every day in this range.</p>'
        : '';

    chart.innerHTML = `${scrollHint}<div class="dash-analytics-chart-scroll">
        <div class="dash-analytics-chart-inner dash-bar-chart dash-bar-chart--analytics-bars">${barsHtml}</div>
    </div>`;
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
