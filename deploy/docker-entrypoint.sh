#!/bin/sh
set -eu

export QUESTIONNAIRE_JSON="${QUESTIONNAIRE_JSON:-/app/questionnaire/questionnaire.v1.json}"

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Running Prisma migrations..."
  ./node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma

  if [ "${RUN_SEED:-true}" = "true" ]; then
    echo "[entrypoint] Ensuring reference questionnaire, clusters, and document categories..."
    node apps/api/dist/prisma/seed.js
  fi
fi

if [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ] && [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  echo "[entrypoint] Ensuring initial SUPER_ADMIN bootstrap user..."
  node apps/api/dist/prisma/bootstrap-admin.js --if-absent
fi

echo "[entrypoint] Starting M2S API server on port ${PORT:-3000}..."
exec node apps/api/dist/src/main.js

