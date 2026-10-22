#!/usr/bin/env bash
# Copy the API keys from apps/server/.env into the stack's Secrets Manager secret, then restart the
# game server so it picks them up. Values are never printed, never passed on a command line, and the
# temporary file is readable only by you and removed on exit.
#
# Usage: infra/scripts/put-secrets.sh [path/to/.env]     (run after the first deploy)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${1:-$ROOT/apps/server/.env}"
STACK="${STACK:-Accomplice}"
REGION="${AWS_REGION:-ap-south-1}"

[ -f "$ENV_FILE" ] || { echo "No env file at $ENV_FILE" >&2; exit 1; }

out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
SECRET_ARN="$(out SecretArn)"
CLUSTER="$(out ClusterName)"
SERVICE="$(out ServiceName)"
[ -n "$SECRET_ARN" ] && [ "$SECRET_ARN" != "None" ] || { echo "Stack $STACK not found in $REGION. Deploy first." >&2; exit 1; }

umask 077
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Parse KEY=value lines (optional quotes, ignores comments) and write the secret JSON to the temp file.
ENV_FILE="$ENV_FILE" TMP="$TMP" node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const want = ["ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY"];
  const out = Object.fromEntries(want.map((k) => [k, ""]));
  for (const line of readFileSync(process.env.ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || !want.includes(m[1])) continue;
    out[m[1]] = m[2].replace(/^(["'\''])(.*)\1$/, "$2").trim();
  }
  writeFileSync(process.env.TMP, JSON.stringify(out));
  for (const k of want) console.log(`${k}: ${out[k] ? "found" : "not set (feature stays off)"}`);
'

aws secretsmanager put-secret-value --region "$REGION" --secret-id "$SECRET_ARN" \
  --secret-string "file://$TMP" --query VersionId --output text >/dev/null
echo "Stored keys in $SECRET_ARN"

aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$SERVICE" \
  --force-new-deployment --query 'service.serviceName' --output text >/dev/null
echo "Restarting $SERVICE so the new keys load (about 2 minutes)."
