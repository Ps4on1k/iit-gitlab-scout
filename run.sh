#!/bin/bash
set -euo pipefail

# Configuration
COMPOSE_FILE="docker-compose.ghcr.yml"
SERVICES="backend frontend caddy"
TIMEOUT_STOP=30
TIMEOUT_STARTUP=60
TIMEOUT_MIGRATE=30
TIMEOUT_HEALTH=10
HEALTH_URL="http://localhost:8080/"

echo "🛑 Stopping containers..."

if ! docker compose -f "$COMPOSE_FILE" stop $SERVICES; then
    echo "⚠️  Warning: Failed to stop containers (they may not be running)"
fi

echo "🗑️  Removing old containers..."
docker compose -f "$COMPOSE_FILE" rm -f $SERVICES

echo "📦 Pulling latest images from GHCR..."
if ! docker compose -f "$COMPOSE_FILE" pull $SERVICES; then
    echo "❌ Error: Failed to pull latest images"
    exit 1
fi

echo "🚀 Starting containers with fresh images..."
if ! docker compose -f "$COMPOSE_FILE" up -d $SERVICES; then
    echo "❌ Error: Failed to start containers"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 $SERVICES
    exit 1
fi

echo "⏳ Waiting for backend container (max $TIMEOUT_STARTUP sec)..."
wait_for_container() {
    local elapsed=0
    while [ $elapsed -lt $TIMEOUT_STARTUP ]; do
        if docker compose -f "$COMPOSE_FILE" ps --status=running --services 2>/dev/null | grep -q "^backend$"; then
            echo "✅ Backend is running"
            return 0
        fi
        if docker compose -f "$COMPOSE_FILE" ps --status=exited --services 2>/dev/null | grep -q "^backend$"; then
            echo "❌ Backend failed to start!"
            echo ""
            echo "========== ERROR LOGS =========="
            docker compose -f "$COMPOSE_FILE" logs --tail=50 backend
            echo "================================"
            return 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo "❌ Timeout: Backend did not start within $TIMEOUT_STARTUP seconds"
    return 1
}

wait_for_container || exit 1

echo "⏳ Giving 5 seconds for application initialization..."
sleep 5

echo "🔄 Running migrations..."
if ! docker compose -f "$COMPOSE_FILE" exec -T backend timeout "$TIMEOUT_MIGRATE" npm run migrate; then
    echo "❌ Error: Migrations failed"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 backend
    exit 1
fi

echo "🏥 Checking health endpoint..."
if ! curl -f -s --max-time "$TIMEOUT_HEALTH" "$HEALTH_URL" > /dev/null; then
    echo "❌ Error: Health check failed"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 backend
    exit 1
fi

echo "✅ Update complete! All services are running."
echo "ℹ️  Database was not affected"
echo "🌐 HTTP:  http://$(hostname -I | awk '{print $1}'):8080"
echo "🔒 HTTPS: https://$(hostname -I | awk '{print $1}'):8443"
