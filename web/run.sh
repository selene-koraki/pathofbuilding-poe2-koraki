#!/usr/bin/env bash
# PoB2 Web — one-command launcher.
#
#   web/run.sh            start the LAN service (docker compose up -d --build)
#   web/run.sh up         same as above
#   web/run.sh dev        dev mode: gateway (tsx watch) + Vite HMR in containers
#   web/run.sh down       stop the service
#   web/run.sh logs       follow gateway logs
#   web/run.sh test       run the full test suite (engine + server + app) in a container
#
# Everything runs in Docker — no native Node/LuaJIT needed on the host.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE=(docker compose -f docker-compose.yml)
PORT="${POB_PORT:-7632}"
TOOLCHAIN=pob2-web-toolchain

ensure_toolchain() {
  if ! docker image inspect "$TOOLCHAIN" >/dev/null 2>&1; then
    echo "[run] building toolchain image…"
    docker build -f Dockerfile --target toolchain -t "$TOOLCHAIN" ..
  fi
}

case "${1:-up}" in
  up|"")
    "${COMPOSE[@]}" up -d --build
    echo "[run] PoB2 Web up on http://0.0.0.0:${PORT} (reachable from any LAN device)"
    ;;
  dev)
    ensure_toolchain
    "${COMPOSE[@]}" --profile dev up
    ;;
  down)
    "${COMPOSE[@]}" down
    ;;
  logs)
    "${COMPOSE[@]}" logs -f web
    ;;
  test)
    ensure_toolchain
    run() { docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
              -v "$(cd .. && pwd)":/app -w "$1" "$TOOLCHAIN" sh -c "$2"; }
    echo "== installing deps =="
    run /app/web/app    "npm install --no-audit --no-fund >/dev/null"
    run /app/web/server "npm install --no-audit --no-fund >/dev/null"
    echo "== app: typecheck + vitest =="
    run /app/web/app    "npx tsc --noEmit && npx vitest run"
    echo "== server: typecheck + vitest (engine contract + cross-device) =="
    run /app/web/server "npx tsc --noEmit && npx vitest run"
    echo "== engine: upstream busted suite (proves src/ untouched) =="
    docker run --rm -e HOME=/tmp -v "$(cd .. && pwd)":/workdir:ro -w /workdir \
      ghcr.io/pathofbuildingcommunity/pathofbuilding-tests:latest busted --lua=luajit || true
    ;;
  *)
    echo "usage: web/run.sh [up|dev|down|logs|test]" >&2
    exit 1
    ;;
esac
