#!/bin/sh
# Vercel build: apply pending migrations on production deploys only, then build.
set -e

if [ "$VERCEL_ENV" = "production" ] && [ -n "$DATABASE_URL" ]; then
  pnpm prisma migrate deploy
fi

pnpm next build
