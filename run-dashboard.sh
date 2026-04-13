#!/usr/bin/env bash
set -euo pipefail

# Start the bot backend + Netlify dashboard in one command.
# Usage:
#   ./run-dashboard.sh              # starts bot + dashboard
#   ./run-dashboard.sh --dash-only  # dashboard only (bot already running)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SCRIPT_DIR"

BOT_PORT="${TEST_PORT:-8080}"
DASH_PORT="${DASH_PORT:-8888}"
FN_PORT="${FN_PORT:-4001}"
BACKEND_URL="http://127.0.0.1:${BOT_PORT}"
DASH_ONLY=false
BOT_PID=""

[[ "${1:-}" == "--dash-only" ]] && DASH_ONLY=true

cleanup() {
  if [[ -n "$BOT_PID" ]] && kill -0 "$BOT_PID" 2>/dev/null; then
    echo "[CLEANUP] Stopping bot (PID $BOT_PID)..."
    kill "$BOT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo ""
echo "===================================="
echo "  Kojin Dashboard  —  Linux Dev"
echo "===================================="
echo ""

for cmd in node npm python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "[ERROR] $cmd not found. Install it first."
    exit 1
  fi
done

[[ ! -d "node_modules" ]] && { echo "[SETUP] npm install..."; npm install; }

# Auto-create .env if missing
if [[ ! -f ".env" ]]; then
  echo "[SETUP] Creating .env with DASHBOARD_BACKEND_URL=$BACKEND_URL"
  cat > .env <<EOF
DASHBOARD_BACKEND_URL=$BACKEND_URL
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:${DASH_PORT}/.netlify/functions/discord-oauth
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
EOF
elif ! grep -q "DASHBOARD_BACKEND_URL" .env; then
  echo "DASHBOARD_BACKEND_URL=$BACKEND_URL" >> .env
  echo "[SETUP] Added DASHBOARD_BACKEND_URL to .env"
else
  echo "[OK] .env has DASHBOARD_BACKEND_URL"
fi

if [[ "$DASH_ONLY" == false ]]; then
  echo ""
  echo "[BOT] Starting bot (TEST_PORT=$BOT_PORT)..."
  export TEST_PORT="$BOT_PORT"
  python3 -u "$BOT_DIR/main.py" > "$BOT_DIR/bot.log" 2>&1 &
  BOT_PID=$!
  echo "[BOT] PID: $BOT_PID  (logs: bot.log)"

  echo "[BOT] Waiting for $BACKEND_URL/health ..."
  for i in $(seq 1 60); do
    if ! kill -0 "$BOT_PID" 2>/dev/null; then
      echo "[ERROR] Bot exited early. Last 30 lines of bot.log:"
      tail -30 "$BOT_DIR/bot.log" 2>/dev/null || true
      exit 1
    fi
    if curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
      echo "[BOT] Backend is UP!"
      break
    fi
    sleep 3
    echo "  ... waiting (${i}×3s)"
  done

  if ! curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
    echo "[ERROR] Bot did not start within 180s. Last 30 lines:"
    tail -30 "$BOT_DIR/bot.log" 2>/dev/null || true
    exit 1
  fi
else
  echo "[SKIP] --dash-only mode, assuming bot is already running."
fi

echo ""
echo "[DASH] Starting Netlify dev on http://localhost:$DASH_PORT"
echo "[DASH] Functions port: $FN_PORT"
echo ""
echo "  Open:  http://localhost:$DASH_PORT/dashboard.html"
echo "  Bot:   $BACKEND_URL/health"
echo ""

exec npx --yes netlify-cli@latest dev --port "$DASH_PORT" --functions-port "$FN_PORT"
