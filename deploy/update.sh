#!/usr/bin/env bash
# Updates pcbgit from GitHub and restarts it. Two ways:
#
#   sudo deploy/update.sh             build the newest master commit here (the
#                                     panel's button; FORCE=1 rebuilds even if unchanged)
#   sudo deploy/update.sh --release   install the newest release (tag vX.Y.Z), as
#                                     the image GitHub Actions built for it
#   sudo deploy/update.sh --check     only fetch and record what either would bring
#
# Run by systemd: pcbgit-update when the admin panel asks for an update,
# pcbgit-check hourly and when the panel asks for a check. With automatic updates
# on (the panel's switch), a check that finds a new release requests it: automatic
# updates only ever install releases.
#
# Only fast-forward pulls are done: local edits on the server are never merged
# or overwritten; the update fails instead and says why.
set -Eeuo pipefail

MODE=update
RELEASE=""
case "${1:-}" in
	--check) MODE=check ;;
	--release) RELEASE=latest ;;
esac

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_DIR="${PCBGIT_CONTROL_DIR:-/var/lib/pcbgit-control}"
COMPOSE_FILES="${PCBGIT_COMPOSE_FILES:-docker-compose.yml:deploy/docker-compose.prod.yml}"
STATUS="$CONTROL_DIR/update-status.json"
LOG="$CONTROL_DIR/update.log"
REQUEST="$CONTROL_DIR/update-request"
# Written by the admin panel's switch; its presence turns automatic updates on.
AUTO="$CONTROL_DIR/auto-update"
# How long to wait for GitHub Actions to publish the image of a new release.
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

# owner/repo of a GitHub remote; nothing for other hosts.
github_repo() {
	local remote
	remote=$(git_ remote get-url origin)
	[[ "$remote" =~ github\.com[:/]([^/]+)/([^/]+)$ ]] && echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
	return 0
}

# Where a release's image comes from: GitHub Actions builds one for every published
# release (.github/workflows/ci.yml), so this small server does not have to.
# PCBGIT_UPDATE_IMAGE in .env: unset follows a GitHub remote (ghcr.io/<owner>/<repo>),
# "build" always builds here. Nothing means build here.
image_repo() {
	local setting repo
	setting=$(sed -n 's/^PCBGIT_UPDATE_IMAGE=//p' "$REPO_DIR/.env" 2>/dev/null | tail -1 | tr -d "\"'")
	if [[ -n "$setting" ]]; then
		[[ "$setting" == build ]] || echo "$setting"
		return 0
	fi
	repo=$(github_repo)
	[[ -n "$repo" ]] && echo "ghcr.io/${repo,,}"
	return 0
}

# State of the CI run for a commit on GitHub: queued, in_progress, success,
# failure, …; nothing when there is none or GitHub cannot be asked.
ci_state() {
	local repo answer status
	repo=$(github_repo)
	[[ -n "$repo" ]] || return 0
	answer=$(curl -fsS --max-time 10 "https://api.github.com/repos/$repo/actions/workflows/ci.yml/runs?head_sha=$1&per_page=1" 2>/dev/null) || return 0
	# No run for the commit: no "status" field, and nothing is printed.
	status=$(grep -m1 -o '"status": *"[a-z_]*"' <<<"$answer" | sed 's/.*"\([a-z_]*\)"$/\1/' || true)
	if [[ "$status" == completed ]]; then
		grep -m1 -o '"conclusion": *"[a-z_]*"' <<<"$answer" | sed 's/.*"\([a-z_]*\)"$/\1/' || true
	else
		echo "$status"
	fi
}

# Whether the image of a commit can be pulled: ready, building (CI still running),
# failed (CI failed, so no image will come), missing, unreadable (a private package
# or no network), local (edits on this server, which the image does not have), or
# off (built here).
image_state() { # repo, full commit
	local answer
	[[ -n "$1" ]] || { echo off; return; }
	if [[ -n "$(git_ status --porcelain --untracked-files=no)" ]]; then echo local; return; fi
	if answer=$(docker manifest inspect "$1:sha-$2" 2>&1 >/dev/null); then echo ready; return; fi
	if ! grep -qi 'manifest unknown\|not found' <<<"$answer"; then echo unreadable; return; fi
	case "$(ci_state "$2")" in
		queued | in_progress | waiting | requested | pending) echo building ;;
		failure | cancelled | timed_out | startup_failure) echo failed ;;
		*) echo missing ;;
	esac
}

# The newest release: tags vX.Y.Z by version number, pre-releases (v1.2.0-rc1) left out.
latest_release() {
	git_ tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true
}

# Whether a release is ahead of what runs: its commit follows HEAD. A release the
# server has already passed (a manual build of master) or that sits on another
# line is never installed, so an update can never go backwards.
release_is_new() { # full commit of the release
	[[ "$1" != "$(git_ rev-parse HEAD)" ]] && git_ merge-base --is-ancestor HEAD "$1"
}

# Records what an update would bring: the master commits the server does not have
# yet (newest first, with their messages as the changelog; the panel's button builds
# them here), whether the server copy has commits of its own, which would block a
# fast-forward, and the newest release with whether its image is ready (automatic
# updates install that).
write_availability() {
	local branch upstream behind ahead remote repo release release_commit="" release_new=false image=""
	branch=$(git_ rev-parse --abbrev-ref HEAD)
	upstream="origin/$branch"
	behind=$(git_ rev-list --count "HEAD..$upstream")
	ahead=$(git_ rev-list --count "$upstream..HEAD")
	# Strip any credentials embedded in an https remote URL.
	remote=$(git_ remote get-url origin | sed -E 's#^([a-z+]+://)[^/@]*@#\1#')
	repo=$(image_repo)
	release=$(latest_release)
	if [[ -n "$release" ]]; then
		release_commit=$(git_ rev-parse "refs/tags/$release^{commit}")
		if release_is_new "$release_commit"; then
			release_new=true
			image=$(image_state "$repo" "$release_commit")
		fi
	fi
	git_ log --max-count=50 --format='%H%x1f%h%x1f%an%x1f%ct%x1f%s' "HEAD..$upstream" \
		>"$CONTROL_DIR/update-commits.txt.tmp"
	publish "$CONTROL_DIR/update-commits.txt"
	printf '{"checked":%s,"ok":true,"branch":"%s","current":"%s","latest":"%s","behind":%s,"ahead":%s,"remote":"%s","source":"%s","release":"%s","release_commit":"%s","release_new":%s,"image":"%s"}\n' \
		"$(date +%s)" "$branch" "$(git_ rev-parse --short HEAD)" "$(git_ rev-parse --short "$upstream")" \
		"$behind" "$ahead" "$remote" "$repo" "$release" "${release_commit:0:7}" "$release_new" "$image" \
		>"$CONTROL_DIR/update-available.json.tmp"
	publish "$CONTROL_DIR/update-available.json"
}

# With automatic updates on, a check that finds a new release requests it. Only when
# it can go ahead now: the release follows what runs, its image is ready (or this
# server builds), and the last automatic attempt at it did not fail (it waits for a
# newer one instead).
auto_update() {
	[[ -f "$AUTO" ]] || return 0
	local available release commit
	available=$(cat "$CONTROL_DIR/update-available.json")
	grep -q '"release_new":true,' <<<"$available" || return 0
	grep -Eq '"image":"(ready|off)"' <<<"$available" || return 0
	release=$(sed -n 's/.*"release":"\([^"]*\)".*/\1/p' <<<"$available")
	commit=$(sed -n 's/.*"release_commit":"\([0-9a-f]*\)".*/\1/p' <<<"$available")
	if [[ -f "$STATUS" ]] && grep -q '"state":"failed"' "$STATUS" && grep -q "\"target\":\"$commit\"" "$STATUS"; then
		return 0
	fi
	printf '{"by":"automatic","auto":true,"release":"%s","force":false,"requested_at":"%s"}\n' "$release" "$(date -Is)" >"$REQUEST.tmp"
	publish "$REQUEST"
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
	if git_ fetch --prune --prune-tags --tags origin >"$CONTROL_DIR/check.log.tmp" 2>&1; then
		publish "$CONTROL_DIR/check.log"
		write_availability
		# The update this may request waits for the lock; let it go first.
		exec 9>&-
		auto_update
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

# A request from the panel may ask for a rebuild even without new commits; one from
# automatic updates names the release to install.
trigger=manual
if [[ -f "$REQUEST" ]]; then
	grep -q '"force": *true' "$REQUEST" && FORCE=1
	grep -q '"auto": *true' "$REQUEST" && trigger=auto
	requested=$(sed -n 's/.*"release": *"\([^"]*\)".*/\1/p' "$REQUEST")
	[[ -n "$requested" ]] && RELEASE=$requested
fi
rm -f "$REQUEST"

started=$(date +%s)
from=$(git_ rev-parse --short HEAD)
to=$from
target=""
how=""
# The panel shows `step` as a list (fetch, wait, pull or build, restart, done)
# and `message` as the detail.
write_status() { # state, step, message
	local finished=null
	[[ "$1" != running ]] && finished=$(date +%s)
	printf '{"state":"%s","step":"%s","how":"%s","trigger":"%s","message":"%s","started":%s,"finished":%s,"from":"%s","to":"%s","target":"%s","release":"%s"}\n' \
		"$1" "$2" "$how" "$trigger" "$3" "$started" "$finished" "$from" "$to" "${target:0:7}" "$RELEASE" >"$STATUS.tmp"
	publish "$STATUS"
}
# A download or build that fails leaves the old version running: move the checkout
# back to it, or the next check would call the server up to date. --keep keeps
# local edits.
from_commit=$(git_ rev-parse HEAD)
on_error() {
	if [[ "$step" == pull || "$step" == build ]] && [[ "$(git_ rev-parse HEAD)" != "$from_commit" ]]; then
		git_ reset --keep "$from_commit" >>"$LOG" 2>&1 && to=$from
	fi
	write_status failed "$step" "Failed while $phase - see the log"
}
step=fetch
phase="pulling from GitHub"
trap on_error ERR

write_status running fetch "Fetching from GitHub"
: >"$LOG"
chmod 644 "$LOG"
{
	echo "== $(date -Is) update started (at $from)"
	branch=$(git_ rev-parse --abbrev-ref HEAD)
	git_ fetch --prune --prune-tags --tags origin
} >>"$LOG" 2>&1
# The exact commit to update to, so a push during the wait below changes nothing:
# a release's commit, or the newest on master for a build here.
if [[ -n "$RELEASE" ]]; then
	[[ "$RELEASE" == latest ]] && RELEASE=$(latest_release)
	if [[ -z "$RELEASE" ]] || ! target=$(git_ rev-parse --verify --quiet "refs/tags/$RELEASE^{commit}"); then
		echo "== no release to install" >>"$LOG"
		write_status success done "No release found"
		exit 0
	fi
	if ! release_is_new "$target"; then
		if [[ -n "$(compose ps -q pcbgit 2>/dev/null)" ]]; then
			# Already there, or past it with a build of master: never go backwards.
			echo "== $RELEASE is not newer than what runs" >>"$LOG"
			write_availability
			write_status success done "Already at or past $RELEASE"
			exit 0
		fi
		# Nothing running (first deploy) on a checkout at or past the release: start
		# what is checked out, built here, rather than nothing.
		echo "== nothing running and $RELEASE is not newer: building the checkout" >>"$LOG"
		RELEASE=""
		target=$(git_ rev-parse HEAD)
	fi
else
	target=$(git_ rev-parse "origin/$branch")
fi

# Nothing running yet (first deploy, or stopped): build regardless.
[[ -z "$(compose ps -q pcbgit 2>/dev/null)" ]] && FORCE=1

if [[ "$(git_ rev-parse HEAD)" == "$target" && "${FORCE:-0}" != 1 ]]; then
	echo "== already up to date" >>"$LOG"
	# Still catches a Caddyfile an earlier update left unapplied.
	sync_caddy >>"$LOG" 2>&1
	write_availability
	write_status success done "Already up to date"
	exit 0
fi

# A release comes as the image GitHub Actions built; the panel's button (no release)
# always builds here.
pull_ref=""
repo=""
[[ -n "$RELEASE" ]] && repo=$(image_repo)
state=$(image_state "$repo" "$target")
# The image appears a few minutes after the release is published (tests, then the
# build). Only a build still running is worth waiting for.
waited=0
while [[ "$state" == building || ("$state" == missing && waited -eq 0) ]]; do
	if ((waited >= IMAGE_WAIT)); then break; fi
	if ((waited == 0)); then
		step=wait
		echo "== waiting for $repo:sha-$target to be built on GitHub" >>"$LOG"
		write_status running wait "Waiting for the image of ${target:0:7} to be built on GitHub"
	fi
	sleep 30
	waited=$((waited + 30))
	state=$(image_state "$repo" "$target")
done
case "$state" in
	ready) pull_ref="$repo:sha-$target" ;;
	off) ;;
	local) echo "== local changes in $REPO_DIR: building here instead of pulling $repo" >>"$LOG" ;;
	*) echo "== no image $repo:sha-$target ($state): building here" >>"$LOG" ;;
esac

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
	how=pulled
	step=pull
	phase="pulling $pull_ref"
	write_status running pull "Downloading the image of $to"
	{
		echo "== pulling $pull_ref"
		docker pull "$pull_ref"
		# Compose runs pcbgit:latest; retagging it recreates both containers.
		docker tag "$pull_ref" pcbgit:latest
		docker rmi "$pull_ref"
	} >>"$LOG" 2>&1
else
	how=built
	step=build
	phase="building $to"
	write_status running build "Building $to on this server"
	{
		echo "== building $to"
		export PCBGIT_GIT_SHA="$to"
		compose build
	} >>"$LOG" 2>&1
fi
step=restart
phase="restarting"
write_status running restart "Restarting pcbgit"
{
	compose up -d --remove-orphans
	sync_caddy
	docker image prune -f
	echo "== $(date -Is) done ($how)"
} >>"$LOG" 2>&1
write_availability
if [[ "$from" == "$to" ]]; then write_status success done "Rebuilt $to"; else write_status success done "Updated $from → ${RELEASE:-$to}"; fi
