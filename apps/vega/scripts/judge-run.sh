#!/usr/bin/env bash
# Install and launch Accomplice on a connected Vega device (Fire TV or the Vega Virtual Device).
#
# Usage:
#   apps/vega/scripts/judge-run.sh                 # picks the package for the connected device's CPU
#   apps/vega/scripts/judge-run.sh path/to/app.vpkg
#   START_VVD=1 apps/vega/scripts/judge-run.sh     # also boots the Vega Virtual Device first
#
# Needs the Vega SDK/CLI (https://developer.amazon.com/docs/vega/) with `vega` on PATH.
set -euo pipefail

APP_ID="com.accomplice.tv.main"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$HERE/../release"

if ! command -v vega >/dev/null 2>&1; then
  [ -f "$HOME/vega/env" ] && . "$HOME/vega/env"
fi
command -v vega >/dev/null 2>&1 || { echo "vega CLI not found. Install the Vega SDK first." >&2; exit 1; }

device_listed() { ! vega device list 2>&1 | grep -q "No devices found"; }

if [ "${START_VVD:-0}" = "1" ] && ! device_listed; then
  echo "Starting the Vega Virtual Device..."
  nohup vega virtual-device start --timeout 180 >"${TMPDIR:-/tmp}/accomplice-vvd.log" 2>&1 &
fi

echo "Waiting for a Vega device..."
for _ in $(seq 1 60); do
  device_listed && break
  sleep 5
done
device_listed || { echo "No Vega device connected. Plug in a Fire TV (developer mode on) or set START_VVD=1." >&2; exit 1; }
vega device list

PKG="${1:-}"
if [ -z "$PKG" ]; then
  # The device list line looks like: "VirtualDevice : tv - aarch64 - OS - <serial>"
  ARCH="$(vega device list 2>&1 | grep -o -E 'aarch64|armv7|x86_64' | head -1)"
  ARCH="${ARCH:-armv7}"   # most Fire TV sticks are armv7
  PKG="$RELEASE_DIR/accomplice_${ARCH}_release.vpkg"
fi
[ -f "$PKG" ] || { echo "Package not found: $PKG" >&2; exit 1; }
echo "Installing $PKG"

# The virtual device sometimes reports "device offline" right after boot. Retry.
for attempt in 1 2 3 4 5; do
  if out="$(vega run-app "$PKG" "$APP_ID" 2>&1)" && ! grep -q -i -E 'offline|not found|error' <<<"$out"; then
    echo "$out"
    echo "Accomplice is running. Use the remote's D-pad and OK. Phones join at the address shown on the TV."
    exit 0
  fi
  echo "$out"
  echo "Attempt $attempt failed, retrying in 20 s..."
  sleep 20
done
echo "Could not install/launch after 5 attempts." >&2
exit 1
