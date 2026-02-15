// netlify/functions/create-checkout-session.js
// KojinStudios Bots — Stripe Checkout Session Creator
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { priceId, guildId, botName } = JSON.parse(event.body);

        // Validate required fields
        if (!priceId || !guildId || !botName) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Missing required fields: priceId, guildId, and botName are required'
                })
            };
        }

        // Validate Guild ID format
        if (!/^\d{17,19}$/.test(guildId)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Invalid Guild ID format. Discord Guild IDs must be 17-19 digits.'
                })
            };
        }

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            metadata: {
                guild_id: guildId,
                bot_name: botName,
                source: 'bots.kojinstudios.com'
            },
            client_reference_id: guildId,
            success_url: `${event.headers.origin || 'https://bots.kojinstudios.com'}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${event.headers.origin || 'https://bots.kojinstudios.com'}/?cancelled=true`,
            billing_address_collection: 'required',
            automatic_tax: {
                enabled: true,
            }
        });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                sessionId: session.id
            })
        };

    } catch (error) {
        console.error('Checkout session error:', error);

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to create checkout session',
                details: error.message
            })
        };
    }
};
