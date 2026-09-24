/**
 * Prepares KiCad's GLB for the browser. KiCad writes one primitive per footprint
 * face — tens of thousands for a real board, with a JSON header of many megabytes —
 * and the viewer used to parse all of them and merge them by material on every load.
 * This does that merge once, at render time:
 *
 * - every primitive is baked into world space and joined with the others that share
 *   its material and category (board layer, SMD, THT or other parts);
 * - the board's own meshes keep KiCad's names ("<board>_soldermask", …), which the
 *   viewer uses for recolouring; parts are named "pcbgit_smd", "pcbgit_tht", …;
 * - the result is written with EXT_meshopt_compression (lossless here).
 */
import { Document, NodeIO, type Accessor, type Material, type Node, type Primitive, type Scene } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

export type Mount = 'smd' | 'tht' | 'other';

/** Marks a GLB this module produced; the viewer reads categories from mesh names then. */
export const PART_MESH_PREFIX = 'pcbgit_';

const TRIANGLES = 4;

/**
 * Takes and returns bytes, never paths: readBinary() refuses external buffers and
 * images, which read() would load from any path the file names.
 */
export async function optimizeBoardGlb(source: Uint8Array, mounts: Record<string, Mount>) {
	await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
	const io = new NodeIO()
		.registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression])
		.registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

	const document = await io.readBinary(source);
	const root = document.getRoot();
	const scene = root.getDefaultScene() ?? root.listScenes()[0];
	if (!scene) throw new Error('GLB has no scene');

	const board = boardName(scene);

	// Collect every primitive with its world matrix and the group it belongs to.
	interface Item {
		primitive: Primitive;
		matrix: number[];
	}
	const groups = new Map<string, { name: string; material: Material | null; items: Item[] }>();
	const visit = (node: Node, mount: Mount) => {
		const own = mounts[node.getName()];
		const here = own ?? mount;
		const mesh = node.getMesh();
		if (mesh) {
			const meshName = mesh.getName();
			const onBoard = board !== null && meshName.startsWith(`${board}_`);
			for (const primitive of mesh.listPrimitives()) {
				if (primitive.getMode() !== TRIANGLES || !primitive.getAttribute('POSITION')) continue;
				const material = primitive.getMaterial();
				const semantics = primitive.listSemantics().sort().join(',');
				const name = onBoard ? meshName : `${PART_MESH_PREFIX}${here}`;
				const key = `${name}|${material ? root.listMaterials().indexOf(material) : -1}|${semantics}`;
				if (!groups.has(key)) groups.set(key, { name, material, items: [] });
				groups.get(key)!.items.push({ primitive, matrix: node.getWorldMatrix() as number[] });
			}
		}
		for (const child of node.listChildren()) visit(child, here);
	};
	for (const node of scene.listChildren()) visit(node, 'other');

	// Build one joined primitive per group, then drop everything that came before.
	const buffer = root.listBuffers()[0] ?? document.createBuffer();
	const oldNodes = root.listNodes();
	const oldMeshes = root.listMeshes();
	const oldAccessors = root.listAccessors();
	const created: Node[] = [];
	for (const { name, material, items } of groups.values()) {
		const primitive = joinInWorldSpace(document, buffer, items);
		if (material) primitive.setMaterial(material);
		const mesh = document.createMesh(name).addPrimitive(primitive);
		created.push(document.createNode(name).setMesh(mesh));
	}
	for (const node of oldNodes) node.dispose();
	for (const mesh of oldMeshes) mesh.dispose();
	for (const accessor of oldAccessors) accessor.dispose();
	for (const node of created) scene.addChild(node);

	document.createExtension(EXTMeshoptCompression).setRequired(true);
	return { data: await io.writeBinary(document), groups: groups.size, board };
}

/** KiCad's board is the shallowest "<name>_PCB" mesh; a daughterboard model sits deeper. */
function boardName(scene: Scene) {
	let best: { name: string; depth: number } | null = null;
	const visit = (node: Node, depth: number) => {
		const name = node.getMesh()?.getName() ?? '';
		if (name.endsWith('_PCB') && (!best || depth < best.depth)) best = { name, depth };
		for (const child of node.listChildren()) visit(child, depth + 1);
	};
	for (const node of scene.listChildren()) visit(node, 0);
	const found = best as { name: string } | null;
	return found ? found.name.slice(0, -'_PCB'.length) : null;
}

/**
 * Concatenates primitives that share attributes, transforming positions by each
 * item's world matrix and normals by its inverse transpose.
 */
function joinInWorldSpace(
	document: Document,
	buffer: ReturnType<Document['createBuffer']>,
	items: { primitive: Primitive; matrix: number[] }[]
) {
	const semantics = items[0].primitive.listSemantics();
	const vertexCount = items.reduce((sum, item) => sum + item.primitive.getAttribute('POSITION')!.getCount(), 0);
	const indexCount = items.reduce((sum, item) => sum + (item.primitive.getIndices()?.getCount() ?? item.primitive.getAttribute('POSITION')!.getCount()), 0);

	const out = new Map<string, { data: Float32Array<ArrayBuffer>; size: number; type: string }>();
	for (const semantic of semantics) {
		const accessor = items[0].primitive.getAttribute(semantic)!;
		const size = accessor.getElementSize();
		out.set(semantic, { data: new Float32Array(vertexCount * size), size, type: accessor.getType() });
	}
	const indices = new Uint32Array(indexCount);

	let vertexBase = 0;
	let indexBase = 0;
	const element: number[] = [];
	for (const { primitive, matrix } of items) {
		const count = primitive.getAttribute('POSITION')!.getCount();
		const normalMatrix = inverseTranspose3(matrix);
		for (const semantic of semantics) {
			const accessor = primitive.getAttribute(semantic) as Accessor;
			const { data, size } = out.get(semantic)!;
			for (let i = 0; i < count; i++) {
				accessor.getElement(i, element);
				const offset = (vertexBase + i) * size;
				if (semantic === 'POSITION') {
					const [x, y, z] = element;
					data[offset] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
					data[offset + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
					data[offset + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
				} else if (semantic === 'NORMAL') {
					const [x, y, z] = element;
					const nx = normalMatrix[0] * x + normalMatrix[3] * y + normalMatrix[6] * z;
					const ny = normalMatrix[1] * x + normalMatrix[4] * y + normalMatrix[7] * z;
					const nz = normalMatrix[2] * x + normalMatrix[5] * y + normalMatrix[8] * z;
					const length = Math.hypot(nx, ny, nz) || 1;
					data[offset] = nx / length;
					data[offset + 1] = ny / length;
					data[offset + 2] = nz / length;
				} else {
					for (let c = 0; c < size; c++) data[offset + c] = element[c];
				}
			}
		}
		const source = primitive.getIndices();
		if (source) {
			const array = source.getArray()!;
			for (let i = 0; i < array.length; i++) indices[indexBase + i] = array[i] + vertexBase;
			indexBase += array.length;
		} else {
			for (let i = 0; i < count; i++) indices[indexBase + i] = vertexBase + i;
			indexBase += count;
		}
		vertexBase += count;
	}

	const primitive = document.createPrimitive();
	for (const [semantic, { data, type }] of out) {
		primitive.setAttribute(semantic, document.createAccessor().setType(type as 'VEC3').setArray(data).setBuffer(buffer));
	}
	// 16-bit indices when they fit: half the size, and every GPU path supports them.
	const index = vertexCount <= 65535 ? Uint16Array.from(indices) : indices;
	primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(index).setBuffer(buffer));
	return primitive;
}

/** Inverse transpose of the upper-left 3×3 of a column-major 4×4 matrix, column-major. */
function inverseTranspose3(m: number[]) {
	const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
	const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
	const det = a * A + d * B + g * C || 1;
	// Cofactor matrix divided by the determinant is the inverse transpose.
	return [
		A / det, B / det, C / det,
		-(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det,
		(b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det
	];
}
