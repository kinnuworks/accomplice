#!/usr/bin/env bash
# Container entrypoint for the game server.
#
# TUNNEL=cloudflare starts a Cloudflare quick tunnel (no account, no domain) so phones get an HTTPS
# address, which browsers require for the microphone. The https://*.trycloudflare.com address is read
# from cloudflared's log and exported as PUBLIC_URL before the server starts, so QR codes point at it.
# The address changes on every container start; the server publishes it to SSM (PUBLIC_URL_PARAM)
# and logs it, and infra/scripts/url.sh prints it.
#
# If either process exits, the container exits and ECS starts a fresh one.
set -uo pipefail

if [ "${TUNNEL:-}" != "cloudflare" ]; then
  exec node --import tsx src/main.ts
fi

PORT="${PORT:-8787}"
LOG="$(mktemp)"
cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate --metrics 127.0.0.1:20241 >"$LOG" 2>&1 &
CF_PID=$!

url=""
for _ in $(seq 1 60); do
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | grep -v '//api\.' | head -n1 || true)"
  [ -n "$url" ] && break
  kill -0 "$CF_PID" 2>/dev/null || break
  sleep 1
done
# Pass cloudflared's own log through to the container log from here on.
tail -n +1 -f "$LOG" --pid "$CF_PID" | sed -u 's/^/[cloudflared] /' &

if [ -n "$url" ]; then
  export PUBLIC_URL="$url"
  echo "[tunnel] PUBLIC_URL=$url"
else
  echo "[tunnel] no quick tunnel address after 60 s; starting with PUBLIC_URL=${PUBLIC_URL:-<unset>}"
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "[tunnel] cloudflared is not running; serving without a tunnel"
    exec node --import tsx src/main.ts
  fi
fi

node --import tsx src/main.ts &
NODE_PID=$!

stop() { kill -TERM "$NODE_PID" "$CF_PID" 2>/dev/null; wait "$NODE_PID" 2>/dev/null; exit 0; }
trap stop TERM INT

# Exit as soon as either process stops.
wait -n "$NODE_PID" "$CF_PID"
code=$?
echo "[tunnel] a process exited (code $code); stopping the container"
kill -TERM "$NODE_PID" "$CF_PID" 2>/dev/null
wait 2>/dev/null
exit "$code"
