#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
SERVICE_NAME="slack-personal-proxy"

echo "=== Slack Personal Proxy - Deploy ==="

# Validate .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example and configure it:"
  echo "  cp .env.example .env"
  exit 1
fi

# Check required env vars
source .env
if [ -z "${API_KEY:-}" ]; then
  echo "ERROR: API_KEY is not set in .env"
  exit 1
fi

if [ -z "${SLACK_BOT_TOKEN:-}" ] && { [ -z "${SLACK_COOKIE:-}" ] || [ -z "${SLACK_TOKEN:-}" ]; }; then
  echo "ERROR: No Slack credentials configured. Set SLACK_BOT_TOKEN or both SLACK_COOKIE and SLACK_TOKEN"
  exit 1
fi

echo "Building image..."
docker compose -f "$COMPOSE_FILE" build

echo "Starting container..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for health check..."
RETRIES=30
while [ $RETRIES -gt 0 ]; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "Service is healthy!"
    break
  fi
  RETRIES=$((RETRIES - 1))
  sleep 1
done

if [ $RETRIES -eq 0 ]; then
  echo "WARNING: Health check did not pass within 30 seconds."
  echo "Check logs: docker compose logs $SERVICE_NAME"
  exit 1
fi

echo ""
echo "=== Status ==="
docker compose -f "$COMPOSE_FILE" ps
echo ""
echo "Service is running at http://localhost:3000"
echo "Test with: curl -H 'X-API-Key: YOUR_KEY' http://localhost:3000/api/auth/test"
