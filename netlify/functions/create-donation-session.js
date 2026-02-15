// netlify/functions/create-donation-session.js
// KojinStudios Bots — Donation Session Creator
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { amount, name, message } = JSON.parse(event.body);
        const amountInCents = Math.round(parseFloat(amount) * 100);

        if (!amount || isNaN(amountInCents) || amountInCents < 50) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Invalid amount. Minimum donation is $0.50' })
            };
        }

        if (amountInCents > 10000000) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Amount too large. Maximum donation is $100,000' })
            };
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Donation to KojinStudios',
                        description: message ? `Donation: ${message.substring(0, 100)}` : 'Thank you for supporting KojinStudios!',
                    },
                    unit_amount: amountInCents,
                },
                quantity: 1,
            }],
            metadata: {
                donation_type: 'general',
                donor_name: name || 'Anonymous',
                donor_message: message || '',
                source: 'bots.kojinstudios.com'
            },
            success_url: `${event.headers.origin || 'https://bots.kojinstudios.com'}/success.html?session_id={CHECKOUT_SESSION_ID}&type=donation`,
            cancel_url: `${event.headers.origin || 'https://bots.kojinstudios.com'}/?cancelled=true`,
            billing_address_collection: 'auto',
            allow_promotion_codes: true,
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ sessionId: session.id })
        };

    } catch (error) {
        console.error('Donation session error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to create donation session', details: error.message })
        };
    }
};
