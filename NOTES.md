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

### Editable tag categories
Tag categories were five fixed values, enforced by a CHECK on the tags table.
They are a table now (`tag_categories`), managed under Admin → Tags: add, rename,
recolour, reorder, delete. Built-in categories keep their translated names until
renamed. "Other" collects the tags of deleted categories and cannot be deleted.
The tags table is rebuilt once on boot with foreign keys off, since dropping it
with them on would have untagged every board. Checked on the local instance:
23 tags and 20 board links before and after.

Eagle support was scoped the same day: Eagle 6 and newer only (see TODO.md).

### Eagle projects render like KiCad ones
Old Eagle projects (Eagle 6 and newer) can be uploaded or pushed for archiving.
The schematic is translated by pcbgit's own converter, since kicad-cli cannot read
Eagle schematics (only KiCad's GUI can; scripting that GUI worked but was fragile
and heavy). The board goes through `kicad-cli pcb import`. Both run in the
isolated renderer; the converter's XML reader expands no entities and caps size
and depth. Boards are marked Native or Converted, converted ones warn on Gerbers
and checks, and offer the converted KiCad project as a download. Eagle before 6
(binary) is refused with a clear message. Board outlines drawn inside a footprint,
common in Eagle projects, now count for the board size (KiCad boards too).

## 2026-09-25

### Job directories checked, not only the files in them
Tracing the Eagle import against the render isolation rules showed a gap that
predates it: `readOutput(file, jobDir)` checked that a file stays inside the job
directory, but trusted the job directory itself. A compromised renderer could
rename its job directory and put a link to a /data directory in its place while
kicad-cli runs; the app would then read from /data, and `writeNew()` would create
files there. `trustedDir()` now requires every step from RENDER_DIR down to be a
real directory, for reads, writes and the schematic fallback. Only a swap in the
instant between check and open remains (TODO.md).

### Database evaluated: SQLite stays
For about 5 concurrent users and 200 boards, SQLite is more than enough: a test
database at 2.5 times that size answered the busiest page in 2.4 ms. Writes are
serialised in the one app process, so they never collide. A switch to PostgreSQL
is noted in TODO.md as low priority, for when several app instances or high
availability are needed, and then as a full switch rather than a choice at install.

### Converted schematics on full standard sheets
Converted Eagle sheets were sized to the coordinates written on the sheet (part
origins, wires), not to how far the symbols reach. Eagle's drawing frame is a
symbol placed at the origin, so it and parts near the edge were cut off
(TB6612FNG). Symbol extents now count, and each sheet goes on the smallest ISO
sheet that holds it (A4 up to A0, landscape or portrait), centred.

### Re-renders reach the browser
Public artifacts were cached as immutable, but a re-render writes new files under
the same commit id and names, so browsers kept showing the old schematic, 3D model
or thumbnail for up to a year. Artifact links now carry the time the file was
stored (`?v=…`), which changes with every render; only such links are cached for
good, unversioned ones for 5 minutes. Checked by re-rendering TB6612FNG: every
link and card thumbnail got a new version.

### Tests run on GitHub
A GitHub Actions workflow runs the tests and type checks on every push and pull
request, with Node 24 as in the Docker image, so a broken commit shows up before
a server updates to it.

### Servers pull the image instead of building it
The live server has 2 cores and 4 GB, and every update ran the npm install and
the app build next to the running site. GitHub Actions now builds the image of
each master commit that passes the tests and publishes it on GHCR, tagged with
the commit. An update pulls the image of exactly the commit it updates to,
waiting up to 20 minutes right after a push, and builds on the server only when
there is none. No admin panel switch: the choice follows from whether an image
exists, and `PCBGIT_UPDATE_IMAGE=build` in `.env` forces building.

### Updates explained in the panel, and automatic updates
The Instance page said "pulls and rebuilds" and showed one status line, so it was
unclear what an update would do and where it stood. The hourly check now also
asks whether the new commit's image is ready, still building on GitHub, failed,
or missing, and the page says what pressing Update will do in each case. A
running update shows its steps (fetch, wait for image, download or build,
restart), and the header says whether the running version was pulled or built.
Automatic updates can be switched on: the hourly check then installs a new
version once its image is ready, and does not retry one that failed. A download
or build that fails now moves the checkout back, so the server does not claim to
be up to date while the old version runs.

### Transparent fills no longer plotted solid red
On the Touch-Matrix board (render-isolation-test), the DF-Player symbol U7 showed
as a solid dark red block in the schematic, dark and light, and in the PDF. Its
body is a text box filled "with colour" at zero opacity, which KiCad's editor
draws as nothing but kicad-cli's plotter treats as unset and fills with the
outline colour. Such fills are now turned into no fill before export. Affected
boards need a re-render.

