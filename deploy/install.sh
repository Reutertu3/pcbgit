#!/usr/bin/env bash
# One-time setup on the server, run as root from the repository:
#   sudo deploy/install.sh
# Creates the shared control folder and the systemd units that let the admin
# panel request updates. Safe to run again.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0" >&2; exit 1; }
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_DIR=/var/lib/pcbgit-control

# The .env checks catch the two mistakes that break a public deploy.
[[ -f "$REPO_DIR/.env" ]] || { echo "Missing $REPO_DIR/.env - copy .env.example and edit it." >&2; exit 1; }
grep -q '^PCBGIT_DOMAIN=.\+' "$REPO_DIR/.env" && ! grep -q '^PCBGIT_DOMAIN=pcb.example.com$' "$REPO_DIR/.env" \
	|| { echo "Set PCBGIT_DOMAIN in .env to your real domain." >&2; exit 1; }
grep -Eq '^PCBGIT_DOMAIN=[A-Za-z0-9.-]+$' "$REPO_DIR/.env" \
	|| { echo "PCBGIT_DOMAIN must be the bare domain, e.g. PCBGIT_DOMAIN=pcb.example.com (no https://, no slash)." >&2; exit 1; }
! grep -q '^PCBGIT_ADMIN_PASSWORD=change-me-now$' "$REPO_DIR/.env" \
	|| { echo "Change PCBGIT_ADMIN_PASSWORD in .env before going public." >&2; exit 1; }

# Make plain `docker compose ...` on this server always include the production
# file. Without it, a bare `docker compose up -d` recreates pcbgit with the local
# settings (ORIGIN=localhost) behind the still-running Caddy, and every login and
# form post is rejected while pages keep loading.
if ! grep -q '^COMPOSE_FILE=' "$REPO_DIR/.env"; then
	printf '\n# Added by deploy/install.sh: plain `docker compose` uses the production setup.\nCOMPOSE_FILE=docker-compose.yml:deploy/docker-compose.prod.yml\n' >>"$REPO_DIR/.env"
	echo "Added COMPOSE_FILE to .env"
fi

# The container runs as uid 10001 and only needs to drop a request file here.
mkdir -p "$CONTROL_DIR"
chown 10001:10001 "$CONTROL_DIR"
chmod 755 "$CONTROL_DIR"

cat >/etc/systemd/system/pcbgit-update.service <<UNIT
[Unit]
Description=Update pcbgit from GitHub and rebuild
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$REPO_DIR/deploy/update.sh
Environment=PCBGIT_CONTROL_DIR=$CONTROL_DIR
UNIT

cat >/etc/systemd/system/pcbgit-update.path <<UNIT
[Unit]
Description=Watch for pcbgit update requests from the admin panel

[Path]
PathExists=$CONTROL_DIR/update-request
Unit=pcbgit-update.service

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now pcbgit-update.path
echo "Installed. First start:  sudo $REPO_DIR/deploy/update.sh   (FORCE=1 for a first build)"
