# pcbgit

Self-hosted git hosting for KiCad projects. Push a board and every commit is
rendered: schematics, board layers, an assembled 3D model, the BOM and DRC/ERC
results, all viewable in the browser.

**Contents**

- [Features](#features)
- [Quick start](#quick-start)
- [Deploying to a server](#deploying-to-a-server)
- [Updating](#updating)
- [Using pcbgit](#using-pcbgit)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Features

**Viewers**

- **Schematic**: every sheet, pan and zoom, light or dark, export as PNG/JPEG up to 600 dpi
- **PCB 2D**: stacked layers with per-layer toggles, front/back flip, DRC markers
- **PCB 3D**: assembled board with components, view cube, soldermask/silkscreen colours,
  HASL/ENIG finish, SMD/THT toggles, ruler, scale objects, image export
- **BOM**: interactive view with placement highlighting ([iBOM](https://github.com/openscopeproject/InteractiveHtmlBom)),
  grouped line items, CSV export, diff between any two versions
- **Checks**: KiCad DRC and ERC, grouped by severity
- **History**: renders and logs per commit, source ZIP downloads

**Hosting**

- Push and clone over HTTPS with personal access tokens, or upload a ZIP
- Public and private boards, stars, comments, colour-coded tags
- Admin panel: users, boards, tags, render queue, backups, updates
- Snapshots for backup and moving to a new server
- One-click updates from GitHub with changelog

**Stack**

SvelteKit, SQLite (`node:sqlite`), bare git repositories on disk. Rendering uses
`kicad-cli` from KiCad 10, which the Docker image includes.

## Quick start

Requires Docker with the Compose plugin.

```sh
git clone https://github.com/Reutertu3/pcbgit.git
cd pcbgit
cp .env.example .env      # set PCBGIT_ADMIN_PASSWORD
docker compose up -d --build
```

Open <http://localhost:3000> and sign in as `admin`. The first build takes a few
minutes: it downloads KiCad and its 3D model library.

All data (database, repositories, renders) is stored in the `pcbgit-data` volume.

## Deploying to a server

Tested on Debian 13. Caddy runs in front of pcbgit and handles HTTPS with a
Let's Encrypt certificate. pcbgit itself is not exposed.

**Requirements:** 2 GB RAM, 8 GB free disk, a domain name. Run the commands below
as root.

### 1. Install Docker

Use Docker's repository. Debian's `docker.io` package is too old.

```sh
apt update && apt install -y ca-certificates curl git ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 2. DNS and firewall

Point the domain's A record (and AAAA, if you use IPv6) at the server. It must
resolve before the first start, or Caddy cannot get a certificate.

```sh
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable
```

### 3. Get the code and configure it

```sh
git clone https://github.com/Reutertu3/pcbgit.git /opt/pcbgit
cd /opt/pcbgit
cp .env.example .env
nano .env
```

Set in `.env`:

| Variable | Value |
|---|---|
| `PCBGIT_DOMAIN` | The bare domain, e.g. `pcb.example.com`. No `https://`, no slash. |
| `PCBGIT_ADMIN_PASSWORD` | A long random password, e.g. from `openssl rand -base64 24` |

For a private repository, add a read-only
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
and clone with the `git@github.com:` URL.

### 4. Install and start

```sh
deploy/install.sh    # systemd units for updates; checks .env
deploy/update.sh     # first build and start
```

Open `https://<your domain>` and sign in as `admin`. Consider switching off open
registration under **Admin → Instance**.

`install.sh` adds `COMPOSE_FILE` to `.env`, so plain `docker compose` commands
on the server always use the production setup.

### Moving an existing instance

1. On the old instance, create a snapshot under **Admin → Backups** and download it.
2. On the new server, run `install.sh` (step 4), but not `update.sh` yet.
3. Copy the snapshot to `/var/lib/pcbgit-control/import.tar.gz`.
4. Add `PCBGIT_IMPORT_SNAPSHOT=/control/import.tar.gz` to `.env`.
5. Run `update.sh`. The snapshot is imported on first start.
6. Sign in with the admin account from the old instance, then delete the file and the `.env` line.

## Updating

pcbgit checks GitHub for new commits every hour. When updates are available,
**Admin → Overview** shows a banner and **Admin → Instance** lists the new
commits as a changelog.

To update, either:

- press **Update from GitHub** under **Admin → Instance**, or
- run `/opt/pcbgit/deploy/update.sh` on the server.

Both pull from GitHub, rebuild and restart. The site is down for a few seconds.
**Check now** runs the GitHub check immediately.

Details:

- Only fast-forward pulls are done. If the server copy has its own commits, the
  update stops and the panel says so.
- The container cannot run commands on the host. The button writes a request file
  to `/var/lib/pcbgit-control`; a systemd unit on the host picks it up.
- Each update re-syncs the systemd units. After updating an existing server to this
  version for the first time, run `deploy/install.sh --units-only` once.
- `systemctl status pcbgit-update.service` shows the last run on the server.

## Using pcbgit

### Push a board

1. Create a board with **New board**.
2. Create a token under **Settings → Access tokens**.
3. Push your KiCad project:

   ```sh
   git remote add pcbgit https://<your domain>/git/<user>/<board>.git
   git push pcbgit main
   ```

   Use your username and the token as the password.

pcbgit renders the shallowest `.kicad_pro` in the repository together with its
`.kicad_sch` and `.kicad_pcb`. Public boards can be cloned without a token.

### Backups

Under **Admin → Backups** you can create, download, upload and restore snapshots.
A snapshot is one `.tar.gz` with the database, all repositories and, optionally,
the rendered output.

- **Restore** moves the current data to `backups/pre-restore-<time>/` instead of
  deleting it, then restarts pcbgit.
- **Large snapshots** that exceed the upload limit can be copied in directly:
  `docker compose cp snapshot.tar.gz pcbgit:/data/backups/`

## Configuration

Set these in `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `PCBGIT_DOMAIN` | — | Public domain (production). Used by Caddy and to set `ORIGIN`. |
| `PCBGIT_ORIGIN` | `http://localhost:3000` | URL of a local instance. Form posts from other origins are rejected. |
| `PCBGIT_ADMIN_USER` | `admin` | Admin account created when no active admin exists |
| `PCBGIT_ADMIN_PASSWORD` | — | Password for that account. Required. |
| `PCBGIT_ADMIN_EMAIL` | `admin@localhost` | Email for that account |
| `PCBGIT_IMPORT_SNAPSHOT` | — | Snapshot to import on the first start of an empty instance |
| `COMPOSE_FILE` | — | Set by `install.sh` so `docker compose` uses the production setup |
| `PCBGIT_SOURCE_URL` | `https://github.com/Reutertu3/pcbgit` | Repository linked as "Source" in the footer. Forks must set their own. |

Set in the image or compose files; rarely changed:

| Variable | Default | Purpose |
|---|---|---|
| `PCBGIT_DATA_DIR` | `/data` | Database, repositories and renders |
| `PCBGIT_CONTROL_DIR` | `/control` (production) | Folder shared with the host for updates. Unset disables in-app updates. |
| `PCBGIT_KICAD_CLI` | `kicad-cli` | Path to the KiCad CLI |
| `PCBGIT_IBOM` | set in the image | iBOM's `generate_interactive_bom.py`. Unset skips the interactive BOM. |
| `BODY_SIZE_LIMIT` | `210M` | Maximum upload and push size |
| `PCBGIT_RESTART_ON_RESTORE` | `true` | Restart after staging a restore |

Build option: `--build-arg INSTALL_3D_MODELS=false` skips the KiCad 3D model
library (several GB). The 3D view then shows boards without components.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Pages load, but login and forms fail with "Cross-site POST form submissions are forbidden" | `ORIGIN` does not match the site URL. Check that `PCBGIT_DOMAIN` is the bare domain and `.env` contains `COMPOSE_FILE`, then run `docker compose up -d`. `docker compose exec pcbgit printenv ORIGIN` must show `https://<your domain>`. |
| 502 from Caddy | pcbgit is starting or has stopped. Check `docker compose logs pcbgit`. |
| No certificate / HTTPS fails | DNS does not point at the server yet, or ports 80/443 are blocked. Check `docker compose logs caddy`. |
| A version shows "Render failed" | Open the board's **History** tab and view the render log. |
| Update fails | The log is shown under **Admin → Instance**. A diverged server copy is the usual cause: `git reset --hard origin/<branch>` in `/opt/pcbgit`. |

## Development

Requires Node 24+ and git. Rendering needs `kicad-cli`; without it, pcbgit still
tracks versions and builds the BOM, but produces no schematic, board, 3D or DRC
output.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit and end-to-end tests
npm run check    # type check
npm run seed     # demo boards
```

After editing `src/lib/server/db/schema.sql`, run `npm run schema`. Columns added
to existing tables also need an entry in `ADDED_COLUMNS` in
`src/lib/server/db/index.ts`.

### Translations

The interface is available in English and German; the globe button in the header
switches, and the choice is saved in a cookie. First-time visitors get their
browser's language.

Strings live in `src/lib/i18n/en.json` and `de.json`. To add a language, copy
`en.json`, translate it, and register it in `LOCALES` in `src/lib/i18n/index.ts`.
`npm test` fails if a file is missing keys or placeholders. KiCad's own DRC/ERC
messages and render logs stay in English.

### Project layout

```
src/lib/server/
  db/              SQLite schema and queries
  auth.ts          passwords, sessions, access tokens
  git.ts           bare repositories, commits from uploads
  githttp.ts       git smart-HTTP (clone and push)
  projects.ts      boards, tags, stars, commit indexing
  render/          render queue, kicad-cli wrapper, KiCad/BOM/DRC parsers
  backups.ts       snapshots
  restore.ts       snapshot validation and restore
  updater.ts       update requests and status
src/routes/
  [owner]/[project]/   board pages: overview, schematic, pcb, 3d, bom, drc, files, history
  git/                 git endpoint
  admin/               admin panel
deploy/
  docker-compose.prod.yml, Caddyfile   production setup
  install.sh, update.sh                server setup and updates
```

The render worker runs inside the app and processes one job at a time. Jobs
interrupted by a restart are marked failed at boot and can be retried from
**Admin → Render queue**.

## License

pcbgit is © 2026 Michael Reuter and licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE).

You can use, modify and host pcbgit, including commercially. If you run a
modified version for others over a network, you must offer them its source code.
The author attribution in the page footer must be kept. See [NOTICE.md](NOTICE.md)
for the exact terms and for the licenses of third-party software pcbgit uses.
