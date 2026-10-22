#!/usr/bin/env bash
# Print the current public game URL. With the Cloudflare quick tunnel it changes every time the
# server container starts; the server writes it to SSM /accomplice/public-url on start.
#   infra/scripts/url.sh          -> https://....trycloudflare.com
#   infra/scripts/url.sh --all    -> also the TV, phone, Echo and MCP links and the plain ALB address
set -euo pipefail
REGION="${AWS_REGION:-ap-south-1}"
URL="$(aws ssm get-parameter --region "$REGION" --name /accomplice/public-url --query Parameter.Value --output text)"
if [ "${1:-}" != "--all" ]; then echo "$URL"; exit 0; fi
ALB="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "${STACK:-Accomplice}" \
  --query "Stacks[0].Outputs[?OutputKey=='AlbUrl'].OutputValue" --output text 2>/dev/null || true)"
echo "Game:   $URL"
echo "TV:     $URL/tv/"
echo "Phone:  $URL/p/   (or scan the QR code on the TV)"
echo "Echo:   $URL/echo/"
echo "MCP:    $URL/mcp"
[ -n "$ALB" ] && echo "ALB:    $ALB   (plain HTTP, no microphone on phones)"
