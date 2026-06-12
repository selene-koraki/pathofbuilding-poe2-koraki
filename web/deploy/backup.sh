#!/usr/bin/env bash
# Back up the shared Builds folder (the only stateful data). Builds are plain XML
# — the same files the desktop app uses — so a tarball is a complete backup.
#
#   web/deploy/backup.sh [BUILD_DIR] [DEST_DIR]
# Defaults: BUILD_DIR=web/builds, DEST_DIR=./pob-backups
# Cron example (daily 03:00):
#   0 3 * * * /opt/pathofbuilding-poe2-koraki/web/deploy/backup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${1:-${POB_BUILD_DIR:-$SCRIPT_DIR/../builds}}"
DEST_DIR="${2:-${POB_BACKUP_DIR:-$SCRIPT_DIR/../../pob-backups}}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST_DIR"
TARBALL="$DEST_DIR/pob-builds-$STAMP.tar.gz"
tar -czf "$TARBALL" -C "$(dirname "$BUILD_DIR")" "$(basename "$BUILD_DIR")"
echo "[backup] wrote $TARBALL"

# Keep the 30 most recent backups.
ls -1t "$DEST_DIR"/pob-builds-*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "[backup] pruned to 30 most recent"
