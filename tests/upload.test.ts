/** ZIP uploads: size limits are enforced before anything is inflated. */
import assert from 'node:assert/strict';
import test from 'node:test';
import AdmZip from 'adm-zip';

const { filesFromZip, MAX_UPLOAD_BYTES } = await import('../src/lib/server/upload.ts');

test('an archive that expands past the limit is rejected before inflating', () => {
	const zip = new AdmZip();
	// 201 MB of zeros compresses to about 200 KB.
	zip.addFile('board.kicad_pcb', Buffer.alloc(MAX_UPLOAD_BYTES + 1024 * 1024));
	const archive = zip.toBuffer();
	assert.ok(archive.length < 1024 * 1024);

	const before = process.memoryUsage().arrayBuffers;
	assert.throws(() => filesFromZip(archive), /expands to more than 200 MB/);
	assert.ok(process.memoryUsage().arrayBuffers - before < 50 * 1024 * 1024, 'nothing was inflated');
});

test('a normal archive is unpacked with its wrapping folder stripped', () => {
	const zip = new AdmZip();
	zip.addFile('board/board.kicad_pcb', Buffer.from('(kicad_pcb)'));
	zip.addFile('board/board.kicad_sch', Buffer.from('(kicad_sch)'));
	zip.addFile('board/__MACOSX/._x', Buffer.from('noise'));
	assert.deepEqual(filesFromZip(zip.toBuffer()).map((f) => f.path), ['board.kicad_pcb', 'board.kicad_sch']);
});
