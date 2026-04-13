# run-dashboard.ps1 — Start the bot + Netlify dashboard on Windows
# Usage:
#   .\run-dashboard.ps1              (starts both bot + dashboard)
#   .\run-dashboard.ps1 -DashOnly   (only dashboard, assumes bot is already running)
#
# Prerequisites: Node.js 18+, Python 3.10+, npm
param(
    [switch]$DashOnly
)

$ErrorActionPreference = "Stop"
$Root       = Split-Path -Parent $MyInvocation.MyCommand.Path
$BotRoot    = Split-Path -Parent $Root
$BotPort    = if ($env:TEST_PORT) { $env:TEST_PORT } else { "8080" }
$DashPort   = if ($env:DASH_PORT) { $env:DASH_PORT } else { "8888" }
$FnPort     = if ($env:FN_PORT)   { $env:FN_PORT }   else { "4001" }
$BackendUrl = "http://127.0.0.1:$BotPort"

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Kojin Dashboard  —  Local Dev"     -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# --- Check tools ---
foreach ($cmd in @("node", "npm", "python")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] $cmd is not installed or not in PATH." -ForegroundColor Red
        exit 1
    }
}

# --- Ensure node_modules ---
Push-Location $Root
if (-not (Test-Path "node_modules")) {
    Write-Host "[SETUP] Installing npm dependencies..." -ForegroundColor Yellow
    npm install
}

# --- Write .env if missing ---
$envPath = Join-Path $Root ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "[SETUP] Creating .env with DASHBOARD_BACKEND_URL=$BackendUrl" -ForegroundColor Yellow
    @"
DASHBOARD_BACKEND_URL=$BackendUrl
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:${DashPort}/.netlify/functions/discord-oauth
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
"@ | Set-Content $envPath -Encoding UTF8
} else {
    $envContent = Get-Content $envPath -Raw
    if ($envContent -notmatch "DASHBOARD_BACKEND_URL") {
        Add-Content $envPath "`nDASHBOARD_BACKEND_URL=$BackendUrl"
        Write-Host "[SETUP] Added DASHBOARD_BACKEND_URL=$BackendUrl to .env" -ForegroundColor Yellow
    } else {
        Write-Host "[OK] .env already has DASHBOARD_BACKEND_URL" -ForegroundColor Green
    }
}

$botJob = $null

if (-not $DashOnly) {
    # --- Start bot in background ---
    Write-Host ""
    Write-Host "[BOT] Starting bot (TEST_PORT=$BotPort)..." -ForegroundColor Magenta
    $env:TEST_PORT = $BotPort
    $botJob = Start-Process -FilePath "python" `
        -ArgumentList "-u", "main.py" `
        -WorkingDirectory $BotRoot `
        -PassThru -NoNewWindow `
        -RedirectStandardOutput (Join-Path $BotRoot "bot_stdout.log") `
        -RedirectStandardError  (Join-Path $BotRoot "bot_stderr.log")

    Write-Host "[BOT] PID: $($botJob.Id)  —  logs: bot_stdout.log / bot_stderr.log" -ForegroundColor DarkGray

    # --- Wait for bot health ---
    Write-Host "[BOT] Waiting for backend at $BackendUrl/health ..." -ForegroundColor Yellow
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 3
        try {
            $resp = Invoke-WebRequest -Uri "$BackendUrl/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                Write-Host "[BOT] Backend is UP!" -ForegroundColor Green
                $ready = $true
                break
            }
        } catch { }
        if ($botJob.HasExited) {
            Write-Host "[ERROR] Bot exited early (code $($botJob.ExitCode)). Check bot_stderr.log" -ForegroundColor Red
            Get-Content (Join-Path $BotRoot "bot_stderr.log") -Tail 30 -ErrorAction SilentlyContinue
            exit 1
        }
        Write-Host "  ... still waiting ($($i * 3)s)" -ForegroundColor DarkGray
    }
    if (-not $ready) {
        Write-Host "[ERROR] Bot did not start within 180s." -ForegroundColor Red
        if ($botJob -and -not $botJob.HasExited) { Stop-Process -Id $botJob.Id -Force -ErrorAction SilentlyContinue }
        exit 1
    }
} else {
    Write-Host "[SKIP] DashOnly mode — assuming bot is already running at $BackendUrl" -ForegroundColor DarkGray
}

# --- Start Netlify dev ---
Write-Host ""
Write-Host "[DASH] Starting Netlify dev on http://localhost:$DashPort ..." -ForegroundColor Cyan
Write-Host "[DASH] Functions proxy port: $FnPort" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Open:  http://localhost:$DashPort/dashboard.html" -ForegroundColor Green
Write-Host "  Bot:   $BackendUrl/health" -ForegroundColor Green
Write-Host ""

try {
    npx --yes netlify-cli@latest dev --port $DashPort --functions-port $FnPort
} finally {
    if ($botJob -and -not $botJob.HasExited) {
        Write-Host "[CLEANUP] Stopping bot (PID $($botJob.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $botJob.Id -Force -ErrorAction SilentlyContinue
    }
}
Pop-Location
