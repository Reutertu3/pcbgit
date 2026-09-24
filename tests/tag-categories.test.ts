/** Tag categories: the migration from fixed categories, and managing them in the admin panel. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { after } from 'node:test';

import { SCHEMA_SQL } from '../src/lib/server/db/schema.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-tagcats-'));
process.env.PCBGIT_DATA_DIR = dataDir;
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

// An instance from before: tags.category limited by a CHECK, and a board already tagged.
{
	const old = new DatabaseSync(path.join(dataDir, 'pcbgit.db'));
	old.exec(SCHEMA_SQL);
	old.exec(`DROP TABLE project_tags; DROP TABLE tags; DROP TABLE tag_categories;
		CREATE TABLE tags (
		  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
		  category TEXT NOT NULL DEFAULT 'general'
		    CHECK (category IN ('general','component','interface','domain','process')),
		  color TEXT NOT NULL DEFAULT '#8a9a8b', description TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
		CREATE TABLE project_tags (
		  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
		  PRIMARY KEY (project_id, tag_id));`);
	old.exec(`INSERT INTO users (id, username, email, password_hash, created_at, updated_at) VALUES ('u1','owner','o@example.com','x',0,0);
		INSERT INTO projects (id, owner_id, slug, name, created_at, updated_at) VALUES ('p1','u1','board','Board',0,0);
		INSERT INTO tags (id, slug, name, category, color, created_at) VALUES ('t1','esp32','ESP32','component','#6ba4e8',0);
		INSERT INTO project_tags (project_id, tag_id) VALUES ('p1','t1');`);
	old.close();
}

const { count, get } = await import('../src/lib/server/db/index.ts');
const projects = await import('../src/lib/server/projects.ts');

test('the old tags table is rebuilt without untagging any board', () => {
	assert.equal(count('SELECT COUNT(*) FROM project_tags'), 1, 'project_tags must survive the rebuild');
	const sql = get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'tags'")!.sql;
	assert.ok(!sql.includes('CHECK'));
	assert.deepEqual(
		projects.listTagCategories().map((c) => c.id),
		['component', 'interface', 'domain', 'process', 'general']
	);
	assert.equal(projects.listTagCategories()[0].tag_count, 1);
});

test('categories can be added, renamed, recoloured and reordered', () => {
	assert.deepEqual(projects.createTagCategory('Sensors', '#123456'), { id: 'sensors' });
	assert.deepEqual(projects.createTagCategory('sensors', '#123456'), { error: 'adminTags.error.categoryExists' });
	assert.deepEqual(projects.createTagCategory('  ', '#123456'), { error: 'adminTags.error.categoryName' });

	// A new tag starts with its category's colour.
	projects.ensureTag('BME280', 'sensors');
	const bme = projects.listTags().find((t) => t.slug === 'bme280')!;
	assert.equal(bme.color, '#123456');

	projects.updateTagCategory('component', 'Parts', '#654321');
	projects.moveTagCategory('sensors', -1);
	const order = projects.listTagCategories();
	assert.deepEqual(order.map((c) => c.id), ['component', 'interface', 'domain', 'process', 'sensors', 'general']);
	assert.equal(order[0].name, 'Parts');

	// Tags follow the categories' order and carry the category's name.
	const tags = projects.listTags();
	assert.deepEqual(tags.map((t) => [t.slug, t.category_name]), [['esp32', 'Parts'], ['bme280', 'Sensors']]);

	// Moving past either end does nothing.
	projects.moveTagCategory('component', -1);
	assert.equal(projects.listTagCategories()[0].id, 'component');
});

test('deleting a category moves its tags to the fallback, which cannot be deleted', () => {
	assert.equal(projects.deleteTagCategory('sensors'), true);
	assert.equal(projects.isTagCategory('sensors'), false);
	assert.equal(projects.listTags().find((t) => t.slug === 'bme280')!.category, projects.FALLBACK_CATEGORY);
	assert.equal(projects.deleteTagCategory(projects.FALLBACK_CATEGORY), false);
	assert.ok(projects.isTagCategory(projects.FALLBACK_CATEGORY));
});
