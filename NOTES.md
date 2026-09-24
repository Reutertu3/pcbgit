# Notes

Major features and fixes, newest first, with the reason where it isn't obvious.
Times are local (CEST) and match the commit. Open work lives in TODO.md; working
rules for the code live in CLAUDE.md.

## 2026-09-24

### 21:00 · Downloads could crash the server
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
