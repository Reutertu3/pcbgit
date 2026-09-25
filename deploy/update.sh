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
# How long to wait for GitHub Actions to publish the image of a new commit.
IMAGE_WAIT=$((20 * 60))

git_() { git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" "$@"; }
compose() {
	local args=()
	IFS=':' read -ra files <<<"$COMPOSE_FILES"
	for file in "${files[@]}"; do args+=(-f "$REPO_DIR/$file"); done
	docker compose --project-directory "$REPO_DIR" "${args[@]}" "$@"
}
# Replace atomically so the app never reads a half-written file.
publish() { chmod 644 "$1.tmp" && mv "$1.tmp" "$1"; }

# Caddy reads the Caddyfile through a bind mount, which keeps showing the old file
# after git replaces it, and compose only recreates services whose definition
# changed. Restart Caddy whenever what it sees differs from the repository.
sync_caddy() {
	[[ -n "$(compose ps -q caddy 2>/dev/null)" ]] || return 0
	if ! cmp -s "$REPO_DIR/deploy/Caddyfile" <(compose exec -T caddy cat /etc/caddy/Caddyfile </dev/null 2>/dev/null); then
		echo "== Caddyfile changed: restarting caddy"
		local previous=${phase:-}
		phase="restarting caddy"
		compose restart caddy
		phase=$previous
	fi
}

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
} >>"$LOG" 2>&1
# The exact commit to update to, so a push during the wait below changes nothing.
target=$(git_ rev-parse "origin/$branch")

# Nothing running yet (first deploy, or stopped): build regardless.
[[ -z "$(compose ps -q pcbgit 2>/dev/null)" ]] && FORCE=1

if [[ "$(git_ rev-parse HEAD)" == "$target" && "${FORCE:-0}" != 1 ]]; then
	echo "== already up to date" >>"$LOG"
	# Still catches a Caddyfile an earlier update left unapplied.
	sync_caddy >>"$LOG" 2>&1
	write_availability
	write_status success "Already up to date"
	exit 0
fi

# Where the image comes from: GitHub Actions builds one for every commit on master
# that passes its tests (.github/workflows/ci.yml), so this small server does not
# have to. PCBGIT_UPDATE_IMAGE in .env: unset follows a GitHub remote
# (ghcr.io/<owner>/<repo>), "build" always builds here.
image_repo() {
	local setting remote
	setting=$(sed -n 's/^PCBGIT_UPDATE_IMAGE=//p' "$REPO_DIR/.env" 2>/dev/null | tail -1 | tr -d "\"'")
	if [[ -n "$setting" ]]; then
		[[ "$setting" == build ]] || echo "$setting"
		return
	fi
	remote=$(git_ remote get-url origin)
	if [[ "$remote" =~ github\.com[:/]([^/]+)/([^/]+)$ ]]; then
		local repo=${BASH_REMATCH[2]%.git}
		echo "ghcr.io/${BASH_REMATCH[1],,}/${repo,,}"
	fi
}
pull_ref=""
repo=$(image_repo)
if [[ -n "$repo" ]]; then
	if [[ -n "$(git_ status --porcelain --untracked-files=no)" ]]; then
		# The image holds the commit as on GitHub, without edits made here.
		echo "== local changes in $REPO_DIR: building here instead of pulling $repo" >>"$LOG"
	else
		# The image appears a few minutes after the push (tests, then the build). Only
		# "not found" is worth waiting for; a private package or no network is not.
		ref="$repo:sha-$target"
		waited=0
		while ! answer=$(docker manifest inspect "$ref" 2>&1 >/dev/null); do
			if ! grep -qi 'manifest unknown\|not found' <<<"$answer"; then
				echo "== cannot read $ref ($answer): building here" >>"$LOG"
				ref=""
				break
			fi
			if ((waited >= IMAGE_WAIT)); then
				echo "== no image $ref after $((IMAGE_WAIT / 60)) min: building here" >>"$LOG"
				ref=""
				break
			fi
			if ((waited == 0)); then
				echo "== waiting for $ref to be built on GitHub" >>"$LOG"
				write_status running "Waiting for the image of ${target:0:7} to be built on GitHub"
			fi
			sleep 30
			waited=$((waited + 30))
		done
		pull_ref=$ref
	fi
fi

phase="pulling from GitHub"
git_ merge --ff-only "$target" >>"$LOG" 2>&1
to=$(git_ rev-parse --short HEAD)

# Keep the systemd units in step with the repository (new timers, fixed paths).
# install.sh is idempotent; a failure here must not block the update itself.
if [[ $EUID -eq 0 && -x "$REPO_DIR/deploy/install.sh" ]]; then
	"$REPO_DIR/deploy/install.sh" --units-only >>"$LOG" 2>&1 || echo "== unit sync failed (see above)" >>"$LOG"
fi

# A release tag on exactly this commit is shown in the footer next to the commit.
export PCBGIT_GIT_TAG="$(git_ describe --tags --exact-match HEAD 2>/dev/null || true)"
if [[ -n "$pull_ref" ]]; then
	how="pulled image"
	phase="pulling $pull_ref"
	write_status running "Pulling the image of $to"
	{
		echo "== pulling $pull_ref"
		docker pull "$pull_ref"
		# Compose runs pcbgit:latest; retagging it recreates both containers.
		docker tag "$pull_ref" pcbgit:latest
		docker rmi "$pull_ref"
		compose up -d --remove-orphans
	} >>"$LOG" 2>&1
else
	how="built here"
	phase="building $to"
	write_status running "Building $to"
	{
		echo "== building $to"
		export PCBGIT_GIT_SHA="$to"
		compose up -d --build --remove-orphans
	} >>"$LOG" 2>&1
fi
{
	sync_caddy
	docker image prune -f
	echo "== $(date -Is) done ($how)"
} >>"$LOG" 2>&1
write_availability
if [[ "$from" == "$to" ]]; then write_status success "Rebuilt $to ($how)"; else write_status success "Updated $from → $to ($how)"; fi
