#!/usr/bin/env bash
# Memory and CPU sampling for Accomplice on a connected Vega device, using the SDK's
# `vega exec perf activity-monitor` (one sample per second, "Memory Application" column).
#
# For each run: cold-launch the app, wait for the title screen, sample it (idle),
# press OK on the remote to open the game lobby, sample again.
#
# Usage: apps/vega/scripts/measure-memory.sh [runs=3] [seconds_per_phase=20] [out_dir]
set -uo pipefail

APP_ID="com.accomplice.tv.main"
RUNS="${1:-3}"
SECS="${2:-20}"
OUT="${3:-$(pwd)/vega-memory-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"

command -v vega >/dev/null 2>&1 || . "$HOME/vega/env"
VDA="$(vega which vda)"

# Kill a process and all of its descendants (only the tree we started).
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}

sample() { # $1 = label
  local log="$OUT/$1.log"
  (cd "$OUT" && exec vega exec perf activity-monitor --app-name "$APP_ID" --output text \
      --output-dir "$OUT/am-$1" </dev/null >"$log" 2>&1) &
  local pid=$!
  sleep $((SECS + 12))   # the tool needs ~10 s to attach before the first sample
  kill_tree "$pid"
  wait "$pid" 2>/dev/null
  # Print the median of the "Memory Application" column (last field, MiB).
  sed 's/\x1b\[[0-9;]*m//g' "$log" | tr '\r' '\n' | grep -E '^ +[0-9.]+%' \
    | awk '{gsub("MiB","",$NF); print $NF}' | sort -n \
    | awk -v l="$1" '{a[NR]=$1} END {if (NR==0) {print l": no samples"; exit}
        m=(NR%2)?a[(NR+1)/2]:(a[NR/2]+a[NR/2+1])/2;
        printf "%s: n=%d median=%.1f MiB min=%.1f max=%.1f\n", l, NR, m, a[1], a[NR]}'
}

for r in $(seq 1 "$RUNS"); do
  vega device terminate-app -a "$APP_ID" >/dev/null 2>&1
  sleep 3
  vega device launch-app -a "$APP_ID" >/dev/null 2>&1
  sleep 15                      # title screen loaded from the live server
  sample "run${r}-title" | tee -a "$OUT/summary.txt"
  "$VDA" shell 'inputd-cli button_press KEY_ENTER' >/dev/null 2>&1   # "Host a game"
  sleep 8                       # lobby with QR code and room code
  sample "run${r}-lobby" | tee -a "$OUT/summary.txt"
done
echo "Logs in $OUT"
