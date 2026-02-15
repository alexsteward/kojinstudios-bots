// netlify/functions/stripe-webhook.js
// KojinStudios Bots — Stripe Webhook Handler (bots.kojinstudios.com)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let payload = event.body;
    if (event.isBase64Encoded) {
        payload = Buffer.from(event.body, 'base64').toString('utf8');
    }

    const sig = event.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return { statusCode: 400, body: JSON.stringify({ error: 'Webhook signature verification failed' }) };
    }

    try {
        console.log('Received event:', stripeEvent.type);

        switch (stripeEvent.type) {
            case 'checkout.session.completed':
                const session = stripeEvent.data.object;
                if (session.mode === 'payment') {
                    await handleDonation(session);
                } else {
                    await handleSubscriptionStart(session);
                }
                break;

            case 'invoice.payment_succeeded':
                await handleRecurringPayment(stripeEvent.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionCanceled(stripeEvent.data.object);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(stripeEvent.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(stripeEvent.data.object);
                break;

            case 'invoice.upcoming':
                await handleUpcomingInvoice(stripeEvent.data.object);
                break;

            default:
                console.log(`Unhandled event type: ${stripeEvent.type}`);
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (err) {
        console.error('Webhook handler error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Webhook processing failed', detail: err.message })
        };
    }
};

// Handle donation payment
async function handleDonation(session) {
    const donorName = session.metadata?.donor_name || 'Anonymous';
    const donorMessage = session.metadata?.donor_message || '';
    const amount = (session.amount_total / 100).toFixed(2);

    await sendDonationNotification(donorName, amount, donorMessage, session);
}

// Send donation Discord notification
async function sendDonationNotification(donorName, amount, message, session) {
    const webhookUrl = process.env.DISCORD_DONATION_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const embed = {
        title: 'New Donation Received',
        description: `Thank you ${donorName} for your generous donation!`,
        color: 0xf1c40f,
        fields: [
            { name: 'Amount', value: `$${amount}`, inline: true },
            { name: 'Donor', value: donorName, inline: true },
            { name: 'Email', value: session.customer_details?.email || 'Not provided', inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'KojinStudios Bots — Donation System' }
    };

    if (message) {
        embed.fields.push({ name: 'Message', value: message.substring(0, 1024), inline: false });
    }

    await sendWebhook(webhookUrl, embed);
}

// Handle successful subscription start
async function handleSubscriptionStart(session) {
    const guildId = session.client_reference_id || session.metadata?.guild_id;
    const botName = session.metadata?.bot_name;

    if (!guildId) {
        console.error('No guild ID found in session');
        return;
    }

    console.log(`Activating ${botName} for guild: ${guildId}`);
    await sendDiscordNotification(guildId, botName, 'activated', session);
    await updateBotDatabase(guildId, botName, session, 'activated');
}

// Handle recurring payment
async function handleRecurringPayment(invoice) {
    if (!invoice.subscription) return; // Skip one-time payments
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const customer = await stripe.customers.retrieve(invoice.customer);

    const guildId = customer.metadata?.guild_id || subscription.metadata?.guild_id;
    const botName = customer.metadata?.bot_name || subscription.metadata?.bot_name;
    const amount = (invoice.amount_paid / 100).toFixed(2);
    const customerEmail = customer.email || invoice.customer_email;

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const embed = {
        title: 'Recurring Payment Received',
        description: 'Monthly subscription payment processed successfully',
        color: 0x00ff00,
        fields: [
            { name: 'Amount', value: `$${amount}`, inline: true },
            { name: 'Billing Period', value: `<t:${invoice.period_start}:D> - <t:${invoice.period_end}:D>`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'KojinStudios Bots — Subscription System' }
    };

    if (botName) embed.fields.push({ name: 'Bot', value: botName, inline: true });
    if (guildId) embed.fields.push({ name: 'Server ID', value: guildId, inline: true });
    embed.fields.push({ name: 'Customer', value: customerEmail || 'Not provided', inline: true });
    embed.fields.push({ name: 'Invoice', value: `[View in Stripe](https://dashboard.stripe.com/invoices/${invoice.id})`, inline: false });

    await sendWebhook(webhookUrl, embed);
}

// Handle subscription cancellation
async function handleSubscriptionCanceled(subscription) {
    const customer = await stripe.customers.retrieve(subscription.customer);
    const guildId = customer.metadata?.guild_id;
    const botName = customer.metadata?.bot_name;

    if (!guildId) return;

    console.log(`Deactivating ${botName} for guild: ${guildId}`);
    await sendDiscordNotification(guildId, botName, 'deactivated');
    await updateBotDatabase(guildId, botName, null, 'deactivated');
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
    let guildId = null, botName = null, customerEmail = null, subscription = null;

    if (invoice.subscription) {
        subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const customer = await stripe.customers.retrieve(invoice.customer);
        guildId = customer.metadata?.guild_id || subscription.metadata?.guild_id;
        botName = customer.metadata?.bot_name || subscription.metadata?.bot_name;
        customerEmail = customer?.email || invoice.customer_email;
    }

    const amount = (invoice.amount_due / 100).toFixed(2);
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const embed = {
        title: 'Payment Failed',
        description: 'A subscription payment could not be processed',
        color: 0xff0000,
        fields: [
            { name: 'Amount', value: `$${amount}`, inline: true },
            { name: 'Customer', value: customerEmail || 'Not provided', inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'KojinStudios Bots — Subscription System' }
    };

    if (botName) embed.fields.push({ name: 'Bot', value: botName, inline: true });
    if (guildId) embed.fields.push({ name: 'Server ID', value: guildId, inline: true });
    if (subscription) {
        embed.fields.push({ name: 'Status', value: subscription.status === 'past_due' ? 'Multiple retries remaining' : 'Final attempt', inline: true });
    }
    embed.fields.push({ name: 'Invoice', value: `[View in Stripe](https://dashboard.stripe.com/invoices/${invoice.id})`, inline: false });
    embed.fields.push({ name: 'Note', value: 'Stripe will automatically retry this payment.', inline: false });

    await sendWebhook(webhookUrl, embed);
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription) {
    const customer = await stripe.customers.retrieve(subscription.customer);
    const guildId = customer.metadata?.guild_id || subscription.metadata?.guild_id;
    const botName = customer.metadata?.bot_name || subscription.metadata?.bot_name;

    let changeDescription = 'Subscription updated';
    if (subscription.cancel_at_period_end) changeDescription = 'Subscription scheduled for cancellation';
    else if (subscription.status === 'active') changeDescription = 'Subscription plan updated';

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const priceItem = subscription.items?.data?.[0];
    const amountStr = priceItem ? `$${((priceItem.price?.unit_amount || 0) / 100).toFixed(2)}/${priceItem.price?.recurring?.interval || 'month'}` : 'N/A';
    const embed = {
        title: 'Subscription Updated',
        description: changeDescription,
        color: 0x3498db,
        fields: [
            { name: 'Status', value: subscription.status, inline: true },
            { name: 'Amount', value: amountStr, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'KojinStudios Bots — Subscription System' }
    };

    if (botName) embed.fields.push({ name: 'Bot', value: botName, inline: true });
    if (guildId) embed.fields.push({ name: 'Server ID', value: guildId, inline: true });
    if (subscription.cancel_at_period_end) {
        embed.fields.push({ name: 'Cancels On', value: new Date(subscription.current_period_end * 1000).toLocaleDateString(), inline: true });
    }
    embed.fields.push({ name: 'Customer', value: customer.email || 'Not provided', inline: true });

    await sendWebhook(webhookUrl, embed);
}

// Handle upcoming invoice
async function handleUpcomingInvoice(invoice) {
    if (!invoice.subscription) return; // Skip one-time invoices
    let guildId = null, botName = null, customerEmail = null;

    if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const customer = await stripe.customers.retrieve(invoice.customer);
        guildId = customer.metadata?.guild_id || subscription.metadata?.guild_id;
        botName = customer.metadata?.bot_name || subscription.metadata?.bot_name;
        customerEmail = customer?.email || invoice.customer_email;
    }

    const amount = (invoice.amount_due / 100).toFixed(2);
    const dueDate = new Date(invoice.period_end * 1000).toLocaleDateString();
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const embed = {
        title: 'Upcoming Payment',
        description: 'Payment will be processed in 7 days',
        color: 0xf39c12,
        fields: [
            { name: 'Amount', value: `$${amount}`, inline: true },
            { name: 'Due Date', value: dueDate, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'KojinStudios Bots — Subscription System' }
    };

    if (botName) embed.fields.push({ name: 'Bot', value: botName, inline: true });
    if (guildId) embed.fields.push({ name: 'Server ID', value: guildId, inline: true });
    embed.fields.push({ name: 'Customer', value: customerEmail || 'Not provided', inline: true });

    await sendWebhook(webhookUrl, embed);
}

// Send Discord notification
async function sendDiscordNotification(guildId, botName, action, session = null) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const color = action === 'activated' ? 0x00ff00 : 0xff0000;
    const embed = {
        title: `${botName} ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        description: `${botName} has been ${action} for server ${guildId}`,
        color: color,
        fields: [],
        timestamp: new Date().toISOString(),
        footer: { text: 'KojinStudios Bots — Subscription System' }
    };

    if (session) {
        embed.fields.push({
            name: 'Payment Details',
            value: `Amount: $${(session.amount_total / 100).toFixed(2)}\nCustomer: ${session.customer_details?.email || 'Unknown'}`,
            inline: true
        });
    }

    await sendWebhook(webhookUrl, embed);
}

// Generic webhook sender
async function sendWebhook(url, embed) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        if (!response.ok) {
            console.error('Discord webhook failed:', response.status);
        }
    } catch (error) {
        console.error('Discord webhook error:', error);
    }
}

// Update bot database
async function updateBotDatabase(guildId, botName, session, action) {
    try {
        const botApiUrl = process.env.BOT_API_URL;
        if (!botApiUrl || botApiUrl.includes('localhost')) {
            console.warn('BOT_API_URL not set or points to localhost – skipping bot update. Set BOT_API_URL to your DuckDNS/bot server URL in Netlify.');
            return;
        }
        const apiKey = process.env.BOT_API_KEY;
        const headers = {
            'Content-Type': 'application/json',
            ...(apiKey && { 'X-API-Key': apiKey })
        };
        const payload = {
            server_id: guildId,
            bot_name: botName,
            action: action,
            session: session,
            source: 'bots.kojinstudios.com'
        };

        const response = await fetch(botApiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Bot API response:', result);
        } else {
            console.error(`Bot API failed: ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to call bot API:', error);
    }
}
