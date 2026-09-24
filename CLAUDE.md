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

Run `npm test` and `npm run check` before calling a change done.

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
with `readOutput(file, jobDir)`, create files there only with `writeNew()` /
`COPYFILE_EXCL` (`render/outputs.ts`), and hand bytes, not paths, to
`storeArtifact()` and `optimizeBoardGlb()`.

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
  `ADDED_COLUMNS` (db/index.ts), or existing instances never get it.
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
- **NOTES.md** is the history of major features and fixes: newest first, with
  date, time, commit and the reason. Add an entry when a major change is
  committed, and a row to its Releases table when a tag is made.

## Things that bite

- **Artifacts are cached as immutable.** Public boards serve
  `/artifacts/<commitId>/<file>` with `max-age=31536000, immutable`, but a re-render
  reuses the same commit id and file names. After changing render output, browsers
  keep the old files; check in a private window. Artifact URLs carry no version yet.
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
- Artifact URLs need a version (e.g. `?v=<artifact id>`) so re-renders bypass the
  immutable cache.
