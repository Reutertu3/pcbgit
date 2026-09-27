# TODO

> [!NOTE]
> Open work on pcbgit, as of 2026-09-27. Registration is closed on pcbgit.com, so
> items marked **before opening registration** only become real once strangers
> can sign up. What was done, and why, is in [NOTES.md](NOTES.md).

**Jump to:** [Open work](#open-work) · [Feature roadmap](#feature-roadmap) · [Features](#features) · [Security](#security) · [Other known issues](#other-known-issues) · [Observe](#observe)

| | Priority | Meaning |
|---|---|---|
| 🔴 | **High** | Roadmap: the core of reviewing hardware in git |
| 🟠 | **Medium** | Open work: comes first when registration opens. Roadmap: common gaps |
| 🔍 | **Review** | Code nobody has audited yet |
| 🟡 | **Low** | Waits until it matters |
| ⚪ | **Optional** | Needs outside services, is a niche, or only if wanted |
| 👀 | **Observe** | Fixed, but worth watching |

## Open work

Only what is left to do; details in the linked sections.

| Priority | Area | Item | Details |
|---|---|---|---|
| 🟠 Medium | Security | Limit the size of a `git push` (any pack size is accepted) | [Security](#medium-before-opening-registration) |
| 🟠 Medium | Security | Limit renders queued per user (one account can fill the render worker) | [Security](#medium-before-opening-registration) |
| 🟠 Medium | Security | Rate limit or CAPTCHA on registration; async `hashPassword` | [Security](#medium-before-opening-registration) |
| 🟠 Medium | Security | Email verification for new accounts (admin approval exists) | [Security](#medium-before-opening-registration) |
| 🟠 Medium | Fabrication | Test one real order or upload preview with each board house | [Gerbers](#gerbers-per-board-house) |
| 🟠 Medium | Rendering | A re-render empties the viewers until it finishes (render into staging, swap) | [Known issues](#other-known-issues) |
| 🔍 Review | Security | `npm audit` and dependency updates (three.js, adm-zip, glTF Transform) | [Not reviewed](#not-reviewed-yet) |
| 🔍 Review | Security | Snapshot restore: tar extraction and paths in `restore.ts` | [Not reviewed](#not-reviewed-yet) |
| 🔍 Review | Security | Host-side updater (`install.sh`, `update.sh`, `/var/lib/pcbgit-control`) | [Not reviewed](#not-reviewed-yet) |
| 🟡 Low | Accounts | Transfer ownership to another admin (only possible in the database now) | [Accounts](#accounts) |
| 🟡 Low | Security | Renderer limits apply to the container, not to one render | [Hardening](#low-hardening) |
| 🟡 Low | Security | Thumbnails may share `/work` with a running render | [Hardening](#low-hardening) |
| 🟡 Low | Security | A compromised renderer can falsify its own GLB or iBOM output | [Hardening](#low-hardening) |
| 🟡 Low | Security | Directory swap race in `/work` between check and open (needs `openat2`) | [Hardening](#low-hardening) |
| 🟡 Low | Security | Full Content-Security-Policy for pages (`kit.csp`) | [Hardening](#low-hardening) |
| 🟡 Low | Security | `git-http-backend` would accept a push on authenticated reads (`http.receivepack=false`) | [Hardening](#low-hardening) |
| 🟡 Low | Boards | `/new` leaves an empty board when the upload fails to commit | [Known issues](#other-known-issues) |
| 🟡 Low | Boards | `syncCommits()` only sees the newest 200 commits of a branch | [Known issues](#other-known-issues) |
| 🟡 Low | Eagle | Nets joined by name only show as separate nets in ERC | [Eagle](#eagle-projects) |
| 🟡 Low | Eagle | Mixed shown and hidden pin numbers in one symbol all show | [Eagle](#eagle-projects) |
| 🟡 Low | Eagle | Only one Eagle project per commit is rendered | [Eagle](#eagle-projects) |
| 🟡 Low | Eagle | Multi-sheet schematics tested with a synthetic file only | [Eagle](#eagle-projects) |
| 🟡 Low | Eagle | `>LAST_DATE_TIME` stays empty | [Eagle](#eagle-projects) |
| 🟡 Low | Database | PostgreSQL only if several app instances or HA are ever needed | [Database](#database-sqlite-for-now) |
| ⚪ Optional | Fabrication | JLCPCB assembly files (CPL, BOM with LCSC numbers) | [Assembly files](#assembly-files-jlcpcb-smt) |
| ⚪ Optional | Fabrication | AISLER drill "2:4 precision", only if its import misreads ours | [Gerbers](#gerbers-per-board-house) |
| ⚪ Optional | Rendering | Board as PDF (assembly drawings) | [Schematic as PDF](#schematic-as-pdf) |
| 👀 Observe | Front page | Card thumbnails blank until hovered after going back (likely fixed 2026-09-25) | [Observe](#observe) |

## Feature roadmap

What a KiCad-centred git host could still offer, sized for a homelab up to a
medium team (a few dozen people, a few hundred boards). **High** is the core of
reviewing hardware in git and can reuse what renders already store; **Medium**
fills common gaps; **Low** matters once several people or tools share an
instance; **Optional** needs outside services or is a niche.

### 🔴 High

- **Visual diff of schematic and board between two versions** · _Review_ \
  The question every hardware review asks ("what changed?"), and git cannot
  answer it for KiCad files. Each commit already has per-sheet and per-layer
  SVGs: overlay two (slider, onion skin, or added/removed in two colours).
- **Revisions from git tags (Rev A, Rev B), and marking a version as ordered** · _Versions_ \
  Which commit went to the board house is what matters months later. Show tags
  in the history and version picker; per version a "fabricated" note (date,
  board house, quantity), so a batch on the bench can be traced to its files.
- **New and fixed DRC/ERC violations against the previous version** · _Checks_ \
  Hundreds of warnings hide the two new ones. Violations are stored per commit
  already; compare by type and position.
- **Render health on the overview: missing libraries, footprints or 3D models, files from a newer KiCad** · _Rendering_ \
  Today a missing 3D model just leaves a gap in the 3D view. kicad-cli reports
  these in its output; collect them per render and show a short warning list.
- **Require two-factor sign-in for admins; passkeys** · _Accounts_ \
  Optional TOTP with recovery codes is in (NOTES, 2026-09-27), but an admin
  account controls the whole instance and may still sign in with a password
  alone. An admin setting to make it mandatory for admins; passkeys (WebAuthn)
  as a second kind of factor.
- **Scheduled snapshots with retention (e.g. daily, keep 7)** · _Operations_ \
  Snapshots are manual only; a homelab server usually has no other backup. A
  timer in the app, a retention count and a free-disk check; optionally copy to
  a second path (NAS mount).

### 🟠 Medium

- **Part search across boards ("which boards use TPS62130?")** · _Parts_ \
  BOM lines with value, footprint and MPN are in the database; a search over
  them, limited to what the viewer can see, answers where a part is used before
  it is discontinued or reordered.
- **Comments pinned to a spot on a schematic sheet or board layer** · _Review_ \
  Comments are per board now; reviews point at a net or a footprint. Store sheet
  or layer plus coordinates, show markers in the viewers, allow resolving.
- **STEP export next to the GLB** · _Mechanics_ \
  Enclosure design needs STEP, not GLB; `kicad-cli pcb export step` in the
  renderer, as one more artifact.
- **Several KiCad projects in one repository** · _Boards_ \
  Only the shallowest `.kicad_pro` is rendered (`kicadfiles.ts`). Let the board
  settings pick the project, or show one board per project in the repository.
- **Branches other than the default one** · _Versions_ \
  Experiments and next revisions often live on branches; render them on request
  and choose the branch in the version picker.
- **Pull mirror from GitHub, GitLab or Forgejo** · _Hosting_ \
  Many KiCad projects already live elsewhere; fetch on a schedule (and on a
  webhook) so they render here without moving.
- **Email (SMTP) and webhooks (ntfy, Matrix, Discord, generic JSON)** · _Notifications_ \
  Notifications only exist in the app. Email also unlocks the email-verification
  item above; webhooks for new versions, failed renders and tag requests.
- **Single sign-on with OIDC (Authentik, Keycloak, Authelia)** · _Accounts_ \
  The usual way homelabs and small companies share accounts; local accounts stay
  for admins.
- **Board spec sheet on the overview** · _Fabrication_ \
  Layers, thickness, finish, copper weight, minimum track, clearance and drill,
  read from the board setup and design rules: what a board house asks for a quote.

### 🟡 Low

| Area | Item | Why |
|---|---|---|
| Accounts | Organisations or teams that own boards | Beyond per-board collaborators, once a group shares many boards |
| Hosting | Embeddable images and badges | Stable URLs for a board's latest render, 3D image and a DRC badge, for wikis and READMEs elsewhere |
| Hosting | REST API with access tokens | List boards, versions and artifacts, trigger a re-render: for CI and scripts |
| Boards | Fork a board | Derivative designs that keep a link to where they came from |
| Fabrication | Panelization with KiKit | Panel Gerbers per board house, next to the single-board ZIPs |
| Hosting | Git over SSH | HTTPS with tokens covers it; some users prefer their SSH keys |

### ⚪ Optional

| Area | Item | Why |
|---|---|---|
| Parts | Price and stock from distributors (LCSC, Mouser, DigiKey) | Needs API keys and outbound network; cache results and show a BOM cost per quantity |
| Rendering | Boards from Gerbers only | For designs from other tools: a Gerber viewer without schematic or 3D |
| Import | Altium or EasyEDA import | After Eagle, only if people ask for it |
| Libraries | Shared symbol and footprint libraries as their own repository type | Previews of library parts, and projects that use them |

---

## Features

### Schematic as PDF

**Status:** ✅ done · one optional item left

- [x] Every render exports all sheets into one PDF (`schPdfArgs`, artifact kind
      `schematic_pdf`), with KiCad's clickable links between sheets.
- [x] "PDF" in the Schematic tab toolbar, "Schematic (PDF)" in the overview's
      downloads panel.
- [x] Served with `Content-Disposition: attachment`: a PDF from the renderer is
      always saved, never opened as a document of pcbgit's origin.
- [ ] Optional: the same for the board (`pcb export pdf`), e.g. assembly drawings.

> [!TIP]
> Existing versions get the PDF after a re-render (**Admin → Boards → Re-render all**).

### Gerbers per board house

**Status:** ✅ done · a real test order is still open

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

#### Assembly files (JLCPCB SMT)

**Status:** ⚪ medium effort, only if wanted

- [ ] CPL: `pcb export pos --format csv --units mm --side both --exclude-dnp`,
      columns renamed to Designator, Mid X, Mid Y, Layer (Top/Bottom), Rotation.
- [ ] BOM in JLCPCB's format (Comment, Designator, Footprint, LCSC Part #). It
      needs an `LCSC` field on the symbols; without one it is only a starting point.

> [!NOTE]
> Rotation offsets: many footprints sit rotated compared with JLCPCB's parts
> library. That cannot be fixed generically; JLCPCB corrects it in its order
> preview. Say so next to the download.

### Eagle projects

**Status:** ✅ done (2026-09-24) · open edge cases below

Eagle 6 and newer are converted on render and marked **Converted** (native KiCad
projects: **Native**). Schematic: own converter (`render/eagle/`, run in the
renderer as `scripts/eagle-convert.ts`); board: `kicad-cli pcb import`. Tested with
Xino RF (Eagle 6.1) and XPlode (Eagle 9.1). Eagle before 6 is refused at upload
and on render. The GUI-importer route (Xvfb, xdotool; 435 MB, 11 s) was tested
and dropped as too fragile.

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

### Accounts

**Status:** 🟡 low priority

- [ ] Transfer ownership: the owner (`users.is_owner`, see [CLAUDE.md](CLAUDE.md))
      cannot be demoted, disabled or deleted by other admins. Handing the role to
      another admin is only possible in the database so far; a "make owner" action
      for the owner on the Users page would do.

### Database: SQLite for now

**Status:** 🟡 low priority

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

---

## Security

<details>
<summary><strong>Done in the audit of 2026-09-23 and after</strong></summary>

- Limits per user (boards, storage, uploads and pushes per hour) and admin
  approval of new accounts
- Open redirect after sign-in fixed; sign-in rate limit (async scrypt)
- Frame and HSTS headers; capability-free containers
- Render isolation: renderer container with no `/data`, no network, read-only,
  limited
- CSP for SVG artifacts
- Git checks on push (`receive.fsckObjects`)
- Symlinks leaving the render checkout removed (by real path, so chains of links
  count too)
- Renderer output read only as plain files inside the job's directory
  (`render/outputs.ts`), and the app's own files there created exclusively
- GLBs read without external buffers; the schematic fallback confined to the
  checkout
- Audit of 2026-09-27: open redirect after sign-in (tabs and newlines in `next`),
  an hourly comment limit, reserved usernames for every top-level route (checked
  by a test), private board names no longer probeable over git, and sign-in
  without an account costing the same scrypt work
- Optional two-factor sign-in (TOTP, recovery codes, codes usable once); admins
  can no longer demote or reset each other (owner only); a locked-out owner is
  reset from the server's shell (`scripts/reset-owner.ts`)

</details>

### Medium: before opening registration

> [!IMPORTANT]
> These four matter as soon as strangers can sign up.

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
      *before* the check, e.g. while kicad-cli runs, is refused (2026-09-25).
      Closing it needs `openat2(RESOLVE_BENEATH)`, which Node does not offer, or a
      renderer that cannot keep processes alive between tool runs.
- [ ] Full Content-Security-Policy for pages (SvelteKit `kit.csp`); pages send
      only `frame-ancestors 'self'` so far.
- [ ] `git-http-backend` gets `REMOTE_USER` on authenticated reads, so it would
      accept a push by itself; only pcbgit's `isWrite()` check stands in between.
      Set `http.receivepack=false` (through `GIT_CONFIG_*`, like the push checks)
      for every request that is not a checked write. Found in the audit of
      2026-09-27; no way around `isWrite()` was found.

### Not reviewed yet

- [ ] `npm audit` and dependency updates; three.js, adm-zip and glTF Transform
      handle untrusted files.
- [ ] Snapshot restore (admin only): tar extraction and paths in `restore.ts`.
- [ ] The host-side updater (`deploy/install.sh`, `update.sh`) and the
      permissions on `/var/lib/pcbgit-control`.

---

## Other known issues

- [ ] A re-render empties a board's viewers until it finishes
      (`clearArtifacts()` runs first). Render into a staging directory and swap.
- [ ] `/new` creates the board before committing the upload; if that fails, an
      empty board is left behind.
- [ ] `syncCommits()` only looks at the newest 200 commits of a branch.

## Observe

- [ ] Card thumbnails (SCH, PCB) sometimes stayed blank after going back to the
      front page until hovered: loaded, but not drawn. `decoding="async"` was
      removed from them on 2026-09-25 and a first test looked fine. If it comes
      back, note the browser; the next step is forcing a redraw when each
      thumbnail loads (`ProjectCard.svelte`).
