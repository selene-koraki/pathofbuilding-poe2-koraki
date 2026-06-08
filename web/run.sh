#!/usr/bin/env bash
# Path of Building 2 — web client launcher (Linux, native, no Wine).
# Boots the Lua calculation engine as a local HTTP service and opens the
# browser UI. The engine runs under LuaJIT directly against src/.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${POB_PORT:-8088}"
export POB_PORT="$PORT"
export POB_WEB_ROOT="${POB_WEB_ROOT:-$REPO/web/public}"
# Point this at your desktop/Wine PoB "Builds" folder to share build files, e.g.
#   export POB_BUILD_DIR="$HOME/.wine/drive_c/users/$USER/AppData/Roaming/Path of Building (PoE2)/Builds"
export POB_BUILD_DIR="${POB_BUILD_DIR:-$REPO/web/builds}"

# --- dependency check ---------------------------------------------------
command -v luajit >/dev/null || { echo "error: luajit not found (install luajit)"; exit 1; }
need_rock() { luajit -e "require('$1')" >/dev/null 2>&1; }
missing=()
need_rock socket || missing+=(luasocket)
need_rock zlib   || missing+=(lua-zlib)
need_rock "lua-utf8" || missing+=(luautf8)
if [ "${#missing[@]}" -gt 0 ]; then
	echo "Installing Lua deps: ${missing[*]}"
	for r in "${missing[@]}"; do luarocks install "$r" >/dev/null || luarocks --local install "$r"; done
fi

mkdir -p "$POB_BUILD_DIR"

echo "Starting PoB2 engine service on http://127.0.0.1:$PORT …"
( sleep 2; command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$PORT" >/dev/null 2>&1 || true ) &

cd "$REPO/src"
exec env LUA_PATH="../runtime/lua/?.lua;../runtime/lua/?/init.lua;;" \
	luajit "$REPO/web/server.lua"
