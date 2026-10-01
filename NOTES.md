# Notes

> [!NOTE]
> A plain log of what was worked on and why: one section per day, in order, a
> heading per milestone. Open work lives in [TODO.md](TODO.md); working rules for
> the code live in [CLAUDE.md](CLAUDE.md).

**Jump to:** [Releases](#releases) · [2026-09-22](#2026-09-22) · [2026-09-23](#2026-09-23) · [2026-09-24](#2026-09-24) · [2026-09-25](#2026-09-25) · [2026-09-26](#2026-09-26) · [2026-09-27](#2026-09-27) · [2026-09-28](#2026-09-28) · [2026-09-29](#2026-09-29) · [2026-09-30](#2026-09-30) · [2026-10-01](#2026-10-01)

## Releases

Each tag links to its release notes on GitHub.

| Tag | Date | Summary |
|---|---|---|
| [**v0.1**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.1) | 2026-09-22 | First deployable version |
| [**v0.2.0**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.2.0) | 2026-09-22 | Ready for deployment in a test environment; many bug fixes, faster 3D |
| [**v0.3.0**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.3.0) | 2026-09-23 | Production Gerbers, re-render all, isolated renderer, security audit |
| [**v0.3.1**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.3.1) | 2026-09-24 | Port setting, README images; also schematic PDF, license list, front-page filter and sort, settings form fix (not listed in its release notes) |
| [**v0.4.0**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.4.0) | 2026-09-24 | Collaborators, version notifications, messages page, profile pictures |
| ~~v0.4.1~~ | 2026-09-24 | Tagged on the v0.4.0 commit by mistake; its release was withdrawn and the fixes shipped as v0.4.2 |
| [**v0.4.2**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.4.2) | 2026-09-24 | Render isolation against symlink tricks, download crash fix, NOTES.md |
| [**v0.4.3**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.4.3) | 2026-09-24 | Preliminary Eagle support (Eagle 6+, Native or Converted) |
| [**v0.5.0**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.5.0) | 2026-09-25 | Servers pull the image GitHub Actions built, automatic updates, CI, re-rendered files reach the browser, Eagle sheets on standard sizes |
| [**v0.5.1**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.5.1) | 2026-09-25 | Transparent schematic fills no longer plotted red, tidier update section with an on/off slider |
| [**v0.5.2**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.5.2) | 2026-09-25 | Catppuccin Latte and Frappé themes, default theme renamed PCBgit, one switch for every on/off option |
| [**v0.6.0**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.0) | 2026-09-25 | Limits per user, approval of and notifications for new accounts, protected owner account, snapshots of any size |
| [**v0.6.1**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.1) | 2026-09-25 | Renderer memory and CPU limits and a minimum of free disk space in `.env` |
| [**v0.6.2**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.2) | 2026-09-25 | Admin panel at /admin-panel (admin profile at /admin), untranslated front page texts, thumbnails drawn without hover |
| [**v0.6.3**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.3) | 2026-09-26 | Updates follow releases (image built only for releases, Install button), master built on the server, last activity per user |
| [**v0.6.4**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.4) | 2026-09-26 | Update section in plain words: release name in the header, one-line explanation, hint under the build button |
| [**v0.6.5**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.5) | 2026-09-26 | Design audit (neutral tag chips, consistent headings, accessibility), calmer board card hover, toolbar menus no longer stack, server builds without Docker Hub for the build syntax |
| [**v0.6.6**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.6) | 2026-09-27 | Calmer board card hover: only the hovered preview reacts (tint, zoom, soft glow, label on a second line); card outline and name fade out slowly |
| [**v0.6.7**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.7) | 2026-09-27 | Tag requests (users ask, admins approve or decline), front page tags grouped by category with counts following the filters, `/tags` lists only tags in use, colour presets for categories |
| [**v0.6.8**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.8) | 2026-09-27 | Security fixes from a small audit (sign-in redirect, comment limit, reserved usernames, private boards over git, sign-in timing); NOTES and TODO easier to scan (image never built, see v0.6.9) |
| [**v0.6.9**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.6.9) | 2026-09-27 | Same as v0.6.8, whose image was never built: a flaky test (ties in the tag request order) failed its release run |
| [**v0.7.0**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.7.0) | 2026-09-27 | Optional two-factor sign-in, admins protected from each other, owner reset from the shell; footer and hero touch-ups |
| [**v0.7.1**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.7.1) | 2026-09-28 | Safer updates (snapshot before, health check and rollback after, capped logs), update section with lasting check results and a progress bar; CI checks each image before publishing it, releases come from a pushed tag, Dependabot |
| [**v0.7.2**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.7.2) | 2026-09-28 | Update check interval in the panel (hourly to monthly), footer source link follows the server's git remote (forks), README condensed with releases, CI and forking |
| [**v0.7.3**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.7.3) | 2026-09-29 | Security fix: one anonymous oversized or malformed git request could crash the server |
| [**v0.7.4**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.7.4) | 2026-09-29 | Registration protected against bots (per-address limit, honeypot, cap on waiting accounts), renders limited per owner, smooth panning in the 3D view |
| [**v0.8.0**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.8.0) | 2026-09-30 | LCSC part numbers in the BOM, STEP download instead of GLB, push size limit, the owner can require two-factor sign-in of admins, replace authenticator |
| [**v0.8.1**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.8.1) | 2026-10-01 | Scheduled snapshots with retention, optional copy to a second folder (NAS) |
| [**v0.8.2**](https://github.com/Reutertu3/pcbgit/releases/tag/v0.8.2) | 2026-10-01 | Interactive installer, first start from the release image, builds on ARM servers, update.sh by hand waits and shows its steps |

---

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

### Deployment, updates, license · `v0.1`
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

### Local hosting and version in the footer · `v0.2.0`
The site works on `localhost`, a hostname and the machine's plain IP at once.
SvelteKit's CSRF check allows only the one configured `ORIGIN`; the own check
(`csrf.ts`) compares a form's `Origin` with the `Host` of the same request, which
is as strict. Clone URLs show the address the visitor used (`origin.ts`). The
footer shows the running commit and release tag, linked to the source (AGPL
section 13).

---

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

### Production Gerbers and schematic PDF · `v0.3.0`
One fabrication ZIP per board house (JLCPCB, AISLER, Generic) with that fab's
file names and drill units, zones refilled before export. Labelled Experimental.
Tested with JLCPCB and AISLER uploads. Schematics also export as one PDF (after
the v0.3.0 tag, so shipped in v0.3.1).

---

## 2026-09-24

### Front page, licenses, settings forms
- Author filter instead of license filter; sort by name by default; the chosen
  sort is remembered in the `pcbgit_sort` cookie.
- License list reduced to CERN-OHL-S/W/P, MIT, CC BY-SA, CC BY-NC-SA and all
  rights reserved, each explained in words. Boards keep ids no longer offered.
- Fixed: saving board settings emptied name and description (Svelte 5 form
  reset); the "saved" note now sits next to the button.
- Published port configurable with `PCBGIT_PORT`.

### Images in project READMEs · `v0.3.1`
Relative image links in a board's README are served from the repository, images
only (never widened to other file types).

### Collaborators and profile pictures · `v0.4.0`
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

> [!WARNING]
> Still open: a race if a compromised renderer keeps a process running ([TODO.md](TODO.md)).

### Downloads could crash the server · `v0.4.2`
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

Eagle support was scoped the same day: Eagle 6 and newer only (see [TODO.md](TODO.md)).

### Eagle projects render like KiCad ones · `v0.4.3`
Old Eagle projects (Eagle 6 and newer) can be uploaded or pushed for archiving.
The schematic is translated by pcbgit's own converter, since kicad-cli cannot read
Eagle schematics (only KiCad's GUI can; scripting that GUI worked but was fragile
and heavy). The board goes through `kicad-cli pcb import`. Both run in the
isolated renderer; the converter's XML reader expands no entities and caps size
and depth. Boards are marked Native or Converted, converted ones warn on Gerbers
and checks, and offer the converted KiCad project as a download. Eagle before 6
(binary) is refused with a clear message. Board outlines drawn inside a footprint,
common in Eagle projects, now count for the board size (KiCad boards too).

---

## 2026-09-25

### Job directories checked, not only the files in them
Tracing the Eagle import against the render isolation rules showed a gap that
predates it: `readOutput(file, jobDir)` checked that a file stays inside the job
directory, but trusted the job directory itself. A compromised renderer could
rename its job directory and put a link to a /data directory in its place while
kicad-cli runs; the app would then read from /data, and `writeNew()` would create
files there. `trustedDir()` now requires every step from RENDER_DIR down to be a
real directory, for reads, writes and the schematic fallback. Only a swap in the
instant between check and open remains ([TODO.md](TODO.md)).

### Database evaluated: SQLite stays
For about 5 concurrent users and 200 boards, SQLite is more than enough: a test
database at 2.5 times that size answered the busiest page in 2.4 ms. Writes are
serialised in the one app process, so they never collide. A switch to PostgreSQL
is noted in [TODO.md](TODO.md) as low priority, for when several app instances or high
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

### Moving a server explained without .env edits
The README's steps for moving pcbgit to a new server went through a host folder
and `PCBGIT_IMPORT_SNAPSHOT`, although Admin → Backups already uploads and
restores snapshots. They now say: set the new server up, sign in, upload the
snapshot and restore it. The `.env` route stays for scripted setups.

### Updates explained in the panel, and automatic updates · `v0.5.0`
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

### Update section tidied · `v0.5.1`
On the Instance page, messages appeared at the top, far from the buttons that
caused them, and the texts were long. The update
section's messages (errors, "Checking GitHub…") now sit under its buttons,
confirmations it already shows elsewhere are gone, the texts are shorter, and
automatic updates are switched with a green/red on/off slider.

### One switch for every on/off option
The green/red slider for automatic updates looked crude. It is replaced by one
iOS-style switch (smooth slide, green when on, the knob stretching while pressed)
used for every on/off option: automatic updates and open registration, the
render queue's auto-refresh, DRC markers on the PCB view, the BOM's "changes
only", the 3D export options, "include rendered output" for snapshots and
"reinstall even if unchanged".

### Catppuccin themes · `v0.5.2`
Catppuccin Latte (light) and Frappé (dark) join the theme picker, with the colours
from the official palette and mauve as the accent. Unlike the other added themes,
they set their own button hover colour; the others still inherit the default
theme's green there. The default theme, Forest, is now called PCBgit.

### What the knowledge graph cannot see
Tracing the render chain and the weakly connected nodes in the graphify graph
showed more blind spots: the `storeArtifact()` calls in `render/worker.ts` are
missing, type references make no edges, calls from `.svelte` files are mostly
absent, and the graph is undirected. Noted in [CLAUDE.md](CLAUDE.md), so a low degree is not
read as dead code.

### Snapshots of any size can be uploaded
With 200 boards a snapshot runs to several GB, far above the 210 MB request
limit, and the old upload also held the whole file in memory twice, which a
4 GB server cannot do. Raising the limit would have applied to every request,
from anyone. Instead the browser now sends a snapshot in pieces of up to 32 MB
(`<name>.part-N` on the server), and the server joins them once all are in,
deleting each piece as it is appended, then checks the archive without blocking
other requests. Tested with a 324 MB snapshot: refused as one request, uploaded
in 10 pieces, byte-identical after joining, 97 MB peak memory.

### Limits per user and approval of new accounts
Before registration is opened, one account must not be able to fill the disk or
the render worker, and strangers should not get in unseen. Admins now set per
user: boards, storage (repositories plus rendered output, counted for the board
owner) and uploads plus pushes per hour (30 by default), as instance defaults
under Instance and per user under Users; admins have none. A refused push shows
the reason in git itself ("remote error: …"). New registrations wait for an
admin's approval by default; the Users page lists them first and the admin
navigation counts them. Tested with real pushes: a 1 MB storage limit, 1 push
per hour, 2 boards, and a registration through approval to sign-in.

### Sign-up notifications and a protected owner account · `v0.6.0`
Admins learned about new accounts only from the marker next to Users. Every
registration now sends active admins a notification ("… registered and waits
for your approval"), linking to the account; the notifications table was rebuilt
once so a notification can exist without a board. Any admin could also demote,
disable, delete or reset the password of the admin who set the instance up. That
account is now the owner (the `.env` admin, or the oldest admin on existing
instances): no one can demote, disable or delete it, and only the owner resets
its password. A separate "super admin" role was not needed for that.

### Resource settings: renderer limits and minimum free disk · `v0.6.1`
On a 2-core, 4 GB server the renderer's fixed limits (4 GB, 2 CPUs) were the
whole machine, so a large board could take the site down with it; and nothing
stopped uploads, pushes, snapshots or renders from filling the disk, which would
break the database and repositories. `PCBGIT_RENDER_MEMORY` and
`PCBGIT_RENDER_CPUS` in `.env` now set the renderer's limits (defaults
unchanged), and `PCBGIT_MIN_FREE_DISK` (1 GB by default) is always left free:
below it writes are refused for everyone and renders wait, as the render queue
page says. The app itself stays unlimited: it briefly holds uploads in memory,
and a hard limit would make it the process that gets killed.

### Front page texts written by the admin, never translated
The tagline was translated while it kept its stock wording, and the text under
it was fixed. Both are now settings under Instance (the text under the tagline
is new there), shown exactly as written in every language: an instance's own
words cannot be translated by pcbgit. The defaults are the old English texts;
an empty field hides it.

### Admin panel moved to /admin-panel
Every profile is at `/<username>`, and the admin panel sat at `/admin`, which is
also the default admin account's name. The panel won, so that account had no
profile page, and its boards named like admin pages (users, tags, …) were hidden
behind them. The panel is now at `/admin-panel`, a reserved username; `/admin` is
the admin account's profile like any other. Old bookmarks to `/admin/…` now lead
there.

### Card thumbnails that only appeared on hover · `v0.6.2`
Going back to the front page, some SCH or PCB thumbnails sometimes stayed blank
until the mouse moved over them. Nothing in the page hides them; hovering only
starts the zoom, which makes the browser redraw. The likely cause was
`decoding="async"` on thumbnails taken from the browser cache, which Firefox and
Chromium sometimes draw late. It is removed (`loading="lazy"` stays); the bug no
longer showed up in a first test, and is kept in [TODO.md](TODO.md) for observation.

---

## 2026-09-26

### Last activity tracked on the account
The Users page's "Last sign-in" was read from the newest session, but signing
out, a password change and expiry all delete sessions, so users turned into
"never"; and a 30-day session kept showing a sign-in from weeks ago while the
user was active daily, with pushes not counting at all. Accounts now keep
`last_login_at` (every sign-in) and `last_seen_at` (any signed-in request or
token use, written at most every 5 minutes). The column is "Last active", with
the last sign-in as its tooltip; existing accounts took their sign-in from the
sessions still there.

### Production follows releases, the button builds master · `v0.6.3`
Every commit pushed to master was a production candidate: CI built its image,
and automatic updates installed it within the hour, before it was tested or had
release notes. Now CI builds the image only for a published release (or a manual
run), automatic updates install only releases (tags vX.Y.Z, no pre-releases) by
pulling that image, and "Update from GitHub" builds the newest master commit on
the server. Neither goes backwards: after a build of master, automatic updates
wait for a release that comes after it. Tested against a local origin with
release tags: install, skip of a pre-release, build of master, refusal to go
back, the next release, a missing image, a failed release not retried, and a
first deploy.

With automatic updates off, the panel could name a new release but not install
it; an **Install v…** button next to it now does, as a download like an
automatic update.

### Update section in plain words · `v0.6.4`
On the live server the section's explanation read as one block of four
sentences, one said twice, with the image registry and "master" in it. It is now
one sentence at the top; the build button explains itself underneath, in plain
words; the registry is only mentioned for a server that builds releases itself;
and the header names the release ("v0.6.3 (a303f88) · downloaded"). The build
button is no longer the highlighted one: installing a release is the usual way.

### Builds on the server no longer need Docker Hub for the build syntax
"Update from GitHub" failed on the live server with a TLS timeout to Docker Hub,
before the build had started: the first line of the Dockerfile
(`# syntax=docker/dockerfile:1`) makes BuildKit fetch that frontend image on
every build. The Dockerfile uses nothing beyond the built-in syntax, so the line
is gone. Base images still come from Docker Hub, but only when they are not
cached on the server yet.

### Toolbar menus no longer stack
Opening the language, theme, notification and user menus one after another left
the earlier ones open on top of each other. Each closed on a click on the page,
but each button kept its own click from reaching the page, and so from the other
menus too. One shared state (`$lib/menus.svelte.ts`) now holds the open menu:
opening one closes the others, and a click on the page still closes it.

### A quieter, more consistent interface
A UI audit, aimed at keeping the site neutral and technical rather than adding
decoration. Tag chips were the loudest thing on every page (coloured fill,
border and text in four hues); they are now plain chips whose dot carries the
colour, except for a selected filter. Sidebar headings on the board page, the
about page and board settings use the same sentence-case headings as the main
panels; small uppercase labels stay for data (stat grids, layer groups). Counts
and sizes use tabular figures, but only where numbers are shown: Inter also
widens the hyphen under that setting, which spread "Self-hosted" apart when it
was set for the whole page. Headings balance their lines, reduced motion is
respected, keyboard users get a skip link, icon-only buttons have labels, and
files inside a folder are indented under it. On phones the start page's hero is
shorter and the filters fold behind a button, so boards start on the first
screen. The 404 page names what is missing ("Board not found", with the reason
it may be gone) instead of saying it twice. The board-card hover glow stays.

### Board card previews: a calmer hover
Hovering the schematic or board preview on a card drew a 2px accent frame inside
the glowing card and filled its label with the accent: two coloured shapes
nested in a coloured glow. Now the preview's backdrop takes a light accent tint,
the image zooms a little further than the rest of the card, an accent line opens
from the middle of its bottom edge (the active tab's marker, since the preview
opens that tab), and the label unfolds smoothly to say where it leads
(`SCH · Schematic →`, `PCB · Board →`).
Keyboard focus shows the same. Corner marks were tried and dropped: they clipped
into the thumbnails. It is still busy; [TODO.md](TODO.md) has it.

---

## 2026-09-27

### v0.6.5 was invisible to servers
The release was published with the tag `v.0.6.5`. `update.sh` only takes tags
of the form `vX.Y.Z` as releases, so servers kept reporting v0.6.4 as the
newest and nothing to install. A push to master after a release is harmless: a
release is installed whenever the running commit comes before it. Fixed by
tagging the same commit `v0.6.5` and publishing the release again.

### Board card hover, muted
Yesterday's hover still did too much. Hovering anywhere on a card zoomed both
previews, and the hovered one added a tint, more zoom, an underline and a
label that widened sideways. Now hovering the card only lights its outline.
Only the preview under the pointer reacts: a light tint, a small zoom, and its
label unfolds a second line below (`SCH`, then `Schematic →`). The underline
is gone. Dimming, then blurring the other preview was tried and dropped: any
change to the preview you are not pointing at pulls the eye away from the one
you are. The preview effects now also leave in 0.35s instead of 1.6s, so moving
across the grid leaves no trail of fading highlights; only the card's outline
keeps its slow fade.

Then a little more flourish for the hovered preview: a thin accent ring and a
soft accent glow that spills past its edges onto the card, a small copy of
the card's own glow. The previews' z-index moved from utilities into
`app.css`, so the hovered one sits above its neighbour and its glow is not
hidden under it. The card's outline now fades out over 2s, and the board name,
which takes the accent with it, fades back as slowly instead of blinking when the
pointer sweeps across the grid.

### Front page tags sorted by category
The tag filter on the left was one heap: the 24 most used tags, components,
interfaces, applications and layer counts mixed. It is now grouped by category,
in the categories' order, each under a small, light caption. Every category
shows its five tags used on the most public boards, plus any tag being filtered
by, so a selected one can always be switched off. A muted `+N` leads to that
category on `/tags` when there are more. Popularity is the public board count
`listTags()` already had; nothing new is stored. The grouping is one pure
helper (`$lib/taggroups.ts`) shared with `/tags`.

`/tags` now lists only tags some public board uses (an unused tag leads to an
empty list), in alphabetical order within each category. Admins still see and
manage every tag in the admin panel.

The sidebar's counts first stayed those of all public boards when filtering by
author (or search, or other tags). They are now counted over the boards the list
matches, with the same filters and visibility (`browseWhere()`, shared by
`browseProjects()` and `browseTagCounts()`): each number says how many boards
would be left after clicking that tag, and tags that would leave none drop out.

### Colour presets for tag categories
Categories in the admin panel only had the browser's colour input, while tags
also had a row of quick picks. Both now use one `ColorField` (colour input plus
swatches). The presets were three similar greens, a sand and no red or indigo;
they are now twelve hues around the wheel at a similar, muted lightness, and
a grey, so any pick reads on light and dark themes.

### Tag requests
Only admins create tags, so boards keep one spelling per tag; letting users
add their own would soon give ESP32S3 next to ESP32-S3 and USBC next to USB-C.
Users now ask for a missing tag on `/tags/request` (linked from the tag picker
and `/tags`): a name, one of the existing categories and an optional note.
Names are compared without case, spaces or punctuation, so another spelling of
an existing tag is refused with its name, and asking for a tag someone else
already asked for joins that request. At most five open requests per person.
Admins get a notification and a Requests list on the admin Tags page, where
they approve (name, category and colour adjustable) or decline with a reason.
An approved tag is added to the board it was asked from; everyone who asked is
notified either way. Admins creating a tag get the same spelling check. The
notifications table is rebuilt once for the two new kinds.

### Small security audit
A read-only pass over sign-in, git over HTTP, uploads, the Markdown and file
routes, tag requests and the updater found five problems, all fixed:
- **Open redirect after sign-in.** `safeNextPath()` refused `//host` and
  `/\host` but not `/<tab>/host`; browsers drop tabs and newlines while parsing,
  so a login link could send a freshly signed-in user to another site
  (reproduced locally). Control characters, whitespace and backslashes are now
  refused, and the path is kept only if resolving it stays on this site.
- **No limit on comments.** Every comment notifies the board's people, so one
  account could flood inboxes once registration opens. Comments now have an
  hourly limit per user (Instance → Limits, 60 by default, admins exempt).
- **Reserved usernames incomplete.** `stars`, `messages`, `notifications` and
  `avatars` are routes, so accounts with those names lost their profile or
  boards. They are reserved, and a test now checks every top-level route.
- **Private board names probeable over git.** Without credentials, a private
  board answered 401 and a missing one 404. Both now give the same 401 and text.
- **Registered emails visible through timing.** Signing in as nobody skipped
  the scrypt work. It now checks against a dummy hash, costing the same.

Left as low-priority hardening in [TODO.md](TODO.md): `git-http-backend` itself
would accept a push on authenticated reads; only pcbgit's own check prevents it.

### v0.6.8's image was never built · `v0.6.9`
The release run's tests failed, so GitHub skipped the image, and the panel
showed the build as failed; the same commit had passed on the push before it.
The tag-request test compared who asked in `created_at` order, and two
requests made in the same millisecond came back in either order (about 3 runs
in 8). The three orderings in `tagrequests.ts` now break ties by insertion
order (`rowid`); 30 runs of that test and 3 of the suite passed. v0.6.9 carries
the fix, so servers go straight from v0.6.7 to v0.6.9.

### Two-factor sign-in
Optional TOTP for every account, from **Settings → Two-factor sign-in**: a QR
code (and the key to type in) for any authenticator app, confirmed with a code,
then ten one-time recovery codes shown once. Signing in with the password then
leads to `/login/2fa`; only after the code is a session made, and it lasts the
usual 30 days, so nobody is asked again on every visit. Git over HTTP keeps
using access tokens. Codes work once (the used time step is stored), a pending
sign-in allows five wrong codes, and failures count towards the existing
sign-in limits; the account's count is no longer reset by the password alone.
Turning 2FA on signs out other devices; turning it off or new recovery codes
need the password. Admins can switch it off for a user who lost everything.

Admins could reset each other's passwords, and now 2FA, so one compromised admin
account was enough to take over the others. Resetting an admin's password or
2FA is now for the owner only, and so is demoting an admin: demoted, the account
is an ordinary user whose password any admin may reset. Admins change their own
under settings.

That left the owner with no way back after losing both password and 2FA: no
admin may reset it, and there is no mail. `scripts/reset-owner.ts`, run with
`docker compose exec` on the server, sets a new random password, prints it,
turns 2FA off and ends the owner's sessions. A shell on the server can reach
the database anyway, so it opens nothing new. A boot-time environment switch
was considered and dropped: left set, it would reset the owner at every restart. The TOTP maths is our own (RFC 6238, tested against its
vectors); the QR code comes from `uqr`, a small dependency-free encoder.

### Footer
The footer's left side showed the site name, then a fixed `pcbgit.com` link.
It is now the site name linking to the site itself, the licence, and Source
pointing at the repository root; the exact running commit is already linked on
the right.

---

## 2026-09-28

### Updates guarded before and after the switch
Servers install releases by themselves, but an update had no way back: migrations
run once at boot and cannot be undone, the update counted as done as soon as
`compose up` returned even if the app never started, and the previous image was
pruned right away. Now `update.sh`:
- **before switching** has the still-running old version take a snapshot without
  rendered output (`scripts/snapshot.ts`, `…-pre-update.tar.gz`, newest three
  kept, listed under Admin → Backups). `PCBGIT_UPDATE_SNAPSHOT=false` skips it.
- **keeps the previous image** as `pcbgit:previous` instead of pruning it.
- **after switching** waits up to five minutes for the new version's health check.
  If it fails, the previous image and checkout come back and the update ends as
  failed, so automatic updates skip that release. The data is left as it is:
  migrations so far only add, and older versions run on a newer database.

The panel shows the two new steps (back up, check it started). Tested on the
local instance: the snapshot from the running container (148 MB with all
repositories), and a deliberately broken image, found unhealthy after 82 s and
replaced by the previous one, which came back healthy.

Container logs were unlimited, which on a small server ends with a full disk.
Every service now keeps at most 5 × 10 MB.

The first update to this version still runs the old way: `update.sh` and the
container doing it are the old ones.

### Update section: checks that answer, and a progress bar
"Check now" often seemed to do nothing, and its "Checking GitHub…" note vanished
without a word about the result. The page knew a check was running only while
its request file existed, and the server's check usually ends within a second
or two, before the next reload could see the file. Now the page holds on to the
click: it counts as running until the server records a check that ended after
it (compared in server time, which the action returns), the button spins, and
the note turns into a result that stays until closed: when it checked, the
newest release and its image, and the new commits on master, or why the check
failed (including no answer within two minutes). "Check now" has its own form
now, apart from the update button. Updates get a progress bar: a segment per
step, the running one moving, and the elapsed time. Tested in Firefox against a
stand-in for the host script.

### CI catches broken releases before servers see them
Until now a release's image was built and published in one go, so an image that
did not start was installable at once, and a broken app build or Dockerfile only
showed when releasing. Now:
- **every push** also runs `npm run build`.
- **a release's image** is pushed as `:candidate`, started on the runner until its
  health check passes and a few pages answer, and only then tagged
  `sha-<commit>`, the version and `latest`, which is what servers look for.
- **release tags** other than `vX.Y.Z` (or `vX.Y.Z-suffix`) fail the job, rather
  than being silently skipped by servers as `v.0.6.5` was.
- **provenance and an SBOM** are published with the image.
- **base images** (node, ubuntu, caddy) are pinned by digest, and **Dependabot**
  proposes npm, action and base-image updates weekly as grouped pull requests.
- **the build context** leaves out docs, Markdown and tests, so editing NOTES or
  TODO no longer reruns the app build.
- **checkout and setup-node** moved from v4 to v7, off the deprecated Node 20.

The new image steps run only for a release or by hand, so they are first tried
with a manual run of the workflow.

### Releases from a pushed tag; Dependabot tuned
Releases were made by hand on GitHub, which is how `v.0.6.5` happened, and the
image only started building once the release was already public. Now a release
is a pushed tag `vX.Y.Z`: CI tests it, builds, starts and checks the image,
publishes it, and only then creates the GitHub release, so none appears without
its image. Its notes are the annotated tag's message, or the commit subjects
since the previous tag. GitHub's own generated notes would have been empty:
they list merged pull requests, and work goes straight to master. Tag messages
need `--cleanup=verbatim`, or git strips Markdown headings as comments (found
while testing the notes step on the real history).

Dependabot's first run opened eight pull requests. It now ignores major
versions of Node, Ubuntu and `@types/node` (the image runs Node 24; new majors
are decisions, in TODO) and groups the build toolchain's majors (vite, the
Svelte plugins, TypeScript), which only work together, into one pull request.

### README covers releases, CI and forking
The README explained updating from a server's side only; how a commit becomes a
release, and what a fork has to do, was nowhere. It now has "Releases and CI"
(the pipeline as a diagram, what each trigger runs, the release commands,
pre-releases, a failed run, Dependabot) and "Forking" (enable Actions, make the
image public, optionally Dependabot). The update routes became a table.

A fork's servers linked to this repository in the footer unless someone set
`PCBGIT_SOURCE_URL`, which the AGPL makes their duty for modified code. `update.sh`
now sets it from the server's git remote (credentials removed, ssh turned into
https); `.env` still overrides it.

### Update check interval in the panel; README condensed
The update check ran hourly, fixed in a systemd timer. It is now chosen in
Admin → Instance (hourly, daily, weekly, monthly), without touching systemd: the
timer still wakes `update.sh --check` every hour, and the script skips until the
last check is older than the chosen interval (a `check-interval` file in the
control folder, like the automatic-update switch). "Check now" always checks,
and a failed check is retried at the next wake-up. Automatic updates follow the
interval, since they install at a check. Tested: the skip decisions for each
interval, and the dropdown in Firefox writing the file.

The README was tightened throughout (about 4,000 → 3,600 words), keeping every
command and setting.

---

## 2026-09-29

### One anonymous request could crash the server
Looking into push size limits showed that pcbgit handed a git request's upload
straight to git without an error handler on that stream. Two things end it early:
git exits on a malformed request while the client is still sending (EPIPE), and
an upload over `BODY_SIZE_LIMIT` (210 MB) breaks off. Either raised an unhandled
stream error, which ends the Node process. A fetch from a public board needs no
account, so anyone could restart the server at will, again and again.
Reproduced on the local instance (restart count 0 → 1), fixed by handling both
ends in `runGitBackend()`, then the same requests left it running. A test sends
a request git rejects and an upload that breaks off; it fails with EPIPE on the
old code.

### Registration protected against bots, without a CAPTCHA
Before presenting pcbgit more widely: registration had no limit, so a bot could
create any number of accounts. With approval on they cannot do anything, but
each one notified every admin and cluttered the Users page, and each hashed its
password synchronously, stalling the whole server for tens of milliseconds. Now:
- **3 new accounts per address an hour**, counted like the sign-in limit (in
  memory, the proxy-aware client address). Only created accounts count, so a
  taken name costs nothing.
- **A honeypot field**, off-screen, hidden from screen readers and the tab order,
  never autofilled. A bot that fills it gets the "waiting for approval" page and
  no account.
- **At most 50 accounts waiting for approval**; beyond that registration pauses
  with a message until an admin catches up, which bounds bots spread over many
  addresses.
- **Password hashing is asynchronous** in every request handler (registration,
  password change, admin create and reset); the sync version stays for startup
  and scripts.

No CAPTCHA: a self-hosted proof-of-work one stays possible if bots get through.
Email verification is postponed: outgoing email is too much to set up for a lab
or homelab instance, and approval plus these limits cover a public one.

### Panning the 3D view is as smooth as rotating it
Rotating the board ran at 60 fps, panning (right drag) at about 40, in jumps. The
3D view renders only when OrbitControls reports a change, and it reports one
only when the camera moved more than a fixed 1e-3 units, or turned. KiCad models
are in metres, so that is a millimetre: a pan, which moves without turning,
raised no change until a millimetre had added up, and its damped glide stopped
short. The render loop now keeps drawing while a button is held and measures the
remaining motion against the model's size. Measured in Firefox with the same
slow drag: pan from ~41 to 60 fps, like rotation; the view is idle again 1.5 s
after letting go.

### Renders limited per owner, set by admins
There is one render worker, and one push of 200 commits queued 200 renders, so
everyone else waited for hours. Now each owner's boards may have a number of
renders waiting or running at once: an instance default under Instance → Limits
(10), overridable per user under Users, 0 for none, admins exempt, like the other
limits (`users.limit_queued_renders`). A push or upload with more new versions
than there is room for queues the newest and keeps the rest as "not rendered"
(`render_status = 'skipped'`, which existed but was never set); the board's
overview says so, and History's render button renders them, within the same
limit. Admin actions (re-render all, retry failed, the queue page) are not
limited.

## 2026-09-30

### LCSC part numbers in the BOM
Boards that carry a "LCSC Part" field on their symbols showed no part numbers
at all: the BOM export asked kicad-cli for a field named `MPN` and nothing
else, and kicad-cli only writes the fields it is asked for. In the local
projects `LCSC Part` is by far the most common part number field, and the
manufacturer's number is mostly called `Part Number`, rarely `MPN`.

The export now asks for every name in two lists (`MPN_FIELDS`, `LCSC_FIELDS`);
kicad-cli leaves the columns of fields a project lacks empty, and the first one
filled in is used. The LCSC number is its own column (`bom_items.lcsc`), in the
table, where it links to the part on lcsc.com and only appears on boards that
have any, and in the CSV download. The interactive BOM shows the fields the
board file itself carries. Lines are now split by LCSC number as well as value
and footprint, since that is what gets ordered; differing MPNs on one line stay
joined with a comma, as kicad-cli writes them. "Without an MPN" counts lines
with neither number. Versions rendered earlier need a re-render, and compared
with an earlier render every line with an LCSC number reads as replaced.

### Push size limit
A push could be any size up to the request limit (`BODY_SIZE_LIMIT`, 210 MB in
the image), where the upload simply broke off without a reason, and nothing
tied it to the disk. Git has its own limit, `receive.maxInputSize`, set per
request through the environment like the object checks: a larger pack is
refused with "pack exceeds maximum allowed size" and nothing of it is stored.
The limit is an instance setting next to the others (Admin → Instance, 200 MB
by default, 0 for none, admins exempt) and, for admins too, never more than
the disk has free above its minimum: the storage check before a push only saw
what was free then. Raising it past 210 MB needs `BODY_SIZE_LIMIT` raised too;
the form says where requests are cut off.

Trying it against the running image showed a logged error after the refused
push: `repoSize()` walked the repository while git was still removing the
refused pack's quarantine directory. It now counts what has vanished as 0.

### Visual diff of schematic and board: evaluated, postponed
Looked at what a diff between two versions could be built from, without
building it.

**What is there.** Every version has one SVG per schematic sheet, on the full
page in millimetres, so two versions of a sheet line up as they are unless the
paper size changed. The board has one SVG per layer, cropped to the board area,
and `commits.board_bbox` holds where that area lies in millimetres: two versions
can be placed in one frame even when the outline grew. The BOM diff already has
`?compare=<sha>` and a "compare with previous" link in History; a visual diff
should take the same parameter, so a base picked once carries across the BOM,
Schematic and PCB tabs.

**Approach.** In the browser, with CSS masks, per sheet or layer: the new
version in muted grey, removed (old minus new, `mask-composite: subtract`) in
red, added (new minus old) in green. Sharp at any zoom, no server work, no
storage, and it works for every version already rendered; KiRI and kidiff do
the same thing. With the two images aligned, an old/new toggle to blink between
them and a swipe slider come cheaply. On the board it is per layer, and the
layer toggles and front/back flip keep working.

**Not known yet.**
- Fringes: two versions offset by a fraction of a pixel (the outline changed)
  could show thin red and green edges around identical copper. The fallback is
  comparing rasterised images on a canvas with a threshold, which is more work
  and less sharp. A prototype on two real versions would settle it.
- Which sheets and layers changed at all: a file hash cannot tell. Two versions
  of bq25170_eval differ in every SVG, Edge.Cuts included, because kicad-cli
  writes a creation date into `<title>` and does not keep element order stable
  (two drill circles swapped). Badges like "3 of 12 layers changed" need a
  normalised comparison.
- False differences between versions rendered by different KiCad or pcbgit
  versions; re-rendering both fixes it, and the page should say so.
- Renamed sheets read as one removed, one added; versions never rendered
  cannot be compared.

**What it is not.** It shows where something changed, not what ("R5: 10k →
4k7", a renamed net). That needs a comparison of the parsed files, a much
larger feature; the BOM diff and the planned DRC/ERC diff cover part of it.

**Order, when it is taken up.** A prototype of the overlay on the PCB tab to
judge the fringes; then compare on Schematic and PCB with overlay, toggle and
slider, and links from History; later the badges and a list of changed regions
to jump to.

### The 3D download is a STEP
The download offered next to the 3D view was the viewer's GLB: a mesh, which
mechanical CAD cannot use for an enclosure. Every render now also runs
`kicad-cli pcb export step` (board body and component models as solids, with
pads, tracks and vias, zones and silkscreen; the bare board, tried first, was
not enough), and that is what the overview and the 3D tab offer, and what the viewer
offers when it cannot show the model. The GLB stays, for the viewer only.

On Touch-Matrix-LiPo the export takes about 18 s and writes 45 MB, 8 MB
gzipped (the bare board: 8 s, 15 MB, 2.7 MB). It counts against the owner's storage, so it is stored as
`board.step.gz` and served as the STEP: gzip passed through to clients that
accept it, unpacked for the rest. Versions rendered before have no STEP until
re-rendered, and no 3D download meanwhile.

The first try answered 500 on the real server while its test passed: the route
set `Content-Type` twice, which SvelteKit's `setHeaders()` refuses and the
test's stand-in allowed. The stand-in is as strict now.

### The owner can require two-factor sign-in of admins
An admin account controls the whole instance, and a user could be made admin
with nothing but a password. Whether that is acceptable is the owner's call: a
switch under Admin → Instance, "Administrators need two-factor sign-in", off by
default, which only the owner sees and can set (it binds the other admins).

With it on, promotion is refused unless the account has two-factor sign-in on,
with a message naming what is missing, and the role dropdown shows "Admin
(needs 2FA)" greyed out. Only the account itself can set 2FA up, so the panel's
"create user" then makes users only. A check at promotion alone would be undone
by turning 2FA off afterwards, so admins cannot: not in their settings, and not
by another admin or the owner from the panel. It comes off only once the
account is a user again; an admin who lost phone and recovery codes is made a
user by the owner, has 2FA turned off, sets it up anew and is promoted again.
With the switch off, everything is as before.

That would have left an admin with a new phone stuck, since switching
authenticators meant turning 2FA off and on. "Replace authenticator" (with the
password) sets up a new secret next to the one in use; a code from the new one
swaps them, makes new recovery codes and signs out other devices. It is there
for every account, whatever the switch says.

Left on the TODO: admins from before keep their role without 2FA (the switch
says how many), and the first admin made at startup has none. The owner's
command-line reset still turns the owner's off, as the way back in.

## 2026-10-01

### Scheduled snapshots
Snapshots were taken by hand and before updates only, and a homelab server
usually has no other backup. Admin → Backups now has a schedule: off (the
default), daily or weekly, at a set hour of server time, keeping the newest few
(7 by default), with or without rendered output (without by default: output is
most of the size and a restore renders everything again). A timer in the app
looks every 10 minutes whether the next slot has come; the first run is the
first slot after switching it on.

Retention only deletes snapshots the schedule made (label `scheduled`); manual,
uploaded and pre-update ones stay. The pre-update script's own "keep 3" now uses
the same helper. A snapshot that would not fit above the free-disk minimum,
judged by the size of the last scheduled one, is skipped and tried again an
hour later; the page shows the last result and the next run, with errors in the
viewer's language.

A snapshot on the same disk does not survive that disk. `PCBGIT_BACKUP_COPY_HOST`
in `.env` names a host folder (another disk, a NAS mount) that compose mounts at
`/backup-copy`; each scheduled snapshot is copied there under a temporary name,
then renamed, with the same retention. Compose's `${VAR:+…}` sets the app's
`PCBGIT_BACKUP_COPY_DIR` only when that is set; unset, an empty placeholder
folder is mounted instead, so one `.env` line is all it takes, with no change to
`update.sh` or the compose files. A copy that fails is reported, and the
snapshot still counts.

Tried on the local image: the timer took a snapshot a minute after start and
copied it into the mounted folder (148 MB without output, like the pre-update
one). The container runs on UTC, so the hour is UTC; the page says so.

### A reinstall showed two rough edges in the first start
The live server was reinstalled from a snapshot, following the README, and its
two install commands tripped over each other. `install.sh` ends by starting one
update check in the background, so the panel has something to show; that check
held the lock for its `git fetch` while `update.sh`, run right after as the
README says, found it taken and gave up with "An update or check is already
running". Run again, `update.sh` built for several minutes without printing a
line, since everything goes to its log, and looked hung.

Run by hand in a terminal, `update.sh` now waits for a running check or update
instead of giving up, and prints each step (the same ones the admin panel shows)
with the time, plus where the log is. Runs from systemd, which have no terminal,
behave as before.

### An installer that asks, and a first start that downloads
The same reinstall showed a third thing: the first start always built the image
on the server, even with `--release`, because the fresh clone was already at the
release commit and nothing ran yet. Building KiCad and its 3D models on a small
server takes a long time and far more disk than the 8 GB the README asked for,
while GitHub had already built and checked that release's image.

`install.sh`, run in a terminal, now does the whole first setup. It asks for the
settings and writes `.env` (keeping one that exists and asking only for what is
missing): the domain, checked to be bare and warned about when its DNS does not
point at the server; the administrator, with a generated password on request;
renderer limits suggested from the server's memory and cores; and an optional
snapshot copy folder, handed to uid 10001. The file is made readable by root
only. Then it offers what to start, with the free disk space: the newest release
as GitHub's image (the default), the same release built here, or master built
here. Without a terminal it behaves as before, for scripted installs.

On a first start, `update.sh --release` now installs the release even when the
checkout is at or past it: the checkout goes back to the tag, so the running
version and the checkout agree, and "Update from GitHub" can move on to master
later. A checkout with local edits still builds what it has.

GitHub builds images for amd64 only, and an ARM server (a Raspberry Pi) pulling
one would only fail its health check and roll back, which release updates could
already run into. The image check now compares the image's platforms with the
server's (`docker version`) and reports `arch` when none fits; the server then
builds the release itself, automatic updates included, and the panel says why.
`update.sh --release-info` prints the newest release and that state for the
installer, and `PCBGIT_UPDATE_IMAGE` in the environment overrides `.env` for one
run ("build this release here").

Tested without a server: the installer's `.env` part driven with scripted answers
(invalid domains and names refused, a domain that does not resolve reported, a
password with spaces quoted so compose reads it literally, a rerun keeping what
is set), the release probe from a clean clone (ready, built here, unreadable)
and with a stand-in `docker` claiming arm64 (arch).

### Upload progress, and dropped ZIPs that were never sent
Uploading a ZIP (a new board, a new version in board settings) showed only
"Uploading…" for as long as it took. SvelteKit's form handling uses fetch, which
cannot report upload progress, so both forms now post through XMLHttpRequest
(`$lib/uploadform.ts`) and show a bar with the bytes sent, then what the server
is doing. The result is applied as `use:enhance` would; a connection that breaks
off or the request size limit (an `error` result, which would have replaced the
page) becomes a message in the form. Without JavaScript the forms post as before.
The Backups page's bar is the same component now.

While at it: on `/new`, a ZIP dropped onto the drop zone only showed its name. It
never reached the file input, so it was not sent. The new submit sends the file
shown, dropped or picked.

