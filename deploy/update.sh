#!/usr/bin/env bash
# Pulls the latest pcbgit from GitHub and rebuilds the running instance.
#
# Run by the pcbgit-update systemd unit when the admin panel asks for an update,
# or by hand:  sudo deploy/update.sh        (FORCE=1 rebuilds even if unchanged)
#
# Only fast-forward pulls are done: local edits on the server are never merged
# or overwritten; the update fails instead and says why.
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_DIR="${PCBGIT_CONTROL_DIR:-/var/lib/pcbgit-control}"
COMPOSE_FILES="${PCBGIT_COMPOSE_FILES:-docker-compose.yml:deploy/docker-compose.prod.yml}"
STATUS="$CONTROL_DIR/update-status.json"
LOG="$CONTROL_DIR/update.log"
REQUEST="$CONTROL_DIR/update-request"

# A scheme or slash in the domain makes ORIGIN wrong, and every form post fails
# the CSRF check. Catch it here rather than as "login does nothing".
if [[ "$COMPOSE_FILES" == *prod* ]] && ! grep -Eq '^PCBGIT_DOMAIN=[A-Za-z0-9.-]+$' "$REPO_DIR/.env"; then
	echo "PCBGIT_DOMAIN in .env must be the bare domain, e.g. pcb.example.com (no https://, no slash)." >&2
	exit 1
fi

mkdir -p "$CONTROL_DIR"
exec 9>"$CONTROL_DIR/.lock"
if ! flock -n 9; then
	echo "An update is already running." >&2
	exit 0
fi

# A request from the panel may ask for a rebuild even without new commits.
if [[ -f "$REQUEST" ]] && grep -q '"force": *true' "$REQUEST"; then FORCE=1; fi
rm -f "$REQUEST"

git_() { git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" "$@"; }
compose() {
	local args=()
	IFS=':' read -ra files <<<"$COMPOSE_FILES"
	for file in "${files[@]}"; do args+=(-f "$REPO_DIR/$file"); done
	docker compose --project-directory "$REPO_DIR" "${args[@]}" "$@"
}

started=$(date +%s)
from=$(git_ rev-parse --short HEAD)
to=$from
write_status() { # state, message
	local finished=null
	[[ "$1" != running ]] && finished=$(date +%s)
	printf '{"state":"%s","message":"%s","started":%s,"finished":%s,"from":"%s","to":"%s"}\n' \
		"$1" "$2" "$started" "$finished" "$from" "$to" >"$STATUS.tmp"
	chmod 644 "$STATUS.tmp"
	mv "$STATUS.tmp" "$STATUS"
}
phase="pulling from GitHub"
trap 'write_status failed "Failed while $phase - see the log"' ERR

write_status running "Pulling from GitHub"
: >"$LOG"
chmod 644 "$LOG"
{
	echo "== $(date -Is) update started (at $from)"
	branch=$(git_ rev-parse --abbrev-ref HEAD)
	git_ fetch --prune origin
	git_ merge --ff-only "origin/$branch"
} >>"$LOG" 2>&1
to=$(git_ rev-parse --short HEAD)

# Nothing running yet (first deploy, or stopped): build regardless.
[[ -z "$(compose ps -q pcbgit 2>/dev/null)" ]] && FORCE=1

if [[ "$from" == "$to" && "${FORCE:-0}" != 1 ]]; then
	echo "== already up to date" >>"$LOG"
	write_status success "Already up to date"
	exit 0
fi

phase="building $to"
write_status running "Building $to"
{
	echo "== building $to"
	export PCBGIT_GIT_SHA="$to"
	compose up -d --build --remove-orphans
	docker image prune -f
	echo "== $(date -Is) done"
} >>"$LOG" 2>&1
if [[ "$from" == "$to" ]]; then write_status success "Rebuilt $to"; else write_status success "Updated $from → $to"; fi
