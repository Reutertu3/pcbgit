import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH, ensureDirs } from '../paths';
import { applyPendingRestore, importOnFirstBoot, migrateLegacyDatabase } from '../restore';
import { SCHEMA_SQL } from './schema';

function open() {
	ensureDirs();
	// Restores are swapped in here, before any handle to the old database exists.
	migrateLegacyDatabase(DATA_DIR);
	importOnFirstBoot(DATA_DIR);
	applyPendingRestore(DATA_DIR);
	ensureDirs();
	const database = new DatabaseSync(DB_PATH);
	database.exec('PRAGMA journal_mode = WAL');
	database.exec('PRAGMA foreign_keys = ON');
	database.exec('PRAGMA busy_timeout = 5000');
	database.exec('PRAGMA synchronous = NORMAL');
	// The schema is written to be idempotent, so replaying it on every boot is the migration.
	database.exec(SCHEMA_SQL);
	rebuildNotifications(database);
	rebuildTags(database);
	seedTagCategories(database);
	addMissingColumns(database);
	database.exec(POST_MIGRATION_SQL);
	return database;
}

/**
 * Notifications began as comments only: a CHECK allowing just comment/reply and a
 * required comment_id; later every one needed a board, until sign-up notifications.
 * SQLite cannot change either in place, so a table in an older shape is copied into
 * the current one (schema.sql) once.
 */
function rebuildNotifications(database: DatabaseSync) {
	const current = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notifications'").get() as
		| { sql: string }
		| undefined;
	if (!current || current.sql.includes("'signup'")) return;

	const create = /CREATE TABLE IF NOT EXISTS notifications \(([\s\S]*?)\n\);/.exec(SCHEMA_SQL)?.[1];
	if (!create) throw new Error('notifications table missing from schema.sql');
	// Older tables lack some columns (commit_id, version_count): copy those both have.
	const old = new Set((database.prepare('PRAGMA table_info(notifications)').all() as { name: string }[]).map((c) => c.name));
	database.exec('BEGIN');
	try {
		database.exec(`CREATE TABLE notifications_next (${create}\n)`);
		const next = (database.prepare('PRAGMA table_info(notifications_next)').all() as { name: string }[]).map((c) => c.name);
		const columns = next.filter((name) => old.has(name)).join(', ');
		database.exec(`INSERT INTO notifications_next (${columns}) SELECT ${columns} FROM notifications`);
		database.exec('DROP TABLE notifications');
		database.exec('ALTER TABLE notifications_next RENAME TO notifications');
		database.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC)');
		database.exec('COMMIT');
		console.log('[db] notifications table rebuilt (version and sign-up notifications)');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

/**
 * Tag categories used to be fixed by a CHECK on tags.category; they are a table
 * now (tag_categories). A tags table in the old shape is copied into the new one
 * once. Foreign keys are off meanwhile: project_tags cascades from tags, and
 * dropping the old table with them on would untag every board.
 */
function rebuildTags(database: DatabaseSync) {
	const current = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tags'").get() as
		| { sql: string }
		| undefined;
	if (!current || !current.sql.includes('CHECK')) return;

	const create = /CREATE TABLE IF NOT EXISTS tags \(([\s\S]*?)\n\);/.exec(SCHEMA_SQL)?.[1];
	if (!create) throw new Error('tags table missing from schema.sql');
	database.exec('PRAGMA foreign_keys = OFF');
	database.exec('BEGIN');
	try {
		database.exec(`CREATE TABLE tags_next (${create}\n)`);
		database.exec(
			`INSERT INTO tags_next (id, slug, name, category, color, description, created_at)
			 SELECT id, slug, name, category, color, description, created_at FROM tags`
		);
		database.exec('DROP TABLE tags');
		database.exec('ALTER TABLE tags_next RENAME TO tags');
		if ((database.prepare('PRAGMA foreign_key_check').all() as unknown[]).length) throw new Error('tag rebuild broke references');
		database.exec('COMMIT');
		console.log('[db] tags table rebuilt for editable categories');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	} finally {
		database.exec('PRAGMA foreign_keys = ON');
	}
}

/** The categories that used to be built in, written once into an empty table. */
function seedTagCategories(database: DatabaseSync) {
	const { n } = database.prepare('SELECT COUNT(*) AS n FROM tag_categories').get() as { n: number };
	if (n) return;
	const insert = database.prepare("INSERT INTO tag_categories (id, name, color, position) VALUES (?, '', ?, ?)");
	for (const [position, [id, color]] of DEFAULT_TAG_CATEGORIES.entries()) insert.run(id, color, position);
}

const DEFAULT_TAG_CATEGORIES = [
	['component', '#6ba4e8'],
	['interface', '#9cb080'],
	['domain', '#e2b862'],
	['process', '#c4829a'],
	['general', '#8a9a8b']
] as const;

/**
 * CREATE TABLE IF NOT EXISTS cannot add a column to a table that already
 * exists, so columns introduced after a release are applied here.
 */
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
	['commits', 'board_bbox', "TEXT NOT NULL DEFAULT ''"],
	['comments', 'parent_id', 'TEXT REFERENCES comments(id) ON DELETE CASCADE'],
	['comments', 'deleted_at', 'INTEGER'],
	['commits', 'converted_from', "TEXT NOT NULL DEFAULT ''"],
	['users', 'approved', 'INTEGER NOT NULL DEFAULT 1'],
	['users', 'limit_boards', 'INTEGER'],
	['users', 'limit_storage_mb', 'INTEGER'],
	['projects', 'repo_bytes', 'INTEGER NOT NULL DEFAULT -1'],
	['users', 'is_owner', 'INTEGER NOT NULL DEFAULT 0']
];

/**
 * Indexes on migrated columns. They cannot live in schema.sql: that runs first,
 * and on an existing database the column does not exist yet at that point.
 */
const POST_MIGRATION_SQL = `
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
`;

function addMissingColumns(database: DatabaseSync) {
	for (const [table, column, definition] of ADDED_COLUMNS) {
		const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
		if (columns.some((c) => c.name === column)) continue;
		database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
		console.log(`[db] added column ${table}.${column}`);
	}
}

// Vite reloads server modules in dev; keep one handle per process so WAL locks stay sane.
const globalRef = globalThis as unknown as { __pcbgitDb?: DatabaseSync };
export const db = (globalRef.__pcbgitDb ??= open());

type Row = Record<string, unknown>;

/** Typed wrappers so call sites stop casting `unknown` at every query. */
export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
	return prep(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
	return prep(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
	return prep(sql).run(...(params as never[]));
}

export function pluck<T = string>(sql: string, ...params: unknown[]): T | undefined {
	const row = get<Row>(sql, ...params);
	return row ? (Object.values(row)[0] as T) : undefined;
}

export function count(sql: string, ...params: unknown[]): number {
	return Number(pluck<number>(sql, ...params) ?? 0);
}

/** Statements are reused across requests; preparing is the expensive half. */
const stmtCache = new Map<string, StatementSync>();
function prep(sql: string) {
	let stmt = stmtCache.get(sql);
	if (!stmt) {
		stmt = db.prepare(sql);
		stmtCache.set(sql, stmt);
	}
	return stmt;
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
export function tx<T>(fn: () => T): T {
	db.exec('BEGIN');
	try {
		const result = fn();
		db.exec('COMMIT');
		return result;
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

export function now() {
	return Date.now();
}

export function newId() {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

export function getSetting(key: string, fallback = '') {
	return pluck<string>('SELECT value FROM settings WHERE key = ?', key) ?? fallback;
}

export function setSetting(key: string, value: string) {
	run(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
		key,
		value
	);
}

export function getBoolSetting(key: string, fallback: boolean) {
	const raw = getSetting(key, '');
	return raw === '' ? fallback : raw === 'true';
}

export function audit(actorId: string | null, action: string, target = '', detail = '') {
	run(
		'INSERT INTO audit_log (id, actor_id, action, target, detail, created_at) VALUES (?,?,?,?,?,?)',
		newId(),
		actorId,
		action,
		target,
		detail,
		now()
	);
}
