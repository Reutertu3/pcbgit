# TODO

Open work on pcbgit, as of 2026-09-26. Registration is closed on pcbgit.com, so
items marked **before opening registration** only become real once strangers
can sign up.

## Overview

Only what is left to do; details in the sections below. **Medium** comes first
when registration opens, **Review** means code nobody has audited yet, **Low**
and **Optional** wait until they matter, **Observe** is fixed but worth watching.

| Priority | Area | Item |
|---|---|---|
| Medium | Security | Limit the size of a `git push` (any pack size is accepted) |
| Medium | Security | Limit renders queued per user (one account can fill the render worker) |
| Medium | Security | Rate limit or CAPTCHA on registration; async `hashPassword` |
| Medium | Security | Email verification for new accounts (admin approval exists) |
| Medium | Fabrication | Test one real order or upload preview with each board house |
| Medium | Rendering | A re-render empties the viewers until it finishes (render into staging, swap) |
| Review | Security | `npm audit` and dependency updates (three.js, adm-zip, glTF Transform) |
| Review | Security | Snapshot restore: tar extraction and paths in `restore.ts` |
| Review | Security | Host-side updater (`install.sh`, `update.sh`, `/var/lib/pcbgit-control`) |
| Low | Accounts | Transfer ownership to another admin (only possible in the database now) |
| Low | Security | Renderer limits apply to the container, not to one render |
| Low | Security | Thumbnails may share `/work` with a running render |
| Low | Security | A compromised renderer can falsify its own GLB or iBOM output |
| Low | Security | Directory swap race in `/work` between check and open (needs `openat2`) |
| Low | Security | Full Content-Security-Policy for pages (`kit.csp`) |
| Low | Boards | `/new` leaves an empty board when the upload fails to commit |
| Low | Boards | `syncCommits()` only sees the newest 200 commits of a branch |
| Low | Eagle | Nets joined by name only show as separate nets in ERC |
| Low | Eagle | Mixed shown and hidden pin numbers in one symbol all show |
| Low | Eagle | Only one Eagle project per commit is rendered |
| Low | Eagle | Multi-sheet schematics tested with a synthetic file only |
| Low | Eagle | `>LAST_DATE_TIME` stays empty |
| Low | Database | PostgreSQL only if several app instances or HA are ever needed |
| Low | Front page | Board card hover is too busy; rethink the preview highlight |
| Low | Front page | Tag filter in the sidebar: group by category with subtle category labels |
| Optional | Fabrication | JLCPCB assembly files (CPL, BOM with LCSC numbers) |
| Optional | Fabrication | AISLER drill "2:4 precision", only if its import misreads ours |
| Optional | Rendering | Board as PDF (assembly drawings) |
| Observe | Front page | Card thumbnails blank until hovered after going back (likely fixed 2026-09-25) |

## Features

### Schematic as PDF: done
- [x] Every render exports all sheets into one PDF (`schPdfArgs`, artifact kind
      `schematic_pdf`), with KiCad's clickable links between sheets.
- [x] "PDF" in the Schematic tab toolbar, "Schematic (PDF)" in the overview's
      downloads panel.
- [x] Served with `Content-Disposition: attachment`: a PDF from the renderer is
      always saved, never opened as a document of pcbgit's origin.
- [ ] Optional: the same for the board (`pcb export pdf`), e.g. assembly drawings.
- Existing versions get the PDF after a re-render (**Admin → Boards → Re-render all**).

### Gerbers per board house: done
Every render makes one fabrication ZIP per profile in `src/lib/fab.ts`; the
overview has a "Gerbers" panel with a board-house dropdown (remembered per browser).
All profiles: only manufacturing layers (`fabricationLayers()`), zones refilled
(`--check-zones`), Excellon in mm with separate PTH/NPTH files.

- [x] **JLCPCB:** Protel extensions (`.gtl .gbl .gts .gbs .gto .gbo .gtp .gbp
      .gm1`), silkscreen clipped to the mask. Checked on `bq25170_eval`, whose
      copper layers are renamed "Front"/"Back".
- [x] **Generic:** KiCad file names with Gerber X2 attributes.
- [x] **AISLER:** its documented names (`<board>.toplayer.ger`, `.boardoutline.ger`,
      `.internalplane1.ger`, `drills_pth.xln`, `holes_npth.xln`, …), drill data in
      inches (community.aisler.net/t/99).
- [ ] AISLER asks for drill files in "2:4 precision". Ours are decimal inches
      with 4 decimals, which carries the same resolution; if AISLER's import ever
      misreads them, add `--excellon-zeros-format suppressleading` for AISLER.
- [ ] Test one real order (or AISLER's upload preview) with each profile.
- [ ] Versions rendered before this still have one `fabrication.zip` and show no
      dropdown until re-rendered (**Admin → Boards → Re-render all**).

#### Assembly files (JLCPCB SMT): medium, only if wanted
- [ ] CPL: `pcb export pos --format csv --units mm --side both --exclude-dnp`,
      columns renamed to Designator, Mid X, Mid Y, Layer (Top/Bottom), Rotation.
- [ ] BOM in JLCPCB's format (Comment, Designator, Footprint, LCSC Part #). It
      needs an `LCSC` field on the symbols; without one it is only a starting point.
- Rotation offsets: many footprints sit rotated compared with JLCPCB's parts
  library. That cannot be fixed generically; JLCPCB corrects it in its order
  preview. Say so next to the download.

### Eagle projects: done (2026-09-24)
Eagle 6 and newer are converted on render and marked **Converted** (native KiCad
projects: **Native**). Schematic: own converter (`render/eagle/`, run in the
renderer as `scripts/eagle-convert.ts`); board: `kicad-cli pcb import`. Tested with
Xino RF (Eagle 6.1) and XPlode (Eagle 9.1). Eagle before 6 is refused at upload
and on render. The GUI-importer route (Xvfb, xdotool; 435 MB, 11 s) was tested
and dropped as too fragile.

Open:
- [ ] Nets that Eagle joins by name only (segments without a wire between them):
      the drawing is right, but ERC and the netlist see separate nets. Adding
      labels would change the drawing, so it is left as a note on the checks tab.
- [ ] KiCad hides pin numbers per symbol, Eagle per pin: a symbol mixing shown and
      hidden pad numbers shows all of them.
- [ ] Several Eagle projects in one commit: only one is rendered (paired by name,
      highest version in the name wins); the render log says which.
- [ ] Multi-sheet Eagle schematics are tested with a synthetic file only; the
      root page is an index of the sheets, so the card thumbnail shows that.
- [ ] Eagle's `>LAST_DATE_TIME` stays empty (the file does not record it).

### Accounts (low priority)
- [ ] Transfer ownership: the owner (`users.is_owner`, see CLAUDE.md) cannot be
      demoted, disabled or deleted by other admins. Handing the role to another
      admin is only possible in the database so far; a "make owner" action for
      the owner on the Users page would do.

### Database: SQLite for now (low priority)
Evaluated 2026-09-25 for about 5 concurrent users and 200 boards: SQLite is more
than enough. At 500 boards, 10,000 versions and 600,000 BOM rows the busiest page
query took 2.4 ms. All writes come from one process through one connection, and
`node:sqlite` is synchronous, so writes never collide; `busy_timeout` covers
scripts run by hand.
- [ ] Consider PostgreSQL only if pcbgit needs several app instances, high
      availability or outside tools on the database. Cost: every query helper
      becomes async (229 call sites in 47 files, 6 transactions), SQLite-only SQL
      (`COLLATE NOCASE`, `rowid` order, upserts, migrations), backup/restore via
      `pg_dump`, an extra container. About 1–2 weeks as a full switch; offering
      both at install doubles that and every later feature, so switch, don't split.

## Security

Done in the audit of 2026-09-23 and after: limits per user (boards, storage,
uploads and pushes per hour) and admin approval of new accounts, open redirect after sign-in, sign-in
rate limit (async scrypt), frame/HSTS headers, capability-free containers,
render isolation (renderer container: no `/data`, no network, read-only,
limited), CSP for SVG artifacts, git checks on push (`receive.fsckObjects`),
symlinks leaving the render checkout removed (by real path, so chains of links
count too), renderer output read only as plain files inside the job's directory
(`render/outputs.ts`) and the app's own files there created exclusively, GLBs read
without external buffers, the schematic fallback confined to the checkout.

### Medium: before opening registration
- [ ] Git push size: `git-http-backend` accepts any pack size.
- [ ] Renders queued per user: one account can fill the single render worker.
- [ ] Email verification for new accounts (admin approval exists, and is on by
      default).
- [ ] Rate limit or CAPTCHA on registration; make `hashPassword` async like
      `verifyPassword`.

### Low: hardening
- [ ] Renderer limits (4 GB, 2 CPUs) apply to the container, not to one render:
      one huge board slows everyone's renders.
- [ ] Thumbnails can be made while a render runs, so `/work` may briefly hold
      another board's rendered SVG next to the current job.
- [ ] A compromised renderer can still falsify its own job's GLB or iBOM output
      (parsed in the browser, iBOM sandboxed).
- [ ] A process a compromised renderer leaves running could swap a directory in
      `/work` for a link between the app's checks (`trustedDir`, realpath) and its
      open (`readOutput`), or while `tar` extracts a checkout. A directory swapped
      *before* the check, e.g. while kicad-cli runs, is refused (2026-09-25). Closing it needs
      `openat2(RESOLVE_BENEATH)`, which Node does not offer, or a renderer that
      cannot keep processes alive between tool runs.
- [ ] Full Content-Security-Policy for pages (SvelteKit `kit.csp`); pages send
      only `frame-ancestors 'self'` so far.

### Not reviewed yet
- [ ] `npm audit` and dependency updates; three.js, adm-zip and glTF Transform
      handle untrusted files.
- [ ] Snapshot restore (admin only): tar extraction and paths in `restore.ts`.
- [ ] The host-side updater (`deploy/install.sh`, `update.sh`) and the
      permissions on `/var/lib/pcbgit-control`.

## Other known issues
- [ ] A re-render empties a board's viewers until it finishes
      (`clearArtifacts()` runs first). Render into a staging directory and swap.
- [ ] `/new` creates the board before committing the upload; if that fails, an
      empty board is left behind.
- [ ] `syncCommits()` only looks at the newest 200 commits of a branch.
- [ ] Board card hover does too much at once: outer accent glow, both previews
      zooming, the hovered one zooming further on a tinted backdrop with an
      accent underline opening from the middle of its bottom edge, and its label unfolding
      (`SCH · Schematic →`). Corner marks were tried and dropped
      (they clipped into the thumbnail); the old 2px frame and accent-filled
      label looked unprofessional. Keep the outer glow; pick one inner cue.
      Rules are the `board-card-*` classes in `app.css`.
- [ ] The tag filter on the front page (left sidebar) is one unsorted heap:
      `popularTags(24)` orders by board count, so components, interfaces,
      applications and layer counts are mixed. Group it by tag category, in the
      categories' order as on `/tags`, with a small, quiet label per group
      (not full headings). Decide what happens to the 24-tag cap per group.

## Observe
- [ ] Card thumbnails (SCH, PCB) sometimes stayed blank after going back to the
      front page until hovered: loaded, but not drawn. `decoding="async"` was
      removed from them on 2026-09-25 and a first test looked fine. If it comes
      back, note the browser; the next step is forcing a redraw when each
      thumbnail loads (`ProjectCard.svelte`).
