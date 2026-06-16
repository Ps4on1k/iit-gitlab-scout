#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
npm run migrate

echo "[entrypoint] Starting server..."
exec node dist/index.js
