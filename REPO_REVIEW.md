# Path of Building 2 (Koraki fork) — Repository Review

_Review date: 2026-06-07. Scope: the whole repo, with emphasis on architecture,
Linux support, correctness/perf bugs, and the UI._

---

## 1. How it works

Path of Building 2 is an **offline build planner for Path of Exile 2**. It is a
**LuaJIT application** whose entire UI and OS integration is provided by a small
native "graphics host" called **SimpleGraphic**. The host loads `src/Launch.lua`
(marked by the `#@ SimpleGraphic` header on line 1) and injects a set of global
functions — rendering (`DrawImage`, `DrawString`, `SetDrawColor`), input
(`IsKeyDown`, `GetCursorPos`), windowing, timers (`GetTime`), filesystem
(`GetUserPath`, `MakeDir`), networking (`lcurl`), and background scripts
(`LaunchSubScript`). None of these exist in stock Lua; they all come from the host.

### Boot sequence
1. **`src/Launch.lua`** (`launch:OnInit`) — sets the window title, reads
   `manifest.xml` to learn the version/branch/platform, decides **dev mode**
   (running from a repo with a remote manifest disables auto-updates), calls
   `RenderInit("DPI_AWARE")`, then loads the main module.
2. **`src/Modules/Main.lua`** (`main:Init`) — the `main` object is a
   `ControlHost`. It loads the data layer (`Common`, `Data`, `ModTools`,
   `CalcTools`, …) and registers **two modes**:
   - `LIST` → `Modules/BuildList.lua` (the build-selection screen)
   - `BUILD` → `Modules/Build.lua` (the actual planner)
3. **Per-frame loop** — `launch:OnFrame` calls `main:OnFrame`, which processes
   input and draws the current mode. Everything is immediate-mode: the whole
   screen is redrawn every frame from Lua.

### Major subsystems
- **Calculation engine** (`src/Modules/Calc*.lua`): `CalcSetup` assembles the
  actor mod databases (passives, items, jewels, auras, config); `CalcPerform`,
  `CalcOffence`, `CalcDefence` compute DPS/EHP/etc. This is the heart of the app
  and the largest hot path (`CalcOffence.lua` alone is huge).
- **Mod system** (`ModParser.lua`, `ModDB.lua`, `ModList.lua`, `ModStore.lua`):
  parses the natural-language modifiers on items/skills/passives into structured
  mods, cached in a generated `ModCache`.
- **Data** (`src/Data/`, `src/TreeData/`): generated game data — passive trees
  per game version (`TreeData/0_1`…`0_5`), `stat_descriptions.lua`, uniques,
  bases, gems. These dominate the ~1.4M LOC line count (the hand-written app is a
  small fraction).
- **UI controls** (`src/Classes/*Control.lua`, `Control.lua`/`ControlHost.lua`):
  buttons, edit fields, dropdowns, lists, scrollbars, tooltips, the passive-tree
  view, etc. (see §4).
- **Export pipeline** (`src/Export/`): developer tooling that unpacks the game's
  GGPK and regenerates the data files (Windows-oriented).
- **Updater** (`UpdateCheck.lua` / `UpdateApply.lua`): diffs the local vs remote
  `manifest.xml` (filename → SHA-1 pairs), downloads changed files, and applies them.

### Tooling
- Tests: **`busted`** specs in `spec/System/*_spec.lua`, run through
  `src/HeadlessWrapper.lua` (a pure-Lua stub of the host) under **LuaJIT**.
- CI: `.github/workflows/test.yml` (sharded busted on Ubuntu),
  `manifest.yml`, `installer.yml` (NSIS, Windows), `update-simple-graphic.yml`.

---

## 2. Can it run on Linux?

**Yes for the calculation engine / tests (verified hands-on). No for the GUI
out-of-the-box — that needs Wine.**

### What I verified in this container
I installed `luajit` + `luautf8` (luarocks) + `busted` and ran the project:
- `HeadlessWrapper.lua` boots the full engine: loads the 0_5 passive tree,
  uniques, rares — `Startup time: 0 ms`, no fatal errors.
- The test suite runs natively: **400 passing / 1 failing** under
  `busted --lua=luajit` (the one failure — `TestSkills_spec.lua:121`, "Keeps
  Virtuous armour scaling during Full DPS loop", expected 1050 got 1200 — is
  **pre-existing on `dev`**, not introduced by this branch; the branch diff vs
  `dev` is empty).

### Why the GUI is Windows-only here
The native host is the only thing that isn't cross-platform, and this repo ships
**only the Windows build of it**:
- `runtime/` contains `SimpleGraphic.dll`, `Path of Building-PoE2.exe`,
  `Update.exe` and a stack of MSVC/ANGLE DLLs — all PE (Windows) binaries.
- `manifest.xml` only ever offers `platform="win32"` runtime files.
- `.github/workflows/update-simple-graphic.yml` downloads
  `SimpleGraphicDLLs-x64-windows.tar` — Windows only.
- There is **no Linux `.so`/ELF host, no submodule, and no build script** to
  produce one in this repo.

### How to run it on Linux
**Option A — GUI via Wine (the path the repo's own `CONTRIBUTING.md` documents):**
```bash
wine "./runtime/Path of Building-PoE2.exe"
```
A working Wine GL/ANGLE stack is required (the bundled `libGLESv2`/`libEGL` are
ANGLE). Running from the cloned repo auto-enables dev mode (updates disabled).
Steam Proton on the released Windows build works the same way. `chmod +x` does
**not** make it a Linux binary — it remains a PE that needs Wine.

**Option B — headless engine (native, no Wine):**
```bash
# one-time deps
luarocks install luautf8 busted
# run the engine / a script
cd src && LUA_PATH='../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' luajit HeadlessWrapper.lua
# run tests
busted --lua=luajit        # from repo root, or: docker compose up
```
This gives the calc engine and scripting (`build`, `newBuild()`), but **no UI**,
and **no build-code import/export** until `Deflate`/`Inflate` are implemented
(they are TODO stubs in `HeadlessWrapper.lua:95-102`).

**Option C — a true native Linux GUI** would require a Linux build of the
SimpleGraphic host (an ELF exposing the same global API + the `#@ SimpleGraphic`
loader). That is **not present or buildable from this repo** — it would mean
pulling/porting it from the upstream SimpleGraphic project. Wine (Option A) is the
realistic route today.

---

## 3. Bugs & inefficiencies

The hand-written app code is mature upstream PoB2; the highest-value issues are in
the **fork-specific** scripts (Python tree-fixer, updater). All items below were
read and verified in source.

### High
1. **Unbounded busy-loop in the updater — `src/UpdateApply.lua:29-32`.**
   ```lua
   local dstFile
   while not dstFile do
       dstFile = io.open(dst, "w+b")
   end
   ```
   If the destination can't be opened (missing dir, permission denied, file
   locked — all plausible on Linux/macOS), this spins forever and hangs the
   update with no diagnostic; the trailing `if dstFile then` is also dead code.
   **Fix:** bound the retries, `MakeDir` the parent first, and `error()` with a
   message if it still fails.

2. **GroupID key-type mismatch — `fix_ascendancy_positions.py:114` vs `117-118`.**
   The collision guard checks the **string** GroupID
   (`str(...["GroupID"]) in data["groups"]`), but the group is then written under
   the raw **int** key (`data["groups"][node["Node"]["group"]]`). JSON keys are
   strings, so the guard can never see the int-keyed entry, and injected groups
   are stored under a key shape no consumer looks up. Silent data corruption of
   injected ascendancy nodes. **Fix:** use the string form for both.

3. **Early `return` aborts the whole batch and leaves output unwritten —
   `fix_ascendancy_positions.py:114-116`.** A single pre-existing GroupID does a
   bare `print` + `return`, after some groups were already mutated, and **before**
   the file write at lines 124-138 — yet `main()` still logs success. **Fix:**
   raise (so CI/tests fail loudly) or `continue` per-node, and check collisions
   before mutating.

### Medium
4. **Non-idempotent tree fixer — `fix_ascendancy_positions.py:124-135`.** The
   script `del`s `data["sprites"]`/`extraImages`/`imageZoomLevels`; a second run
   (and `main()` globs every `**/data.json`) raises `KeyError`. **Fix:** guard each
   `del` with an `if key in data`.

5. **Missing test fixtures — `tests/`.** `test_fix_ascendancy_positions.py`
   depends on `data.json`/`data_fixed.json` fixtures that aren't in the repo
   (`tests/` contains only the test file), so both tests currently error with
   `FileNotFoundError`. Either commit the fixtures or generate them in `setUp`.

6. **Per-frame table allocation — `src/Modules/Main.lua:363`.**
   `self.viewPort = { x=0, y=0, width=..., height=... }` is re-allocated every
   frame in `OnFrame`. Minor but needless GC churn at 60+ fps. **Fix:** allocate
   once in `Init`, mutate fields in place.

7. **`update_manifest.py` helper is inverted/fragile (`:20-26`).**
   `_exclude_directory` actually returns True when the path **is inside** a listed
   directory, and folds a `len(path.parts) <= 1` check into the per-directory
   `any()`, conflating "top-level file" with "matches this directory." Works for
   the current `manifest.cfg` but is a latent correctness trap. **Fix:** rename and
   lift the top-level check out of the loop.

### Low / housekeeping
8. **Committed patch-reject file — `spec/System/TestItemParse_spec.lua.rej`** is
   tracked in git. It's leftover from a `patch`/rebase and should be deleted; the
   useful tests inside it (enchant parsing, `linePostfix` reset) look worth
   actually applying to `TestItemParse_spec.lua`.
9. **Red test on `dev` — `spec/System/TestSkills_spec.lua:121`** (see §2). The
   suite is not green; worth fixing or quarantining so CI signal stays meaningful.
10. **`UpdateCheck.lua` minor smells:** module-level `globalRetryLimit` shared
    across downloads with no per-call reset (`:14`), and an unreachable
    `return true` (`:86`). Low impact; document intent / drop dead code.

---

## 4. UI critique & concrete proposals

### Why it looks dated
The entire UI is **immediate-mode, hand-drawn flat rectangles**. There is one
real drawing primitive — `DrawImage(nil, x, y, w, h)` fills a solid rect in the
current color — and every border/panel/divider is a stack of those. Specifically:
- **Hard 1px hairline borders everywhere**, faked as two stacked filled rects
  (outer = border color, inner inset by 1-2px = fill). No corner radius, no
  anti-aliasing, no gradients, no shadows/elevation.
- **Pure greyscale chrome with zero accent color.** State is encoded only as a
  brightness step: `0.33` disabled, `0.5` idle border, `0.66` secondary,
  `0.75/1.0` hover/active, `0.1/0.15` panel fill, `0` black. The only color in the
  app is in *content* text (item rarities, damage types) via the `colorCodes`
  table in `src/Data/Global.lua:7`.
- **No design system.** Chrome colors are inlined as raw `SetDrawColor(0.5,…)`
  literals — **185 of them just in `src/Classes/`** — so there's no single place
  to retheme. Spacing is ad-hoc `+1/+2/+4` magic numbers; there are no
  padding/typography tokens. Bitmap fonts (Liberation Sans `"VAR"`, Vera Mono
  `"FIXED"`) are pre-rasterized at fixed sizes with no scaling between them.
- **Weak hover/active affordances.** The active tab is just the same button drawn
  with a white border (`locked` state) — no underline, pill, or accent. Hover is a
  single brightness flip, no transitions.

Importantly, **none of this needs a new rendering engine to fix** — it's all
reachable with the existing `SetDrawColor` + `DrawImage(nil,…)` + `DrawString`.

### Proposed improvements (incremental, low-risk)
**Step 1 — centralize the design system (unlocks everything else):**
- Add a `uiColors` chrome table next to `colorCodes` in `src/Data/Global.lua`:
  `border`, `borderHover`, `panelBg`, `panelBgAlt`, `accent`, `textPrimary`,
  `textMuted`, `textDisabled`. The existing `updateColorCode()`/`defaultColorCodes`
  mechanism already proves runtime-overridable colors work.
- Add a shared `DrawBox(x,y,w,h, borderCol, fillCol, inset)` helper (e.g. in a new
  `UI.lua` or on `Control`) to replace the repeated two-rect idiom, plus spacing
  constants (`PAD=4`, `PAD_SM=2`, `ROW_H=20`).
- Mechanically replace the 185 inline literals in `ButtonControl`, `EditControl`,
  `DropDownControl`, `CheckBoxControl`, `ScrollBarControl`, `SectionControl`,
  `PopupDialog` with these references.

**Step 2 — the actual visual wins:**
- **Introduce one accent color** (e.g. PoE gold `^xC8AA64` or a teal) used for the
  active-tab indicator, focused-input border, checkbox check, and primary-button
  border. A single accent against the greyscale instantly modernizes it.
- **Warm up the panels:** swap pure-black fills (`0`/`0.1`) for a charcoal
  (`~0.07,0.07,0.08`); add a second tone for alternating list rows for structure.
- **Quieter dividers:** drop idle borders from `0.5` to `~0.35`, reserving bright
  `1.0` strictly for hover/active.
- **Active-tab accent bar:** in `src/Modules/Build.lua:318-344`, draw a 2px accent
  underline under the active mode button instead of relying on the white border.
- **Hover fill tint:** add a faint low-alpha accent overlay on `mOver` (the
  dropdown already does a grey row highlight — generalize it).
- **Cheap depth:** draw a 1px darker shadow rect offset +1px under popups /
  dropdowns / tooltips so they lift off the tiled-tree background; optionally
  darken/desaturate that background tint (`src/Modules/Main.lua:1464`).

**Step 3 — typography & spacing:**
- Standardize a small type scale (body 16, label 14, header 18 `VAR BOLD`) via
  constants instead of scattered literals.
- Consider the already-shipped **Fontin / Fontin SmallCaps** fonts (unused today)
  for section headers — more on-brand for PoE, zero new assets.
- Bump control insets from 2px to ~4px and the 20px mode buttons slightly for
  breathing room.

**Files to touch:** `src/Data/Global.lua` (tokens), `src/Classes/Control.lua` (or
new `UI.lua`, shared `DrawBox`), the per-widget `Draw` methods listed above,
`src/Modules/Build.lua:318-344` (active-tab accent), `src/Modules/Main.lua:1462`
(background tint). All changes stay within the current rendering model and can ship
one control at a time.
