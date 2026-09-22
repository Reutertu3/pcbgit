#!/usr/bin/env bash
# One-time setup on the server, run as root from the repository:
#   sudo deploy/install.sh
# Creates the shared control folder and the systemd units that let the admin
# panel request updates and see what is available. Safe to run again;
# deploy/update.sh re-runs it with --units-only after each update.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0" >&2; exit 1; }
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_DIR=/var/lib/pcbgit-control
UNITS_ONLY=0
[[ "${1:-}" == --units-only ]] && UNITS_ONLY=1

if [[ $UNITS_ONLY == 0 ]]; then
	# The .env checks catch the mistakes that break a public deploy.
	[[ -f "$REPO_DIR/.env" ]] || { echo "Missing $REPO_DIR/.env - copy .env.example and edit it." >&2; exit 1; }
	grep -q '^PCBGIT_DOMAIN=.\+' "$REPO_DIR/.env" && ! grep -q '^PCBGIT_DOMAIN=pcb.example.com$' "$REPO_DIR/.env" \
		|| { echo "Set PCBGIT_DOMAIN in .env to your real domain." >&2; exit 1; }
	grep -Eq '^PCBGIT_DOMAIN=[A-Za-z0-9.-]+$' "$REPO_DIR/.env" \
		|| { echo "PCBGIT_DOMAIN must be the bare domain, e.g. PCBGIT_DOMAIN=pcb.example.com (no https://, no slash)." >&2; exit 1; }
	! grep -q '^PCBGIT_ADMIN_PASSWORD=change-me-now$' "$REPO_DIR/.env" \
		|| { echo "Change PCBGIT_ADMIN_PASSWORD in .env before going public." >&2; exit 1; }
fi

# Make plain `docker compose ...` on this server always include the production
# file. Without it, a bare `docker compose up -d` recreates pcbgit with the local
# settings (ORIGIN=localhost) behind the still-running Caddy, and every login and
# form post is rejected while pages keep loading.
if [[ -f "$REPO_DIR/.env" ]] && ! grep -q '^COMPOSE_FILE=' "$REPO_DIR/.env"; then
	printf '\n# Added by deploy/install.sh: plain `docker compose` uses the production setup.\nCOMPOSE_FILE=docker-compose.yml:deploy/docker-compose.prod.yml\n' >>"$REPO_DIR/.env"
	echo "Added COMPOSE_FILE to .env"
fi

# The container runs as uid 10001 and only needs to drop request files here.
mkdir -p "$CONTROL_DIR"
chown 10001:10001 "$CONTROL_DIR"
chmod 755 "$CONTROL_DIR"

unit() { # name, content — only rewritten when it changed
	local file="/etc/systemd/system/$1"
	if [[ ! -f "$file" ]] || [[ "$(cat "$file")" != "$2" ]]; then
		printf '%s\n' "$2" >"$file"
		echo "Wrote $file"
	fi
}

unit pcbgit-update.service "[Unit]
Description=Update pcbgit from GitHub and rebuild
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$REPO_DIR/deploy/update.sh
Environment=PCBGIT_CONTROL_DIR=$CONTROL_DIR"

unit pcbgit-update.path "[Unit]
Description=Watch for pcbgit update requests from the admin panel

[Path]
PathExists=$CONTROL_DIR/update-request
Unit=pcbgit-update.service

[Install]
WantedBy=multi-user.target"

unit pcbgit-check.service "[Unit]
Description=Check GitHub for pcbgit updates
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$REPO_DIR/deploy/update.sh --check
Environment=PCBGIT_CONTROL_DIR=$CONTROL_DIR"

unit pcbgit-check.timer "[Unit]
Description=Check GitHub for pcbgit updates hourly

[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
RandomizedDelaySec=5min

[Install]
WantedBy=timers.target"

unit pcbgit-check.path "[Unit]
Description=Watch for update checks requested from the admin panel

[Path]
PathExists=$CONTROL_DIR/check-request
Unit=pcbgit-check.service

[Install]
WantedBy=multi-user.target"

systemctl daemon-reload
systemctl enable --now pcbgit-update.path pcbgit-check.path pcbgit-check.timer >/dev/null
# First availability check, so the panel has something to show straight away.
systemctl start --no-block pcbgit-check.service
[[ $UNITS_ONLY == 1 ]] || echo "Installed. First start:  sudo $REPO_DIR/deploy/update.sh"
