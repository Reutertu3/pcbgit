# Notes

Major features and fixes in the order they happened, one section per day, with
the reason where it isn't obvious. Open work lives in TODO.md; working rules for
the code live in CLAUDE.md.

## Releases

| Tag | Date | Summary |
|---|---|---|
| v0.1 | 2026-09-22 | First deployable version |
| v0.2.0 | 2026-09-22 | Ready for deployment in a test environment; many bug fixes, faster 3D |
| v0.3.0 | 2026-09-23 | Production Gerbers, re-render all, isolated renderer, security audit |
| v0.3.1 | 2026-09-24 | Port setting, README images; also schematic PDF, license list, front-page filter and sort, settings form fix (not listed in its release notes) |
| v0.4.0 | 2026-09-24 | Collaborators, version notifications, messages page, profile pictures |
| v0.4.1 | 2026-09-24 | Render isolation against symlink tricks, download crash fix |

## 2026-09-22

### Start
- First commit: SvelteKit app with SQLite, bare git repositories, ZIP upload and
  git push, and a render worker (kicad-cli) producing schematic, PCB layers,
  3D model, BOM and DRC/ERC. About 14,500 lines in 125 files.
- Backups: snapshots of the database and repositories, restore on boot.
- Briefly named "Kupfergit", renamed to pcbgit the same morning.
- 3D view options: mask, silkscreen and finish colours, SMD/THT visibility, ruler.
- 2D view fixed.
- Self-hosting as a personal git server: production compose file, Caddy, in-app
  updater.

### Deployment, updates, license · v0.1
- Production setup: `deploy/` with Caddy (HTTPS), `install.sh` and `update.sh`.
- Card thumbnails cached as WebP, which fixed slow front-page loads; sharper
  schematics and an export button.
- Update notifier in the admin panel, with changelog and one-click update.
- Licensed AGPL-3.0-or-later; NOTICE.md lists third-party components.

### Comments and uploads
- Replies to comments, and notifications for comments and replies.
- Users can only delete their own comments (admins any).
- Fixed a possible crash on ZIP upload: declared sizes are checked before
  anything is inflated, so a small archive cannot expand to gigabytes (200 MB cap).

### iBOM and languages
Interactive HTML BOM per render, following the selected colour theme. English and
German throughout, with a language switcher (`pcbgit-lang` cookie); the i18n test
keeps both files in step.

### 3D viewer: daughterboards, speed, scale objects
- A daughterboard model has its own "…_PCB" mesh; the real board is now the
  shallowest one, so it is no longer mistaken for the main board.
- Transparent parts no longer render with wrong opacity.
- GLBs are optimised at render time (`render/glb.ts`, meshopt): primitives joined
  by material and baked into world space, a fraction of KiCad's size, and the
  viewer no longer merges tens of thousands of primitives on every load.
- DRC markers land on the right spot; PCB view presets fixed.
- Scale comparison objects in the 3D view, including a procedurally modelled
  banana (Cavendish), for a sense of size.

### Local hosting and version in the footer · v0.2.0
The site works on `localhost`, a hostname and the machine's plain IP at once.
SvelteKit's CSRF check allows only the one configured `ORIGIN`; the own check
(`csrf.ts`) compares a form's `Origin` with the `Host` of the same request, which
is as strict. Clone URLs show the address the visitor used (`origin.ts`). The
footer shows the running commit and release tag, linked to the source (AGPL
section 13).

## 2026-09-23

### Rendering fixes
- Hierarchical schematics open on the root sheet (`sheet-0`).
- Boards with renamed copper layers render in 2D.
- "Re-render all" in the admin panel; Gruvbox Dark schematic colours.
- 3D viewer capped at 60 fps and loads faster.

### Security audit and render isolation
- Sign-in rate limit, open-redirect fix, security headers, CSP for SVG artifacts.
- kicad-cli, iBOM and the thumbnail tools moved into a separate `renderer`
  container: no `/data`, no network, read-only, limited.
- Containers run without Linux capabilities.
- Pushes are checked (`receive.fsckObjects`); escaping symlinks are removed
  from render checkouts.

### Production Gerbers and schematic PDF · v0.3.0
One fabrication ZIP per board house (JLCPCB, AISLER, Generic) with that fab's
file names and drill units, zones refilled before export. Labelled Experimental.
Tested with JLCPCB and AISLER uploads. Schematics also export as one PDF (after
the v0.3.0 tag, so shipped in v0.3.1).

## 2026-09-24

### Front page, licenses, settings forms
- Author filter instead of license filter; sort by name by default; the chosen
  sort is remembered in the `pcbgit_sort` cookie.
- License list reduced to CERN-OHL-S/W/P, MIT, CC BY-SA, CC BY-NC-SA and all
  rights reserved, each explained in words. Boards keep ids no longer offered.
- Fixed: saving board settings emptied name and description (Svelte 5 form
  reset); the "saved" note now sits next to the button.
- Published port configurable with `PCBGIT_PORT`.

### Images in project READMEs · v0.3.1
Relative image links in a board's README are served from the repository, images
only (never widened to other file types).

### Collaborators and profile pictures · v0.4.0
- Owners add existing users as collaborators (picked from a list). Collaborators
  can do everything except delete the board and manage collaborators; private
  boards are visible to them. Permissions go through `canView` / `canEdit` /
  `isOwner`.
- Notifications for new versions (uploads and pushes), sent to owner and
  collaborators except the pusher. Comment notifications reach collaborators.
- "Settings" became the user center; messages have their own page (`/messages`).
- Profile pictures: cropped to 256 px and re-encoded in the renderer, EXIF
  orientation applied, stored in the database so snapshots include them.

### Render isolation hardened against symlink tricks
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

### Downloads could crash the server
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
