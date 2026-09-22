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
	addMissingColumns(database);
	database.exec(POST_MIGRATION_SQL);
	return database;
}

/**
 * CREATE TABLE IF NOT EXISTS cannot add a column to a table that already
 * exists, so columns introduced after a release are applied here.
 */
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
	['commits', 'board_bbox', "TEXT NOT NULL DEFAULT ''"],
	['comments', 'parent_id', 'TEXT REFERENCES comments(id) ON DELETE CASCADE'],
	['comments', 'deleted_at', 'INTEGER']
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
