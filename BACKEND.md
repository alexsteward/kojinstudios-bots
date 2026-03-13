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

## Ticket Panels API (Tickets bot — configure panels from the web)

The dashboard lets users create and edit **ticket panels** in the browser. Your backend (and the Tickets bot) should implement these endpoints so the web can list panels, create new ones, and update existing ones. The bot then posts or updates the panel message in Discord so users never need the in-Discord panel builder.

### List panels

- **URL**: `GET {BACKEND_API_URL}/panels?guild_id={guild_id}`
- **Response (JSON)**:
  - `panels`: array of panel objects. Each panel should include at least: `id`, `guild_id`, `channel_id`, `message_id`, `title`, `panel_data` (JSON string). `panel_data` shape: `{ "title", "description", "categories": [ { "emoji", "name", "description", "discord_category_id", "ping_role_id", "questions" } ] }`.

### Create panel (publish to Discord)

- **URL**: `POST {BACKEND_API_URL}/panels`
- **Body (JSON)**:
  - `guild_id` (required): Discord guild ID
  - `channel_id` (required): Discord text channel ID where the panel message should be posted
  - `title` (required): Panel embed title
  - `description` (optional): Panel embed description
  - `categories` (required): Array of `{ emoji, name, description?, discord_category_id?, ping_role_id?, questions? }`. At least one category. Each category becomes a button on the panel.
- **Response**: Return the created panel (e.g. `id`, `message_id`, etc.) or an error object `{ "error": "..." }`.
- **Bot behavior**: Your backend should instruct the Tickets bot to post an embed + button view in that channel and store the panel in the same DB the bot uses (`ticket_panels`). How you do that (HTTP callback, queue, shared DB + bot polling) is up to you; the dashboard only calls this API.

### Update panel

- **URL**: `PATCH {BACKEND_API_URL}/panels/{panel_id}`
- **Body (JSON)**: Same as create (`channel_id`, `title`, `description`, `categories`). All optional; send only what changed or the full payload.
- **Response**: Updated panel or `{ "error": "..." }`.
- **Bot behavior**: Update the panel row in the DB and edit the existing Discord message (same channel) with the new embed and buttons.

### Delete panel (optional)

- **URL**: `DELETE {BACKEND_API_URL}/panels/{panel_id}`
- **Response**: Success or `{ "error": "..." }`. Bot should delete the Discord message and the DB row.

### Channels list (for “Channel to post in” dropdown)

- **URL**: `GET {BACKEND_API_URL}/channels?guild_id={guild_id}`
- **Response (JSON)**:
  - `channels`: array of `{ id, name }` for text channels the bot can post in (e.g. channels the bot can see). Use the bot’s token or API to list guild channels.
- If this endpoint is not implemented or returns empty, the dashboard still works: users can type a **Channel ID** manually.

---

## Summary

- **Discord**: Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI`; add the same redirect in the Discord app.
- **Dashboard server status**: Optional. Implement `GET /server-status?guild_id=...` on your backend and set `BACKEND_API_URL` (or `BOT_API_URL`) so the dashboard shows real bot and subscription data.
- **Ticket panels (web config)**: Implement `GET /panels?guild_id=...`, `POST /panels`, `PATCH /panels/:id`, and optionally `GET /channels?guild_id=...` and `DELETE /panels/:id`. The dashboard then lets users create and edit panels from the web; your backend tells the Tickets bot to post or update the message in Discord so users don’t need the in-Discord panel builder.
- **Payments**: Configure Stripe (and any server-side checkout) as needed; the frontend already uses a Stripe publishable key for the payment flow.
