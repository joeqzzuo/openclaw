#!/usr/bin/env bash
# Fully non-interactive Docker setup. Wraps setup.sh with --non-interactive
# defaults so no human input is required.
#
# Usage:
#   # vLLM / OpenAI-compatible endpoint (default)
#   CUSTOM_BASE_URL=http://host:8001/v1 CUSTOM_MODEL_ID=my-model ./scripts/docker/setup-auto.sh
#
#   # vLLM with API key
#   CUSTOM_BASE_URL=http://host:8001/v1 CUSTOM_MODEL_ID=my-model CUSTOM_API_KEY=tok-xxx ./scripts/docker/setup-auto.sh
#
#   # Anthropic
#   AUTH_CHOICE=anthropic ANTHROPIC_API_KEY=sk-ant-xxx ./scripts/docker/setup-auto.sh
#
#   # OpenAI
#   AUTH_CHOICE=openai OPENAI_API_KEY=sk-xxx ./scripts/docker/setup-auto.sh
#
#   # Skip everything optional for a minimal headless gateway
#   SKIP_OPTIONAL=1 CUSTOM_BASE_URL=http://host:8001/v1 CUSTOM_MODEL_ID=my-model ./scripts/docker/setup-auto.sh
#
# All OPENCLAW_* env vars accepted by setup.sh still work (OPENCLAW_IMAGE,
# OPENCLAW_SANDBOX, OPENCLAW_GATEWAY_BIND, etc.).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

AUTH_CHOICE="${AUTH_CHOICE:-custom-api-key}"

# Build the auth flag from well-known env vars.
AUTH_FLAG=""
case "$AUTH_CHOICE" in
  custom-api-key)
    CUSTOM_BASE_URL="${CUSTOM_BASE_URL:-http://45.78.192.243:8000/v1}"
    CUSTOM_MODEL_ID="${CUSTOM_MODEL_ID:-Qwen/Qwen3.5-9B}"
    # vLLM and similar endpoints often don't need a real key, but OpenClaw
    # requires one to be configured. Use a placeholder when none is provided.
    CUSTOM_API_KEY="${CUSTOM_API_KEY:-no-key-required}"
    AUTH_FLAG="--custom-base-url $CUSTOM_BASE_URL --custom-model-id $CUSTOM_MODEL_ID --custom-compatibility openai --custom-api-key $CUSTOM_API_KEY"
    ;;
  anthropic)
    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
      echo "ERROR: ANTHROPIC_API_KEY is required for auth-choice=anthropic" >&2
      exit 1
    fi
    AUTH_FLAG="--anthropic-api-key $ANTHROPIC_API_KEY"
    ;;
  openai)
    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
      echo "ERROR: OPENAI_API_KEY is required for auth-choice=openai" >&2
      exit 1
    fi
    AUTH_FLAG="--openai-api-key $OPENAI_API_KEY"
    ;;
  skip)
    AUTH_FLAG=""
    ;;
  *)
    # Pass through for other providers; caller must set OPENCLAW_ONBOARD_FLAGS
    # for provider-specific key flags.
    AUTH_FLAG=""
    ;;
esac

# Skip channels (we configure luffa manually below), health check, and UI prompts.
# Keep skills and search enabled so built-in tools are available.
SKIP_FLAGS="--skip-channels --skip-health --skip-ui"

export OPENCLAW_ONBOARD_FLAGS="--non-interactive --accept-risk --auth-choice $AUTH_CHOICE $AUTH_FLAG $SKIP_FLAGS"

# Run the main setup (builds image, onboards, starts gateway).
bash "$ROOT_DIR/scripts/docker/setup.sh"

# --- Post-setup: add external host to Control UI allowedOrigins ---
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
GATEWAY_HOST="${OPENCLAW_GATEWAY_HOST:-}"

# Auto-detect public IP if not explicitly set.
if [[ -z "$GATEWAY_HOST" ]]; then
  GATEWAY_HOST="$(curl -sf --max-time 5 https://ifconfig.me 2>/dev/null \
    || curl -sf --max-time 5 https://api.ipify.org 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || true)"
fi

# --- Configure Luffa as the only channel ---
LUFFA_BOT_SECRET="${LUFFA_BOT_SECRET:-}"
if [[ -n "$LUFFA_BOT_SECRET" ]]; then
  echo ""
  echo "==> Configuring Luffa channel"
  LUFFA_CONFIG="$(cat <<JSONEOF
{"luffa":{"enabled":true,"secret":"${LUFFA_BOT_SECRET}","dmPolicy":"open"}}
JSONEOF
)"
  docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --no-deps \
    --entrypoint node openclaw-gateway \
    dist/index.js config set channels "$LUFFA_CONFIG" --strict-json
fi

# --- Enable all built-in plugins that work without API keys ---
FREE_PLUGINS=(duckduckgo browser openshell memory-core diffs llm-task)
echo ""
echo "==> Enabling built-in plugins: ${FREE_PLUGINS[*]}"
for plugin in "${FREE_PLUGINS[@]}"; do
  docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --no-deps \
    --entrypoint node openclaw-gateway \
    dist/index.js config set "plugins.entries.${plugin}.enabled" true 2>/dev/null || true
done

# --- Enable web search tool with DuckDuckGo ---
echo ""
echo "==> Enabling web search (DuckDuckGo)"
docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --no-deps \
  --entrypoint node openclaw-gateway \
  dist/index.js config set tools.web.search.enabled true
docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --no-deps \
  --entrypoint node openclaw-gateway \
  dist/index.js config set tools.web.search.provider duckduckgo

# --- Configure model context window to match vLLM --max-model-len ---
CONTEXT_WINDOW="${OPENCLAW_CONTEXT_WINDOW:-131072}"
MAX_TOKENS="${OPENCLAW_MAX_TOKENS:-4096}"
echo ""
echo "==> Setting model context window=${CONTEXT_WINDOW}, maxTokens=${MAX_TOKENS}"
MODEL_CONFIG="$(printf '[{"id":"%s","name":"%s","contextWindow":%s,"maxTokens":%s,"input":["text"],"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0},"reasoning":false}]' \
  "$CUSTOM_MODEL_ID" "$CUSTOM_MODEL_ID" "$CONTEXT_WINDOW" "$MAX_TOKENS")"
# Derive provider key from base URL (same logic OpenClaw uses for custom providers).
PROVIDER_KEY="$(echo "$CUSTOM_BASE_URL" | sed 's|https\?://||;s|/.*||;s|[^a-z0-9]|-|g;s|^|custom-|')"
docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --no-deps \
  --entrypoint node openclaw-gateway \
  dist/index.js config set "models.providers.${PROVIDER_KEY}.models" "$MODEL_CONFIG" --strict-json

if [[ -n "$GATEWAY_HOST" ]]; then
  ALLOWED_ORIGINS="$(printf '["http://localhost:%s","http://127.0.0.1:%s","http://%s:%s"]' \
    "$GATEWAY_PORT" "$GATEWAY_PORT" "$GATEWAY_HOST" "$GATEWAY_PORT")"
  echo ""
  echo "==> Adding $GATEWAY_HOST to Control UI allowedOrigins"
  docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --no-deps \
    --entrypoint node openclaw-gateway \
    dist/index.js config set gateway.controlUi.allowedOrigins "$ALLOWED_ORIGINS" --strict-json
fi

# Restart gateway to pick up all config changes.
echo ""
echo "==> Restarting gateway"
docker compose -f "$ROOT_DIR/docker-compose.yml" restart openclaw-gateway

echo ""
echo "Control UI: http://${GATEWAY_HOST:-127.0.0.1}:${GATEWAY_PORT}/"
