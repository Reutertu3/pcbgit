// Regenerates src/lib/server/db/schema.ts from schema.sql so the bundled
// server carries its schema inline instead of reading a side file at runtime.
import fs from 'node:fs';

const sql = fs.readFileSync('src/lib/server/db/schema.sql', 'utf8');
const escaped = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

fs.writeFileSync(
	'src/lib/server/db/schema.ts',
	'// Generated from schema.sql — do not edit by hand.\n' +
		'// Edit src/lib/server/db/schema.sql and run: node scripts/gen-schema.js\n' +
		'export const SCHEMA_SQL = `' +
		escaped +
		'`;\n'
);
console.log('schema.ts regenerated (' + sql.length + ' chars)');
