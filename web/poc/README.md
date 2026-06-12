# PoB2 Web Client — proof of concept

A native-Linux path to using Path of Building 2 **without Wine for the parts
that are ported**, and a foundation for a modern, PoE2-styled UI.

It runs the **existing** PoB2 calculation engine headlessly under LuaJIT and
exposes it over a small `localhost` HTTP API. A browser front-end (plain
HTML/CSS/JS, styled after the in-game PoE2 look) calls that API. The engine in
`src/` is **not modified** — everything here lives under `web/`.

```
web/
  server.lua      Boots the engine (via src/HeadlessWrapper.lua) + HTTP API
  run.sh          One-command launcher (installs Lua deps, starts server, opens browser)
  public/         The browser UI (index.html, style.css, app.js)
  builds/         Build XML files the service reads (a Sample is auto-generated)
```

## Run it

```bash
./web/run.sh
# then open http://127.0.0.1:8088  (run.sh tries to open it for you)
```

Requirements: `luajit`, and the LuaRocks modules `luasocket`, `lua-zlib`,
`luautf8` (run.sh installs the missing ones).

## Share build files with the desktop / Wine app

Both front-ends read/write the same plain-XML build files, so point the service
at your existing Builds folder and switch between them freely:

```bash
export POB_BUILD_DIR="$HOME/.wine/drive_c/users/$USER/AppData/Roaming/Path of Building (PoE2)/Builds"
./web/run.sh
```

## What works today (this PoC)

- Engine boots headless on Linux (no SimpleGraphic, no Wine).
- `GET /api/builds` — lists build files.
- `GET /api/build?name=<name>` — loads a build and returns the engine's own
  computed stat sidebar as JSON (with the game's colour codes preserved).
- Browser UI renders the build's class/level/skill and full stat panel.
- Real `Deflate`/`Inflate` (zlib) are wired, so PoB import/export codes can be
  supported next.

## What's next (the roadmap from the review)

1. Editable config (toggles/inputs) → recompute on change (WebSocket).
2. Items (paste already returns structured data) and Skills tabs.
3. Passive tree view (the big one) in Canvas/WebGL.
4. Optional: swap the transport (localhost → in-tab WASM or a hosted server)
   behind the same API without changing the front-end.

This is intentionally a thin vertical slice to prove the architecture; it is not
feature-complete. The desktop app (via Wine) remains the full-featured fallback
while tabs are migrated one at a time.
