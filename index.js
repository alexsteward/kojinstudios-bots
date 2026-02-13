// ============================================
// KojinStudios Bots — Main Script
// bots.kojinstudios.com
// ============================================

// Bot data configuration
const botData = {
    bundle: {
        name: 'Complete Bundle',
        avatars: ['images/gavel.jpg', 'images/tickets.jpg', 'images/host.png'],
        price: '$12.00',
        priceId: 'price_1STSPeBV80dUyFnbpl8UTDJa',
        description: 'All three premium bots in a single subscription — moderation, support, and engagement.',
        features: [
            { title: 'Gavel — Moderation', desc: 'Complete automoderation, case management, and server protection' },
            { title: 'Tickets — Support', desc: 'Unlimited ticket categories, panels, and custom branding' },
            { title: 'Host — Engagement', desc: 'Weather, reaction roles, events, XP & leveling system' },
            { title: 'Custom Branding', desc: 'Fully customize every bot\'s appearance to match your server' },
            { title: 'Custom Commands', desc: 'Create unique commands and workflows across all bots' },
            { title: 'Priority Support', desc: 'Dedicated support channels with fastest response times' }
        ]
    },
    gavel: {
        name: 'Gavel',
        avatar: 'images/gavel.jpg',
        price: '$5.00',
        priceId: 'price_1RqJNHBV80dUyFnbQ70XJRYO',
        description: 'Professional automoderation with intelligent protection systems',
        features: [
            { title: 'Case Management System', desc: 'Comprehensive case tracking for all moderation actions' },
            { title: 'User Analytics', desc: 'Detailed insights on user behavior and server activity' },
            { title: 'Automod Configuration', desc: 'Customizable automod rules tailored to your server' },
            { title: 'Impersonation Protection', desc: 'Advanced detection and prevention of impersonation' },
            { title: 'Data Export', desc: 'Export moderation logs, cases, and analytics data' },
            { title: 'Custom Branding', desc: 'Customize bot appearance and messages with your branding' },
            { title: 'Custom Commands', desc: 'Create custom moderation commands for your team' },
            { title: 'Priority Support', desc: 'Dedicated support channels with faster response times' }
        ]
    },
    tickets: {
        name: 'Tickets',
        avatar: 'images/tickets.jpg',
        price: '$5.00',
        priceId: 'price_1RqJMQBV80dUyFnbodXxowjV',
        description: 'Professional customer service and support ticket system',
        features: [
            { title: 'Unlimited Categories', desc: 'Create unlimited ticket categories for different departments' },
            { title: 'Unlimited Panels', desc: 'Unlimited ticket panels with custom designs' },
            { title: 'Unlimited Tickets', desc: 'Handle as many support requests as needed' },
            { title: 'Custom Branding', desc: 'Customize ticket appearance with your branding' },
            { title: 'Custom Commands', desc: 'Create custom ticket commands for your support team' },
            { title: 'Priority Support', desc: 'Dedicated support channels with faster response times' }
        ]
    },
    kojinhost: {
        name: 'Host',
        avatar: 'images/host.png',
        price: '$5.00',
        priceId: 'price_1RqJMaBV80dUyFnbhCpWxsq8',
        description: 'Multi-purpose utility bot for server engagement',
        features: [
            { title: 'Weather System', desc: 'Real-time weather updates for any location worldwide' },
            { title: 'Reaction Roles', desc: 'Auto-assign roles based on reactions with customization' },
            { title: 'Event Management', desc: 'Create and manage server events with RSVP and reminders' },
            { title: 'XP & Leveling', desc: 'Gamify your server with levels, rewards, and leaderboards' },
            { title: 'Custom Branding', desc: 'Customize bot appearance with your server branding' },
            { title: 'Custom Commands', desc: 'Create custom utility commands for your community' },
            { title: 'Priority Support', desc: 'Dedicated support channels with faster response times' }
        ]
    },
    intella: {
        name: 'Intella',
        avatar: 'images/intella.png',
        price: 'FREE',
        priceId: null,
        oauthUrl: 'https://discord.com/oauth2/authorize?client_id=1393695244976918588&permissions=1126967206737984&integration_type=0&scope=bot+applications.commands',
        freeUntil: '8/1/26',
        description: 'Discord-first market information bot with economic calendar and news aggregation',
        features: [
            { title: 'Economic Calendar', desc: 'Track economic events with impact levels and timezone handling' },
            { title: 'Market News Aggregation', desc: 'Multi-source news from Yahoo Finance, Finnhub, and NewsAPI' },
            { title: 'Interactive Dashboard', desc: 'Single entry point (/intella) with quick news and event previews' },
            { title: 'News & Event Alerts', desc: 'Subscribe to updates for specific events and news topics' },
            { title: 'User & Server Configuration', desc: 'Per-user settings and server-wide configuration options' },
            { title: 'Real-time Market Data', desc: 'Access trading-related information without leaving Discord' }
        ]
    }
};

// Stripe configuration
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51QjpOCBV80dUyFnbuH8nf61vvtDKTCRPFoH0qr6jPdTYzgDu5O9lBbfz4lNGLd2sWZnfUaapzTGWXL5K16dsLOo000Uavqzn6I';
let stripe = null;
let currentBot = null;
let selectedGuildId = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initStripe();
    initNavigation();
    initMobileMenu();
    initScrollAnimations();
    initStatusBoard();
    setupPurchaseForm();
    handleOAuthCallback();
});

// ============================================
// STRIPE
// ============================================
function initStripe() {
    try {
        if (typeof Stripe === 'undefined') {
            console.error('Stripe.js failed to load');
            return;
        }
        stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    } catch (error) {
        console.error('Failed to initialize Stripe:', error);
    }
}

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
    const nav = document.getElementById('navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        if (scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
        lastScroll = scrollY;
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
                // Close mobile menu if open
                const mobileMenu = document.getElementById('mobile-menu');
                if (mobileMenu) mobileMenu.classList.remove('open');
            }
        });
    });
}

// ============================================
// MOBILE MENU
// ============================================
function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const menu = document.getElementById('mobile-menu');

    if (toggle && menu) {
        toggle.addEventListener('click', () => {
            menu.classList.toggle('open');
        });

        // Close on link click
        menu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menu.classList.remove('open');
            });
        });
    }
}

// ============================================
// SCROLL ANIMATIONS
// ============================================
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    });

    document.querySelectorAll('.showcase, .feature-card, .price-card, .bundle-highlight, .faq-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Add visible class styles
    const style = document.createElement('style');
    style.textContent = `
        .visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// STATUS BOARD (fake live metrics)
// ============================================
function initStatusBoard() {
    const latencyEls = document.querySelectorAll('.status-latency');
    const updatedEl = document.getElementById('status-updated');
    if (!latencyEls.length && !updatedEl) return;

    let seconds = 0;

    function tick() {
        // Slightly jitter latency values around their base
        latencyEls.forEach(el => {
            const base = parseFloat(el.getAttribute('data-base') || '0');
            if (!base) return;
            const delta = (Math.random() - 0.5) * 0.6; // ±0.3 ms
            const value = (base + delta);
            el.textContent = value.toFixed(1) + ' ms';
        });

        // Simple "last updated" label
        seconds += 5;
        if (updatedEl) {
            if (seconds <= 5) {
                updatedEl.textContent = 'Updated just now';
            } else if (seconds < 60) {
                updatedEl.textContent = `Updated ${seconds}s ago`;
            } else {
                const mins = Math.floor(seconds / 60);
                updatedEl.textContent = `Updated ${mins}m ago`;
            }
        }
    }

    // Initial paint
    tick();
    // Refresh every 5 seconds
    setInterval(tick, 5000);
}

// ============================================
// FAQ
// ============================================
function toggleFaq(trigger) {
    const item = trigger.closest('.faq-item');
    const content = item.querySelector('.faq-content');
    const isOpen = item.classList.contains('open');

    // Close all
    document.querySelectorAll('.faq-item.open').forEach(openItem => {
        openItem.classList.remove('open');
        openItem.querySelector('.faq-content').style.maxHeight = '0';
    });

    // Open clicked if it wasn't already open
    if (!isOpen) {
        item.classList.add('open');
        content.style.maxHeight = content.scrollHeight + 'px';
    }
}

// ============================================
// BOT DETAILS MODAL
// ============================================
function openBotModal(botName) {
    const modal = document.getElementById('bot-modal');
    const body = document.getElementById('modal-body');
    const bot = botData[botName];

    if (!bot || !modal || !body) return;

    const isBundle = botName === 'bundle';
    const isIntella = botName === 'intella';
    const avatarHTML = isBundle
        ? `<div class="modal-bot-avatar" style="display:flex;gap:4px;width:80px;height:80px;">
             ${bot.avatars.map(a => `<img src="${a}" style="width:33%;height:100%;object-fit:cover;border-radius:10px;">`).join('')}
           </div>`
        : `<div class="modal-bot-avatar"><img src="${bot.avatar}" alt="${bot.name}"></div>`;

    const priceDisplay = isIntella 
        ? `<div class="modal-bot-price-display">${bot.price}<span style="color:var(--text-3);font-weight:500;font-size:0.9rem;"> until ${bot.freeUntil}</span></div>`
        : `<div class="modal-bot-price-display">${bot.price}<span style="color:var(--text-3);font-weight:500;font-size:0.9rem;">/month</span></div>`;

    const actionButton = isIntella
        ? `<button class="btn btn-primary btn-lg" style="flex:1;" onclick="openAddBotModal('${botName}')">
             Add Bot — FREE
           </button>`
        : `<button class="btn btn-primary btn-lg" style="flex:1;" onclick="openPurchaseModalFromDetails('${botName}')">
             Get Started — ${bot.price}/mo
           </button>`;

    body.innerHTML = `
        <button class="modal-close" onclick="closeBotModal()">&times;</button>
        <div class="modal-bot-header">
            ${avatarHTML}
            <div>
                <h3 class="modal-bot-name">${bot.name}</h3>
                <p class="modal-bot-desc">${bot.description}</p>
                ${priceDisplay}
            </div>
        </div>
        <h4 class="modal-features-title">${isIntella ? 'Features' : 'Premium Features'}</h4>
        <div class="modal-features-list">
            ${bot.features.map(f => `
                <div class="modal-feature-item">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="rgba(0,184,148,0.15)"/><path d="M6 10l3 3 5-5" stroke="#00b894" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <div>
                        <strong>${f.title}</strong>
                        <p>${f.desc}</p>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="modal-actions-row">
            ${actionButton}
            <button class="btn btn-ghost btn-lg" onclick="closeBotModal()">Close</button>
        </div>
    `;

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeBotModal() {
    const modal = document.getElementById('bot-modal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

function openPurchaseModalFromDetails(botName) {
    closeBotModal();
    setTimeout(() => openPurchaseModal(botName), 250);
}

// ============================================
// PURCHASE MODAL
// ============================================
function openPurchaseModal(botName) {
    currentBot = botName;
    const bot = botData[botName];
    const modal = document.getElementById('purchase-modal');

    if (!bot || !modal) return;

    // Update display
    const avatarEl = document.getElementById('selected-bot-avatar');
    const nameEl = document.getElementById('selected-bot-name');
    const priceEl = document.getElementById('selected-bot-price');

    if (botName === 'bundle') {
        avatarEl.innerHTML = `<div style="display:flex;gap:3px;width:100%;height:100%;">${bot.avatars.map(a => `<img src="${a}" style="width:33%;height:100%;object-fit:cover;border-radius:8px;">`).join('')}</div>`;
    } else {
        avatarEl.innerHTML = `<img src="${bot.avatar}" alt="${bot.name}">`;
    }

    nameEl.textContent = bot.name;
    priceEl.textContent = bot.price + '/month';

    // Reset form
    const form = document.getElementById('purchase-form');
    if (form) form.reset();

    const validation = document.getElementById('guild-validation');
    if (validation) validation.textContent = '';

    const purchaseBtn = document.getElementById('purchase-btn');
    if (purchaseBtn) purchaseBtn.disabled = true;

    const errorMsg = document.getElementById('error-message');
    if (errorMsg) errorMsg.style.display = 'none';

    // Reset sections
    const oauthSection = document.getElementById('discord-oauth-section');
    const manualInput = document.getElementById('manual-input-container');
    const dropdown = document.getElementById('server-dropdown-container');

    if (oauthSection) oauthSection.style.display = 'block';
    if (manualInput) manualInput.style.display = 'block';
    if (dropdown) dropdown.style.display = 'none';

    selectedGuildId = null;

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closePurchaseModal() {
    const modal = document.getElementById('purchase-modal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
        currentBot = null;
        selectedGuildId = null;
    }
}

// ============================================
// PURCHASE FORM
// ============================================
function setupPurchaseForm() {
    // Discord OAuth button
    const discordBtn = document.getElementById('discord-login-btn');
    if (discordBtn) {
        discordBtn.addEventListener('click', initDiscordOAuth);
    }

    // Guild ID input
    const guildInput = document.getElementById('guild-id');
    if (guildInput) {
        guildInput.addEventListener('input', handleGuildIdInput);
        guildInput.addEventListener('paste', handleGuildIdPaste);
    }

    // Form submission
    const form = document.getElementById('purchase-form');
    if (form) {
        form.addEventListener('submit', handlePurchaseSubmit);
    }

    // Close modals on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeBotModal();
            closePurchaseModal();
        }
    });
}

// Guild ID input handling
function handleGuildIdInput(e) {
    let guildId = e.target.value.trim();
    const sanitized = guildId.replace(/\D/g, '');
    if (guildId !== sanitized) {
        e.target.value = sanitized;
        guildId = sanitized;
    }

    if (guildId.length > 19) {
        e.target.value = guildId.substring(0, 19);
        guildId = guildId.substring(0, 19);
    }

    const input = e.target;
    const validation = document.getElementById('guild-validation');
    const purchaseBtn = document.getElementById('purchase-btn');

    if (guildId === '') {
        input.className = 'form-input';
        validation.textContent = '';
        purchaseBtn.disabled = true;
        selectedGuildId = null;
        return;
    }

    if (/^\d{17,19}$/.test(guildId)) {
        input.className = 'form-input valid';
        validation.className = 'validation-msg valid';
        validation.textContent = 'Valid Server ID';
        purchaseBtn.disabled = false;
        selectedGuildId = guildId;
    } else {
        input.className = 'form-input invalid';
        validation.className = 'validation-msg invalid';
        validation.textContent = guildId.length < 17
            ? `Too short (${guildId.length}/17-19 digits)`
            : 'Invalid Server ID format';
        purchaseBtn.disabled = true;
        selectedGuildId = null;
    }
}

function handleGuildIdPaste(e) {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text');
    const sanitized = paste.replace(/\D/g, '').substring(0, 19);
    e.target.value = sanitized;
    e.target.dispatchEvent(new Event('input'));
}

// ============================================
// DISCORD OAUTH
// ============================================
async function initDiscordOAuth() {
    if (!currentBot) {
        showError('Please select a bot first');
        return;
    }

    try {
        const response = await fetch(`/.netlify/functions/discord-oauth?bot_name=${encodeURIComponent(currentBot)}`);
        const data = await response.json();

        if (data.authUrl) {
            sessionStorage.setItem('pendingBot', currentBot);
            window.location.href = data.authUrl;
        } else {
            const errMsg = data.error || 'Discord login is not configured. Use the Server ID field below.';
            showError(errMsg);
        }
    } catch (error) {
        console.warn('Discord OAuth not available:', error);
        showError('Could not start Discord login. Use the Server ID field below, or try again later.');
    }
}

async function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (!code) return;

    const loadingState = document.getElementById('server-loading-state');
    const oauthSection = document.getElementById('discord-oauth-section');
    const dropdownContainer = document.getElementById('server-dropdown-container');

    try {
        let botName = sessionStorage.getItem('pendingBot') || currentBot;
        if (!botName) return;

        if (!currentBot || !document.getElementById('purchase-modal').classList.contains('show')) {
            currentBot = botName;
            openPurchaseModal(botName);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (oauthSection) oauthSection.style.display = 'none';
        if (dropdownContainer) dropdownContainer.style.display = 'none';
        if (loadingState) loadingState.style.display = 'flex';

        const response = await fetch(`/.netlify/functions/discord-oauth?code=${code}&bot_name=${encodeURIComponent(botName)}`);
        const data = await response.json();

        if (loadingState) loadingState.style.display = 'none';

        const guildsWithBot = data.guildsWithBot || data.guilds || [];
        const otherGuilds = data.otherGuilds || [];
        const hasAny = guildsWithBot.length > 0 || otherGuilds.length > 0;

        if (data.success && hasAny) {
            showServerSelection(guildsWithBot, otherGuilds);
            window.history.replaceState({}, document.title, window.location.pathname);
            sessionStorage.removeItem('pendingBot');
        } else if (data.success && !hasAny) {
            showError('No servers found where this bot is added. Add the bot to your server first, or enter your Server ID below.');
        } else {
            showError(data.error || 'Could not load your servers. Use the Server ID field below, or try again.');
        }
    } catch (error) {
        console.error('OAuth callback error:', error);
        if (loadingState) loadingState.style.display = 'none';
        showError('Failed to fetch your Discord servers. Use the Server ID field below.');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showServerSelection(guildsWithBot, otherGuilds) {
    if (typeof otherGuilds === 'undefined') otherGuilds = [];
    const dropdownContainer = document.getElementById('server-dropdown-container');
    const dropdown = document.getElementById('server-select-dropdown');
    const manualContainer = document.getElementById('manual-input-container');
    const oauthSection = document.getElementById('discord-oauth-section');

    if (!dropdownContainer || !dropdown) return;

    if (oauthSection) oauthSection.style.display = 'none';
    if (manualContainer) manualContainer.style.display = 'none';
    dropdownContainer.style.display = 'block';

    let optionsHtml = '<option value="">Select a server...</option>';
    if (guildsWithBot.length > 0) {
        optionsHtml += '<optgroup label="Servers the bot is in">' +
            guildsWithBot.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('') + '</optgroup>';
    }
    if (otherGuilds.length > 0) {
        optionsHtml += '<optgroup label="Other servers">' +
            otherGuilds.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('') + '</optgroup>';
    }
    dropdown.innerHTML = optionsHtml;

    const newDropdown = dropdown.cloneNode(true);
    dropdown.parentNode.replaceChild(newDropdown, dropdown);

    const updatedDropdown = document.getElementById('server-select-dropdown');
    if (updatedDropdown) {
        updatedDropdown.addEventListener('change', function () {
            const guildId = this.value;
            if (guildId) {
                selectedGuildId = guildId;
                const purchaseBtn = document.getElementById('purchase-btn');
                if (purchaseBtn) purchaseBtn.disabled = false;
                const errorMsg = document.getElementById('error-message');
                if (errorMsg) errorMsg.style.display = 'none';
            } else {
                selectedGuildId = null;
                const purchaseBtn = document.getElementById('purchase-btn');
                if (purchaseBtn) purchaseBtn.disabled = true;
            }
        });
    }
}

// ============================================
// PAYMENT PROCESSING
// ============================================
async function handlePurchaseSubmit(e) {
    e.preventDefault();
    if (!selectedGuildId || !currentBot) {
        showError('Please select a server');
        return;
    }
    await processPayment(selectedGuildId, currentBot);
}

async function processPayment(guildId, botName) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const errorMessage = document.getElementById('error-message');

    if (!stripe) {
        showError('Payment system not available. Please refresh the page.');
        return;
    }

    try {
        loadingOverlay.style.display = 'flex';
        errorMessage.style.display = 'none';

        const bot = botData[botName];

        const response = await fetch('/.netlify/functions/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                priceId: bot.priceId,
                guildId: guildId,
                botName: botName,
                successUrl: `${window.location.origin}/success.html?session_id={CHECKOUT_SESSION_ID}&bot=${botName}`,
                cancelUrl: `${window.location.origin}/?cancelled=true`
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.sessionId) {
            throw new Error('No session ID received from server');
        }

        localStorage.setItem('lastPurchasedBot', botName);

        const result = await stripe.redirectToCheckout({ sessionId: data.sessionId });

        if (result.error) {
            throw new Error(result.error.message);
        }
    } catch (error) {
        console.error('Payment error:', error);
        loadingOverlay.style.display = 'none';

        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            showError('Unable to connect to payment server. Please check your internet connection.');
        } else if (error.message.includes('Invalid Guild ID')) {
            showError('Invalid Discord Server ID format. Please check and try again.');
        } else {
            showError(error.message || 'Payment processing failed. Please try again.');
        }
    }
}

function showError(message) {
    const el = document.getElementById('error-message');
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    }
}

// ============================================
// ADD BOT MODAL (for free bots like Intella)
// ============================================
function openAddBotModal(botName) {
    const bot = botData[botName];
    if (!bot || !bot.oauthUrl) {
        showError('Bot configuration error');
        return;
    }
    
    // Direct redirect to Discord OAuth
    window.location.href = bot.oauthUrl;
}

// ============================================
// EXPOSE TO GLOBAL SCOPE
// ============================================
window.openBotModal = openBotModal;
window.closeBotModal = closeBotModal;
window.openPurchaseModal = openPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.openPurchaseModalFromDetails = openPurchaseModalFromDetails;
window.openAddBotModal = openAddBotModal;
window.toggleFaq = toggleFaq;
