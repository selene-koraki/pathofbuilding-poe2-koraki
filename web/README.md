# PoB2 Web

A modern, PoE2-styled web client for Path of Building 2, driving the **unmodified**
LuaJIT engine in `src/` headlessly. Self-hosted on your LAN; usable from any
device, with cross-device build continuity. See **[PLAN.md](./PLAN.md)** for the
full spec and roadmap.

## Architecture

```
Browser (React+TS+Vite, Zustand)
   │  WebSocket (typed JSON-RPC)
Node gateway (web/server)  ── shared build sessions, autosave, static serving
   │  newline-delimited JSON-RPC over stdio
LuaJIT engine kernel (web/engine)  ── drives src/ logic, never renders
   │  reads/writes
Builds/ (shared plain-XML, same files the desktop app uses)
```

- **`web/engine/`** — `kernel.lua` (JSON-RPC loop), `serialize.lua`, `api/*.lua`.
  Boots via `HeadlessWrapper.lua`, wires real `Deflate`/`Inflate`, calls the same
  logic methods the desktop UI and busted specs use. **Never edits `src/`.**
- **`web/server/`** — Node/TS gateway: supervises the engine (auto-restart),
  brokers WebSocket ⇄ JSON-RPC, serves the SPA, owns the Builds folder, and runs
  build-keyed **shared sessions** so multiple devices stay in lockstep (§7B).
- **`web/app/`** — React SPA: design system + tabs. Engine output (including
  `^`-colour codes) is rendered as-is; calc/allocation logic is never reimplemented.
- **`web/shared/`** — TypeScript RPC + DTO contract, imported by gateway and app.

## Run it (Docker — no native Node/LuaJIT needed)

```bash
web/run.sh                # build + start the LAN service (docker compose up -d)
# open http://<server-ip>:7632 from any device on the LAN
web/run.sh logs           # follow gateway logs
web/run.sh down           # stop
web/run.sh dev            # dev mode: gateway (tsx watch) + Vite HMR
web/run.sh test           # full test suite (engine + server + app + busted)
```

Or directly:

```bash
docker compose -f web/docker-compose.yml up -d --build
```

### Configuration (env)

| Var | Default | Meaning |
|---|---|---|
| `POB_PORT` | `7632` | LAN port. |
| `HOST` | `0.0.0.0` | Bind address (LAN-reachable). |
| `POB_BUILD_DIR` | `./web/builds` | Shared Builds folder (auto-created; a `Sample` build is generated on first run). |
| `POB_BUILD_DIR_HOST` | `./builds` | Host path bind-mounted into the container. |
| `POB_AUTOSAVE_MS` | `1500` | Debounced autosave delay after the last change. |
| `POB_SESSION_IDLE_MS` | `300000` | Idle eviction after the last device leaves. |

**Sharing builds with a desktop/Wine install:** point `POB_BUILD_DIR_HOST` at the
desktop app's Builds folder, e.g.
`POB_BUILD_DIR_HOST="$HOME/.wine/drive_c/users/$USER/AppData/Roaming/Path of Building (PoE2)/Builds"`.
The web app reads/writes the same plain-XML files.

> **Security:** v1 is single-user on a trusted LAN with **no auth**. Put the
> gateway behind a reverse proxy with auth before exposing it beyond the LAN.

## Tests

- **Engine contract** (`web/server/test/engine.contract.test.ts`) — spawns the real
  kernel, asserts the JSON-RPC surface drives the engine.
- **Cross-device** (`web/server/test/crossdevice.test.ts`) — two WS clients on one
  build: a mutation on A reaches B in ~200 ms, autosaves, and a late joiner loads
  the latest state after eviction (§7B guard).
- **Engine restart** (`web/server/test/restart.test.ts`) — kill → auto-respawn.
- **App** (`web/app/src/**/*.test.tsx`) — Vitest + RTL for the design system.
- **Upstream busted** — the engine suite still passes (proves `src/` untouched).

The `web/poc/` folder is the original proof-of-concept, kept for reference.
