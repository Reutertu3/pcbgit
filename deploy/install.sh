#!/usr/bin/env bash
# Setup on the server, run as root from the repository:
#   sudo deploy/install.sh
# In a terminal it asks for the settings, writes .env (keeping one that exists),
# then offers what to start: the newest release as the image GitHub built, the
# same release built here, or master built here. Without a terminal it only
# checks .env and leaves the first start to deploy/update.sh.
# Either way it sets up the service user (pcbgit by default, PCBGIT_USER without a
# terminal), which owns the checkout, .env and the control folder and runs every
# update and check, and the systemd units that let the admin panel request updates.
# Root stays for this script, the units, and Docker itself. Safe to run again;
# the update service re-runs it with --units-only after each update.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
CONTROL_DIR=/var/lib/pcbgit-control
# The container's user (Dockerfile). The host user gets the same ids when they are
# free, so the folders both write to need no translation.
CONTAINER_ID=10001
UNITS_ONLY=0
[[ "${1:-}" == --units-only ]] && UNITS_ONLY=1
INTERACTIVE=0
[[ $UNITS_ONLY == 0 && -t 0 && -t 1 ]] && INTERACTIVE=1

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
	BOLD=$'\e[1m' DIM=$'\e[2m' RESET=$'\e[0m' ACCENT=$'\e[36m' GREEN=$'\e[32m' YELLOW=$'\e[33m' RED=$'\e[31m'
else
	BOLD='' DIM='' RESET='' ACCENT='' GREEN='' YELLOW='' RED=''
fi
SECTION=0
SECTIONS=7
section() {
	SECTION=$((SECTION + 1))
	if [[ $INTERACTIVE == 1 ]]; then
		printf '\n%s%s%d/%d%s  %s%s%s\n' "$ACCENT" "$BOLD" "$SECTION" "$SECTIONS" "$RESET" "$BOLD" "$1" "$RESET"
	else
		printf '== %s\n' "$1"
	fi
}
note() { printf '  %s%s%s\n' "$DIM" "$*" "$RESET"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die() { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo $0"

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
	read -r -p "  ${ACCENT}?${RESET} $1${2:+ ${DIM}[$2]${RESET}}: " answer
	REPLY=${answer:-${2:-}}
}

yes_no() { # question, default y or n
	local answer
	read -r -p "  ${ACCENT}?${RESET} $1 ${DIM}[$([[ $2 == y ]] && echo Y/n || echo y/N)]${RESET}: " answer
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
		warn "$1 does not resolve yet. Point its A (and AAAA) record at this server first:"
		note "Caddy cannot get a certificate until it does."
		return
	fi
	for address in $resolved; do
		[[ "$own" == *" $address "* ]] && { ok "$1 points at this server"; return; }
	done
	warn "$1 resolves to ${resolved% }, not to an address of this server (${own# })."
	note "Fine behind NAT or a proxy; otherwise fix the DNS record before starting."
}

# The service user: whoever owns the checkout already, else pcbgit.
SERVICE_USER=$(stat -c %U "$REPO_DIR")
[[ "$SERVICE_USER" == root ]] && SERVICE_USER=pcbgit
SERVICE_USER=${PCBGIT_USER:-$SERVICE_USER}

choose_user() {
	section "Service user"
	note "Owns the checkout and .env, and runs updates and checks. Root is only kept"
	note "for this script, the systemd units and Docker itself."
	while true; do
		ask "User name" "$SERVICE_USER"
		[[ "$REPLY" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$REPLY" != root ]] && break
		warn "Lower-case letters, digits, - and _, starting with a letter; not root."
	done
	SERVICE_USER=$REPLY
	if id "$SERVICE_USER" &>/dev/null; then note "$SERVICE_USER exists and is used as it is."; fi
}

configure_env() {
	local fresh=0 domain user email password memory cpus total_mb cores copy
	if [[ ! -f "$ENV_FILE" ]]; then
		cp "$REPO_DIR/.env.example" "$ENV_FILE"
		fresh=1
	fi
	# It holds the admin password.
	chmod 600 "$ENV_FILE"

	section "Domain"
	domain=$(env_value PCBGIT_DOMAIN)
	[[ "$domain" == pcb.example.com ]] && domain=""
	while true; do
		ask "Domain, without https:// (e.g. pcb.example.com)" "$domain"
		domain=$REPLY
		[[ "$domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ && "$domain" != pcb.example.com ]] && break
		warn "The bare domain, like pcb.example.com: no scheme, no slash, no port."
	done
	check_dns "$domain"
	set_env PCBGIT_DOMAIN "$domain"

	section "Administrator"
	while true; do
		ask "Username" "$(env_value PCBGIT_ADMIN_USER || true)"
		user=${REPLY:-admin}
		[[ "$user" =~ ^[A-Za-z0-9][A-Za-z0-9-]{1,30}[A-Za-z0-9]$ ]] && break
		warn "3 to 32 letters, digits and dashes, not starting or ending with a dash."
	done
	set_env PCBGIT_ADMIN_USER "$user"
	email=$(env_value PCBGIT_ADMIN_EMAIL)
	[[ -z "$email" || "$email" == admin@localhost ]] && email="admin@$domain"
	ask "Email" "$email"
	set_env PCBGIT_ADMIN_EMAIL "$REPLY"

	password=$(env_value PCBGIT_ADMIN_PASSWORD)
	if [[ -z "$password" || "$password" == change-me-now ]] || ! yes_no "Keep the password in .env?" y; then
		note "Only used when no administrator exists yet: on the first start, not after restoring a snapshot."
		while true; do
			read -r -s -p "  ${ACCENT}?${RESET} Password ${DIM}(Enter to generate one)${RESET}: " password
			echo
			if [[ -z "$password" ]]; then
				password=$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)
				ok "Generated: ${BOLD}$password${RESET}"
				note "Note it down now; it is also in $ENV_FILE."
				break
			fi
			[[ ${#password} -ge 12 && "$password" != *"'"* ]] && break
			warn "At least 12 characters, and no single quote."
		done
		set_env PCBGIT_ADMIN_PASSWORD "$password"
	fi

	# The renderer's limits keep a large board from taking the site down: the
	# server's memory less 1.5 GB for everything else, and half a core less.
	section "Renderer"
	if ! grep -q '^PCBGIT_RENDER_MEMORY=' "$ENV_FILE" || ((fresh)); then
		total_mb=$(($(awk '/^MemTotal:/ { print $2 }' /proc/meminfo) / 1024))
		memory=$((total_mb - 1536 < 1024 ? 1024 : total_mb - 1536))m
		cores=$(nproc)
		cpus=$( ((cores > 1)) && echo "$((cores - 1)).5" || echo 1)
		note "kicad-cli and the 3D export run in their own container. This server:"
		note "$((total_mb / 1024)) GB memory, $cores core(s)."
		ask "Memory the renderer may use" "$memory"
		set_env PCBGIT_RENDER_MEMORY "$REPLY"
		ask "CPU cores the renderer may use" "$cpus"
		set_env PCBGIT_RENDER_CPUS "$REPLY"
	else
		ok "Kept: $(env_value PCBGIT_RENDER_MEMORY) memory, $(env_value PCBGIT_RENDER_CPUS) core(s) (edit .env to change)"
	fi

	section "Snapshot copies"
	copy=$(env_value PCBGIT_BACKUP_COPY_HOST)
	note "Scheduled snapshots (set up later under Admin -> Backups) can also be copied to a"
	note "folder on another disk or a NAS mount, which survives this server's disk."
	while true; do
		ask "Folder for snapshot copies (Enter for none)" "$copy"
		copy=$REPLY
		[[ -z "$copy" ]] && break
		if [[ "$copy" == /* && -d "$copy" ]]; then
			# The container writes there.
			chown "$CONTAINER_ID:$CONTAINER_ID" "$copy" && break
		fi
		warn "An absolute path to a folder that exists and is mounted."
		# Enter must still mean "none" on the next try.
		copy=""
	done
	if [[ -n "$copy" ]]; then set_env PCBGIT_BACKUP_COPY_HOST "$copy"; elif grep -q '^PCBGIT_BACKUP_COPY_HOST=' "$ENV_FILE"; then set_env PCBGIT_BACKUP_COPY_HOST ""; fi
}

# Creates the service user if needed and lets it run docker. The docker group can
# start containers with the host mounted, so it is as good as root: the user keeps
# the scripts' own work (git, files, the control folder) out of root's hands, it is
# no wall against someone who has it.
ensure_user() {
	local ids=()
	getent group docker >/dev/null || die "Docker is not installed (there is no docker group)."
	if ! id "$SERVICE_USER" &>/dev/null; then
		if ! getent passwd "$CONTAINER_ID" >/dev/null && ! getent group "$CONTAINER_ID" >/dev/null; then
			groupadd --system --gid "$CONTAINER_ID" "$SERVICE_USER"
			ids=(--uid "$CONTAINER_ID" --gid "$CONTAINER_ID")
		else
			ids=(--user-group)
		fi
		# 10001 is above the system range, which useradd warns about and accepts.
		useradd --system "${ids[@]}" --home-dir "/var/lib/$SERVICE_USER" --create-home \
			--shell "$(command -v nologin || echo /usr/sbin/nologin)" "$SERVICE_USER" 2> >(grep -v SYS_UID_MAX >&2)
		ok "Created the user $SERVICE_USER (uid $(id -u "$SERVICE_USER"))"
	fi
	if ! id -nG "$SERVICE_USER" | tr ' ' '\n' | grep -qx docker; then
		usermod -aG docker "$SERVICE_USER"
		ok "Added $SERVICE_USER to the docker group"
	fi
}

# Hands the checkout, .env and the control folder to the service user. Files the
# container wrote in the control folder stay its own; root's (from installs before
# the service user) move over.
ensure_ownership() {
	local parent
	parent=$(dirname "$REPO_DIR")
	runuser -u "$SERVICE_USER" -- test -x "$parent" \
		|| die "$SERVICE_USER cannot reach $parent. Move the checkout somewhere public, e.g. /opt/pcbgit, and run this again from there."
	if [[ -n "$(find "$REPO_DIR" ! -user "$SERVICE_USER" -print -quit)" ]]; then
		chown -R "$SERVICE_USER:" "$REPO_DIR"
		ok "$REPO_DIR belongs to $SERVICE_USER"
	fi
	[[ -f "$ENV_FILE" ]] && chmod 600 "$ENV_FILE"

	# The container (uid 10001) drops request files here, through the group.
	mkdir -p "$CONTROL_DIR"
	chown "$SERVICE_USER:$CONTAINER_ID" "$CONTROL_DIR"
	chmod 2775 "$CONTROL_DIR"
	find "$CONTROL_DIR" -mindepth 1 -user root -exec chown "$SERVICE_USER:$CONTAINER_ID" {} +
}

unit() { # name, content — only rewritten when it changed
	local file="/etc/systemd/system/$1"
	if [[ ! -f "$file" ]] || [[ "$(cat "$file")" != "$2" ]]; then
		printf '%s\n' "$2" >"$file"
		ok "Wrote $file"
	fi
}

write_units() {
	unit pcbgit-update.service "[Unit]
Description=Update pcbgit from GitHub and rebuild
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=$SERVICE_USER
ExecStart=$REPO_DIR/deploy/update.sh
# As root (+), the one step that needs it: the systemd units of the version just installed.
ExecStartPost=+$REPO_DIR/deploy/install.sh --units-only
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
User=$SERVICE_USER
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
	systemctl enable --now pcbgit-update.path pcbgit-check.path pcbgit-check.timer >/dev/null 2>&1
	# First availability check, so the panel has something to show straight away.
	systemctl start --no-block pcbgit-check.service
}

if [[ $INTERACTIVE == 1 ]]; then
	printf '\n  %s%spcbgit%s %sserver setup%s\n' "$ACCENT" "$BOLD" "$RESET" "$BOLD" "$RESET"
	note "$REPO_DIR · Enter keeps the value in brackets."
	choose_user
	configure_env
fi

if [[ $UNITS_ONLY == 0 ]]; then
	# The .env checks catch the mistakes that break a public deploy.
	[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE - copy .env.example and edit it, or run this in a terminal to be asked."
	grep -q '^PCBGIT_DOMAIN=.\+' "$ENV_FILE" && ! grep -q '^PCBGIT_DOMAIN=pcb.example.com$' "$ENV_FILE" \
		|| die "Set PCBGIT_DOMAIN in .env to your real domain."
	grep -Eq '^PCBGIT_DOMAIN=[A-Za-z0-9.-]+$' "$ENV_FILE" \
		|| die "PCBGIT_DOMAIN must be the bare domain, e.g. PCBGIT_DOMAIN=pcb.example.com (no https://, no slash)."
	! grep -q '^PCBGIT_ADMIN_PASSWORD=change-me-now$' "$ENV_FILE" \
		|| die "Change PCBGIT_ADMIN_PASSWORD in .env before going public."
fi

section "System setup"
# Make plain `docker compose ...` on this server always include the production
# file. Without it, a bare `docker compose up -d` recreates pcbgit with the local
# settings (ORIGIN=localhost) behind the still-running Caddy, and every login and
# form post is rejected while pages keep loading.
if [[ -f "$ENV_FILE" ]] && ! grep -q '^COMPOSE_FILE=' "$ENV_FILE"; then
	printf '\n# Added by deploy/install.sh: plain `docker compose` uses the production setup.\nCOMPOSE_FILE=docker-compose.yml:deploy/docker-compose.prod.yml\n' >>"$ENV_FILE"
	ok "Added COMPOSE_FILE to .env"
fi
ensure_user
ensure_ownership
write_units
ok "Updates and checks run as $SERVICE_USER"
[[ $UNITS_ONLY == 1 ]] && exit 0
if [[ $INTERACTIVE == 0 ]]; then
	echo "Installed. First start:  sudo -u $SERVICE_USER $REPO_DIR/deploy/update.sh --release"
	exit 0
fi

section "First start"
# Only offered when nothing runs yet: later versions come from the admin panel
# (or deploy/update.sh).
if [[ -n "$(cd "$REPO_DIR" && docker compose ps -q pcbgit 2>/dev/null)" ]]; then
	ok "pcbgit is already running; updates come from Admin -> Instance."
	exit 0
fi
note "Looking for the newest release..."
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
note "What should run? ${free:-unknown} free on the disk."
if [[ "$release" == none ]]; then
	note "There is no release yet: master is built on this server (several minutes)."
	choice=3
else
	if [[ -z "$prebuilt" ]]; then
		printf '    %s1%s  %s as the image GitHub built %s(about 1 GB to download, a minute or two)%s\n' "$BOLD" "$RESET" "$release" "$DIM" "$RESET"
	else
		printf '    %s1  not available: %s%s\n' "$DIM" "$prebuilt" "$RESET"
	fi
	printf '    %s2%s  %s, built on this server %s(several minutes, about 15 GB of disk while building)%s\n' "$BOLD" "$RESET" "$release" "$DIM" "$RESET"
	printf '    %s3%s  the newest master, built on this server %s(unreleased changes, same cost as 2)%s\n' "$BOLD" "$RESET" "$DIM" "$RESET"
	default=$([[ -z "$prebuilt" ]] && echo 1 || echo 2)
	while true; do
		ask "Choice" "$default"
		choice=$REPLY
		[[ "$choice" == 1 && -n "$prebuilt" ]] && { warn "Not available here."; continue; }
		[[ "$choice" =~ ^[123]$ ]] && break
	done
fi
echo
# update.sh switches to the service user itself.
case "$choice" in
	1) "$REPO_DIR/deploy/update.sh" --release ;;
	2) PCBGIT_UPDATE_IMAGE=build "$REPO_DIR/deploy/update.sh" --release ;;
	3) "$REPO_DIR/deploy/update.sh" ;;
esac

printf '\n  %s%s✓ pcbgit is running%s\n\n' "$GREEN" "$BOLD" "$RESET"
printf '    %-13s %s\n' \
	Address "https://$(env_value PCBGIT_DOMAIN)" \
	"Sign in as" "$(env_value PCBGIT_ADMIN_USER)" \
	"Service user" "$SERVICE_USER" \
	Settings "$ENV_FILE" \
	"Update log" "$CONTROL_DIR/update.log"
echo
note "To bring back an earlier server, restore its snapshot under Admin -> Backups."
