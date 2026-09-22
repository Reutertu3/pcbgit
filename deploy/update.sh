#!/usr/bin/env bash
# Pulls the latest pcbgit from GitHub and rebuilds the running instance.
#
#   sudo deploy/update.sh            update (FORCE=1 rebuilds even if unchanged)
#   sudo deploy/update.sh --check    only fetch and record what an update would bring
#
# Run by systemd: pcbgit-update when the admin panel asks for an update,
# pcbgit-check hourly and when the panel asks for a check.
#
# Only fast-forward pulls are done: local edits on the server are never merged
# or overwritten; the update fails instead and says why.
set -Eeuo pipefail

MODE=update
[[ "${1:-}" == --check ]] && MODE=check

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_DIR="${PCBGIT_CONTROL_DIR:-/var/lib/pcbgit-control}"
COMPOSE_FILES="${PCBGIT_COMPOSE_FILES:-docker-compose.yml:deploy/docker-compose.prod.yml}"
STATUS="$CONTROL_DIR/update-status.json"
LOG="$CONTROL_DIR/update.log"
REQUEST="$CONTROL_DIR/update-request"

git_() { git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" "$@"; }
compose() {
	local args=()
	IFS=':' read -ra files <<<"$COMPOSE_FILES"
	for file in "${files[@]}"; do args+=(-f "$REPO_DIR/$file"); done
	docker compose --project-directory "$REPO_DIR" "${args[@]}" "$@"
}
# Replace atomically so the app never reads a half-written file.
publish() { chmod 644 "$1.tmp" && mv "$1.tmp" "$1"; }

# Records what an update would bring: the commits on GitHub that the server does
# not have yet (newest first, with their messages as the changelog), and whether
# the server copy has commits of its own, which would block a fast-forward.
write_availability() {
	local branch upstream behind ahead remote
	branch=$(git_ rev-parse --abbrev-ref HEAD)
	upstream="origin/$branch"
	behind=$(git_ rev-list --count "HEAD..$upstream")
	ahead=$(git_ rev-list --count "$upstream..HEAD")
	# Strip any credentials embedded in an https remote URL.
	remote=$(git_ remote get-url origin | sed -E 's#^([a-z+]+://)[^/@]*@#\1#')
	git_ log --max-count=50 --format='%H%x1f%h%x1f%an%x1f%ct%x1f%s' "HEAD..$upstream" \
		>"$CONTROL_DIR/update-commits.txt.tmp"
	publish "$CONTROL_DIR/update-commits.txt"
	printf '{"checked":%s,"ok":true,"branch":"%s","current":"%s","latest":"%s","behind":%s,"ahead":%s,"remote":"%s"}\n' \
		"$(date +%s)" "$branch" "$(git_ rev-parse --short HEAD)" "$(git_ rev-parse --short "$upstream")" \
		"$behind" "$ahead" "$remote" >"$CONTROL_DIR/update-available.json.tmp"
	publish "$CONTROL_DIR/update-available.json"
}

mkdir -p "$CONTROL_DIR"
exec 9>"$CONTROL_DIR/.lock"
if ! flock -n 9; then
	# An update in progress refreshes the availability itself when it finishes.
	echo "An update or check is already running." >&2
	exit 0
fi

if [[ "$MODE" == check ]]; then
	rm -f "$CONTROL_DIR/check-request"
	if git_ fetch --prune origin >"$CONTROL_DIR/check.log.tmp" 2>&1; then
		publish "$CONTROL_DIR/check.log"
		write_availability
	else
		publish "$CONTROL_DIR/check.log"
		printf '{"checked":%s,"ok":false}\n' "$(date +%s)" >"$CONTROL_DIR/update-available.json.tmp"
		publish "$CONTROL_DIR/update-available.json"
		exit 1
	fi
	exit 0
fi

# A scheme or slash in the domain makes ORIGIN wrong, and every form post fails
# the CSRF check. Catch it here rather than as "login does nothing".
if [[ "$COMPOSE_FILES" == *prod* ]] && ! grep -Eq '^PCBGIT_DOMAIN=[A-Za-z0-9.-]+$' "$REPO_DIR/.env"; then
	echo "PCBGIT_DOMAIN in .env must be the bare domain, e.g. pcb.example.com (no https://, no slash)." >&2
	exit 1
fi

# A request from the panel may ask for a rebuild even without new commits.
if [[ -f "$REQUEST" ]] && grep -q '"force": *true' "$REQUEST"; then FORCE=1; fi
rm -f "$REQUEST"

started=$(date +%s)
from=$(git_ rev-parse --short HEAD)
to=$from
write_status() { # state, message
	local finished=null
	[[ "$1" != running ]] && finished=$(date +%s)
	printf '{"state":"%s","message":"%s","started":%s,"finished":%s,"from":"%s","to":"%s"}\n' \
		"$1" "$2" "$started" "$finished" "$from" "$to" >"$STATUS.tmp"
	publish "$STATUS"
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

# Keep the systemd units in step with the repository (new timers, fixed paths).
# install.sh is idempotent; a failure here must not block the update itself.
if [[ $EUID -eq 0 && -x "$REPO_DIR/deploy/install.sh" ]]; then
	"$REPO_DIR/deploy/install.sh" --units-only >>"$LOG" 2>&1 || echo "== unit sync failed (see above)" >>"$LOG"
fi

# Nothing running yet (first deploy, or stopped): build regardless.
[[ -z "$(compose ps -q pcbgit 2>/dev/null)" ]] && FORCE=1

if [[ "$from" == "$to" && "${FORCE:-0}" != 1 ]]; then
	echo "== already up to date" >>"$LOG"
	write_availability
	write_status success "Already up to date"
	exit 0
fi

phase="building $to"
write_status running "Building $to"
{
	echo "== building $to"
	export PCBGIT_GIT_SHA="$to"
	# A release tag on exactly this commit is shown in the footer next to the commit.
	export PCBGIT_GIT_TAG="$(git_ describe --tags --exact-match "$to" 2>/dev/null || true)"
	compose up -d --build --remove-orphans
	docker image prune -f
	echo "== $(date -Is) done"
} >>"$LOG" 2>&1
write_availability
if [[ "$from" == "$to" ]]; then write_status success "Rebuilt $to"; else write_status success "Updated $from → $to"; fi
