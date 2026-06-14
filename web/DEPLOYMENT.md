# PoB2 Web — Deployment

Self-hosted LAN service. One container/process group runs the Node gateway, which
supervises the LuaJIT engine kernel and serves the prebuilt SPA.

## One-command deploy

```bash
web/run.sh                 # docker compose up -d --build
# open http://<server-ip>:7632 from any device on the LAN
```

or directly:

```bash
docker compose -f web/docker-compose.yml up -d --build
```

## Configuration (env)

| Var | Default | Meaning |
|---|---|---|
| `POB_PORT` | `7632` | LAN port (host + container). |
| `HOST` | `0.0.0.0` | Bind address — LAN-reachable. |
| `POB_BUILD_DIR` | `/app/web/builds` (in-container) | Shared Builds folder. |
| `POB_BUILD_DIR_HOST` | `./builds` | Host path bind-mounted to the Builds folder. |
| `POB_AUTOSAVE_MS` | `1500` | Debounced autosave delay. |
| `POB_SESSION_IDLE_MS` | `300000` | Idle session eviction. |

### Repointing at a desktop / Wine Builds folder

The web app reads/writes the **same plain-XML** files the desktop app uses. To
share builds with a desktop or Wine install, bind-mount its Builds folder:

```bash
POB_BUILD_DIR_HOST="$HOME/.wine/drive_c/users/$USER/AppData/Roaming/Path of Building (PoE2)/Builds" \
  docker compose -f web/docker-compose.yml up -d --build
```

There is no shared desktop Builds folder by default; the gateway auto-creates
`./web/builds` and generates a `Sample` build on first run so the Build Manager
isn't empty.

## systemd (auto-start on boot)

```bash
sudo cp web/deploy/pob2-web.service /etc/systemd/system/
# edit WorkingDirectory to your checkout path
sudo systemctl daemon-reload
sudo systemctl enable --now pob2-web
```

## Backups

Builds are the only stateful data (plain XML). Tarball them:

```bash
web/deploy/backup.sh                      # -> ./pob-backups/pob-builds-<stamp>.tar.gz
# cron (daily 03:00):
0 3 * * * /opt/pathofbuilding-poe2-koraki/web/deploy/backup.sh
```

Restore by extracting a tarball back over `POB_BUILD_DIR_HOST`.

## Logging & health

- The gateway logs to stdout/stderr → `docker compose -f web/docker-compose.yml logs -f web`
  (or journald under systemd). It reports engine up/down/restart, autosave, and
  per-command errors (engine errors are surfaced to clients, never swallowed).
- Health check: `GET /healthz` → `200 ok`.
- The engine kernel is a separate process; if it crashes the gateway auto-restarts
  it with backoff and clients reconcile on the next command (no data loss — the
  build is autosaved and rehydrated).

## Security

v1 is **single-user on a trusted LAN with no auth**. Before exposing beyond the
LAN, put the gateway behind a reverse proxy (e.g. Caddy/nginx) with TLS + auth.
Do not add multi-tenant auth to v1.

## Updating

```bash
git pull
web/run.sh                 # rebuilds the image and restarts
```

Upstream engine fixes arrive via the weekly `upstream-sync` PR; `src/` is never
modified by the web app, so merges stay clean.
