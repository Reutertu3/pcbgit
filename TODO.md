# TODO

Open work on pcbgit, as of 2026-09-24. Registration is closed on pcbgit.com, so
items marked **before opening registration** only become real once strangers
can sign up.

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

### Eagle projects (for archiving)
Decided: Eagle 6 and newer only (XML files); older binary files are refused.
Tested 2026-09-24 with KiCad 10.0.6 on an Eagle 9.1 project:
- Board: `kicad-cli pcb import --format eagle` works. Items on Eagle layers
  without a KiCad equivalent (dimensions, documentation) land on `UNDEFINED`, and
  the board then refuses to load; moving them to `Dwgs.User` fixes it. After that
  layers, preview, Gerbers, drill, GLB (bare board, no part models) and DRC work.
- Schematic: `kicad-cli` cannot read Eagle schematics (only the GUI importer
  can). Show a placeholder and the original file; build the BOM from the
  schematic's XML parts list instead.
- [ ] Detect Eagle-only commits (`.brd`/`.sch` starting with `<eagle`), ignore
      backups (`.b#1`, `.s#1`), refuse pre-6 binary files with a clear message.
- [ ] Import step in the renderer before the normal pipeline; layer fix through
      `readOutput`/`writeNew`.
- [ ] BOM from the Eagle schematic XML.
- [ ] Mark such boards "converted from Eagle"; warn on Gerbers (Eagle poured
      copper at CAM time, KiCad refills zones with its own rules) and on DRC
      (KiCad default rules, not the project's).

## Security

Done in the audit of 2026-09-23 and after: open redirect after sign-in, sign-in
rate limit (async scrypt), frame/HSTS headers, capability-free containers,
render isolation (renderer container: no `/data`, no network, read-only,
limited), CSP for SVG artifacts, git checks on push (`receive.fsckObjects`),
symlinks leaving the render checkout removed (by real path, so chains of links
count too), renderer output read only as plain files inside the job's directory
(`render/outputs.ts`) and the app's own files there created exclusively, GLBs read
without external buffers, the schematic fallback confined to the checkout.

### Medium: before opening registration
- [ ] Git push size: `git-http-backend` accepts any pack size.
- [ ] Boards per user, and storage per user (repositories plus artifacts).
- [ ] Renders queued per user: one account can fill the single render worker.
- [ ] Rate limit for uploads and pushes, like the sign-in limit.
- [ ] Email verification, or admin approval, for new accounts.
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
      `/work` for a link between the app's realpath check and its open
      (`readOutput`), or while `tar` extracts a checkout. Closing it needs
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
- [ ] Artifact URLs need a version (e.g. `?v=<artifact id>`): public artifacts
      are cached as immutable, so browsers keep old files after a re-render.
- [ ] `/new` creates the board before committing the upload; if that fails, an
      empty board is left behind.
- [ ] `syncCommits()` only looks at the newest 200 commits of a branch.
