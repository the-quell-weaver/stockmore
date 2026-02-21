#!/usr/bin/env bash
set -euo pipefail

HOST="${E2E_HOST:-localhost}"
PORT="${E2E_PORT:-5566}"
BASE_URL="${E2E_BASE_URL:-http://${HOST}:${PORT}}"
READY_PATH="${E2E_READY_PATH:-/login}"
READY_ATTEMPTS="${E2E_READY_ATTEMPTS:-10}"
READY_TIMEOUT="${E2E_READY_TIMEOUT:-30}"

# Notes:
# - Keep HOST as "localhost" because Playwright auth state cookies are scoped to localhost.
# - READY_PATH defaults to /login to avoid homepage auth/server-side gating.

cleanup() {
  if [[ -n "${APP_PID:-}" ]] && kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill "$APP_PID"
  fi
}
trap cleanup EXIT

npx --prefix src supabase start
npm --prefix src run supabase:local-env

npm --prefix src run dev -- --hostname "$HOST" --port "$PORT" --webpack &
APP_PID=$!

check_url() {
  if command -v timeout >/dev/null 2>&1; then
    timeout "$READY_TIMEOUT" curl -fsS "${BASE_URL}${READY_PATH}" >/dev/null 2>&1
  else
    curl -fsS --connect-timeout 1 --max-time "$READY_TIMEOUT" "${BASE_URL}${READY_PATH}" >/dev/null 2>&1
  fi
}

for _ in $(seq 1 "$READY_ATTEMPTS"); do
  if check_url; then
    break
  fi
  sleep 1
done

if ! check_url; then
  echo "E2E server did not become ready at $BASE_URL" >&2
  exit 1
fi

PLAYWRIGHT_BASE_URL="$BASE_URL" npm --prefix src run test:e2e
