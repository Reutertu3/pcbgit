# Notes

Major features and fixes, newest first, with the reason where it isn't obvious.
Times are local (CEST) and match the commit. Open work lives in TODO.md; working
rules for the code live in CLAUDE.md.

## Releases

| Tag | Date | Commit | Summary |
|---|---|---|---|
| (unreleased) | 2026-09-24 | `35581ce`, `5f86b22` | Render isolation against symlink tricks, download crash fix |
| v0.4.0 | 2026-09-24 13:27 | `5578525` | Collaborators, version notifications, messages page, profile pictures |
| v0.3.1 | 2026-09-24 12:23 | `b9f2aaf` | Port setting, README images; also schematic PDF, license list, front-page filter and sort, settings form fix (not listed in its release notes) |
| v0.3.0 | 2026-09-23 22:23 | `3cb5cd6` | Production Gerbers, re-render all, isolated renderer, security audit |
| v0.2.0 | 2026-09-22 21:06 | `b0f0b45` | Ready for deployment in a test environment; many bug fixes, faster 3D |
| v0.1 | 2026-09-22 13:14 | `45ccf70` | First deployable version |

## 2026-09-24

### 20:57 · Downloads could crash the server (`5f86b22`)
Three routes (artifacts, thumbnails, backup download) passed a Node file stream
straight to `new Response()`. Node's HTTP layer (undici) wraps such a stream in an
adapter that can close it a second time when the visitor disconnects near the end
of a download. That error cannot be caught and ends the process; Docker restarts
it, so it showed up as failed downloads and empty viewers. Reproduced with 30
parallel downloads (2 crashes). Files are now converted with `Readable.toWeb()`
(`$lib/server/filebody.ts`). The git backend stream had the same flaw after an
aborted clone and now drops output that arrives after a cancel. Checked with 120
parallel and 20 aborted downloads: no crash. The bug dated from the PDF export
commit (2026-09-23), not from the render hardening.

### 20:45 · Render isolation hardened against symlink tricks (`35581ce`)
The renderer container is meant to contain a hostile board file, but the app read
its output with calls that follow symlinks while `/data` was mounted. A
compromised renderer could have linked an output file to the database and had it
published as an artifact.
- Checkout symlinks are judged by where they really resolve (a chain of
  local-looking links counted as inside before); the walk no longer follows
  directory links, so a link to `/` cannot walk the filesystem.
- Renderer output is read only as plain files inside the job's own directory
  (`render/outputs.ts`); artifacts are stored from bytes, not paths.
- Files the app creates in the render directory use exclusive create.
- GLBs are read without loading external buffers; fab ZIPs and the optimised GLB
  stay in memory; the schematic fallback only reads sub-sheets in the checkout.
- The renderer refuses `--opt=/path`, `-o/path` and `..` arguments.

Still open: a race if a compromised renderer keeps a process running (TODO.md).

### 13:27 · Collaborators and profile pictures (`7349f9b`, `619c145`, `5578525`)
- Owners add existing users as collaborators (picked from a list). Collaborators
  can do everything except delete the board and manage collaborators; private
  boards are visible to them. Permissions go through `canView` / `canEdit` /
  `isOwner`.
- Notifications for new versions (uploads and pushes), sent to owner and
  collaborators except the pusher. Comment notifications reach collaborators.
- "Settings" became the user center; messages have their own page (`/messages`).
- Profile pictures: cropped to 256 px and re-encoded in the renderer, EXIF
  orientation applied, stored in the database so snapshots include them.

### 12:23 · Images in project READMEs (`b9f2aaf`)
Relative image links in a board's README are served from the repository, images
only (never widened to other file types).

### 00:20–01:45 · Front page, licenses, settings forms
- Author filter instead of license filter; sort by name by default; the chosen
  sort is remembered in the `pcbgit_sort` cookie.
- License list reduced to CERN-OHL-S/W/P, MIT, CC BY-SA, CC BY-NC-SA and all
  rights reserved, each explained in words. Boards keep ids no longer offered.
- Fixed: saving board settings emptied name and description (Svelte 5 form
  reset); the "saved" note now sits next to the button.
- Published port configurable with `PCBGIT_PORT`.

## 2026-09-23

### 22:23–22:38 · Production Gerbers and schematic PDF (`3cb5cd6`, `4923ac1`)
One fabrication ZIP per board house (JLCPCB, AISLER, Generic) with that fab's
file names and drill units, zones refilled before export. Labelled Experimental.
Tested with JLCPCB and AISLER uploads. Schematics also export as one PDF.

### 20:33–21:59 · Security audit and render isolation (`e6c7a05`, `6eabc84`, `8d58a29`, `03742b9`)
- Sign-in rate limit, open-redirect fix, security headers, CSP for SVG artifacts.
- kicad-cli, iBOM and the thumbnail tools moved into a separate `renderer`
  container: no `/data`, no network, read-only, limited.
- Containers run without Linux capabilities.
- Pushes are checked (`receive.fsckObjects`); escaping symlinks are removed
  from render checkouts.

### 20:13–21:47 · Rendering fixes (`4c1bd19`, `2a0d551`, `eecc01b`, `cfc77d3`)
- Hierarchical schematics open on the root sheet (`sheet-0`).
- Boards with renamed copper layers render in 2D.
- "Re-render all" in the admin panel; Gruvbox Dark schematic colours.
- 3D viewer capped at 60 fps and loads faster.

## 2026-09-22

### 21:06–21:48 · Local hosting and version in the footer (`b0f0b45`, `32cdbfe`) · v0.2.0
The site works on `localhost`, a hostname and the machine's plain IP at once.
SvelteKit's CSRF check allows only the one configured `ORIGIN`; the own check
(`csrf.ts`) compares a form's `Origin` with the `Host` of the same request, which
is as strict. Clone URLs show the address the visitor used (`origin.ts`). The footer shows the running
commit and release tag, linked to the source (AGPL section 13).

### 18:27–19:41 · 3D viewer: daughterboards, speed, scale objects (`96f65e4`, `9a9d57f`, `e6fc8b1`, `f06d9e7`, `9bed873`, `d69f7e0`)
- A daughterboard model has its own "…_PCB" mesh; the real board is now the
  shallowest one, so it is no longer mistaken for the main board.
- Transparent parts no longer render with wrong opacity.
- GLBs are optimised at render time (`render/glb.ts`, meshopt): primitives joined
  by material and baked into world space, a fraction of KiCad's size, and the
  viewer no longer merges tens of thousands of primitives on every load.
- DRC markers land on the right spot; PCB view presets fixed.
- Scale comparison objects in the 3D view, including a procedurally modelled
  banana (Cavendish), for a sense of size.

### 15:59–16:43 · iBOM and languages (`9b45dc6`, `6f791c8`)
Interactive HTML BOM per render, following the selected colour theme. English and
German throughout, with a language switcher (`pcbgit-lang` cookie); the i18n test
keeps both files in step.

### 14:34–15:13 · Comments and uploads (`f8cfb38`, `acc51ce`, `0e247ec`, `5ad9a3d`)
- Replies to comments, and notifications for comments and replies.
- Users can only delete their own comments (admins any).
- Fixed a possible crash on ZIP upload: declared sizes are checked before
  anything is inflated, so a small archive cannot expand to gigabytes (200 MB cap).

### 13:14–14:24 · Deployment, updates, license (`45ccf70`, `3e921f0`, `6ed4c1b`, `75ec9a4`) · v0.1
- Production setup: `deploy/` with Caddy (HTTPS), `install.sh` and `update.sh`.
- Card thumbnails cached as WebP, which fixed slow front-page loads; sharper
  schematics and an export button.
- Update notifier in the admin panel, with changelog and one-click update.
- Licensed AGPL-3.0-or-later; NOTICE.md lists third-party components.

### 08:21–12:03 · Start (`e031ca4` … `e6b2a1b`)
- 08:21 · First commit: SvelteKit app with SQLite, bare git repositories, ZIP
  upload and git push, and a render worker (kicad-cli) producing schematic, PCB
  layers, 3D model, BOM and DRC/ERC. About 14,500 lines in 125 files.
- 10:03 · Backups: snapshots of the database and repositories, restore on boot.
- 10:10 · Briefly named "Kupfergit"; renamed to pcbgit at 11:54.
- 10:47–11:31 · 3D view options: mask, silkscreen and finish colours, SMD/THT
  visibility, ruler.
- 11:54 · 2D view fixed.
- 12:03 · Self-hosting as a personal git server: production compose file,
  Caddy, in-app updater.
