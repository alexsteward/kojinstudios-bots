# Netlify setup

What to set in **Netlify → Site → Environment variables**.

---

## You already have (keep these)

- **Discord redirect URL** — same one is used for the dashboard login. The dashboard uses the same Discord OAuth flow; no extra redirect needed.
- **Discord webhook URL** — used by Stripe/webhook functions; unchanged.

So you don’t need to add new Discord redirect or webhook vars for the dashboard.

---

## Dashboard-only env vars (use `DASHBOARD_` prefix)

All dashboard-specific variables are prefixed with `DASHBOARD_` so they don’t clash with existing ones.

| Variable | Required | Description |
|----------|----------|-------------|
| `DASHBOARD_BACKEND_URL` | No | Base URL of the **bot’s webhook server** (server-status, panels, channels). Tickets uses 443 with SSL → `https://YOUR_IP` or `https://your-name.duckdns.org`. Without SSL the bot uses port 8444 → `http://YOUR_IP:8444`. Unset = dashboard works with mock/empty data. |

**Order of fallback:** The dashboard functions look for backend URL in this order:  
`DASHBOARD_BACKEND_URL` → `BACKEND_API_URL` → `BOT_API_URL`.  
So you can set **one** of these to your bot URL (DuckDNS or IP:8080) and use it for both Stripe→bot and dashboard→bot if you want.

---

## Summary

- **Nothing new required** for dashboard login: it uses your existing Discord OAuth (same app, same redirect URL).
- **Optional:** Add `DASHBOARD_BACKEND_URL` in Netlify only if you have (or will add) a backend that implements the dashboard APIs in BACKEND.md (server-status, panels, channels). Without it, the dashboard still loads; server status and panels are mock/empty until you plug in the backend.
