# pcbgit

Self-hosted git hosting for KiCad projects: every commit is rendered to schematic,
PCB layers, 3D model, BOM and DRC/ERC. SvelteKit (adapter-node) + `node:sqlite`,
kicad-cli for rendering, shipped as one Docker image. The README covers setup,
configuration and the project layout; this file covers working on the code.

## Commands

```sh
npm run dev      # http://localhost:5173 (no kicad-cli locally → metadata-only renders)
npm test         # node --test with strip-types; unit + pipeline tests
npm run check    # svelte-kit sync + svelte-check; must report 0 errors
npm run schema   # after editing src/lib/server/db/schema.sql
npm run seed     # demo boards
```

Run `npm test` and `npm run check` before calling a change done. GitHub Actions
(`.github/workflows/ci.yml`) runs both on every push, with Node 24 as in the image.

## How a version gets rendered

Upload (`/new`, board settings) → `filesFromZip()` (upload.ts) → `commitFiles()`
(git.ts, plumbing into the bare repo) → `syncCommits()` (projects.ts). A `git push`
(githttp) and the admin/history "re-sync" join at `syncCommits()`, which indexes new
commits and calls `enqueueRender()`. The worker (render/worker.ts) runs in-process,
one job at a time: `renderCommit()` → kicad-cli exports → `storeArtifact()` copies
each output to `DATA_DIR/artifacts/<commitId>/` and records a row in `artifacts`;
parsed BOM/DRC/board stats go to SQLite in `persistResults()`.

**Render isolation:** the job's checkout and output live in `RENDER_DIR` (`/work`
in Docker, a volume shared with the `renderer` service). Every external tool
(kicad-cli, iBOM, rsvg-convert, cwebp) goes through `runTool()` in
`render/kicad.ts`: with `PCBGIT_RENDER_SOCKET` set it is sent to
`scripts/render-runner.ts` in the renderer container (no `/data`, no network,
read-only, limited), otherwise it runs locally (`npm run dev`). The runner only
accepts those tools and paths inside `RENDER_DIR`. New tools must be added to
its allowlist, and must only be given paths under `RENDER_DIR`: copy inputs in,
copy results out (see `thumbnails.ts`). The renderer can rewrite anything in
`RENDER_DIR`, and the app resolves paths with `/data` mounted: read results only
with `readOutput(file, jobDir)`, create files there only with `writeNew()`
(`render/outputs.ts`), and hand bytes, not paths, to `storeArtifact()` and
`optimizeBoardGlb()`. Both check the job directory itself with `trustedDir()`:
every step from `RENDER_DIR` down must be a real directory, since the renderer
can swap a whole job directory for a link. Code that needs a directory's real
path (the schematic fallback) takes it from `trustedDir()` too.

**Eagle projects** (6 and newer) are converted before that: a commit without KiCad
files is searched for Eagle `.sch`/`.brd` (`render/eagle/detect.ts`, by content);
`eagleimport.ts` runs `scripts/eagle-convert.ts` (schematic, our own converter in
`render/eagle/`) and `kicad-cli pcb import` (board) in the renderer, into
`<out>/converted/`, and the pipeline continues with those files. The version gets
`commits.converted_from` ('' = native), shown as **Native** / **Converted**. The
converter takes untrusted XML: keep its reader entity-free and capped
(`eagle/xml.ts`), run every number through `num()` and every string through `q()`.

## Conventions

- **Translations:** every user-facing string goes in both `src/lib/i18n/en.json` and
  `de.json`, same keys and placeholders (the i18n test enforces this). Plurals are
  `{ "one": …, "other": … }`. Server code uses `translate(locals.locale, key)`,
  components use `t(key)`. Remove keys the code no longer uses.
- **Errors shown to users** are `UserError` subclasses with a translation key.
- **Paths** under the data dir go through `safeSegment()` (paths.ts); never join
  user input into a path without it.
- **Pure helpers** that need tests live in modules without `$lib/server/db` or git
  imports (e.g. `render/kicad.ts`, `render/schematictheme.ts`); tests import them
  with explicit `.ts` extensions.
- **Schema changes:** a new column on an existing table also needs an entry in
  `ADDED_COLUMNS` (db/index.ts), or existing instances never get it. Changing a
  CHECK or NOT NULL means rebuilding the table once at boot (`rebuildTags`,
  `rebuildNotifications`); if other tables reference it with `ON DELETE CASCADE`,
  turn foreign keys off around the rebuild, or dropping the old table deletes
  their rows.
- **Admin actions** that change data call `audit(...)`.
- **Permissions** go through `canView` / `canEdit` / `isOwner` (projects.ts). Collaborators
  (`project_members`) can do everything an owner can except delete the board and manage
  collaborators. SQL that filters by access (`visibleTo`, `VISIBLE` in notifications.ts)
  repeats the rule; keep all of them in step.
- **Notifications** are `comment`, `reply` or `version`. `syncCommits()` sends a version
  notification only when it gets an actor (uploads, pushes); re-syncs pass none.
- **Forms that edit existing values** use `use:enhance={keepValues}` ($lib/forms):
  SvelteKit resets a form after success, and with Svelte 5 that empties every field
  filled via `value={…}`. Forms that should clear (passwords, "create …") keep plain
  enhance. Their save actions return `saved: true`, and the page shows the message
  next to the button with `SavedNote`; errors stay at the top (`FormError`).
- **Form state that follows page data** is an overridable `$derived(data.x)`, not
  `$state(data.x)`: pages are reused between boards, and `$state` keeps the first.
- **Board houses** are entries in `FAB_PROFILES` ($lib/fab.ts) plus a `fab.<id>`
  translation; every render makes one fabrication ZIP per profile. **Licenses** are
  one table in $lib/licenses.ts (stored id, name, link, commercial, sharing). Boards
  keep ids no longer offered, and the settings form keeps them selectable.
- **`render/kicad.ts` has no `$lib` imports:** the renderer runs it with plain Node,
  outside Vite. Pass options in instead.
- **Styling:** colours come from the theme tokens (`--accent`, `--on-accent`,
  `--surface-*`, `--border-*`), mixed with `color-mix`. Rules in `@layer components`
  lose to Tailwind utilities (a later layer) whatever their specificity, so a
  property a component rule changes on hover must not also be set by a utility.
- Comments explain *why*, briefly, matching the existing style. No dead code.
- **NOTES.md** is a plain reminder of what was worked on: in order, one section
  per day, a milestone heading and the reason (no clock times, no commit
  hashes). Add an entry when a major change is done, and a row to its Releases
  table when a release is made.

## Things that bite

- **Artifact URLs carry a version.** A re-render reuses the commit id and file
  names, so links are `/artifacts/<commitId>/<file>?v=<created_at>` (`artifactUrl()`;
  card thumbnails use `head_rendered_at`). Only URLs with `v` are cached as
  immutable on public boards; without it, 5 minutes. Build artifact links with
  `artifactUrl()`, and append options with `&` (`&dark`), not `?`.
- **Re-rendering clears first.** `clearArtifacts()` runs before rendering, so a
  board's viewers are empty until its render finishes.
- **Schematic sheets:** kicad-cli writes `<root>.svg` and `<root>-<sheet>.svg`;
  `orderSchematicSheets()` puts the root at `sheet-0`. The card thumbnail and the
  Schematic tab both rely on `sheet-0` being the root.
- **Schematic dark mode** is a server-side recolour (`?dark`,
  `render/schematictheme.ts`) of KiCad's *default* schematic palette to Gruvbox
  Dark. If kicad-cli is ever given `--theme`, that map stops matching. Light mode
  keeps KiCad's colours on the `#f5f4ef` sheet colour.
- **The render queue** is one in-process worker; jobs are picked by
  `ORDER BY queued_at` (ms), with ties falling back to insertion order.
- **`syncCommits()`** only looks at the newest 200 commits of the branch.
- Uploads replace the whole tree: files missing from a new ZIP are deleted in that
  version.
- **`RENDER_DIR` holds the renderer's socket.** Anything that cleans it must only
  remove job directories (`checkout-`, `out-`, `thumb-`).
- **SVG artifacts** are served with a CSP that blocks script (`SVG_POLICY`), in
  case a compromised renderer writes one.
- **Repository files are served for README images only**
  (`[owner]/[project]/raw/[sha]/[...path]`): images by extension, commits of that
  board only, SVG with `SVG_POLICY`. Never widen it to other types: a repo's HTML
  served from this origin would run as pcbgit.
- **Profile pictures** are BLOBs in the `avatars` table (so snapshots cover them),
  only ever served as our own re-encoding: `avatarimage.ts` checks the header, then
  rsvg-convert crops and cwebp encodes in the renderer. rsvg-convert ignores EXIF
  orientation, so the crop SVG applies it. URLs carry `?v=<updated_at>`.
- `docker compose exec` reads stdin: in scripts, give it `</dev/null`, or it
  swallows the rest of the script.
- **Sign-in limits** (`loginguard.ts`) count failures per client address and per
  account, in memory. Behind a proxy the address comes from `ADDRESS_HEADER` /
  `XFF_DEPTH` (set in `deploy/docker-compose.prod.yml`); without them every visitor
  looks like the proxy and one attacker locks everyone out.
- **Push checks** (`PUSH_CHECKS`, `receive.fsckObjects` via `GIT_CONFIG_*`) only
  apply over HTTP: git strips those variables for local pushes, so test them
  through `runGitBackend()` (see `tests/git-checks.test.ts`).
- **Testing a form action with curl:** send `Accept: text/html`, or SvelteKit
  answers with the JSON meant for enhanced forms instead of the rendered page.
- **Cookies:** `pcbgit_session` (login), `pcbgit-lang` (language), `pcbgit_sort`
  (front-page sort, set only when the visitor picks one). Theme, 3D colours and the
  chosen board house are `localStorage`.
- **Ports:** the app listens on 3000 in the container; `PCBGIT_PORT` in `.env`
  sets the published port, and `ORIGIN` defaults to follow it.

## Verifying render changes

- The local `./data` was rendered without kicad-cli, so it has no SVG/GLB output.
- KiCad 10 is installed locally as a flatpak:
  `flatpak run --filesystem=<dir> --command=kicad-cli org.kicad.KiCad sch export svg --output <out> <file>.kicad_sch`
  (the sandbox needs `--filesystem` for the files it reads and writes).
- The real target is the Docker image (KiCad 10 from the PPA):
  `docker compose up -d --build`, then http://localhost:3000. Admin credentials come
  from `.env`. The `pcbgit-data` volume survives rebuilds.
- Hierarchical test project: `~/KiCad/Touch-Matrix-LiPo` (root + `Tastatur`). Copy
  it before running anything against it.

## Knowledge graph

`graphify-out/` (gitignored) holds a graphify graph of the repo. Refresh it with
`/graphify --update` after code changes (code-only updates cost no LLM tokens).
It is good for "what calls what" in TypeScript. It does not see calls made inside
SvelteKit `actions = { … }` objects, Svelte template markup, or code that loops
over a table or constant (`FAB_PROFILES`), so route handlers and table-driven
code look disconnected; confirm in the code.

## Known open issues

- `/new` creates the project before committing the upload; if the commit or sync
  fails, an empty board is left behind.
