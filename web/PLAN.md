# PoB2 Web — Feature Plan & Build Specification

> A start-to-finish plan to replace Path of Building 2's desktop UI with a modern,
> PoE2-styled web application driven by the **unmodified** PoB2 LuaJIT engine —
> reaching feature parity for the core build planner, with a UX redesign.
>
> This document is written to be executed autonomously (e.g. dropped into a
> `/goal` prompt). Each phase has explicit deliverables and acceptance criteria
> that gate progress. See **§12** for the ready-to-paste `/goal` prompt.

---

## 1. Locked decisions

| Decision | Choice | Notes |
|---|---|---|
| Front-end | **React + TypeScript + Vite** | Largest ecosystem; best for complex reactive state + the tree canvas. |
| Backend | **Node/TS gateway + LuaJIT engine kernel** | Gateway does I/O + WebSocket; engine is a pure compute kernel over JSON-RPC/stdio. |
| v1 scope | **Core planner first** | Tree, Skills, Items, Config, Calcs, import/export build codes. |
| Deferred to v2 | Trade-site search, party/support play, full item crafting, PoE-account import. |
| Deployment | **Self-hosted local server** (single user, LAN) | Long-running daemon; transport-agnostic boundary kept for future hosted/WASM. |
| v1 must-have | **Server-side Build Manager + cross-device continuity** | Pick from saved builds or start new; continue a build across laptop/phone/desktop and swap on the fly. Delivered in Phases 0–1, not deferred. |
| Hard constraint | **`src/` engine stays unmodified** | Preserves clean upstream sync (`.github/workflows/upstream-sync.yml`). All new code lives in `web/`. |

**North star:** open `http://<my-server>:<port>` from any device on my LAN, pick from
my saved builds (or start a new one), and plan a PoE2 build with a UI that looks like
the game and is nicer to use than the desktop app — **continuing a build seamlessly
across laptop, phone, and desktop**, computing on the real PoB engine, with the
server as the single source of truth and live cross-device sync.

---

## 2. Architecture

```
┌────────────────┐   WebSocket    ┌─────────────────────┐   JSON-RPC / stdio   ┌──────────────────────┐
│  Browser (SPA) │ ◀────────────▶ │   Node Gateway      │ ◀──────────────────▶ │  LuaJIT Engine Kernel│
│  React + TS    │   (+ REST for  │   - ws server       │   (newline-delimited │  - host shims        │
│  PixiJS tree   │    bulk/static)│   - static serving  │    JSON messages)    │  - api/* handlers    │
│  Zustand store │                │   - session mgmt    │                      │  - drives src/ logic │
└────────────────┘                │   - build-file I/O  │                      └──────────┬───────────┘
                                  │   - supervises Lua  │                                 │ reuses (read-only)
                                  └─────────┬───────────┘                                 ▼
                                            │ reads/writes                      ┌──────────────────────┐
                                            ▼                                   │  src/ (unmodified)   │
                                  ┌──────────────────────┐                      │  Modules/, Classes/, │
                                  │  Builds/ (shared XML) │                      │  Data/, TreeData/    │
                                  └──────────────────────┘                      └──────────────────────┘
```

**Responsibilities**
- **Engine kernel (`web/engine/`)** — LuaJIT. Boots a headless host (extends
  `src/HeadlessWrapper.lua`: real `Deflate`/`Inflate`, file I/O), holds the active
  build(s) in memory, and exposes a **command/query API** that calls the existing
  `src/` *logic* methods while skipping all rendering. Pure stdin/stdout JSON-RPC;
  no sockets. Authoritative for all build state and computed output.
- **Gateway (`web/server/`)** — Node + TypeScript. Spawns & supervises the engine,
  brokers WebSocket ⇄ engine JSON-RPC, serves the built SPA, manages the build
  folder shared with the desktop app, handles sessions and reconnects.
- **App (`web/app/`)** — React + TS + Vite. Design system, components, tabs, the
  PixiJS passive tree. Talks to the gateway over a typed WebSocket client.
- **Shared (`web/shared/`)** — TypeScript types for the RPC schema and build DTOs,
  imported by both gateway and app (one source of truth for the contract).

**The transport-agnostic seam** is the JSON-RPC message schema in `web/shared/`.
Today it travels browser→gateway(WS)→engine(stdio). A future WASM build would move
the engine into a Web Worker and carry the *same* schema over `postMessage`,
changing only the gateway, not the engine or the app's API client.

**State model (v1) — build-keyed shared sessions (this is what enables cross-device):**
The engine is authoritative and holds each open build in memory as a **session keyed
by the build**, *not* by the WebSocket connection. Every device that opens build *X*
**subscribes to the same session**: it immediately receives the current live state,
and every subsequent mutation (from any device) is broadcast as a `build.updated`
event to **all** subscribers, so a laptop, phone, and desktop stay in lockstep.
Commands are processed by the engine in a single serialized queue, giving a total
order (last-write-wins, no conflict resolution needed for one user on several
devices). Mutations also trigger a **debounced autosave** to the shared `Builds/`
XML file, so a device that connects later — even after the session was evicted from
memory — loads the latest saved state. After any mutating command the gateway pushes
a **full JSON projection** of the build + computed stats; switch to deltas only if
payload size ever matters (it won't for a single user). See **§7B** for the full
cross-device design.

**Repo layout**
```
web/
  engine/        kernel.lua, host.lua (host shims), api/{build,character,tree,skills,items,config,calcs,notes}.lua, serialize.lua
  server/        src/{index,rpc,builds,library,sessions,ws,static}.ts, package.json, tsconfig
  app/           src/{api,design,components,tabs,tree,store,routes}, index.html, vite.config, package.json
  shared/        rpc-schema.ts, dto.ts (build/stat/item/tree DTOs)
  poc/           the original proof-of-concept (archived; superseded by the above)
  docker-compose.yml, run.sh, PLAN.md
```
(The current `web/server.lua` + `web/public/` PoC is moved to `web/poc/` — it
validated the approach and is kept for reference.)

---

## 3. The Engine API (the headless boundary)

**The core challenge:** in `src/`, interaction logic and rendering are mixed inside
the tab/control classes (e.g. `TreeTab`, `ItemsTab`, `SkillsTab`). The strategy is
**not** to fork them but to add a thin Lua **API layer** in `web/engine/api/` that
calls the *logic* methods (the same ones the desktop UI and the busted specs call —
e.g. `build.spec:AllocNode`, `build.itemsTab:CreateDisplayItemFromRaw`,
`build.skillsTab:PasteSocketGroup`, `build:RefreshStatList`) and never touches the
draw paths. The existing tests prove these model methods are reachable headlessly.

**Kernel loop:** read newline-delimited JSON-RPC requests on stdin →
dispatch to `api/<domain>.<method>` → mutate the in-memory build → recompute →
emit a result and a `build.updated` event on stdout. All wrapped in `pcall` so a
bad command returns an error, never crashes the kernel.

**Command/query surface (v1)** — illustrative, grouped by domain:
- **library** (the Build Manager — server-side, device-agnostic): `list` → build
  summaries `{id, name, class, ascendancy, level, mainSkill, folder, favorite,
  updatedAt}`; `open{id}` (subscribe this device to the build's shared session);
  `close{id}`; `new{name}`; `duplicate{id}`; `rename{id,name}`; `delete{id}`;
  `move{id,folder}`; `favorite{id,bool}`; `listFolders`; `importCode{code,name}`.
- **build**: `save{name?}` (also runs on autosave), `exportCode` → string,
  `getState` (full projection of the *currently open* build for this session).
- **character**: `setLevel`, `setClass`, `setAscendancy`, `getMeta`.
- **tree**: `getTreeData{version}` (geometry + sprite manifest, served once & cached),
  `allocNode{id}`, `deallocNode{id}`, `allocPath{ids}`, `setMastery{node,effect}`,
  `setJewel{slot,item}`, `search{q}`, `listSpecs`, `selectSpec`, `newSpec`, `getAllocated`.
- **skills**: `listGroups`, `addGroup`, `removeGroup`, `setMainGroup`, `setMainSkill`,
  `addGem{group}`, `setGem{group,index, name|level|quality|enabled|count}`,
  `removeGem`, `reorderGem`, `pasteGroup{text}`.
- **items**: `getSlots`, `equip{slot,item}`, `unequip{slot}`, `pasteItem{text}`,
  `createItem{base}`, `setItemMod{...}`, `queryDB{filter}`, `listSets`, `setActiveSet`.
- **config**: `getSchema` (the `ConfigOptions` spec → form metadata), `set{key,value}`.
- **calcs**: `getSidebar` (formatted stat list), `getBreakdown{section}`,
  `compare{mutation}` → stat deltas (powers a "what does this node/item do" view).
- **notes**: `get`, `set{text}`.

**Events:** `build.updated{state}` (to all subscribers of a build),
`library.changed{summaries}` (build added/renamed/deleted/moved — refreshes every
device's manager list), `presence{buildId, devices}` (which devices are viewing a
build), `progress{msg}`, `error{where,msg}`.

**Serialization:** a `serialize.lua` turns engine objects into stable JSON DTOs
(defined in `web/shared/dto.ts`). Color escapes (`^x`, `^N`) are passed through and
rendered by the app (as in the PoC), so engine-side formatting stays the source of truth.

---

## 4. UI/UX redesign

### Design language — "PoE2, not PoB"
Dark stone surfaces, warm gold/bronze filigree, engraved serif (Cinzel/Trajan-like)
headers, and the **game's own rarity/element palette** carried through from the
engine. Builds on the token set already in the PoC (`--gold`, `--bronze-line`,
panel/`--bg` tokens, corner ticks). Dark theme is the default and only theme for v1.

### Design system / component library (`web/app/src/design` + `components`)
- **Tokens:** color, spacing scale, type scale, radii, elevation, motion. One file
  re-themes everything (the thing the desktop UI fatally lacks).
- **Primitives:** `Button`, `IconButton`, `TextInput`, `NumberInput`, `Select`,
  `Combobox`, `Slider`, `Checkbox`, `Toggle`, `Tabs`, `Panel`, `Card`, `Tooltip`,
  `Modal`, `Drawer`, `Toast`, `ContextMenu`, `Spinner`, `SearchField`.
- **Domain components:** `StatRow`/`StatPanel`, `ItemTooltip` (the colored item
  display), `GemPill`, `SocketGroup`, `ModLine` (blue=supported/red=unsupported),
  `ColorText` (the `^`-code renderer), `Breakdown` tree, `CompareDelta`.
- Developed in isolation (Storybook or a `/dev` route) so the system is testable
  and consistent before tabs consume it.

### Build Manager (the home screen) + on-the-fly switching
- A **Build Library** landing screen: a grid/list of saved builds showing class
  color, ascendancy, level, main skill, last-modified, and a favorite star;
  searchable and sortable; folders; create / duplicate / rename / delete / import.
- A **quick build-switcher** reachable from anywhere (in the `Ctrl-K` palette and a
  header dropdown) so you can swap builds without leaving the planner.
- **Cross-device affordances:** a subtle "also open on *iPhone*" presence indicator
  (from the `presence` event) and an autosave/"synced" status chip, so it's obvious
  the build is live everywhere. Opening the same build on a second device picks up
  the current state instantly (see §7B).

### Information-architecture improvements over the desktop UI
The desktop app is cramped, hairline-bordered, and keyboard-shallow. v1 improves:
- **Persistent stat sidebar** that stays put across tabs, with collapsible sections.
- **Responsive panel layout** (the desktop's fixed pixel anchoring → flex/grid that
  reflows; usable on a laptop or a wide monitor).
- **Global command palette / search** (`Ctrl-K`): jump to any tab, node, gem, item,
  or config option.
- **Better comparison UX:** hovering a node/item shows a clean stat-delta card
  (powered by `calcs.compare`) instead of a dense tooltip.
- **Drag-and-drop** gems between socket groups; **inline validation** on inputs.
- **Keyboard-first**: parity with desktop shortcuts + discoverable hints.
- **Honest "supported/unsupported"** coloring preserved (blue/red) — a beloved PoB signal.

### Cross-cutting UX
Loading/skeleton states, optimistic UI with reconcile-on-`build.updated`, error
toasts (engine errors surfaced, never swallowed), undo/redo, autosave indicator.

---

## 5. Feature parity matrix (desktop → v1)

| Desktop feature | v1 | Notes |
|---|---|---|
| Build list: list/new/open/delete, folders | ✅ | Upgraded to the **Build Manager** (rich metadata, search, favorites, duplicate). |
| **Cross-device continuity** (start on one device, continue on another) | ✅ ★new | Beyond desktop. Shared server-side sessions + autosave (§7B). |
| **Live multi-device sync** (edit on laptop, phone follows) | ✅ ★new | Beyond desktop. Broadcast `build.updated` to all subscribers. |
| Sidebar: class/asc/level, main group/skill, stat set | ✅ | |
| Sidebar: full stat panel (offence + defence) | ✅ | Reuses `build.controls.statBox.list`. |
| Config tab: toggles/conditions/enemy/map mods | ✅ | Generated from `ConfigOptions` schema. |
| Skills: socket groups, gems, supports, level/quality/enable | ✅ | |
| Items: slots, equip/unequip, paste-from-game | ✅ | |
| Items: unique DB / item DB search | ✅ | |
| Items: rare templates, mod-roll selection | ✅ | |
| Items: full crafting (prefix/suffix bench/essence) | ⏳ v2 | Read/equip crafted items works; authoring deferred. |
| Item sets | ✅ | |
| Passive tree: view, allocate, search, masteries, ascendancy | ✅ | |
| Passive tree: jewels (radius/conversion/timeless) | ✅ (basic) | Timeless edge-cases audited in Phase 5. |
| Passive tree: alternate path tracing (shift-hover) | ✅ | |
| Tree specs / loadouts; tree versions | ✅ | |
| Calcs tab: breakdown sections | ✅ | |
| Calcs tab: node/item power report & comparison | ✅ | |
| Import/Export: build codes (paste/generate) | ✅ | `Deflate`/`Inflate` already wired. |
| Import from PoE account (character) | ⏳ v2 | Needs OAuth + live API. |
| Trade-site search | ⏳ v2 | |
| Party / support builds | ⏳ v2 | |
| Notes tab | ✅ | |
| Undo/redo | ✅ | Engine-side `UndoHandler` or command journal. |
| Save/load, autosave, shared build files | ✅ | |
| Tooltips (stat, item, gem) | ✅ | Redesigned. |

**"Parity" is defined objectively (see §8):** every ✅ row passes its acceptance
test, and a corpus of sample builds computes **numerically identical** stats in the
web app and the headless engine.

---

## 6. Phased roadmap

Each phase ends only when its **Definition of Done (DoD)** passes. Commit per
milestone; keep the test suite green; never modify `src/`.

### Phase 0 — Foundations (incl. shared-session backbone)
- **Goal:** the three-tier skeleton runs end-to-end with **build-keyed shared
  sessions**; design system seeded; CI green.
- **Deliverables:** repo layout (§2); engine kernel with JSON-RPC loop + `library.open`
  + `build.load` + `calcs.getSidebar`; gateway that spawns/supervises the engine and
  implements the **shared-session model** (subscribe-by-build, broadcast
  `build.updated` to all subscribers, reconnect handling) + WS + static + build-file
  I/O + **debounced autosave**; React app shell with design tokens, `ColorText`,
  `StatPanel`, and a working "open a build → see live stats" flow (port the PoC);
  shared RPC types; Vite dev proxy; Dockerfile/compose + `run.sh`; CI (lint, typecheck,
  unit, engine contract test).
- **DoD:** `docker compose up` serves on the LAN; selecting a build shows the full stat
  sidebar; **opening the same build in two browser tabs/devices shows the same live
  state and one tab's change appears in the other within ~200 ms**; killing the engine
  subprocess auto-restarts; CI passes.

### Phase 1 — Build Manager + cross-device continuity + Sidebar + Config
- **Goal:** the full **Build Manager** works from any device, builds continue across
  devices, and a build is fully *configurable* with live recompute.
- **Deliverables:** **Build Library** screen (rich summaries, search/sort, favorites,
  folders) + quick-switcher; `library.*` commands (new/open/duplicate/rename/delete/
  move/favorite/importCode) with `library.changed` + `presence` events; cross-device
  continuity hardening (reconnect, late-join loads latest autosaved state, presence
  indicator, "synced" chip); character controls (level/class/ascendancy); main
  group/skill/stat-set selectors; **Config tab** auto-generated from `ConfigOptions`
  (toggles, dropdowns, numbers, conditions, enemy, map mods) with live recompute;
  optimistic UI + `build.updated` reconcile.
- **DoD:** from a phone and a laptop simultaneously: the library lists all builds and
  reflects create/rename/delete live; **starting/editing a build on one device and
  picking it up on the other shows the latest state with no manual save**; swapping
  builds on the fly works; toggling any config option updates the sidebar identically
  to the desktop app; numeric parity test passes on the config corpus.

### Phase 2 — Skills
- **Deliverables:** socket-group list, add/remove/reorder groups; gem add/remove,
  set level/quality/enabled/count, supports; main-skill selection; paste socket group;
  drag-drop gems; `GemPill`/`SocketGroup` components; gem search.
- **DoD:** building a socket setup from scratch yields the same skill list, DPS, and
  reservations as the desktop app; parity tests pass.

### Phase 3 — Items
- **Deliverables:** equipment slots + `equip/unequip`; **paste-from-game** parsing;
  unique/item DB browser with search/filter; rare templates + mod-roll selection;
  item sets; `ItemTooltip` with full rarity/mod coloring and supported/unsupported
  signal; (full crafting authoring **deferred to v2** — equipping crafted/loaded items works).
- **DoD:** pasting a set of items reproduces desktop stats exactly; DB search returns
  correct uniques; item sets switch correctly; parity tests pass.

### Phase 4 — Calcs
- **Deliverables:** **Calcs breakdown** (sections, expandable derivations from
  `CalcBreakdown`); **comparison/power** view via `calcs.compare`; redesigned stat &
  breakdown tooltips; warnings surfaced.
- **DoD:** breakdown values match the desktop Calcs tab; node/item power deltas match
  the desktop power report on the corpus.

### Phase 5 — Passive tree (the big one) — see §7
- **Deliverables:** tree-data export → JSON + sprite manifest; **PixiJS renderer**
  (pan/zoom, node states, hover, search highlight, connectors); allocate/deallocate
  synced to engine; **shift-path tracing**; masteries; ascendancy; jewel sockets &
  radius rings; tree **specs/loadouts** and **versions**; minimap/search.
- **DoD:** allocating/deallocating any node changes stats identically to desktop;
  a complex tree (~120 points + jewels + masteries) renders at ≥60 fps on a typical
  laptop and computes identical stats; path tracing matches desktop allocation.

### Phase 6 — Import/Export, specs, undo/redo, polish
- **Deliverables:** build-code import/export (round-trips with desktop & PoB sites);
  tree/skill/item loadout management; **undo/redo** across all mutations; command
  palette; keyboard shortcut parity; empty/error states; performance pass.
- **DoD:** a build exported from the web app imports byte-identically into desktop PoB
  (and vice-versa); undo/redo holds across every tab.

### Phase 7 — Parity audit, accessibility, deployment hardening
- **Deliverables:** full parity-matrix sign-off; the numeric-parity corpus expanded
  to ≥25 diverse real builds; a11y pass (focus, ARIA, contrast); responsive pass;
  systemd/compose deployment docs; backup of build folder; logging/metrics.
- **DoD:** every ✅ matrix row passes; the whole corpus is numerically identical;
  the app is documented and deployable as a LAN service in one command.

---

## 7. Passive tree deep-dive (hardest component)

- **Data export:** a build-time step (or kernel `tree.getTreeData`) projects
  `src/TreeData/<ver>/tree.lua` into compact JSON — node id, position, orbit,
  type (normal/notable/keystone/mastery/jewel/ascendancy), connections, group, stats
  text, and a **sprite manifest** (sheet URL + per-node UV rects). Sprite sheets
  (`src/TreeData/<ver>/*.png`) are served statically by the gateway (cached/CDN-able).
- **Renderer:** **PixiJS** (WebGL 2D). Layers: connectors → group backgrounds →
  nodes → overlays (allocation glow, hover ring, search highlight) → jewel radii.
  Viewport with smooth pan/zoom + culling for off-screen nodes. This is where the
  browser decisively beats the desktop bitmap renderer.
- **Interactions:** click allocate/deallocate (engine `tree.allocNode`/`deallocNode`
  → recompute → `build.updated` repaints node states); **shift-hover path preview**
  using the engine's path logic, click to commit; mastery effect picker popover;
  ascendancy ring; jewel socket equip + radius ring render.
- **Sync invariant:** the engine remains authoritative for *which* nodes are
  allocated and *what they do*; the renderer only reflects engine state and sends
  intents. No allocation rules duplicated in JS.
- **Risks:** sprite-sheet size/loading (preload + cache), timeless/radius jewel
  edge-cases (audited against parity corpus), path-trace performance (precompute
  adjacency client-side, validate on engine).

---

## 7B. Cross-device build sessions & the Build Manager

The feature: **start a build on my laptop, continue on my phone or desktop, and swap
builds on the fly — from anywhere in the house.** The architecture makes this natural
because the server is the single source of truth.

**Session model (sessions are keyed by build, not by connection):**
- The gateway keeps a `Session` per *open build id*, each owning one in-memory engine
  view of that build and a set of subscribed WebSocket clients (devices).
- `library.open{id}` from any device **attaches** that device to the build's session:
  the gateway replies with the current full state, then streams `build.updated` for
  every subsequent mutation **from any device** → all devices converge in lockstep.
- The engine processes commands in a **single serialized queue**, so there is a total
  order and **last-write-wins** — correct and conflict-free for one user across
  several devices (no CRDT needed).

**Persistence & late join (continue later, even after a restart):**
- Every mutation schedules a **debounced autosave** (e.g. 1–2 s after the last change,
  and on disconnect) to the shared `Builds/<name>.xml` — the same files the desktop
  app uses, so the desktop app and any device see the same builds.
- If a build's session was evicted (idle eviction after the last device leaves), the
  next `library.open` **re-hydrates it from the latest autosaved XML**. So "pick it up
  later" always loads the most recent state, whether or not anything was still warm.

**Switching on the fly:** `library.open{otherId}` swaps the device's subscription to a
different build (the previous build's session stays warm if other devices are on it,
else autosaves and idles). The quick-switcher / `Ctrl-K` drives this.

**Presence:** the gateway tracks devices per session and emits `presence{buildId,
devices}` so the UI can show "also open on *Pixel 8*" and a live "synced" chip. Each
device sends a small label (e.g. UA-derived) on connect.

**Reconnect & offline:** the WS client auto-reconnects with backoff; on reconnect it
re-`open`s the last build and reconciles to the server's current state (server is
authoritative, so no client-side merge). Brief disconnects are invisible.

**Optional polish (not required for DoD):** per-build **view state** (active tab,
tree pan/zoom, selected skill) can be persisted in a sidecar so handoff restores not
just the build data but *where you were*. Core requirement is build-data continuity;
view-state restoration is a nice-to-have.

**Security note:** v1 is single-user on a trusted LAN with **no auth**. Before
exposing beyond the LAN, put the gateway behind a reverse proxy with auth — do not
add multi-tenant auth in v1.

---

## 8. Testing & "parity" definition

- **Engine contract tests (busted):** the existing `spec/System/*` suite keeps
  proving the engine; add API-layer specs asserting each command mutates state
  correctly. Runs in CI under LuaJIT (already Linux-native).
- **Numeric parity harness (the objective bar for "parity"):** a corpus of build XMLs
  (and import codes) is computed two ways — (a) directly via headless engine, (b)
  via the full web stack driving the same mutations — and a script asserts the stat
  outputs are **identical**. Grown each phase; ≥25 diverse builds by Phase 7. This is
  what lets an autonomous build *prove* it reached parity rather than claim it.
- **Front-end:** Vitest + React Testing Library for components/store; Playwright e2e
  for key flows (open build, allocate node, equip item, toggle config, export code);
  optional visual-regression snapshots of the design system.
- **Cross-device test (Playwright, two contexts):** open the same build in two browser
  contexts; a mutation in context A appears in context B within a budget (~200 ms);
  rename/delete in the manager propagates to both; after evicting the session, a fresh
  open loads the latest autosaved state. This guards the §7B continuity feature.
- **Performance budgets:** tree ≥60 fps on a mid laptop; mutation→repaint < 150 ms
  for a typical build; initial load < 3 s on LAN (excluding first sprite fetch).

---

## 9. CI/CD & dev workflow

- **Dev loop:** `web/run.sh dev` → engine kernel + gateway + Vite (HMR) with the
  gateway proxied; edit React with hot reload; edit Lua API and the kernel reloads.
- **CI:** lint + typecheck (TS) + Vitest + busted engine/contract + a smoke parity run;
  Playwright e2e on a built artifact; block merge on red.
- **Upstream hygiene:** CI also runs the existing engine suite to ensure `src/` is
  untouched and the weekly `upstream-sync` PRs stay conflict-free. New code lives only
  in `web/`.

---

## 10. Deployment (self-hosted local server)

- **Artifact:** `docker compose up -d` (or a `systemd` unit) runs gateway + engine;
  Vite output is prebuilt and served by the gateway. One container/process group.
- **Config:** `POB_BUILD_DIR` (shared Builds folder — can point at the desktop/Wine
  app's folder), `PORT`, bind address (LAN). Build folder is bind-mounted and backed up.
- **Access:** `http://<server-ip>:<port>` from any LAN device. Single user, no auth in
  v1 (note: add a reverse-proxy + auth before ever exposing beyond the LAN).
- **Future:** the transport-agnostic seam (§2) allows a later hosted/multi-user or
  WASM build by swapping the gateway only.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Engine logic coupled to rendering in some tab methods | Add an **additive** Lua API layer that calls logic methods; if a method is render-entangled, add a small headless seam in `web/engine/` — never edit `src/`. |
| Passive tree complexity/perf | PixiJS + culling; phased; parity corpus for jewels. |
| Upstream drift breaking the API layer | `src/` untouched + contract tests run after every sync PR; failures localize to `web/engine/api/`. |
| Calc cost stalling I/O | Engine kernel is a separate process from the gateway; long calcs can't block WebSockets; worker pool possible later. |
| Scope creep | Core-first; deferred list (trade/party/crafting/account) is explicit and out of v1 DoD. |
| "Looks done but numbers wrong" | The numeric-parity harness is the gate; no phase is done until its corpus is identical. |

---

## 12. The `/goal` prompt (ready to paste)

```
/goal Build the PoB2 web application per web/PLAN.md, start to finish.

Context: This repo is a fork of Path of Building 2 (a LuaJIT desktop build
planner). I want to replace its UI with a modern, PoE2-styled web app driven by
the UNMODIFIED engine in src/, reaching feature parity for the core planner.

Authoritative spec: web/PLAN.md. Follow it exactly.

Architecture: React+TS+Vite front-end (web/app) ⇄ WebSocket ⇄ Node/TS gateway
(web/server) ⇄ JSON-RPC/stdio ⇄ LuaJIT engine kernel (web/engine) that drives
src/ logic without rendering. Shared RPC/DTO types in web/shared.

Must-have early (Phases 0–1, NOT deferred): a server-side Build Manager + cross-device
continuity per §7B — builds are keyed server-side as shared sessions, so I can start a
build on one device, continue on another, and swap builds on the fly, with live sync
and autosave to the shared Builds/ folder.

Execute the phases in web/PLAN.md §6 IN ORDER (0→7). For each phase:
  1. Implement its deliverables.
  2. Make its Definition of Done pass, including the numeric-parity harness (§8).
  3. Run all tests (busted engine suite + Vitest + Playwright) and keep them green.
  4. Commit with a clear per-milestone message and push to the feature branch.
  Do NOT start the next phase until the current DoD passes.

Hard rules:
  - NEVER modify anything under src/ (keep upstream sync clean). All new code lives
    under web/. If a src/ method is render-entangled, add a headless seam in
    web/engine instead of editing src/.
  - Reuse the engine's own computed outputs and color codes; never reimplement calc
    or allocation logic in JS — the Lua engine stays authoritative.
  - Match the PoE2-styled design system (§4); build the component library before the
    tabs consume it.
  - "Parity" means the numeric-parity corpus computes identically AND every ✅ row in
    the §5 matrix passes its acceptance test. Prove it, don't assert it.

Deferred to v2 (do NOT build in v1): trade-site search, party/support play, full
item crafting authoring, PoE-account import.

Work autonomously through all phases. After each phase, post a short status
(what shipped, DoD result, parity corpus result) and continue. At the end, deliver
the completed §5 parity matrix sign-off and deployment docs.
```

---

## Appendix A — Recommended libraries
- **App:** React 18, TypeScript, Vite, **Zustand** (state), **PixiJS** (tree),
  CSS Modules or vanilla-extract (bespoke design tokens), `@tanstack/react-virtual`
  (long lists), Playwright + Vitest + React Testing Library.
- **Gateway:** Node 20+, TypeScript, `ws`, a tiny static handler (or `fastify`),
  `zod` (validate RPC at the boundary).
- **Engine:** LuaJIT, `lua-zlib` (Deflate/Inflate), `dkjson` (already vendored).

## Appendix B — Definition of Done checklist (per phase)
- [ ] Deliverables implemented and behind the design system.
- [ ] Numeric-parity corpus for the phase: web == headless engine.
- [ ] busted + Vitest + Playwright green; typecheck + lint clean.
- [ ] `src/` untouched (`git diff --quiet src/`).
- [ ] Committed + pushed; short status posted.
