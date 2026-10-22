# Accomplice game server plus the three static web apps (TV, phone, Echo simulator).
# Build from the repo root:  docker build -f apps/server/Dockerfile -t accomplice .
# Keys are not baked in: ANTHROPIC_API_KEY / ELEVENLABS_API_KEY arrive as env vars from Secrets Manager.

ARG NODE_IMAGE=node:24-bookworm-slim

# ---- build: install the workspace and build the web apps ----
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CI=1 \
    npm_config_enable_global_virtual_store=false
RUN npm install -g pnpm@11.25.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# vite build only: type checks run in CI and locally, a type error should not block a hotfix deploy.
RUN pnpm --filter @accomplice/tv-web --filter @accomplice/phone --filter @accomplice/echo-sim exec vite build

# ---- runtime: server source, workspace packages, built web apps ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 CACHE_DIR=/data/cache LOG_LEVEL=info
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/assets ./assets
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/tv-web/dist ./apps/tv-web/dist
COPY --from=build /app/apps/phone/dist ./apps/phone/dist
COPY --from=build /app/apps/echo-sim/dist ./apps/echo-sim/dist
RUN mkdir -p /data/cache && chown -R node:node /data
USER node
WORKDIR /app/apps/server
EXPOSE 8787
CMD ["node", "--import", "tsx", "src/main.ts"]
