# Backend setup — KojinStudios Bots site

This doc lists environment variables and API contracts so you can run the site and plug in your own backend.

---

## Netlify environment variables

Set these in **Netlify → Site → Environment variables** (or in a `.env` file for local dev with Netlify Dev).

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_CLIENT_ID` | Yes (for OAuth) | Discord Application (OAuth2) Client ID |
| `DISCORD_CLIENT_SECRET` | Yes (for OAuth) | Discord Application Client Secret |
| `DISCORD_REDIRECT_URI` | Yes (for OAuth) | Must match a Redirect URL in the Discord app (e.g. `https://bots.kojinstudios.com/.netlify/functions/discord-oauth` or your Netlify deploy URL) |
| `BACKEND_API_URL` or `BOT_API_URL` | No | Base URL of your backend API. If set, the **server-status** Netlify function will proxy to it (see contract below). If unset, the dashboard still works with mock data. |
| Stripe keys | Yes (for payments) | The site uses Stripe publishable key in the frontend; use your own keys and ensure the Netlify/backend flow for checkout uses the matching secret. |

---

## Discord Developer Portal

1. Create or use an existing **Application**.
2. **OAuth2 → Redirects**: add exactly:
   - Production: `https://<your-domain>/.netlify/functions/discord-oauth`
   - Local: `http://localhost:8888/.netlify/functions/discord-oauth` (if using Netlify Dev).
3. **OAuth2 → Scopes**: at least `identify`, `guilds`.
4. Use the Application’s **Client ID** and **Client Secret** as `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`; set `DISCORD_REDIRECT_URI` to the same URL you added as redirect.

---

## Server-status API (your backend)

When `BACKEND_API_URL` (or `BOT_API_URL`) is set, the Netlify function `server-status` calls your backend to get real bot presence and subscription for a guild.

**Request**

- **URL**: `GET {BACKEND_API_URL}/server-status?guild_id={guild_id}`
- **Method**: `GET`
- **Query**
  - `guild_id` (required): Discord guild (server) ID, 17–19 digits.

**Response (JSON)**

Return a JSON object that can include (the Netlify function merges this with `guild_id`):

| Field | Type | Description |
|-------|------|-------------|
| `gavel` | boolean | Whether Gavel bot is in the server |
| `tickets` | boolean | Whether Tickets bot is in the server |
| `host` | boolean | Whether Host bot is in the server |
| `intella` | boolean | Whether Intella bot is in the server |
| `subscription` | `'free'` \| `'premium'` \| `null` | Subscription tier for this server; `null` if none |

Example:

```json
{
  "gavel": true,
  "tickets": true,
  "host": false,
  "intella": true,
  "subscription": "premium"
}
```

If your backend returns an error (non-2xx or invalid JSON), the Netlify function falls back to mock data so the dashboard still loads.

---

## Summary

- **Discord**: Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI`; add the same redirect in the Discord app.
- **Dashboard server status**: Optional. Implement `GET /server-status?guild_id=...` on your backend and set `BACKEND_API_URL` (or `BOT_API_URL`) so the dashboard shows real bot and subscription data.
- **Payments**: Configure Stripe (and any server-side checkout) as needed; the frontend already uses a Stripe publishable key for the payment flow.
