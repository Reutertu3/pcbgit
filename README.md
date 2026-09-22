# PCBHub

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
cp .env.example .env        # set PCBHUB_ADMIN_PASSWORD and PCBHUB_ORIGIN
docker compose up -d --build
```

Open `http://localhost:3000` and sign in as the admin from `.env`.
Everything mutable (the database, repositories and rendered artifacts) lives in the
`pcbhub-data` volume at `/data`.

`PCBHUB_ORIGIN` must be the URL people actually use, because form posts from any
other origin are rejected. Put a TLS-terminating reverse proxy in front for
anything beyond a LAN.

The image is based on `kicad/kicad:9.0-full`, which includes the 3D models.
If that tag is not available, or you want a smaller image, build with
`--build-arg KICAD_IMAGE=kicad/kicad:9.0`. The 3D view then shows bare boards.

## Pushing a board

1. Create a board at **New board**. It starts as an empty repository.
2. Create a token under **Settings → Access tokens**.
3. Push:

```sh
git remote add pcbhub http://localhost:3000/git/<you>/<board>.git
git push pcbhub main      # username: <you>, password: the token
```

Public boards can be cloned anonymously. Private boards need a token, and
pushing always needs one. PCBHub looks for the shallowest `.kicad_pro` and
renders its matching `.kicad_sch` and `.kicad_pcb`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PCBHUB_DATA_DIR` | `./data` (`/data` in Docker) | Database, repositories, artifacts |
| `PCBHUB_ADMIN_USER` / `_PASSWORD` / `_EMAIL` | `admin` / `changeme` | Created at boot whenever no active admin exists |
| `PCBHUB_KICAD_CLI` | `kicad-cli` | Path to the KiCad CLI |
| `ORIGIN` | — | Public URL (CSRF and clone URLs) |
| `BODY_SIZE_LIMIT` | `210M` in Docker | Maximum upload and push size |

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
