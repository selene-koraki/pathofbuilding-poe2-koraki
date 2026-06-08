# Keeping this fork in sync with upstream

Upstream is **PathOfBuildingCommunity/PathOfBuilding-PoE2**. Its `dev` branch is
where everything you care about lands: engine/calculation fixes, **data-mined
content** (new uniques, gems, passive trees under `src/Data` and `src/TreeData`),
**patch-note / changelog** updates, and new SimpleGraphic DLLs (once upstream's
own update PR is merged). So **syncing `dev` gives you all of it**.

This is low-friction here because **all of this fork's custom code lives in
`web/`** and the engine in `src/` is untouched — upstream merges don't conflict.

## Option 1 — Automated (recommended): the `Sync from upstream` Action

`.github/workflows/upstream-sync.yml` runs daily (and on-demand). When upstream
has new commits it pushes them to a `sync/upstream-dev` branch and opens a normal
**pull request** into your `dev`, which you review and merge. It never
force-pushes your work.

To activate it:

1. **Enable Actions** on your fork (Settings → Actions → General → allow
   workflows). Forks have Actions off by default.
2. **Put the workflow on your default branch.** Scheduled (`cron`) workflows and
   the manual "Run workflow" button only work when the file is on the repo's
   default branch. Merge this branch into `dev` (or set your working branch as
   default) so the workflow is live.
3. Trigger it once manually from the **Actions** tab → *Sync from upstream* →
   *Run workflow* to confirm it works.

Notes: GitHub pauses `cron` schedules after ~60 days of no repo activity (just
re-run it manually to resume), and the daily time is adjustable via the `cron`
line.

## Option 2 — GitHub's built-in "Sync fork" button

On your fork's repo page, the branch dropdown shows **Sync fork** for any branch
that still tracks upstream (e.g. `dev`). One click fast-forwards it. Simplest if
you keep `dev` as a clean mirror and do your work on a separate branch.

## Option 3 — Command line

```bash
# one-time
git remote add upstream https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2.git

# each time you want updates
git fetch upstream
git checkout dev
git merge upstream/dev      # clean: you only changed web/
git push origin dev
```

If you keep your work on a branch off `dev`, merge `dev` into it afterwards
(`git checkout my-branch && git merge dev`).

## Recommended branch hygiene

- Keep editing only under `web/` (and additive files like docs / new workflows).
  Avoid changing files in `src/` so upstream merges stay conflict-free.
- If you ever *do* need an engine tweak, prefer doing it from `web/` (e.g. via
  the headless host overrides in `web/server.lua`) rather than editing `src/`.
- The few conflicts you might ever see would be in shared files like
  `CHANGELOG.md` / `changelog.txt`; resolve by taking upstream's version.
