# Local Dashboard Runbook (Linux)

## 1) Prepare env

```bash
cd kojinstudios-bots-main
cp .env.example .env
```

Fill in at least:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Optional:

- `DASHBOARD_BACKEND_URL` for real panel/status data

## 2) Start dashboard + functions

```bash
chmod +x run-dashboard.sh
./run-dashboard.sh
```

Defaults to port `8888`. If taken, it auto-picks the next open port.

Set a specific start port:

```bash
PORT=9000 ./run-dashboard.sh
```

## 3) Health check

In a second terminal:

```bash
python3 test_dashboard.py http://localhost:8888
```

If you used a different port, replace `8888`.

## Notes

- `dashboard-api` may return `503` until `DASHBOARD_BACKEND_URL` is configured.
- `create-checkout-session` returns clear validation/Stripe errors if payload or Stripe secret is missing.
- If Netlify says `EADDRINUSE ... :3999`, another Netlify process is already running. Stop it, then start again.
