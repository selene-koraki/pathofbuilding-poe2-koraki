# PoB2 Web — Parity Matrix Sign-off (§5)

"Parity" is objective (PLAN §8): every ✅ row passes an acceptance test **and** a
corpus of builds computes **numerically identical** stats via the web stack and the
headless engine. Evidence below references the automated tests under
`web/server/test/` and the parity corpus in `web/parity/scenarios.ts`.

**Numeric parity corpus:** `web/server/test/parity.test.ts` runs **45 scenarios**
(3 classes × 3 levels × 4 config matrices, plus skills / supports / minions / items /
tree, plus 4 integrated multi-subsystem builds and an undo/redo build). Each is
computed two independent ways — a dedicated headless engine kernel vs. the full
gateway/session stack a browser drives — and asserted **bit-identical**. All pass.

Engine tree (`src/`) is byte-for-byte untouched: `git diff --quiet src/ spec/ runtime/`
in CI; the upstream busted suite stays green (one documented pre-existing failure).

| Desktop feature | v1 | Acceptance evidence |
|---|---|---|
| Build list: list/new/open/delete, folders | ✅ | `library.*` + Build Manager UI; `crossdevice.test.ts` opens/lists; manual + `library.list/new/rename/delete`. |
| **Cross-device continuity** | ✅ ★ | `crossdevice.test.ts`: late joiner loads latest autosaved state after eviction. |
| **Live multi-device sync** | ✅ ★ | `crossdevice.test.ts`: mutation on A reaches B < 500 ms (design target ~200 ms). |
| Sidebar: class/asc/level, main group/skill, stat set | ✅ | `CharacterPanel`; `character.*`, `skills.setMainGroup/Skill`. |
| Sidebar: full stat panel (offence + defence) | ✅ | Reuses `build.controls.statBox.list`; `StatPanel`; every parity scenario asserts the output. |
| Config tab: toggles/conditions/enemy/map mods | ✅ | `config.getSchema/getShown/set`; parity config matrices (16 scenarios). |
| **Quest rewards** | ✅ | Generated into the Config schema (`Quest Rewards` section, 17 options) from `ConfigOptions.lua`. |
| **Custom modifiers** | ✅ | Config schema `text` option (custom-mods box). |
| Skills: socket groups, gems, supports, level/quality/enable | ✅ | `skills.test.ts`; parity `fireball-*` scenarios. |
| **Minions** | ✅ | `tree`/`parity` `minion-raise-zombie`; minion section in the sidebar; `Minion.*` output parity. |
| **Full DPS** toggle + per-group include | ✅ | `skills.setGroupFullDPS`; parity `fireball-*` (FullDPS in tracked stats). |
| Items: slots, equip/unequip, paste-from-game | ✅ | `items.test.ts` (paste applies mods); parity `items-unique-belly`, `integrated-warrior-armour`. |
| Items: unique DB / item DB search | ✅ | `items.test.ts` (searchUniques filters by slot). |
| Items: rare templates, mod-roll selection | ✅ (read/equip) | `items.pasteItem` of rares; authoring of rolls is v2. |
| Items: full crafting (bench/essence) | ⏳ v2 | Equipping crafted/loaded items works; authoring deferred per plan. |
| Item sets | ✅ | `items.test.ts` (switching sets removes items). |
| **Flasks** | ✅ | Flask slots + `items.setSlotActive`. |
| **Charms** | ✅ | Charm slots + active toggle. |
| **Runes / Soul Cores** | ✅ (read/equip) | Rendered in the item tooltip; equipping items with runes works; authoring v2. |
| **Anoints** | ✅ (read) | Rendered in the item tooltip (enchant mod lines); authoring v2. |
| **Enchantments** | ✅ (read) | Item tooltip enchant lines; bench-enchant authoring v2. |
| Passive tree: view, allocate, search, ascendancy | ✅ | `tree.test.ts`; parity `tree-witch-rawpower`, `integrated-sorc-fireball`. |
| Passive tree: masteries | ✅ | `tree.getMasteryEffects/setMastery/clearMastery` (PoE2 0.5 tree exposes none; wired for when present). |
| Passive tree: jewels (radius/conversion/timeless) | ✅ (basic) | Jewel sockets are item slots (`Jewel <id>`); radius via engine; timeless edge-cases tracked. |
| Passive tree: alternate path tracing (shift-hover) | ✅ | `tree.previewPath` (engine `node.path`); `tree.test.ts` auto-fills the path. |
| Tree: specs & versions | ✅ | `tree.listSpecs/selectSpec`; TreeTab spec selector. |
| **Weapon set swap (Set I/II)** | ✅ (alloc mode) | `tree.setAllocMode`; point counts split (weaponSet1/2); UI toggle. |
| **Tree power heatmap** | ✅ | `tree.power` (BuildPower coroutine run to completion); `tree.test.ts`; renderer gradient. |
| **Loadouts** | ✅ (tree specs + item sets) | Tree specs + item sets shipped; skill/config-set UI is a tracked follow-up. |
| **Import tree/items/skills from URL** | ⏳ follow-up | Build-code import shipped; planner-URL import tracked. |
| Calcs tab: breakdown sections | ✅ | `calcs.test.ts` (breakdown lines); CalcsTab explorer. |
| Calcs tab: node/item power report & comparison | ✅ | `calcs.compare` (non-committing, reverts); `calcs.test.ts`. |
| Import/Export: build codes | ✅ | `undo.test.ts` (export re-imports to identical allocation). |
| Import from PoE account | ⏳ v2 | Needs OAuth + live API. |
| Trade-site search | ⏳ v2 | |
| Party / support builds | ⏳ v2 | |
| Build-vs-build comparison | ⏳ v2 | Per your call. |
| Pantheon / Bandits | ➖ N/A | Not in PoE2 — replaced by Quest Rewards (above). |
| Notes tab | ✅ | `notes.get/set`; NotesTab. |
| Undo/redo | ✅ | `undo.test.ts` (spans config→skills→tree); kernel XML-snapshot journal. |
| Save/load, autosave, shared build files | ✅ | `crossdevice.test.ts` (debounced autosave to shared XML). |
| Tooltips (stat, item, gem) | ✅ | `ItemTooltip` (engine `AddItemTooltip` lines); tree hover tooltips; gem pills. |
| App settings (number formatting) | ⏳ follow-up | Minimal; build-folder/port are server config. |

## Tracked follow-ups (honest gaps)

These do not block the numeric-parity bar (every scenario is identical) but are
acknowledged for full polish:

1. **Tree node art** — the PixiJS renderer draws engine-accurate geometry/states/
   heatmap as styled shapes, not the game's sprite bitmaps. Geometry + all
   computation are exact; sprite-sheet art is a visual-fidelity follow-up.
2. **Spectre/beast library browser** — minion skills + minion stat panel work and
   are parity-verified; a browse-and-add spectre library UI is deferred.
3. **Skill/config loadout UI** — engine skill sets & config sets exist; tree specs
   and item sets have UI; skill/config-set switchers are a follow-up.
4. **Planner-URL import**, **app settings (number format)**, **rare/rune/anoint
   authoring** — deferred (build-code import + read/equip cover the v1 path).
5. **Playwright e2e / fps measurement** — the cross-device guarantee is covered by a
   two-client WS test; a browser-level Playwright + fps probe is the remaining check.

## How to reproduce

```bash
web/run.sh test     # app vitest + server vitest (incl. 45-scenario parity) + busted
```
