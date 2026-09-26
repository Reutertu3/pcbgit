<p align="center">
  <img src="docs/images/banner.webp" alt="pcbgit" width="900">
</p>

<p align="center">
  <b>Self-hosted git hosting for KiCad projects.</b><br>
  Push a board and every commit is rendered: schematics, board layers, an assembled 3D
  model, the BOM, DRC/ERC results and fabrication files — all in the browser.
</p>

<p align="center">
  <b><a href="https://pcbgit.com">Live demo at pcbgit.com</a></b><br>
  <sub>Sign-ups are disabled there; run your own instance to push boards.</sub>
</p>

<p align="center">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-2b5748">
  <img alt="KiCad 10" src="https://img.shields.io/badge/KiCad-10-9cb080">
  <img alt="Runs in Docker" src="https://img.shields.io/badge/deploy-Docker-618764">
  <img alt="Built with SvelteKit" src="https://img.shields.io/badge/built%20with-SvelteKit-273338">
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#deploying-to-a-server">Deploy</a> ·
  <a href="#updating">Updating</a> ·
  <a href="#using-pcbgit">Usage</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="#development">Development</a>
</p>

---

<p align="center">
  <img src="docs/images/browse.webp" alt="The board list, with schematic and board thumbnails per board" width="900">
</p>

## Features

### Viewers

| | What you get |
|---|---|
| **Schematic** | Every sheet, pan and zoom, light or dark, PNG/JPEG export up to 600 dpi, all sheets as one PDF |
| **PCB 2D** | Stacked layers with per-layer toggles, front/back flip, DRC markers with zoom-to-error |
| **PCB 3D** | Assembled board with components, view cube, soldermask/silkscreen colours, HASL/ENIG finish, SMD/THT toggles, ruler, scale objects, image export |
| **BOM** | Interactive view with placement highlighting ([iBOM]), grouped line items, CSV export, diff between any two versions |
| **Checks** | KiCad DRC and ERC, grouped by severity, linked to their spot on the board |
| **Fabrication** *(experimental)* | Gerbers and drill files ready for a board house: **JLCPCB**, **AISLER** or generic KiCad names |
| **Eagle import** | Eagle 6+ projects are converted on upload or push and marked *Converted*; the converted KiCad project is a download |
| **History** | Renders and logs per commit, source ZIP downloads |

### Hosting

- Push and clone over **HTTPS with personal access tokens**, or upload a ZIP
- **Public and private boards**, stars, threaded comments with notifications
- **Admin panel**: users, boards, colour-coded tags, render queue, backups, updates,
  limits per user (boards, storage, uploads and pushes per hour), approval of new accounts
- **Snapshots** for backup and moving to a new server
- **One-click updates** from GitHub with a changelog
- **English and German** interface, eight colour themes

### Stack

SvelteKit, SQLite (`node:sqlite`), bare git repositories on disk. Rendering uses
`kicad-cli` from KiCad 10, which the Docker image includes, in a separate sandboxed
container without access to the database or the network. 3D models are joined
and compressed at render time, so a 29 MB KiCad export becomes a ~6 MB download.

[iBOM]: https://github.com/openscopeproject/InteractiveHtmlBom

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/images/schematic.webp" alt="Schematic viewer"><br><b>Schematic</b></td>
    <td width="50%"><img src="docs/images/pcb.webp" alt="Layered board view with DRC markers"><br><b>PCB 2D</b></td>
  </tr>
  <tr>
    <td><img src="docs/images/3d.webp" alt="Assembled 3D model"><br><b>PCB 3D</b></td>
    <td><img src="docs/images/bom.webp" alt="Interactive bill of materials"><br><b>BOM</b></td>
  </tr>
  <tr>
    <td><img src="docs/images/checks.webp" alt="DRC and ERC results"><br><b>Checks</b></td>
    <td><img src="docs/images/overview.webp" alt="Board overview page"><br><b>Overview</b> — preview, stats, README, downloads, discussion</td>
  </tr>
</table>

<details>
<summary><b>Admin panel</b></summary>

<img src="docs/images/admin.webp" alt="Admin overview with instance statistics">

</details>

## Quick start

Requires Docker with the Compose plugin.

```sh
git clone https://github.com/Reutertu3/pcbgit.git
cd pcbgit
cp .env.example .env      # set PCBGIT_ADMIN_PASSWORD
docker compose up -d --build
```

Open <http://localhost:3000> and sign in as `admin`. Another port: set
`PCBGIT_PORT` in `.env`.

> [!TIP]
> The first build takes a few minutes: it downloads KiCad and its 3D model
> library. Later builds reuse those layers. To skip the several-GB model library,
> build with `--build-arg INSTALL_3D_MODELS=false`; the 3D view then shows bare
> boards without components.

All data (database, repositories, renders) lives in the `pcbgit-data` volume.
Create your first board with **New board**, or push one over git — see
[Using pcbgit](#using-pcbgit).

### On a LAN, without a domain

pcbgit needs no domain, no HTTPS and no extra configuration for this: it answers
on every address it is reached at. Start it as above and share the machine's
address, for example `http://192.168.1.50:3000` or `http://pcbgit.lan:3000`.
Colleagues sign in, push and clone from phones and laptops; the clone box always
shows the address that visitor is using. A reverse proxy in front must pass the
client's `Host` header through (Caddy's `reverse_proxy` does).

## Deploying to a server

Tested on Debian 13. Caddy runs in front of pcbgit and handles HTTPS with a
Let's Encrypt certificate. pcbgit itself is not exposed.

**Requirements:** 2 GB RAM, 8 GB free disk, a domain name. Run the commands below
as root.

> [!IMPORTANT]
> Set `PCBGIT_DOMAIN` to the bare domain and give `PCBGIT_ADMIN_PASSWORD` a long
> random value before the first start. A wrong domain makes every form post fail
> with a cross-site error, because it decides the app's `ORIGIN`.

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

Open `https://<your domain>` and sign in as `admin`. Under **Admin → Instance**,
decide on registration: closed, or open with every new account approved by an
admin first (the default), and set limits per user (boards, storage, uploads and
pushes per hour). **Admin → Users** approves new accounts and sets limits for
single users; admins also get a notification for each new account. The `.env`
admin is the instance's owner: other admins cannot demote, disable or delete it,
or reset its password.

`install.sh` adds `COMPOSE_FILE` to `.env`, so plain `docker compose` commands
on the server always use the production setup.

<details>
<summary><b>Moving an existing pcbgit to a new server</b></summary>

1. On the old server, create a snapshot under **Admin → Backups** and download it.
2. Set up the new server as above and sign in with the admin account from its `.env`.
3. Under **Admin → Backups**, upload the snapshot and restore it. pcbgit restarts
   with the old server's users, boards and settings; from then on, sign in with
   the old server's accounts.

Snapshots of any size can be uploaded: the browser sends them in pieces. They
can also be copied in on the server: `docker compose cp snapshot.tar.gz
pcbgit:/data/backups/`. Either way they then appear in the list.

</details>

## Updating

pcbgit checks GitHub every hour. **Admin → Instance** shows the newest release
(whether automatic updates will install it, and whether its image is ready) and
the commits on `master` since the running version, as a changelog.

There are two ways to update:

- **Automatic updates** (switch under **Admin → Instance**) install each new
  **release** (a tag `vX.Y.Z`, published on GitHub; pre-releases are skipped).
  GitHub Actions builds the Docker image of every published release, and the
  server only downloads it: about a minute, nothing built on the server. A
  release published a few minutes ago may still be building; the update waits.
  `deploy/update.sh --release` does the same by hand.
- **Update from GitHub** (button under **Admin → Instance**, or
  `/opt/pcbgit/deploy/update.sh` on the server) builds the **newest commit on
  `master`** on the server itself, which takes several minutes. For trying
  what is not released yet.

Neither ever goes backwards: after a build of `master`, automatic updates wait
for the next release that comes after it. The site is down for a few seconds
while pcbgit restarts. The panel shows each step (fetch, wait for image,
download or build, restart) and how the running version got there. **Check now**
runs the GitHub check immediately.

<details>
<summary>How updating works, and what can go wrong</summary>

- Only fast-forward pulls are done. If the server copy has its own commits, the
  update stops and the panel says so.
- The container cannot run commands on the host. The button writes a request file
  to `/var/lib/pcbgit-control`; a systemd unit on the host picks it up. The
  automatic-update switch is a file there too (`auto-update`), read by the hourly
  check.
- An automatic update only starts when the release's image is ready (or when the
  server builds itself). If it fails, it is not retried; the next release is.
- A download or build that fails leaves the old version running, and the checkout
  goes back to it, so the next check offers the update again.
- Each update re-syncs the systemd units and restarts Caddy when its config changed.
- `systemctl status pcbgit-update.service` shows the last run on the server.
- Release images come from `ghcr.io/<owner>/<repo>` of the GitHub remote, and must
  be public (the package's settings on GitHub; a package published from a public
  repository usually is). A private or unreachable image is not waited for; the
  server builds the release instead, and the log says why.
- After an update that changes rendering, **Admin → Boards → Re-render all**
  brings existing versions up to date.

</details>

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
Every push renders in the background; **History** keeps the log of each version,
and **Admin → Render queue** shows what is running.

### Downloads

A board's overview offers the BOM (CSV), the schematic as one PDF, the 3D model
(GLB), the source as ZIP and, under **Production Gerbers**, a fabrication ZIP for
the board house picked in the dropdown. Each follows that fab's conventions (file
names, drill units) and holds only the manufacturing layers, with zones refilled
before export. The Gerber export is experimental: check the fab's preview before
ordering.

### Backups

Under **Admin → Backups** you can create, download, upload and restore snapshots.
A snapshot is one `.tar.gz` with the database, all repositories and, optionally,
the rendered output. Uploads of any size work: the browser sends the file in
pieces of up to 32 MB, which the server keeps as `<name>.part-N` and joins once
all have arrived. The only limit is free disk space (1 GB is always left free).
Snapshots can also be copied in directly:
`docker compose cp snapshot.tar.gz pcbgit:/data/backups/`

> [!WARNING]
> A restore replaces users, boards, repositories and settings with the snapshot's,
> then restarts pcbgit. The previous data is moved to `backups/pre-restore-<time>/`
> rather than deleted, so it can be recovered by hand.

## Configuration

Set these in `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PCBGIT_DOMAIN` | — | Public domain (production). Used by Caddy and to set `ORIGIN`. |
| `PCBGIT_PORT` | `3000` | Port pcbgit is published on (local and LAN; production uses 80/443) |
| `PCBGIT_ORIGIN` | `http://localhost:<PCBGIT_PORT>` | Public URL, used for links in server-rendered pages and for the cookie's scheme. Optional on a LAN: any address works. |
| `PCBGIT_ADMIN_USER` | `admin` | Admin account created when no active admin exists |
| `PCBGIT_ADMIN_PASSWORD` | — | Password for that account. Required. |
| `PCBGIT_ADMIN_EMAIL` | `admin@localhost` | Email for that account |
| `PCBGIT_IMPORT_SNAPSHOT` | — | Snapshot to import on the first start of an empty instance |
| `COMPOSE_FILE` | — | Set by `install.sh` so `docker compose` uses the production setup |
| `PCBGIT_SOURCE_URL` | `https://github.com/Reutertu3/pcbgit` | Repository linked as "Source" in the footer. Forks must set their own. |
| `PCBGIT_RENDER_MEMORY` | `4g` | Memory the renderer container may use; keep it below the server's total |
| `PCBGIT_RENDER_CPUS` | `2` | CPUs the renderer container may use |
| `PCBGIT_MIN_FREE_DISK` | `1G` | Free disk space that always stays free: below it uploads, pushes and snapshots are refused and renders wait |
| `PCBGIT_UPDATE_IMAGE` | `ghcr.io/<owner>/<repo>` of a GitHub remote | Where release installs pull the image from (tagged `sha-<commit>`). `build` builds releases on the server too. |

<details>
<summary>Set in the image or compose files; rarely changed</summary>

| Variable | Default | Purpose |
|---|---|---|
| `PCBGIT_DATA_DIR` | `/data` | Database, repositories and renders |
| `PCBGIT_CONTROL_DIR` | `/control` (production) | Folder shared with the host for updates. Unset disables in-app updates. |
| `PCBGIT_KICAD_CLI` | `kicad-cli` | Path to the KiCad CLI |
| `PCBGIT_IBOM` | set in the image | iBOM's `generate_interactive_bom.py`. Unset skips the interactive BOM. |
| `BODY_SIZE_LIMIT` | `210M` | Maximum size of one request: board uploads and pushes (snapshots are sent in pieces below it) |
| `PCBGIT_RESTART_ON_RESTORE` | `true` | Restart after staging a restore |
| `PCBGIT_RENDER_DIR` | `/work` | Render checkouts and output, shared with the `renderer` container |
| `PCBGIT_RENDER_SOCKET` | `/work/runner.sock` | Where the app reaches the renderer. Unset runs the render tools in the app itself. |
| `ADDRESS_HEADER`, `XFF_DEPTH` | set in production | Client address behind the proxy, for the sign-in rate limit. Required behind any reverse proxy. |

</details>

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Pages load, but forms are rejected as submitted from a different address | Something between browser and pcbgit rewrites the `Host` header, or the page was opened at one address and posts to another. Check the reverse proxy passes `Host` through. |
| 502 from Caddy | pcbgit is starting or has stopped. Check `docker compose logs pcbgit`. |
| No certificate / HTTPS fails | DNS does not point at the server yet, or ports 80/443 are blocked. Check `docker compose logs caddy`. |
| A version shows "Render failed" | Open the board's **History** tab and view the render log. |
| Render log says "renderer unavailable" | The `renderer` container is not running. Check `docker compose ps` and `docker compose logs renderer`. |
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

<details>
<summary><b>Project layout</b></summary>

```
src/lib/server/
  db/              SQLite schema and queries
  auth.ts          passwords, sessions, access tokens
  git.ts           bare repositories, commits from uploads
  githttp.ts       git smart-HTTP (clone and push)
  projects.ts      boards, tags, stars, commit indexing
  render/          render queue, kicad-cli wrapper, parsers, GLB optimisation
  backups.ts       snapshots
  restore.ts       snapshot validation and restore
  updater.ts       update requests and status
src/lib/fab.ts     board-house profiles for the fabrication ZIPs
src/lib/i18n/      translations (en.json, de.json) and lookup
src/routes/
  [owner]/[project]/   board pages: overview, schematic, pcb, 3d, bom, drc, files, history
  git/                 git endpoint
  admin/               admin panel
scripts/render-runner.ts   the renderer container's entry point
deploy/
  docker-compose.prod.yml, Caddyfile   production setup
  install.sh, update.sh                server setup and updates
```

The render queue runs in the app, one job at a time. The tools it calls (kicad-cli,
iBOM, the thumbnail rasterisers) run in the `renderer` container, reached through
a socket on the shared render volume. Jobs interrupted by a restart are marked
failed at boot and can be retried from **Admin → Render queue**.

</details>

## License

pcbgit is © 2026 Michael Reuter and licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE).

You can use, modify and host pcbgit, including commercially. If you run a
modified version for others over a network, you must offer them its source code.
The footer's credit to the original project must be kept. See [NOTICE.md](NOTICE.md)
for the exact terms and for the licenses of third-party software pcbgit uses.
