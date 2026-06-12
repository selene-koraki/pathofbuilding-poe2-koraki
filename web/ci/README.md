# Web CI

`web-ci.yml` is the GitHub Actions workflow for the web stack (typecheck, Vitest,
SPA build, engine contract + cross-device tests, and a `git diff --quiet src/`
guard that proves the engine tree stays untouched).

It lives here (not in `.github/workflows/`) so the repo stays pushable with a
token that lacks the `workflow` OAuth scope, and so all fork-additive web code
stays under `web/`. To enable it:

```bash
cp web/ci/web-ci.yml .github/workflows/web-ci.yml
git add .github/workflows/web-ci.yml && git commit -m "Enable web CI"
```

(Requires a token/SSH key with `workflow` scope to push.) Locally, the same
checks run via `web/run.sh test`.
