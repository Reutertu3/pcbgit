#!/usr/bin/env bash
# Setup on the server, run as root from the repository:
#   sudo deploy/install.sh
# In a terminal it asks for the settings, writes .env (keeping one that exists),
# then offers what to start: the newest release as the image GitHub built, the
# same release built here, or master built here. Without a terminal it only
# checks .env and leaves the first start to deploy/update.sh.
# Either way it creates the shared control folder and the systemd units that let
# the admin panel request updates and see what is available. Safe to run again;
# deploy/update.sh re-runs it with --units-only after each update.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0" >&2; exit 1; }
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
CONTROL_DIR=/var/lib/pcbgit-control
UNITS_ONLY=0
[[ "${1:-}" == --units-only ]] && UNITS_ONLY=1
INTERACTIVE=0
[[ $UNITS_ONLY == 0 && -t 0 && -t 1 ]] && INTERACTIVE=1

env_value() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -1 | sed -E "s/^'(.*)'$/\1/"; }

# Sets KEY in .env: replaces its line, or the commented example ("# KEY=..."), or
# appends it. Values beyond plain characters are single-quoted, which compose
# reads literally.
set_env() {
	local key=$1 value=$2 line
	[[ "$value" =~ ^[A-Za-z0-9._@:/+=-]*$ ]] && line="$key=$value" || line="$key='$value'"
	if grep -q "^$key=" "$ENV_FILE"; then
		KEY="$key" LINE="$line" awk '$0 ~ "^" ENVIRON["KEY"] "=" { print ENVIRON["LINE"]; next } { print }' "$ENV_FILE" >"$ENV_FILE.tmp"
	elif grep -q "^# $key=" "$ENV_FILE"; then
		KEY="$key" LINE="$line" awk '!done && $0 ~ "^# " ENVIRON["KEY"] "=" { print ENVIRON["LINE"]; done = 1; next } { print }' "$ENV_FILE" >"$ENV_FILE.tmp"
	else
		cp "$ENV_FILE" "$ENV_FILE.tmp" && echo "$line" >>"$ENV_FILE.tmp"
	fi
	cat "$ENV_FILE.tmp" >"$ENV_FILE" && rm -f "$ENV_FILE.tmp"
}

ask() { # question, default: the answer in REPLY
	local answer
	read -r -p "$1${2:+ [$2]}: " answer
	REPLY=${answer:-${2:-}}
}

yes_no() { # question, default y or n
	local answer
	read -r -p "$1 [$([[ $2 == y ]] && echo Y/n || echo y/N)]: " answer
	[[ "${answer:-$2}" =~ ^[Yy] ]]
}

# What the domain resolves to, against this server's own addresses. Behind NAT
# they differ legitimately, so this only warns.
check_dns() {
	local resolved own
	# getent fails for a name that does not resolve: that is the case to report.
	resolved=$(getent ahosts "$1" 2>/dev/null | awk '{ print $1 }' | sort -u | tr '\n' ' ' || true)
	own=" $(hostname -I 2>/dev/null || true) "
	if [[ -z "$resolved" ]]; then
		echo "  ! $1 does not resolve yet. Point its A (and AAAA) record at this server first:"
		echo "    Caddy cannot get a certificate until it does."
		return
	fi
	for address in $resolved; do [[ "$own" == *" $address "* ]] && return; done
	echo "  ! $1 resolves to ${resolved% }, not to an address of this server (${own# })."
	echo "    Fine behind NAT or a proxy; otherwise fix the DNS record before starting."
}

configure_env() {
	local fresh=0 domain user email password memory cpus total_mb cores copy
	if [[ ! -f "$ENV_FILE" ]]; then
		cp "$REPO_DIR/.env.example" "$ENV_FILE"
		fresh=1
		echo "Writing $ENV_FILE. Enter keeps the value in brackets."
	else
		echo "Checking $ENV_FILE. Enter keeps the value in brackets."
	fi
	# It holds the admin password.
	chmod 600 "$ENV_FILE"

	domain=$(env_value PCBGIT_DOMAIN)
	[[ "$domain" == pcb.example.com ]] && domain=""
	while true; do
		ask "Domain, without https:// (e.g. pcb.example.com)" "$domain"
		domain=$REPLY
		[[ "$domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ && "$domain" != pcb.example.com ]] && break
		echo "  The bare domain, like pcb.example.com: no scheme, no slash, no port."
	done
	check_dns "$domain"
	set_env PCBGIT_DOMAIN "$domain"

	while true; do
		ask "Administrator's username" "$(env_value PCBGIT_ADMIN_USER || true)"
		user=${REPLY:-admin}
		[[ "$user" =~ ^[A-Za-z0-9][A-Za-z0-9-]{1,30}[A-Za-z0-9]$ ]] && break
		echo "  3 to 32 letters, digits and dashes, not starting or ending with a dash."
	done
	set_env PCBGIT_ADMIN_USER "$user"
	email=$(env_value PCBGIT_ADMIN_EMAIL)
	[[ -z "$email" || "$email" == admin@localhost ]] && email="admin@$domain"
	ask "Administrator's email" "$email"
	set_env PCBGIT_ADMIN_EMAIL "$REPLY"

	password=$(env_value PCBGIT_ADMIN_PASSWORD)
	if [[ -z "$password" || "$password" == change-me-now ]] || ! yes_no "Keep the administrator's password in .env?" y; then
		echo "  Only used when no administrator exists yet: on the first start, not after restoring a snapshot."
		while true; do
			read -r -s -p "Administrator's password (Enter to generate one): " password
			echo
			if [[ -z "$password" ]]; then
				password=$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)
				echo "  Generated: $password"
				echo "  Note it down now; it is also in $ENV_FILE."
				break
			fi
			[[ ${#password} -ge 12 && "$password" != *"'"* ]] && break
			echo "  At least 12 characters, and no single quote."
		done
		set_env PCBGIT_ADMIN_PASSWORD "$password"
	fi

	# The renderer's limits keep a large board from taking the site down: the
	# server's memory less 1.5 GB for everything else, and half a core less.
	if ! grep -q '^PCBGIT_RENDER_MEMORY=' "$ENV_FILE" || ((fresh)); then
		total_mb=$(($(awk '/^MemTotal:/ { print $2 }' /proc/meminfo) / 1024))
		memory=$((total_mb - 1536 < 1024 ? 1024 : total_mb - 1536))m
		cores=$(nproc)
		cpus=$( ((cores > 1)) && echo "$((cores - 1)).5" || echo 1)
		echo "This server: $((total_mb / 1024)) GB memory, $cores core(s)."
		ask "Memory the renderer may use (kicad-cli, 3D export)" "$memory"
		set_env PCBGIT_RENDER_MEMORY "$REPLY"
		ask "CPU cores the renderer may use" "$cpus"
		set_env PCBGIT_RENDER_CPUS "$REPLY"
	fi

	copy=$(env_value PCBGIT_BACKUP_COPY_HOST)
	echo "Scheduled snapshots (set up later under Admin -> Backups) can also be copied to a"
	echo "folder on another disk or a NAS mount, which survives this server's disk."
	while true; do
		ask "Folder for snapshot copies (Enter for none)" "$copy"
		copy=$REPLY
		[[ -z "$copy" ]] && break
		if [[ "$copy" == /* && -d "$copy" ]]; then
			# The container runs as uid 10001.
			chown 10001:10001 "$copy" && break
		fi
		echo "  An absolute path to a folder that exists and is mounted."
		# Enter must still mean "none" on the next try.
		copy=""
	done
	if [[ -n "$copy" ]]; then set_env PCBGIT_BACKUP_COPY_HOST "$copy"; elif grep -q '^PCBGIT_BACKUP_COPY_HOST=' "$ENV_FILE"; then set_env PCBGIT_BACKUP_COPY_HOST ""; fi
	echo "Saved $ENV_FILE."
	echo
}

[[ $INTERACTIVE == 1 ]] && configure_env

if [[ $UNITS_ONLY == 0 ]]; then
	# The .env checks catch the mistakes that break a public deploy.
	[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE - copy .env.example and edit it, or run this in a terminal to be asked." >&2; exit 1; }
	grep -q '^PCBGIT_DOMAIN=.\+' "$ENV_FILE" && ! grep -q '^PCBGIT_DOMAIN=pcb.example.com$' "$ENV_FILE" \
		|| { echo "Set PCBGIT_DOMAIN in .env to your real domain." >&2; exit 1; }
	grep -Eq '^PCBGIT_DOMAIN=[A-Za-z0-9.-]+$' "$ENV_FILE" \
		|| { echo "PCBGIT_DOMAIN must be the bare domain, e.g. PCBGIT_DOMAIN=pcb.example.com (no https://, no slash)." >&2; exit 1; }
	! grep -q '^PCBGIT_ADMIN_PASSWORD=change-me-now$' "$ENV_FILE" \
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
[[ $UNITS_ONLY == 1 ]] && exit 0
if [[ $INTERACTIVE == 0 ]]; then
	echo "Installed. First start:  sudo $REPO_DIR/deploy/update.sh --release"
	exit 0
fi

# What to start. Only offered when nothing runs yet: later versions come from the
# admin panel (or deploy/update.sh).
if [[ -n "$(cd "$REPO_DIR" && docker compose ps -q pcbgit 2>/dev/null)" ]]; then
	echo "Installed. pcbgit is already running; updates come from Admin -> Instance."
	exit 0
fi
read -r release state <<<"$("$REPO_DIR/deploy/update.sh" --release-info)"
free=$(df -h --output=avail /var/lib/docker 2>/dev/null | tail -1 | tr -d ' ')
case "$state" in
	ready) prebuilt="" ;;
	arch) prebuilt="GitHub builds images for x86-64 only, and this server is $(docker version --format '{{.Server.Arch}}')" ;;
	local) prebuilt="this checkout has local changes, which the image does not have" ;;
	building) prebuilt="GitHub is still building its image; try again in a few minutes" ;;
	off) prebuilt="PCBGIT_UPDATE_IMAGE=build in .env" ;;
	*) prebuilt="no image can be read ($state)" ;;
esac
echo "What should run? (${free:-unknown} free on the disk)"
if [[ "$release" == none ]]; then
	echo "  There is no release yet: master is built on this server (several minutes)."
	choice=3
else
	if [[ -z "$prebuilt" ]]; then
		echo "  1) $release as the image GitHub built: about 1 GB to download, a minute or two"
	else
		echo "  1) (not available: $prebuilt)"
	fi
	echo "  2) $release, built on this server: several minutes, about 15 GB of disk while building"
	echo "  3) the newest master, built on this server: unreleased changes, same cost as 2"
	default=$([[ -z "$prebuilt" ]] && echo 1 || echo 2)
	while true; do
		ask "Choice" "$default"
		choice=$REPLY
		[[ "$choice" == 1 && -n "$prebuilt" ]] && { echo "  Not available here."; continue; }
		[[ "$choice" =~ ^[123]$ ]] && break
	done
fi
echo
case "$choice" in
	1) "$REPO_DIR/deploy/update.sh" --release ;;
	2) PCBGIT_UPDATE_IMAGE=build "$REPO_DIR/deploy/update.sh" --release ;;
	3) "$REPO_DIR/deploy/update.sh" ;;
esac
echo
echo "Open https://$(env_value PCBGIT_DOMAIN) and sign in as $(env_value PCBGIT_ADMIN_USER),"
echo "or restore a snapshot under Admin -> Backups to bring back an earlier server."
