# TODO: security before opening pcbgit.com

Left over from the security audit of 2026-09-23. Already fixed then: the open
redirect after sign-in, the sign-in rate limit (with async scrypt), and the
frame/HSTS headers.

Registration is closed on pcbgit.com, so today only accounts the admin creates
can upload or push. Items marked **before opening registration** become real
once strangers can sign up.

## High

### Isolate rendering from the data directory
kicad-cli (C++) and InteractiveHtmlBom (Python) parse every uploaded or pushed
board. They run as the same user, in the same container, as the web app, with
full access to `/data`: the database (sessions, password hashes, tokens) and
every repository, private ones included. A parser bug in KiCad would expose all
of it.

- [x] Run renders in a separate container that sees only the render directory:
      the `renderer` service (`scripts/render-runner.ts`), reached through a
      socket on the shared `/work` volume. Thumbnails too.
- [x] No network access for render processes (`network_mode: none`).
- [x] CPU and memory limits: 4 GB, 2 CPUs, 512 processes for the renderer, plus
      read-only root, `cap_drop: ALL`, `no-new-privileges`. Timeouts as before:
      240 s per kicad-cli call, 600 s for the GLB export.
- [x] Uploads and snapshots stay in `/data/tmp`; `/work` holds only render jobs.

Left over:
- [ ] The limits apply to the renderer as a whole, not to one render. One huge
      board can still slow everyone's renders.
- [ ] Thumbnails can be made while a render runs, so `/work` may briefly hold
      another board's rendered SVG next to the current job.
- [ ] A compromised renderer can still falsify its own job's output. SVGs are
      covered by the CSP; the GLB and iBOM HTML are parsed or sandboxed in the
      browser.
- [ ] Deploy: check `deploy/update.sh` brings up the renderer on the server
      (it should, since it runs `docker compose up --build` with both files).

## Medium: before opening registration

### Limits on uploads, pushes and renders
Uploads are capped at 200 MB and 4000 files each (`upload.ts`,
`BODY_SIZE_LIMIT=210M`). Nothing else is limited.

- [ ] Git push size: `git-http-backend` accepts any pack size.
- [ ] Boards per user.
- [ ] Storage per user: repositories plus artifacts.
- [ ] Renders queued per user. One account can fill the single render worker
      for everyone.
- [ ] Rate limit for uploads and pushes, like the sign-in limit.

### Account abuse
- [ ] Email verification, or admin approval, for new accounts.
- [ ] A rate limit or CAPTCHA on registration. Each registration also runs a
      synchronous scrypt (`hashPassword`).
- [ ] Make `hashPassword` async, like `verifyPassword`.

## Low: hardening

### CSP for artifact SVGs
Schematic and PCB SVGs are served inline, same-origin, as `image/svg+xml`,
with no CSP. kicad-cli escapes schematic text (a `<script>` in a text item
comes out as `&lt;script&gt;`, tested with KiCad 10), so no injection is
known. Defence in depth:

- [x] SVG artifacts (and the SVG thumbnail fallback) are served with
      `SVG_POLICY` (`artifactaccess.ts`): no script, sandboxed, inline styles
      and `data:` images only.

### Symlinks in pushed commits
`exportTree()` unpacks `git archive` with `tar`, which recreates symlinks,
including absolute ones. File discovery skips them (`Dirent.isFile()` is false
for a symlink), but a schematic can reference sub-sheets by absolute path, and
kicad-cli follows it. With render isolation, kicad-cli only sees `/work`, so a
link can no longer reach the database or repositories; at most another file in
`/work` (see the thumbnail note above).

- [ ] Remove symlinks from the checkout after unpacking, or reject commits that
      contain them.

### Full Content-Security-Policy
Pages send only `frame-ancestors 'self'`.

- [ ] Enable SvelteKit's `kit.csp` (nonces for its inline scripts), and check
      the theme pre-paint script in `app.html` and the 3D viewer still work.

## Not reviewed yet

- [ ] `npm audit` and updates for dependencies. Check three.js, adm-zip and
      glTF Transform especially, since they handle untrusted files.
- [ ] Snapshot restore (admin only): tar extraction of an uploaded snapshot,
      and path handling in `restore.ts`.
- [ ] git-http-backend's configuration: which services are enabled, and whether
      `receive.fsckObjects` should be on for pushes.
- [ ] The host-side updater (`deploy/install.sh`, `update.sh`) and the
      permissions on `/var/lib/pcbgit-control`.
