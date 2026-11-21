# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/prisma ./apps/api/prisma

RUN npm ci

COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY questionnaire ./questionnaire

RUN ./node_modules/.bin/prisma generate --schema=apps/api/prisma/schema.prisma \
  && npm -w packages/shared run build \
  && npm -w apps/api run build \
  && npm -w apps/web run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_DIR=/data/storage
ENV SERVE_WEB_DIST=true
ENV QUESTIONNAIRE_JSON=/app/questionnaire/questionnaire.v1.json

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/prisma ./apps/api/prisma

# Install runtime dependencies + Prisma CLI for `migrate deploy`, skipping optional dev binaries (e.g., embedded-postgres).
RUN npm ci --omit=dev --omit=optional --workspace=apps/api --include-workspace-root \
  && npm install --no-save --omit=optional prisma@^5.22.0 \
  && ./node_modules/.bin/prisma generate --schema=apps/api/prisma/schema.prisma \
  && npm cache clean --force

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist-cjs ./packages/shared/dist-cjs
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/questionnaire ./questionnaire
COPY deploy/docker-entrypoint.sh ./deploy/docker-entrypoint.sh

RUN sed -i 's/\r$//' ./deploy/docker-entrypoint.sh \
  && chmod +x ./deploy/docker-entrypoint.sh \
  && mkdir -p /data/storage \
  && chown -R node:node /app /data/storage

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]

