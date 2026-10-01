# TODO

> [!NOTE]
> Only what is still open, as of 2026-10-01; each item appears once. What was done,
> and why, is in [NOTES.md](NOTES.md): an item moves there when it is finished.
> Registration is closed on pcbgit.com, so the first group only becomes urgent
> once strangers can sign up.

## At a glance

| | Group | Open | What it is |
|---|---|---|---|
| 🔴 | [Before opening registration](#before-opening-registration) | 0 | Abuse limits a public instance needs |
| 🟠 | [Next up](#next-up) | 6 | Fixes and chores worth doing soon |
| 🗺️ | [Feature roadmap](#feature-roadmap) | 25 | New features, by priority |
| 🔍 | [To review](#to-review) | 3 | Code nobody has audited yet |
| 🟡 | [Low priority](#low-priority) | 20 | Hardening, edge cases, chores that can wait |
| ⚪ | [Optional](#optional) | 4 | Only if wanted |
| 👀 | [Observe](#observe) | 1 | Fixed, but worth watching |

---

## Before opening registration

> [!IMPORTANT]
> These matter as soon as strangers can sign up. Nothing is open: admin approval
> of new accounts is on by default, registration is limited per address, with a
> honeypot and a cap on waiting accounts, renders are limited per owner
> (2026-09-29) and the size of a push is limited (2026-09-30); email
> verification is postponed (Optional).

## Next up

- [ ] **A re-render empties a board's viewers until it finishes**
      (`clearArtifacts()` runs first). Render into a staging directory and swap.
- [ ] **Test one real order** (or AISLER's upload preview) with each board-house
      profile (JLCPCB, AISLER, Generic).
- [ ] **Scan the image for known vulnerabilities** (e.g. Trivy) in the CI image job.
      Provenance and an SBOM are published with every image already.
- [ ] **Upgrade the build toolchain's major versions together:** vite 6 → 8,
      `@sveltejs/vite-plugin-svelte` 5 → 7, TypeScript 5 → 7 (and whatever SvelteKit,
      Svelte and svelte-check need alongside). Each fails CI alone; Dependabot now
      proposes them as one pull request (`toolchain-major`).
- [ ] **Branches and pull requests, with CI required before `master`.** "Update
      from GitHub" builds `master`, so CI should have passed before code lands
      there. Branch protection is a repository setting (Settings → Branches);
      Dependabot already works this way.
- [ ] **Offer the STEP download as a ZIP** (`board.step` inside). It is stored as
      `board.step.gz` and sent with `Content-Encoding: gzip`, but a client that
      does not accept gzip (curl without `--compressed`, wget) gets it unpacked by
      the server. That runs on Node's small worker pool, which file reads and
      password hashing share; many such downloads from a public board need no
      account. Store the ZIP itself as the artifact and send it as it is, so the
      server never unpacks anything.
      Same rule for a later step: the other artifacts compress well too (SVGs to
      about 15–30 %, the GLB to about 32 %, the iBOM page to 59 %, the DRC/ERC
      reports to 10 %; on the local instance 153 MB would become about 65 MB).
      Stored gzipped and sent with `Content-Encoding: gzip`, browsers unpack them;
      clients without gzip get the compressed file, never unpacked on the server.
      The dark schematic recolour, iBOM theming and card thumbnails read artifact
      files and would unpack first; existing renders stay as they are until
      re-rendered.

---

## Feature roadmap

What a KiCad-centred git host could still offer, sized for a homelab up to a
medium team (a few dozen people, a few hundred boards). **High** is the core of
reviewing hardware in git and can reuse what renders already store; **Medium**
fills common gaps; **Low** matters once several people or tools share an
instance; **Optional** needs outside services or is a niche.

### 🔴 High

- **Deployment as a dedicated `pcbgit` user instead of root, with everything still working** · _Operations_ \
  Today `install.sh` and `update.sh` run as root: the checkout in `/opt/pcbgit`,
  system units in `/etc/systemd/system`, the control folder
  `/var/lib/pcbgit-control` chowned to uid 10001, and the snapshot copy folder
  too. Root should only prepare the server once: install Docker, create the user
  `pcbgit` (in the `docker` group), set up the firewall. Everything after that
  runs as `pcbgit`: the checkout in its home, user units
  (`~/.config/systemd/user`, `loginctl enable-linger pcbgit` so they run while
  nobody is logged in), the control folder in its home, named in `.env` and
  mounted by compose instead of the fixed path. Giving the host user uid 10001,
  the container's, makes the control and copy folders writable by both without
  chown or ACLs. Everything must keep working: updates and checks from the
  panel, automatic updates, rollback, pre-update and scheduled snapshots with
  the copy folder, renderer limits, Caddy on 80/443 (the Docker daemon binds
  them). Existing root installs keep working or get a documented move.
  Membership in `docker` is still root-equivalent; rootless Docker was
  considered and dropped (ports below 1024 and cgroup delegation for the
  renderer limits need root-side setup, and make it fragile).

- **Visual diff of schematic and board between two versions** · _Review_ \
  The question every hardware review asks ("what changed?"), and git cannot
  answer it for KiCad files. Evaluated and postponed (NOTES, 2026-09-30). Plan:
  an overlay in the browser from the per-sheet and per-layer SVGs each version
  already has, with CSS masks (new in grey, removed red, added green), an
  old/new toggle and a swipe slider, picked with `?compare=<sha>` like the BOM
  diff. Start with a prototype on the PCB tab: whether identical copper shows
  thin fringes when the outline moved decides between masks and a canvas
  comparison. Later: badges for changed sheets and layers (needs a normalised
  comparison, the SVG files differ even when nothing changed), a list of changed
  regions. It shows where, not what: "R5: 10k → 4k7" needs the parsed files.
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
  The owner can require it (Admin → Instance, off by default, 2026-09-30): an
  account then only becomes admin with two-factor sign-in on, and admins cannot
  turn it off. Admins from before may still have none, the `.env` owner among
  them: ask them to set it up at sign-in. Passkeys (WebAuthn) as a second kind
  of factor.

### 🟠 Medium

- **Part search across boards ("which boards use TPS62130?")** · _Parts_ \
  BOM lines with value, footprint, MPN and LCSC number are in the database; a search over
  them, limited to what the viewer can see, answers where a part is used before
  it is discontinued or reordered.
- **Comments pinned to a spot on a schematic sheet or board layer** · _Review_ \
  Comments are per board now; reviews point at a net or a footprint. Store sheet
  or layer plus coordinates, show markers in the viewers, allow resolving.
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
  Notifications only exist in the app. Email would also allow password reset and
  the postponed email verification; webhooks for new versions, failed renders and
  tag requests.
- **Single sign-on with OIDC (Authentik, Keycloak, Authelia)** · _Accounts_ \
  The usual way homelabs and small companies share accounts; local accounts stay
  for admins.
- **Maintenance mode** · _Operations_ \
  For work on an instance (a restore, a migration, a board clean-up) without
  visitors or pushes in between. A switch in the admin panel; while it is on,
  every page answers 503 with a static page the admin writes (shown as written,
  in every language), except sign-in (with the two-factor step) and a reduced
  admin panel to turn it off again. Git answers 503 with the same message, so
  pushes fail cleanly. Keep `/about` answering: the image's health check
  requests it, and `update.sh` would roll back an update that turned
  maintenance on. Decide whether renders pause meanwhile.
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

## To review

Code that handles untrusted input or runs as root, and has not been audited.

- [ ] **Dependencies:** `npm audit` and updates; three.js, adm-zip and glTF
      Transform handle untrusted files. Dependabot now proposes updates weekly.
- [ ] **Snapshot restore** (admin only): tar extraction and paths in `restore.ts`.
- [ ] **The host-side updater:** `deploy/install.sh`, `update.sh` (runs as root)
      and the permissions on `/var/lib/pcbgit-control`.

---

## Low priority

### Security hardening

- [ ] **Renderer limits apply to the container, not to one render** (4 GB, 2 CPUs
      by default): one huge board slows everyone's renders.
- [ ] **Thumbnails can be made while a render runs**, so `/work` may briefly hold
      another board's rendered SVG next to the current job.
- [ ] **A compromised renderer can still falsify its own job's GLB or iBOM output**
      (parsed in the browser, iBOM sandboxed).
- [ ] **Directory swap race in `/work`.** A process a compromised renderer leaves
      running could swap a directory for a link between the app's checks
      (`trustedDir`, realpath) and its open (`readOutput`), or while `tar` extracts
      a checkout. A swap *before* the check is refused. Closing it needs
      `openat2(RESOLVE_BENEATH)`, which Node does not offer, or a renderer that
      cannot keep processes alive between tool runs.
- [ ] **Full Content-Security-Policy for pages** (SvelteKit `kit.csp`); pages send
      only `frame-ancestors 'self'` so far.
- [ ] **`git-http-backend` would accept a push on authenticated reads**, since it
      gets `REMOTE_USER`; only pcbgit's `isWrite()` check stands in between (no way
      around it was found). Set `http.receivepack=false` through `GIT_CONFIG_*`
      for every request that is not a checked write.

### Boards and accounts

- [ ] **`/new` leaves an empty board** when committing the upload fails, since the
      board is created first.
- [ ] **`syncCommits()` only looks at the newest 200 commits** of a branch.
- [ ] **A re-render can keep an old card thumbnail.** If a thumbnail of the previous
      render is still being made when the commit is rendered again, it can land in
      the new `thumbs/` and is then served as the new one (`thumbnails.ts` trusts any
      existing file, and its in-flight key is only `commitId/name`). Rare: the
      previous render normally warmed them. Fix: key on `head_rendered_at` and write
      under a temporary name, renamed only if the source is unchanged.
- [ ] **Transfer ownership.** The owner (`users.is_owner`, see [CLAUDE.md](CLAUDE.md))
      can only be changed in the database; a "make owner" action for the owner on
      the Users page would do.

### Eagle projects

Eagle 6+ is converted and rendered (own schematic converter, `kicad-cli pcb
import` for the board). Edge cases left:

- [ ] **Nets Eagle joins by name only** (segments without a wire between them): the
      drawing is right, but ERC and the netlist see separate nets. Adding labels
      would change the drawing, so it is a note on the checks tab.
- [ ] **Mixed shown and hidden pin numbers** in one symbol all show: KiCad hides
      them per symbol, Eagle per pin.
- [ ] **Several Eagle projects in one commit:** only one is rendered (paired by
      name, highest version in the name wins); the render log says which.
- [ ] **Multi-sheet Eagle schematics** are tested with a synthetic file only; the
      root page is an index of the sheets, so the card thumbnail shows that.
- [ ] **`>LAST_DATE_TIME` stays empty** (the file does not record it).

### Delivery

- [ ] **Pre-release channel.** `update.sh` skips pre-releases; a setting to follow
      them would let a staging instance take `v0.8.0-rc1` first. Today the local
      Docker instance does that by hand.
- [ ] **Prune the build cache** on servers that use "Update from GitHub": Docker's
      build cache grows without bound. An occasional `docker builder prune` with a
      size cap in `update.sh`.
- [ ] **One version number.** `package.json` says 1.0.0 while releases are at
      v0.7.x; set it from the tag, or keep it in step when tagging.
- [ ] **Lint and format checks.** No ESLint or Prettier yet; `svelte-check` covers
      types only.
- [ ] **Node 26 and Ubuntu 26.04 for the image**, as deliberate switches:
      Node once 26 is LTS (the app relies on `node:sqlite` and type stripping),
      Ubuntu once KiCad's PPA supports it (renders may change). Dependabot ignores
      both majors.

### Database

- [ ] **PostgreSQL only if pcbgit needs several app instances, high availability or
      outside tools on the database.** Evaluated 2026-09-25: at 500 boards, 10,000
      versions and 600,000 BOM rows the busiest page query took 2.4 ms on SQLite.
      Cost of switching: every query helper becomes async (229 call sites in 47
      files), SQLite-only SQL, backup via `pg_dump`, an extra container; about 1–2
      weeks. Switch, don't offer both.

---

## Optional

- [ ] **Email verification for new accounts** (postponed 2026-09-29). Needs
      outgoing email: SMTP settings, and SPF/DKIM/DMARC or a relay for delivery,
      too much for a lab or homelab instance. Admin approval and the registration
      limits cover a public instance meanwhile. If it comes, password reset by
      email and email notifications (roadmap) come with it cheaply.
- [ ] **JLCPCB assembly files.** CPL from `pcb export pos --format csv --units mm
      --side both --exclude-dnp` (columns renamed to Designator, Mid X, Mid Y,
      Layer, Rotation), and a BOM in JLCPCB's format (Comment, Designator,
      Footprint, LCSC Part #); the LCSC number is in `bom_items.lcsc` already. Say next
      to the download that JLCPCB corrects footprint rotations in its preview.
- [ ] **AISLER drill "2:4 precision".** Ours are decimal inches with 4 decimals,
      the same resolution; only if AISLER's import misreads them, add
      `--excellon-zeros-format suppressleading` for its profile.
- [ ] **Board as PDF** (`pcb export pdf`), e.g. for assembly drawings, like the
      schematic PDF.

## Observe

- [ ] **Card thumbnails blank until hovered** after going back to the front page:
      loaded, but not drawn. `decoding="async"` was removed on 2026-09-25 and it has
      not come back since. If it does, note the browser; the next step is forcing a
      redraw when each thumbnail loads (`ProjectCard.svelte`).
