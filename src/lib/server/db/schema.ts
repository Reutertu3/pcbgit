// Generated from schema.sql — do not edit by hand.
// Edit src/lib/server/db/schema.sql and run: node scripts/gen-schema.js
export const SCHEMA_SQL = `-- pcbgit schema. Applied idempotently at every boot by db/index.ts.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  -- 0 while a new account waits for an admin (is_active is 0 then too).
  approved      INTEGER NOT NULL DEFAULT 1,
  -- Per-user limits; NULL means the instance default (settings limit_*).
  limit_boards     INTEGER,
  limit_storage_mb INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Personal access tokens: used as the password for \`git push\` over HTTP.
CREATE TABLE IF NOT EXISTS access_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON access_tokens(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL COLLATE NOCASE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  license        TEXT NOT NULL DEFAULT '',
  source_url     TEXT NOT NULL DEFAULT '',
  default_branch TEXT NOT NULL DEFAULT 'main',
  head_commit_id TEXT,
  -- Size of the bare repository on disk, for storage limits; -1 until measured.
  repo_bytes     INTEGER NOT NULL DEFAULT -1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (owner_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_projects_visibility ON projects(visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  color       TEXT NOT NULL DEFAULT '#8a9a8b',
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

-- Tag categories, managed in the admin panel. An empty name means the built-in,
-- translated one (tagCategory.<id>). 'general' is the fallback and cannot be deleted.
CREATE TABLE IF NOT EXISTS tag_categories (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL DEFAULT '',
  color    TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_tags (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_project_tags_tag ON project_tags(tag_id);

CREATE TABLE IF NOT EXISTS stars (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_stars_project ON stars(project_id);

-- One row per pushed/uploaded commit that we know about.
CREATE TABLE IF NOT EXISTS commits (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sha           TEXT NOT NULL,
  branch        TEXT NOT NULL,
  message       TEXT NOT NULL DEFAULT '',
  author_name   TEXT NOT NULL DEFAULT '',
  author_email  TEXT NOT NULL DEFAULT '',
  committed_at  INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  -- Board summary, filled in by the render worker.
  render_status TEXT NOT NULL DEFAULT 'queued'
                  CHECK (render_status IN ('queued','running','success','failed','skipped')),
  board_name    TEXT NOT NULL DEFAULT '',
  board_width   REAL,
  board_height  REAL,
  layer_count   INTEGER,
  net_count     INTEGER,
  part_count    INTEGER,
  drc_errors    INTEGER NOT NULL DEFAULT 0,
  drc_warnings  INTEGER NOT NULL DEFAULT 0,
  erc_errors    INTEGER NOT NULL DEFAULT 0,
  erc_warnings  INTEGER NOT NULL DEFAULT 0,
  -- '' for a native KiCad project; for one converted on render, e.g. 'Eagle 6.1'.
  converted_from TEXT NOT NULL DEFAULT '',
  -- Board outline bounds in mm, as JSON, so DRC markers can be placed on the 2D view.
  board_bbox    TEXT NOT NULL DEFAULT '',
  UNIQUE (project_id, sha)
);
CREATE INDEX IF NOT EXISTS idx_commits_project ON commits(project_id, committed_at DESC);

CREATE TABLE IF NOT EXISTS render_jobs (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  commit_id   TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','success','failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  log         TEXT NOT NULL DEFAULT '',
  error       TEXT NOT NULL DEFAULT '',
  queued_at   INTEGER NOT NULL,
  started_at  INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON render_jobs(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_jobs_commit ON render_jobs(commit_id);

-- Rendered output files on disk, keyed by commit.
CREATE TABLE IF NOT EXISTS artifacts (
  id         TEXT PRIMARY KEY,
  commit_id  TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,     -- schematic_svg | pcb_layer_svg | pcb_glb | thumbnail | bom_csv | drc_json | erc_json | gerber_zip
  name       TEXT NOT NULL,     -- sheet name / layer id / file label
  rel_path   TEXT NOT NULL,     -- relative to DATA_DIR/artifacts
  ordinal    INTEGER NOT NULL DEFAULT 0,
  meta       TEXT NOT NULL DEFAULT '{}',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_commit ON artifacts(commit_id, kind, ordinal);

CREATE TABLE IF NOT EXISTS bom_items (
  id          TEXT PRIMARY KEY,
  commit_id   TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  refs        TEXT NOT NULL DEFAULT '',
  value       TEXT NOT NULL DEFAULT '',
  footprint   TEXT NOT NULL DEFAULT '',
  quantity    INTEGER NOT NULL DEFAULT 1,
  datasheet   TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  mpn         TEXT NOT NULL DEFAULT '',
  dnp         INTEGER NOT NULL DEFAULT 0,
  ordinal     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bom_commit ON bom_items(commit_id, ordinal);

CREATE TABLE IF NOT EXISTS drc_violations (
  id         TEXT PRIMARY KEY,
  commit_id  TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'drc' CHECK (source IN ('drc','erc','unconnected','schematic_parity')),
  severity   TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('error','warning','info','exclusion')),
  rule       TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  x_mm       REAL,
  y_mm       REAL,
  layer      TEXT NOT NULL DEFAULT '',
  ordinal    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_drc_commit ON drc_violations(commit_id, severity, ordinal);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- Replies point at the top-level comment of their thread (one level deep).
  parent_id  TEXT REFERENCES comments(id) ON DELETE CASCADE,
  -- A deleted comment that still has replies keeps its row as a placeholder.
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, created_at);
-- idx_comments_parent is created in db/index.ts, after parent_id is migrated in.

-- One row per recipient per comment. Removed with the comment.
-- A comment/reply points at its comment; a new version at the newest commit of the
-- push or upload, with how many versions it brought. Databases from before
-- "version" existed are rebuilt into this shape at boot (db/index.ts).
CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('comment','reply','version')),
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  comment_id    TEXT REFERENCES comments(id) ON DELETE CASCADE,
  commit_id     TEXT REFERENCES commits(id) ON DELETE CASCADE,
  version_count INTEGER NOT NULL DEFAULT 1,
  actor_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  read_at       INTEGER,
  UNIQUE (user_id, comment_id)
);

-- Collaborators: existing users the owner lets edit and push to a board.
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id);

-- Profile pictures, already cropped and encoded (avatars.ts). Kept in the
-- database so snapshots and user deletion cover them without extra steps.
CREATE TABLE IF NOT EXISTS avatars (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image      BLOB NOT NULL,
  type       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
