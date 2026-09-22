/** GLB optimisation: primitives are grouped by board layer / part category and baked into world space. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const { optimizeBoardGlb } = await import('../src/lib/server/render/glb.ts');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbgit-glb-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

/** One triangle at the origin, in its own mesh. */
function triangle(document: Document, name: string, material: ReturnType<Document['createMaterial']>) {
	const buffer = document.getRoot().listBuffers()[0];
	const position = document.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
	const normal = document.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])).setBuffer(buffer);
	const indices = document.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2])).setBuffer(buffer);
	const primitive = document.createPrimitive().setAttribute('POSITION', position).setAttribute('NORMAL', normal).setIndices(indices).setMaterial(material);
	return document.createMesh(name).addPrimitive(primitive);
}

test('board layers keep their names, parts are grouped per category, transforms are baked in', async () => {
	const document = new Document();
	document.createBuffer();
	const mask = document.createMaterial('mask');
	const plastic = document.createMaterial('plastic');
	const scene = document.createScene();
	scene.addChild(document.createNode('a').setMesh(triangle(document, 'Board_PCB', mask)));
	scene.addChild(document.createNode('b').setMesh(triangle(document, 'Board_soldermask', mask)));
	// Two parts of the same footprint type, and a daughterboard with its own "_PCB" mesh nested under U3.
	for (const [ref, x] of [['R1', 10], ['R2', 20], ['U3', 30]] as const) {
		const part = document.createNode(ref).setTranslation([x, 0, 0]);
		part.addChild(document.createNode('model').setMesh(triangle(document, ref === 'U3' ? 'Daughter_PCB' : 'body', plastic)));
		scene.addChild(part);
	}
	const source = path.join(dir, 'in.glb');
	await new NodeIO().write(source, document);

	const target = path.join(dir, 'out.glb');
	const result = await optimizeBoardGlb(source, target, { R1: 'smd', R2: 'smd', U3: 'tht' });
	assert.equal(result.board, 'Board', 'the shallowest _PCB mesh is the board');

	await MeshoptDecoder.ready;
	const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
	const output = await io.read(target);
	assert.ok(output.getRoot().listExtensionsUsed().some((extension) => extension.extensionName === 'EXT_meshopt_compression'));

	const meshes = Object.fromEntries(output.getRoot().listMeshes().map((mesh) => [mesh.getName(), mesh]));
	assert.deepEqual(Object.keys(meshes).sort(), ['Board_PCB', 'Board_soldermask', 'pcbgit_smd', 'pcbgit_tht']);

	// R1 and R2 became one primitive, each triangle moved by its footprint's translation.
	const smd = meshes.pcbgit_smd.listPrimitives()[0];
	assert.equal(smd.getIndices()!.getCount(), 6);
	const xs = Array.from(smd.getAttribute('POSITION')!.getArray()!).filter((_, i) => i % 3 === 0);
	assert.deepEqual(xs, [10, 11, 10, 20, 21, 20]);
	assert.equal(smd.getMaterial()!.getName(), 'plastic');
});
