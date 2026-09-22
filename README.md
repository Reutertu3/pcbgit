# pcbgit

A self-hosted, GitHub-style repository for KiCad hardware projects. Push a
board with `git` (or upload a ZIP) and every commit is rendered automatically:

- **Schematic**: every sheet, with pan and zoom
- **PCB 2D**: stacked, toggleable layers, front/back flip and DRC markers on the board
- **PCB 3D**: the assembled board with components (GLB, three.js)
- **BOM**: grouped line items, CSV export and a diff between any two versions
- **DRC / ERC**: KiCad's own checks, grouped by severity
- **Version history**: per-commit renders, render logs and source ZIPs
- **Admin panel**: users, boards, tags, render queue and instance settings

Storage is SQLite (`node:sqlite`, no native modules) plus bare git repositories
on disk. Rendering uses `kicad-cli`, which the Docker image provides.

## Run with Docker

```sh
cp .env.example .env        # set PCBGIT_ADMIN_PASSWORD and PCBGIT_ORIGIN
docker compose up -d --build
```

Open `http://localhost:3000` and sign in as the admin from `.env`.
Everything mutable (the database, repositories and rendered artifacts) lives in the
`pcbgit-data` volume at `/data`.

`PCBGIT_ORIGIN` must be the URL people actually use, because form posts from any
other origin are rejected. Put a TLS-terminating reverse proxy in front for
anything beyond a LAN.

The image is `ubuntu:24.04` with KiCad 10 installed from the official
`ppa:kicad/kicad-10.0-releases`. The component 3D model library is several GB;
for a smaller image build with `--build-arg INSTALL_3D_MODELS=false`, and the
3D view then shows bare boards.

## Backups and fast deployment

**Admin → Backups** creates a snapshot: one `.tar.gz` with the database, every
git repository and, optionally, the rendered output. Snapshots can be downloaded,
uploaded (checked before anything changes) and restored. A restore moves the
current data aside into `backups/pre-restore-<time>/` instead of deleting it, and
under Docker the server restarts to apply it.

To stand up a new server from a snapshot, mount the file and point
`PCBGIT_IMPORT_SNAPSHOT` at it. It is imported on first boot of an empty
volume and ignored once the instance has data:

```sh
docker run -d -p 3000:3000 -v pcbgit-data:/data \
  -v ./pcbgit-snapshot.tar.gz:/import/snap.tar.gz:ro \
  -e PCBGIT_IMPORT_SNAPSHOT=/import/snap.tar.gz \
  -e ORIGIN=https://pcb.example.com pcbgit:latest
```

The imported instance keeps the snapshot's accounts, so sign in with the admin
password from the old server. Snapshots larger than the upload limit can be
copied into `/data/backups/` directly, and they then appear in the list.

## Deploy to a public server

Tested layout: a Debian VPS, Docker, and Caddy in front for HTTPS. pcbgit itself
is never exposed directly; Caddy gets the Let's Encrypt certificate and proxies.
The build brings its own KiCad, so plan for about 2 GB of RAM and 8 GB of free disk.

**1. Prepare the server** (as root, once)

```sh
# Docker from Docker's own repository (Debian's is too old for the compose file)
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Point your domain's DNS A (and AAAA) record at the server, and allow ports 22, 80
and 443 (for example `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable`).

**2. Get the code and configure it**

```sh
git clone https://github.com/<you>/pcbgit.git /opt/pcbgit
cd /opt/pcbgit
cp .env.example .env
nano .env        # PCBGIT_DOMAIN and a long random PCBGIT_ADMIN_PASSWORD
```

For a private repository, add a read-only [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
and clone with the `git@github.com:` URL instead.

**3. Install the update watcher and start**

(Moving an existing instance? Do the snapshot step below between these two commands.)

```sh
sudo deploy/install.sh     # control folder + systemd units; checks .env
sudo deploy/update.sh      # first build and start (takes a while)
```

Open `https://<your domain>`, sign in as the admin from `.env`, and in
**Admin → Instance** consider switching off open registration.

**Moving an existing instance over:** create a snapshot in Admin → Backups, copy
it to the server as `/var/lib/pcbgit-control/import.tar.gz` (after `install.sh`,
before the first `update.sh`), and add to `.env`:

```sh
PCBGIT_IMPORT_SNAPSHOT=/control/import.tar.gz
```

It is imported on the first start only; delete the file and the line afterwards.
The imported instance keeps its accounts, so sign in with your existing admin.

### Updating

Push to GitHub, then either press **Update from GitHub** in Admin → Instance or
run `sudo deploy/update.sh` over SSH. Both pull (fast-forward only), rebuild and
restart; the site is down for a few seconds. The panel shows the running commit,
the result and the log. If the server copy has local commits the update stops
instead of merging, and the log says so.

The container cannot run anything on the host: the button only drops a request
file into `/var/lib/pcbgit-control`, which the `pcbgit-update.path` systemd unit
watches. `systemctl status pcbgit-update.service` shows the last run.

## Pushing a board

1. Create a board at **New board**. It starts as an empty repository.
2. Create a token under **Settings → Access tokens**.
3. Push:

```sh
git remote add pcbgit http://localhost:3000/git/<you>/<board>.git
git push pcbgit main      # username: <you>, password: the token
```

Public boards can be cloned anonymously. Private boards need a token, and
pushing always needs one. pcbgit looks for the shallowest `.kicad_pro` and
renders its matching `.kicad_sch` and `.kicad_pcb`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PCBGIT_DATA_DIR` | `./data` (`/data` in Docker) | Database, repositories, artifacts |
| `PCBGIT_ADMIN_USER` / `_PASSWORD` / `_EMAIL` | `admin` / `changeme` | Created at boot whenever no active admin exists |
| `PCBGIT_KICAD_CLI` | `kicad-cli` | Path to the KiCad CLI |
| `ORIGIN` | — | Public URL (CSRF and clone URLs) |
| `BODY_SIZE_LIMIT` | `210M` in Docker | Maximum upload and push size |
| `PCBGIT_IMPORT_SNAPSHOT` | — | Snapshot to import on first boot of an empty instance |
| `PCBGIT_RESTART_ON_RESTORE` | `true` in Docker | Exit after staging a restore so the restart policy applies it |
| `PCBGIT_DOMAIN` | — | Public domain, used by Caddy and for `ORIGIN` in the production compose file |
| `PCBGIT_CONTROL_DIR` | `/control` in production | Folder shared with the host update watcher; unset disables in-app updates |

Without `kicad-cli`, versions are still tracked, and board statistics and a BOM are
parsed directly from the KiCad files. Schematic, layer, 3D and DRC output needs
KiCad.

## Development

```sh
npm install
npm run dev               # http://localhost:5173
npm test                  # parser + end-to-end pipeline tests
npm run check             # svelte-check / TypeScript
npm run seed              # optional demo boards (synthetic KiCad fixtures)
```

Requires Node 24+ (for built-in `node:sqlite` and type stripping) and git.
After editing `src/lib/server/db/schema.sql`, run `npm run schema`. Columns added
to existing tables also need an entry in `ADDED_COLUMNS` in `db/index.ts`.

## Layout

```
src/lib/server/
  db/          SQLite schema and query helpers
  auth.ts      scrypt passwords, sessions, access tokens
  git.ts       bare repos, commits from uploads, tree reads
  githttp.ts   git-http-backend CGI bridge (clone/push)
  projects.ts  boards, tags, stars, commit indexing
  render/      job queue, kicad-cli wrapper, KiCad/BOM/DRC parsers
src/routes/
  [owner]/[project]/   overview, schematic, pcb, 3d, bom, drc, files, history, settings
  git/                 smart-HTTP git endpoint
  admin/               admin panel
```

The render worker runs in-process and handles one job at a time. Jobs
interrupted by a restart are marked failed at boot and can be retried from
the admin queue.
