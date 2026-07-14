#!/usr/bin/env bash
# Deploy the unique-visitor worker (Debian/Ubuntu + systemd). Run as root.
# The worker lives inside the dashboard repo at `face-matching/`; on the server
# that is /root/dashboard-ai-box/face-matching. Auto-detects MONGODB_URI from the
# running dashboard so there is nothing to fill in. Idempotent: safe to re-run.
set -euo pipefail

APP_DIR=/root/dashboard-ai-box/face-matching
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> OS check"
. /etc/os-release 2>/dev/null || true
echo "    ${PRETTY_NAME:-unknown OS}"

echo "==> Prerequisites (python venv + build tools + OpenCV runtime libs)"
apt-get update -y
# libgl1 + libglib2.0-0: insightface pulls opencv-python (non-headless) which needs
# libGL.so.1 at import time — missing on headless servers.
apt-get install -y python3-venv python3-dev build-essential libgl1 libglib2.0-0

if [ "$SRC_DIR" != "$APP_DIR" ]; then
  echo "==> Sync code to $APP_DIR"
  mkdir -p "$APP_DIR/deploy"
  for f in aibox_payload.py dedup_engine.py embedder.py worker.py requirements.txt; do
    cp "$SRC_DIR/$f" "$APP_DIR/"
  done
  cp "$SRC_DIR/deploy/unique-visitor-worker.service" "$APP_DIR/deploy/"
  cp "$SRC_DIR/deploy/worker.env.example" "$APP_DIR/deploy/"
fi

echo "==> Python venv + deps (first service start downloads the ArcFace model ~280MB)"
[ -d "$APP_DIR/.venv" ] || python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --upgrade pip
"$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements.txt"

if [ ! -f "$APP_DIR/worker.env" ]; then
  echo "==> Creating worker.env — auto-detecting MONGODB_URI from the dashboard process"
  uri=""
  for pid in $(pgrep -f "node|next|npm" 2>/dev/null || true); do
    v=$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep '^MONGODB_URI=' | cut -d= -f2- || true)
    [ -n "$v" ] && { uri="$v"; break; }
  done
  {
    [ -n "$uri" ] && printf 'MONGODB_URI=%s\n' "$uri"
    grep -v '^MONGODB_URI=' "$APP_DIR/deploy/worker.env.example"
  } > "$APP_DIR/worker.env"
  chmod 600 "$APP_DIR/worker.env"
  [ -n "$uri" ] && echo "    auto-detected MONGODB_URI" || echo "    !! could not auto-detect — edit $APP_DIR/worker.env"
fi

if ! grep -q '^MONGODB_URI=.\+' "$APP_DIR/worker.env"; then
  echo "!! MONGODB_URI missing in $APP_DIR/worker.env — set it, then re-run this script."
  exit 1
fi

echo "==> Install + start systemd service"
cp "$APP_DIR/deploy/unique-visitor-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now unique-visitor-worker
sleep 3
echo "==> Status:"
systemctl status --no-pager unique-visitor-worker || true
echo
echo "==> Recent logs:"
journalctl -u unique-visitor-worker -n 30 --no-pager || true
