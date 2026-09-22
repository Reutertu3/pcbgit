<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import { t } from '$lib/i18n/t';

	interface Props {
		url: string;
		/** Reference designator -> mounting type, from the board file. */
		mounts?: Record<string, 'smd' | 'tht' | 'other'>;
		/** Printed on exported images when the caption option is on. */
		caption?: string;
		/** Download file name, without extension. */
		fileBase?: string;
		class?: string;
	}
	let { url, mounts = {}, caption = '', fileBase = 'board-3d', class: className = '' }: Props = $props();

	type Vec3 = [number, number, number];

	/**
	 * Soldermask finishes offered by JLCPCB, as sRGB approximations of the real boards.
	 * Coloured masks let copper show through faintly; black and white are near opaque,
	 * or the light core and gold copper underneath tint them brown and grey.
	 */
	const MASKS = [
		{ id: 'green', label: 'Green', color: '#125c33', opacity: 0.94 },
		{ id: 'blue', label: 'Blue', color: '#123f8c', opacity: 0.94 },
		{ id: 'yellow', label: 'Yellow', color: '#c9a414', opacity: 0.94 },
		{ id: 'purple', label: 'Purple', color: '#4a1f70', opacity: 0.94 },
		{ id: 'red', label: 'Red', color: '#a31a1a', opacity: 0.94 },
		{ id: 'white', label: 'White', color: '#eeeeea', opacity: 0.99 },
		{ id: 'black', label: 'Black', color: '#141414', opacity: 0.995 }
	] as const;
	const SILKS = [
		{ id: 'white', label: 'White', color: '#f4f4f0' },
		{ id: 'black', label: 'Black', color: '#111111' }
	] as const;
	/** Surface finish of the exposed pads. Roughness is a uniform too, so switching is free. */
	const FINISHES = [
		{ id: 'hasl', label: 'HASL', title: 'viewer3d.finish.hasl', color: '#c3c6c9', roughness: 0.34 },
		{ id: 'enig', label: 'ENIG', title: 'viewer3d.finish.enig', color: '#dcb65e', roughness: 0.2 }
	] as const;
	type MaskId = (typeof MASKS)[number]['id'];
	type SilkId = (typeof SILKS)[number]['id'];
	type FinishId = (typeof FINISHES)[number]['id'];
	const COLOR_KEY = 'pcbgit-3d-colors';

	/** Home view: tilted top-down, the angle that fills a landscape viewport best. */
	const HOME: Vec3 = [0, 1, 0.62];

	let host = $state<HTMLDivElement | null>(null);
	let cube = $state<HTMLDivElement | null>(null);
	let progress = $state(0);
	let error = $state<string | null>(null);
	let loaded = $state(false);
	let backend = $state('');
	let drawCalls = $state(0);
	/** Frames drawn in the last second; null while the view is still (nothing is rendered then). */
	let fps = $state<number | null>(null);
	let mask = $state<MaskId>('green');
	let silk = $state<SilkId>('white');
	let finish = $state<FinishId>('hasl');
	/** False for models without KiCad's named board layers; the pickers are hidden then. */
	let recolorable = $state(false);

	/* View options panel */
	const COMPARISONS = [
		{ id: 'none', label: 'viewer3d.compare.none' },
		{ id: 'card', label: 'viewer3d.compare.card' },
		{ id: 'coin', label: 'viewer3d.compare.coin' },
		{ id: 'banana', label: 'viewer3d.compare.banana' }
	] as const;
	type CompareId = (typeof COMPARISONS)[number]['id'];
	let showSmd = $state(true);
	let showTht = $state(true);
	let showRuler = $state(false);
	let compare = $state<CompareId>('none');
	let counts = $state({ smd: 0, tht: 0 });
	let rulerLabels = $state<{ width: string; depth: string }>({ width: '', depth: '' });
	let widthLabel = $state<HTMLSpanElement | null>(null);
	let depthLabel = $state<HTMLSpanElement | null>(null);
	let setShown = $state<(category: 'smd' | 'tht', on: boolean) => void>(() => {});
	let setRuler = $state<(on: boolean) => void>(() => {});
	let setCompare = $state<(kind: CompareId) => void>(() => {});

	/* Image export */
	const EXPORT_SIZES = [
		{ id: 'view2', label: 'viewer3d.size.view2', scale: 2 },
		{ id: 'view4', label: 'viewer3d.size.view4', scale: 4 },
		{ id: 'fhd', label: '1920 × 1080', width: 1920, height: 1080 },
		{ id: 'uhd', label: '3840 × 2160 (4K)', width: 3840, height: 2160 },
		{ id: 'square', label: '2048 × 2048', width: 2048, height: 2048 }
	] as const;
	type ExportSizeId = (typeof EXPORT_SIZES)[number]['id'];
	type ExportBackground = 'transparent' | 'viewer' | 'white' | 'custom';
	type ExportFormat = 'png' | 'jpeg' | 'webp';
	interface ExportOptions {
		size: ExportSizeId;
		background: ExportBackground;
		customColor: string;
		format: ExportFormat;
		reframe: boolean;
		labels: boolean;
		caption: boolean;
	}
	/** Browsers cap canvas and GPU buffer sizes; stay well inside common limits. */
	const MAX_EXPORT_EDGE = 8192;

	let exportOpen = $state(false);
	let exporting = $state(false);
	let exportError = $state<string | null>(null);
	let exportOptions = $state<ExportOptions>({
		size: 'view2',
		background: 'viewer',
		customColor: '#ffffff',
		format: 'png',
		reframe: true,
		labels: true,
		caption: false
	});
	let exportImage = $state<(options: ExportOptions) => Promise<Blob>>(async () => {
		throw new Error(t('viewer3d.notReady'));
	});

	/** Pixel size an option resolves to, clamped to what browsers can render. */
	function exportDimensions(id: ExportSizeId) {
		const option = EXPORT_SIZES.find((o) => o.id === id)!;
		let width = 'scale' in option ? Math.round((host?.clientWidth ?? 1280) * option.scale) : option.width;
		let height = 'scale' in option ? Math.round((host?.clientHeight ?? 720) * option.scale) : option.height;
		const shrink = Math.min(1, MAX_EXPORT_EDGE / Math.max(width, height));
		width = Math.round(width * shrink);
		height = Math.round(height * shrink);
		return { width, height, keepsFraming: 'scale' in option };
	}

	async function runExport() {
		exporting = true;
		exportError = null;
		try {
			const blob = await exportImage($state.snapshot(exportOptions));
			const link = document.createElement('a');
			link.href = URL.createObjectURL(blob);
			link.download = `${fileBase}.${exportOptions.format === 'jpeg' ? 'jpg' : exportOptions.format}`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
			exportOpen = false;
		} catch (error) {
			exportError = error instanceof Error ? error.message : t('viewer3d.exportFailed');
		} finally {
			exporting = false;
		}
	}

	// Assigned once three.js has loaded.
	let viewFrom = $state<(direction: Vec3) => void>(() => {});
	let applyColors = $state<() => void>(() => {});

	try {
		const saved = JSON.parse(localStorage.getItem(COLOR_KEY) ?? 'null');
		if (MASKS.some((m) => m.id === saved?.mask)) mask = saved.mask;
		if (SILKS.some((m) => m.id === saved?.silk)) silk = saved.silk;
		if (FINISHES.some((m) => m.id === saved?.finish)) finish = saved.finish;
	} catch {
		// No storage (private mode, SSR): keep the defaults.
	}

	function choose(next: { mask?: MaskId; silk?: SilkId; finish?: FinishId }) {
		if (next.mask) {
			mask = next.mask;
			// As at JLCPCB: white mask gets black print, black mask gets white print.
			if (next.mask === 'white') silk = 'black';
			if (next.mask === 'black') silk = 'white';
		}
		if (next.silk) silk = next.silk;
		if (next.finish) finish = next.finish;
		applyColors();
		try {
			localStorage.setItem(COLOR_KEY, JSON.stringify({ mask, silk, finish }));
		} catch {
			// Not persisted; the choice still applies to this view.
		}
	}

	/* ------------------------------------------------------------ view cube */

	/**
	 * A chamfered cube like Fusion 360's ViewCube: 6 faces, 12 bevelled 45° edges and
	 * 8 corner triangles. Each of the 26 facets is a button that faces its own view
	 * direction. Model space: glTF is Y-up, the board lies in XZ with its top on +Y.
	 */
	const CUBE_HALF = 32;
	const CHAMFER = 11;

	/** Face orientation (right, up) chosen so every label reads upright. */
	const FACE_BASIS: Record<string, { label: string; x: Vec3; y: Vec3 }> = {
		'0,1,0': { label: 'viewer3d.cube.top', x: [1, 0, 0], y: [0, 0, -1] },
		'0,-1,0': { label: 'viewer3d.cube.bottom', x: [1, 0, 0], y: [0, 0, 1] },
		'0,0,1': { label: 'viewer3d.cube.front', x: [1, 0, 0], y: [0, 1, 0] },
		'0,0,-1': { label: 'viewer3d.cube.back', x: [-1, 0, 0], y: [0, 1, 0] },
		'1,0,0': { label: 'viewer3d.cube.right', x: [0, 0, -1], y: [0, 1, 0] },
		'-1,0,0': { label: 'viewer3d.cube.left', x: [0, 0, 1], y: [0, 1, 0] }
	};

	const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
	const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	const unit = (a: Vec3): Vec3 => {
		const l = Math.hypot(...a);
		return [a[0] / l, a[1] / l, a[2] / l];
	};

	interface Facet {
		dir: Vec3;
		name: string;
		kind: 'face' | 'edge' | 'corner';
		label: string;
		transform: string;
		width: number;
		height: number;
		clip: string;
		shade: number;
	}

	/** Polygon corners of the facet whose outward direction is the sign vector `s`. */
	function facetVertices(s: Vec3): Vec3[] {
		const H = CUBE_HALF;
		const I = CUBE_HALF - CHAMFER;
		const axes = [0, 1, 2].filter((i) => s[i] !== 0);
		const point = (values: Record<number, number>): Vec3 => [values[0], values[1], values[2]];

		if (axes.length === 1) {
			// Face: the inner square, in cyclic order.
			const [a] = axes;
			const [u, v] = [0, 1, 2].filter((i) => i !== a);
			return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([pu, pv]) => point({ [a]: s[a] * H, [u]: pu * I, [v]: pv * I }));
		}
		if (axes.length === 2) {
			// Edge bevel between two faces, running along the free axis.
			const [a, b] = axes;
			const t = [0, 1, 2].find((i) => s[i] === 0)!;
			const p1 = { [a]: s[a] * H, [b]: s[b] * I };
			const p2 = { [a]: s[a] * I, [b]: s[b] * H };
			return [point({ ...p1, [t]: -I }), point({ ...p1, [t]: I }), point({ ...p2, [t]: I }), point({ ...p2, [t]: -I })];
		}
		// Corner triangle where three bevels meet.
		return [0, 1, 2].map((i) => point({ 0: s[0] * (i === 0 ? H : I), 1: s[1] * (i === 1 ? H : I), 2: s[2] * (i === 2 ? H : I) }));
	}

	/**
	 * Lays a polygon into CSS: a box in the facet's own plane, clipped to its shape
	 * (clip-path also limits the clickable area), placed with three.js
	 * CSS3DRenderer's axis conversion.
	 */
	function buildFacet(s: Vec3): Facet {
		const vertices = facetVertices(s);
		const n = unit(s);
		const faceInfo = FACE_BASIS[s.join(',')];
		const x = faceInfo ? faceInfo.x : unit(sub(vertices[1], vertices[0]));
		const y = faceInfo ? faceInfo.y : cross(n, x);

		const centroid = vertices.reduce<Vec3>((c, v) => [c[0] + v[0] / vertices.length, c[1] + v[1] / vertices.length, c[2] + v[2] / vertices.length], [0, 0, 0]);
		const local = vertices.map((v) => [dot(sub(v, centroid), x), dot(sub(v, centroid), y)]);
		const minX = Math.min(...local.map((p) => p[0])), maxX = Math.max(...local.map((p) => p[0]));
		const minY = Math.min(...local.map((p) => p[1])), maxY = Math.max(...local.map((p) => p[1]));
		const width = maxX - minX, height = maxY - minY;
		const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
		const p = [0, 1, 2].map((i) => centroid[i] + x[i] * cx + y[i] * cy);
		const clip = local.map(([u, v]) => `${(((u - minX) / width) * 100).toFixed(2)}% ${(((maxY - v) / height) * 100).toFixed(2)}%`).join(', ');

		const kind = faceInfo ? 'face' : s.filter((v) => v !== 0).length === 2 ? 'edge' : 'corner';
		const name = [s[1] > 0 ? 'top' : s[1] < 0 ? 'bottom' : '', s[2] > 0 ? 'front' : s[2] < 0 ? 'back' : '', s[0] > 0 ? 'right' : s[0] < 0 ? 'left' : '']
			.filter(Boolean)
			.join('-');

		return {
			dir: s,
			name,
			kind,
			label: faceInfo?.label ?? '',
			transform: `translate(-50%, -50%) matrix3d(${x[0]},${x[1]},${x[2]},0,${-y[0]},${-y[1]},${-y[2]},0,${n[0]},${n[1]},${n[2]},0,${p[0]},${p[1]},${p[2]},1)`,
			width,
			height,
			clip: `polygon(${clip})`,
			// Fixed shading by how much the facet faces up; makes the cube read as a solid.
			shade: Math.round(55 + 35 * n[1])
		};
	}

	/** "top-front" → "Top-Front" in the viewer's language. */
	const facetName = (facet: Facet) =>
		facet.name
			.split('-')
			.map((part) => t(`viewer3d.cube.${part}` as 'viewer3d.cube.top'))
			.join('-');

	const FACETS: Facet[] = [];
	for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
		if (sx || sy || sz) FACETS.push(buildFacet([sx, sy, sz]));
	}

	/* Dragging on the cube orbits the board; a click without movement picks a facet. */
	let orbitBy = $state<(dx: number, dy: number) => void>(() => {});
	let drag: { id: number; x: number; y: number; active: boolean } | null = null;
	const DRAG_THRESHOLD = 4;

	function cubePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		drag = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
	}

	function cubePointerMove(event: PointerEvent) {
		if (!drag || drag.id !== event.pointerId) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (!drag.active) {
			if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
			drag.active = true;
			// Captured only once it is a drag, so a plain click still reaches its facet.
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}
		drag.x = event.clientX;
		drag.y = event.clientY;
		orbitBy(dx, dy);
	}

	function cubePointerUp(event: PointerEvent) {
		if (drag?.active) (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		drag = null;
	}

	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | undefined;

		(async () => {
			// three.js is heavy and only this tab needs it, so it is imported lazily.
			const THREE = await import('three/webgpu');
			const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
			const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
			const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
			const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
			const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
			if (disposed || !host) return;

			// WebGPU where the browser has it, WebGL 2 otherwise; same code either way.
			const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
			await renderer.init();
			if (disposed) {
				renderer.dispose();
				return;
			}
			backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
			// HiDPI screens need 4x the pixels, which halves the frame rate on integrated GPUs.
			// Motion renders at 1x; the view sharpens to full resolution once it settles.
			const stillRatio = Math.min(devicePixelRatio, 2);
			const motionRatio = Math.min(stillRatio, 1);
			renderer.setPixelRatio(stillRatio);
			renderer.setSize(host.clientWidth, host.clientHeight);
			renderer.setClearColor(0x000000, 0);
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.toneMappingExposure = 1.05;
			host.appendChild(renderer.domElement);

			const scene = new THREE.Scene();
			// A room environment gives solder mask and copper believable reflections without an HDRI.
			const pmrem = new THREE.PMREMGenerator(renderer);
			const envTarget = await pmrem.fromSceneAsync(new RoomEnvironment(), 0.04);
			scene.environment = envTarget.texture;
			// Full-strength room light plus direct lights over-exposes a flat board and
			// washes mask colours out to pastels.
			scene.environmentIntensity = 0.55;

			const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.1, 5000);
			const controls = new OrbitControls(camera, renderer.domElement);
			controls.enableDamping = true;
			controls.dampingFactor = 0.1;
			controls.rotateSpeed = 0.8;
			controls.panSpeed = 0.9;

			const key = new THREE.DirectionalLight(0xffffff, 1.1);
			key.position.set(1, 2.2, 1.4);
			scene.add(key);
			const fill = new THREE.DirectionalLight(0xffffff, 0.35);
			fill.position.set(-1.4, -0.6, -1);
			scene.add(fill);

			/* ---- camera animation between views ---- */
			let animation: {
				start: number;
				fromDir: import('three/webgpu').Vector3;
				turn: import('three/webgpu').Quaternion;
				fromDist: number;
				toDist: number;
				fromTarget: import('three/webgpu').Vector3;
				toTarget: import('three/webgpu').Vector3;
			} | null = null;
			const ANIMATION_MS = 450;

			function stepAnimation(now: number) {
				if (!animation) return false;
				const t = Math.min(1, (now - animation.start) / ANIMATION_MS);
				const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
				const turn = new THREE.Quaternion().slerp(animation.turn, e);
				const dir = animation.fromDir.clone().applyQuaternion(turn);
				const target = animation.fromTarget.clone().lerp(animation.toTarget, e);
				const dist = animation.fromDist + (animation.toDist - animation.fromDist) * e;
				controls.target.copy(target);
				camera.position.copy(target).addScaledVector(dir, dist);
				if (t >= 1) animation = null;
				return animation !== null;
			}

			/* ---- render on demand: nothing runs while the view is still ---- */
			let pending = 0;
			let interacting = false;
			let trailing = 0;
			const requestRender = () => {
				// The WebGL fallback of WebGPURenderer (three r174) presents a frame one
				// render late, so every burst of renders ends with one extra frame.
				trailing = 1;
				if (!pending) pending = requestAnimationFrame(frame);
			};
			function frame(now: number) {
				pending = 0;
				// An export owns the canvas while it runs; it re-requests a frame when done.
				if (exporting) return;
				const animating = stepAnimation(now);
				// With damping, update() keeps emitting 'change' until the motion settles.
				const moving = controls.update() || animating || interacting;
				const ratio = moving ? motionRatio : stillRatio;
				const sharpened = !moving && renderer.getPixelRatio() !== ratio;
				if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
				fitClipPlanes();
				renderer.render(scene, camera);
				frameTimes.push(now);
				syncCube();
				syncRulerLabels();
				if (animating || sharpened) requestRender();
				else if (!pending && trailing > 0) {
					trailing--;
					pending = requestAnimationFrame(frame);
				}
			}
			controls.addEventListener('change', requestRender);

			/* ---- live frame rate: counts frames actually drawn, so a still view reads idle ---- */
			const frameTimes: number[] = [];
			const fpsTimer = setInterval(() => {
				const cutoff = performance.now() - 1000;
				while (frameTimes.length && frameTimes[0] < cutoff) frameTimes.shift();
				fps = frameTimes.length > 1 ? frameTimes.length : null;
			}, 250);

			/** Rotates the CSS cube with the camera (CSS3DRenderer's camera matrix, rotation only). */
			function syncCube() {
				if (!cube) return;
				const e = camera.matrixWorldInverse.elements;
				cube.style.transform = `matrix3d(${e[0]},${-e[1]},${e[2]},0,${e[4]},${-e[5]},${e[6]},0,${e[8]},${-e[9]},${e[10]},0,0,0,0,1)`;
			}

			/** Pins the ruler's HTML labels to their 3D anchor points. */
			const labelAnchors: { el: () => HTMLElement | null; at: import('three/webgpu').Vector3 }[] = [];
			function syncRulerLabels() {
				if (!host) return;
				const w = host.clientWidth, h = host.clientHeight;
				for (const { el, at } of labelAnchors) {
					const node = el();
					if (!node) continue;
					const ndc = at.clone().project(camera);
					const visible = showRuler && ndc.z < 1;
					node.style.display = visible ? '' : 'none';
					if (visible) node.style.transform = `translate(${((ndc.x + 1) / 2) * w}px, ${((1 - ndc.y) / 2) * h}px) translate(-50%, -50%)`;
				}
			}

			let currentDir = new THREE.Vector3(...HOME).normalize();
			let userMoved = false;
			controls.addEventListener('start', () => {
				userMoved = true;
				interacting = true;
				animation = null;
			});
			controls.addEventListener('end', () => {
				interacting = false;
				requestRender();
			});

			const bounds = new THREE.Box3();
			const centre = new THREE.Vector3();
			/** Sampled model vertices (x,y,z…), relative to the centre, used for framing. */
			let fitPoints = new Float32Array(0);

			/**
			 * Camera pose that frames the model from a direction, using its actual
			 * vertices. A bounding box would waste space: one tall part makes the box
			 * far higher than the board, and in angled views its empty corners stick out.
			 */
			function poseFor(direction: import('three/webgpu').Vector3, fill = 0.92) {
				const dir = direction.clone().normalize();
				// OrbitControls cannot sit exactly on a pole; nudge straight up/down views.
				// The nudge decides which way is up on screen: toward the board's back edge
				// in both cases, so the bottom view looks like the board turned over in
				// your hand (left-right mirrored, bottom silkscreen readable), not upside down.
				if (Math.abs(dir.y) > 0.9999) dir.set(0, Math.sign(dir.y), Math.sign(dir.y) * 1e-4).normalize();

				const probe = new THREE.PerspectiveCamera(camera.fov, camera.aspect);
				probe.position.copy(dir);
				probe.lookAt(0, 0, 0);
				probe.updateMatrixWorld();
				const right = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0);
				const up = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1);
				const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * fill;
				const tanH = tanV * camera.aspect;

				// Each point needs depth + offset/tan(half-fov) of distance to stay in frame.
				// Angled views are not symmetric about the centre, so the aim point is
				// shifted toward the middle of the projected extents and the distance
				// recomputed; two passes converge closely enough.
				const target = new THREE.Vector3();
				let distance = 0;
				for (let pass = 0; pass < 3; pass++) {
					const tr = target.dot(right), tu = target.dot(up), td = target.dot(dir);
					distance = 0;
					for (let i = 0; i < fitPoints.length; i += 3) {
						const x = fitPoints[i], y = fitPoints[i + 1], z = fitPoints[i + 2];
						const depth = x * dir.x + y * dir.y + z * dir.z - td;
						const across = Math.abs(x * right.x + y * right.y + z * right.z - tr) / tanH;
						const vertical = Math.abs(x * up.x + y * up.y + z * up.z - tu) / tanV;
						distance = Math.max(distance, depth + across, depth + vertical);
					}
					if (pass === 2) break;

					let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
					for (let i = 0; i < fitPoints.length; i += 3) {
						const x = fitPoints[i], y = fitPoints[i + 1], z = fitPoints[i + 2];
						const toCamera = distance - (x * dir.x + y * dir.y + z * dir.z - td);
						const sx = (x * right.x + y * right.y + z * right.z - tr) / toCamera;
						const sy = (x * up.x + y * up.y + z * up.z - tu) / toCamera;
						minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
						minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
					}
					target.addScaledVector(right, ((minX + maxX) / 2) * distance);
					target.addScaledVector(up, ((minY + maxY) / 2) * distance);
				}

				const aim = centre.clone().add(target);
				return { dir, distance, target: aim };
			}

			/** Frames a direction immediately (load, resize). */
			function snapTo(direction: import('three/webgpu').Vector3) {
				if (!fitPoints.length) return;
				const pose = poseFor(direction);
				controls.target.copy(pose.target);
				camera.position.copy(pose.target).addScaledVector(pose.dir, pose.distance);
				controls.update();
				currentDir = direction.clone();
				requestRender();
			}

			/** Glides to a direction (view cube, home button). */
			viewFrom = (direction) => {
				if (!fitPoints.length) return;
				const pose = poseFor(new THREE.Vector3(...direction));
				const offset = camera.position.clone().sub(controls.target);
				const fromDir = offset.clone().normalize();
				animation = {
					start: performance.now(),
					fromDir,
					turn: new THREE.Quaternion().setFromUnitVectors(fromDir, pose.dir),
					fromDist: offset.length(),
					toDist: pose.distance,
					fromTarget: controls.target.clone(),
					toTarget: pose.target
				};
				currentDir = new THREE.Vector3(...direction);
				userMoved = false;
				requestRender();
			};

			/** Orbits like dragging the canvas: the board turns with the pointer. */
			orbitBy = (dx, dy) => {
				animation = null;
				userMoved = true;
				const radiansPerPixel = (2 * Math.PI) / 360; // one degree per pixel
				const offset = camera.position.clone().sub(controls.target);
				const spherical = new THREE.Spherical().setFromVector3(offset);
				spherical.theta -= dx * radiansPerPixel;
				spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * radiansPerPixel, 1e-4, Math.PI - 1e-4);
				offset.setFromSpherical(spherical);
				camera.position.copy(controls.target).add(offset);
				controls.update();
				requestRender();
			};

			/* ---- board layer materials: mask, silkscreen, pad finish ---- */
			type Role = 'mask' | 'silk' | 'pad' | 'body';
			type Category = 'board' | 'smd' | 'tht' | 'other';
			const roleMaterials: Record<Role, import('three/webgpu').MeshStandardMaterial[]> = { mask: [], silk: [], pad: [], body: [] };
			const categoryMeshes: Record<Category, import('three/webgpu').Mesh[]> = { board: [], smd: [], tht: [], other: [] };
			const roleClones = new Map<string, import('three/webgpu').Material>();
			const materials = new Set<import('three/webgpu').Material>();

			applyColors = () => {
				const maskDef = MASKS.find((m) => m.id === mask)!;
				const silkColor = SILKS.find((m) => m.id === silk)!.color;
				const finishDef = FINISHES.find((m) => m.id === finish)!;
				// Colour and roughness are uniforms: no shader recompile, so this is instant.
				for (const material of roleMaterials.mask) {
					material.color.set(maskDef.color);
					material.opacity = maskDef.opacity;
				}
				for (const material of roleMaterials.silk) material.color.set(silkColor);
				for (const material of roleMaterials.pad) {
					material.color.set(finishDef.color);
					material.metalness = 1;
					material.roughness = finishDef.roughness;
				}
				requestRender();
			};

			/**
			 * KiCad exports one primitive per footprint face, often tens of thousands of
			 * them, and every one is a draw call. Baking transforms and merging all
			 * meshes that share a material collapses that to one draw call per material.
			 */
			function mergeByMaterial(
				root: import('three/webgpu').Object3D,
				classify: (mesh: import('three/webgpu').Mesh) => { role: Role | null; category: Category }
			) {
				root.updateMatrixWorld(true);
				const groups = new Map<string, { material: import('three/webgpu').Material; category: Category; geometries: import('three/webgpu').BufferGeometry[] }>();
				const loose: import('three/webgpu').Mesh[] = [];

				root.traverse((object) => {
					const mesh = object as import('three/webgpu').Mesh;
					if (!mesh.isMesh) return;
					if (Array.isArray(mesh.material)) {
						loose.push(mesh);
						return;
					}
					let material = mesh.material;
					const { role, category } = classify(mesh);
					if (role) {
						// Cloned so recolouring the board never touches a component's material.
						let clone = roleClones.get(material.uuid);
						if (!clone) {
							clone = material.clone();
							// Silkscreen ink is opaque; KiCad's 0.9 greys black print on a white mask.
							// It stays in the transparent pass so it can be ordered after the mask.
							if (role === 'silk') clone.opacity = 1;
							// KiCad exports the board core 2% transparent; transparent surfaces do
							// not write depth, so the board could be seen through. Make it solid.
							if (role === 'body') {
								clone.transparent = false;
								clone.opacity = 1;
								clone.depthWrite = true;
								clone.side = THREE.DoubleSide;
							}
							roleClones.set(material.uuid, clone);
							roleMaterials[role].push(clone as import('three/webgpu').MeshStandardMaterial);
						}
						material = clone;
					}
					const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
					const signature = Object.keys(geometry.attributes).sort().join(',');
					// Split by category too, so SMD/THT parts can be hidden without rebuilding.
					const key = `${material.uuid}|${category}|${signature}|${geometry.index ? 'i' : 'n'}`;
					if (!groups.has(key)) groups.set(key, { material, category, geometries: [] });
					groups.get(key)!.geometries.push(geometry);
				});

				const merged = new THREE.Group();
				for (const { material, category, geometries } of groups.values()) {
					const combined = geometries.length > 1 ? mergeGeometries(geometries, false) : geometries[0];
					const meshes = combined ? [combined] : geometries;
					for (const geometry of meshes) {
						const mesh = new THREE.Mesh(geometry, material);
						// Mask and silkscreen are nearly coplanar: draw the print after the mask
						// explicitly rather than trusting depth sorting between them.
						if (roleMaterials.mask.includes(material as never)) mesh.renderOrder = 1;
						if (roleMaterials.silk.includes(material as never)) mesh.renderOrder = 2;
						categoryMeshes[category].push(mesh);
						merged.add(mesh);
					}
					if (combined && combined !== geometries[0]) geometries.forEach((geometry) => geometry.dispose());
					materials.add(material);
				}
				for (const mesh of loose) {
					merged.add(mesh.clone());
					(mesh.material as import('three/webgpu').Material[]).forEach((material) => materials.add(material));
				}

				root.traverse((object) => {
					const mesh = object as import('three/webgpu').Mesh;
					if (mesh.isMesh && !loose.includes(mesh)) mesh.geometry.dispose();
				});
				return merged;
			}

			/* ---- ruler, scale comparison, and refitting to whatever is shown ---- */
			let modelRoot: import('three/webgpu').Object3D | null = null;
			let ruler: import('three/webgpu').Group | null = null;
			let comparison: import('three/webgpu').Object3D | null = null;
			const boardBounds = new THREE.Box3();
			const MM = 0.001;

			let fitRadius = 1;
			/**
			 * Clip planes hugging the model from the current camera position. Copper, pads
			 * and mask are 5-15 µm apart; with a fixed near plane the depth buffer resolves
			 * only ~20 µm at normal viewing distance, so those layers z-fought (flickered).
			 */
			function fitClipPlanes() {
				const distance = camera.position.distanceTo(centre);
				const near = Math.max(distance - fitRadius, fitRadius / 200);
				const far = distance + fitRadius * 1.5;
				if (near === camera.near && far === camera.far) return;
				camera.near = near;
				camera.far = far;
				camera.updateProjectionMatrix();
			}

			/** Recomputes the framing set: model, plus the ruler and comparison when shown. */
			function refreshFit() {
				const roots = [modelRoot, ruler, comparison].filter((o): o is import('three/webgpu').Object3D => !!o && o.visible);
				bounds.makeEmpty();
				for (const root of roots) bounds.expandByObject(root);
				bounds.getCenter(centre);
				fitPoints = samplePoints(roots, centre);
				// KiCad exports in metres: a typical board is ~0.1 units across, so the
				// radius must not be clamped to a "sensible" minimum like 1.
				const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 1e-4);
				fitRadius = radius;
				controls.minDistance = radius * 0.05;
				controls.maxDistance = radius * 14;
			}

			/** Glides to frame the current contents from the current viewing angle. */
			function reframe() {
				refreshFit();
				const dir = camera.position.clone().sub(controls.target).normalize();
				viewFrom([dir.x, dir.y, dir.z]);
			}

			/** Dimension lines for width (X) and depth (Z), just above the board. */
			function buildRuler() {
				const group = new THREE.Group();
				const b = boardBounds;
				const size = b.getSize(new THREE.Vector3());
				const y = b.max.y + 0.2 * MM;
				const off = Math.max(size.x, size.z) * 0.07;
				const tick = off * 0.3;
				const zLine = b.max.z + off;
				const xLine = b.min.x - off;
				const segments = [
					// Width: extension lines from the front corners, the dimension line, end ticks.
					[b.min.x, y, b.max.z, b.min.x, y, zLine + tick], [b.max.x, y, b.max.z, b.max.x, y, zLine + tick],
					[b.min.x, y, zLine, b.max.x, y, zLine],
					// Depth: the same along the left edge.
					[b.min.x, y, b.min.z, xLine - tick, y, b.min.z], [b.min.x, y, b.max.z, xLine - tick, y, b.max.z],
					[xLine, y, b.min.z, xLine, y, b.max.z]
				].flat();
				const geometry = new THREE.BufferGeometry();
				geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
				group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xf2d27a })));

				labelAnchors.length = 0;
				labelAnchors.push({ el: () => widthLabel, at: new THREE.Vector3((b.min.x + b.max.x) / 2, y, zLine) });
				labelAnchors.push({ el: () => depthLabel, at: new THREE.Vector3(xLine, y, (b.min.z + b.max.z) / 2) });
				rulerLabels = { width: `${(size.x / MM).toFixed(1)} mm`, depth: `${(size.z / MM).toFixed(1)} mm` };
				return group;
			}

			/* Real-world objects for scale, in metres. Built on demand. */
			function bankCard() {
				// ISO/IEC 7810 ID-1: 85.60 x 53.98 x 0.76 mm, corner radius 3.18 mm.
				const w = 85.6 * MM, h = 53.98 * MM, r = 3.18 * MM;
				const shape = new THREE.Shape();
				shape.moveTo(-w / 2 + r, -h / 2);
				shape.lineTo(w / 2 - r, -h / 2);
				shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
				shape.lineTo(w / 2, h / 2 - r);
				shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
				shape.lineTo(-w / 2 + r, h / 2);
				shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
				shape.lineTo(-w / 2, -h / 2 + r);
				shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
				const body = new THREE.Mesh(
					new THREE.ExtrudeGeometry(shape, { depth: 0.76 * MM, bevelEnabled: false, curveSegments: 6 }),
					new THREE.MeshStandardMaterial({ color: '#1f4f96', roughness: 0.45 })
				);
				body.rotation.x = -Math.PI / 2;
				const chip = new THREE.Mesh(
					new THREE.BoxGeometry(11.8 * MM, 0.08 * MM, 8.9 * MM),
					new THREE.MeshStandardMaterial({ color: '#d8b35a', metalness: 1, roughness: 0.3 })
				);
				chip.position.set(-w / 2 + 16 * MM, 0.8 * MM, -3 * MM);
				const group = new THREE.Group();
				group.add(body, chip);
				return group;
			}

			function euroCoin() {
				// 23.25 mm across, 2.33 mm thick; brass ring around a cupronickel centre.
				const ring = new THREE.Mesh(
					new THREE.CylinderGeometry(11.625 * MM, 11.625 * MM, 2.33 * MM, 64),
					new THREE.MeshStandardMaterial({ color: '#c9a646', metalness: 1, roughness: 0.35 })
				);
				const centre = new THREE.Mesh(
					new THREE.CylinderGeometry(8.1 * MM, 8.1 * MM, 2.4 * MM, 64),
					new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 1, roughness: 0.3 })
				);
				const group = new THREE.Group();
				group.add(ring, centre);
				return group;
			}

			function banana() {
				// A Cavendish, ~20 cm along the curve, lying on its side: green stalk with a cut
				// end, a neck widening into a five-ridged body, curved like a C, dark blossom tip.
				const curve = new THREE.CatmullRomCurve3(
					[[0, 12, 0], [18, 8, -6], [45, 3, -20], [95, 0, -30], [145, 2, -22], [180, 6, -6], [192, 8, 2]].map(
						([x, y, z]) => new THREE.Vector3(x * MM, y * MM, z * MM)
					),
					false,
					'centripetal'
				);
				const tubular = 180, radial = 40;
				const frames = curve.computeFrenetFrames(tubular, false);
				const smooth = (a: number, b: number, x: number) => {
					const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
					return k * k * (3 - 2 * k);
				};
				/** Radius in mm along the banana, t = 0 at the stalk's cut end. */
				const radiusAt = (t: number) => {
					if (t < 0.12) return 5 * (1 + 0.25 * smooth(0.07, 0.12, t));
					if (t < 0.34) return 6.25 + (17.5 - 6.25) * smooth(0.12, 0.34, t);
					if (t < 0.82) return 17.5 * (1 + 0.04 * Math.sin((Math.PI * (t - 0.34)) / 0.48));
					// A blunt blossom end as thick as the neck, closed by a short rounded dome.
					if (t < 0.975) return 6.25 + (17.5 - 6.25) * (1 - smooth(0.82, 0.975, t));
					return Math.max(0.3, 6.25 * Math.sqrt(Math.max(0, 1 - ((t - 0.975) / 0.025) ** 2)));
				};
				const color = (hex: string) => new THREE.Color(hex);
				const C = {
					cut: color('#4f3d24'), stalk: color('#5f7c2a'), neck: color('#b3c03c'), yellow: color('#f0c93a'),
					edge: color('#d4ab28'), spot: color('#7d4f22'), tip: color('#2f2419')
				};
				/** Deterministic hash for the sugar spots, so the banana looks the same every time. */
				const hash = (a: number, b: number) => {
					const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
					return x - Math.floor(x);
				};
				/**
				 * Sugar-spot strength at ring i, segment j (0..1). Spots are scattered one per
				 * few cells with random size; distance is measured in roughly millimetres
				 * (rings are ~1.1 mm apart, segments ~2.7 mm round the body).
				 */
				const SPOT_CELL = [14, 6];
				const spotAt = (i: number, j: number) => {
					let strength = 0;
					const [ci, cj] = [Math.floor(i / SPOT_CELL[0]), Math.floor(j / SPOT_CELL[1])];
					for (let di = -1; di <= 1; di++) {
						for (let dj = -1; dj <= 1; dj++) {
							const [a, b] = [ci + di, (((cj + dj) % (radial / SPOT_CELL[1])) + radial / SPOT_CELL[1]) % (radial / SPOT_CELL[1])];
							if (hash(a, b) > 0.35) continue;
							const si = (a + hash(b, a)) * SPOT_CELL[0];
							const sj = (b + hash(a + 7, b + 3)) * SPOT_CELL[1];
							const radius = 1.2 + 2.2 * hash(a + 13, b + 29);
							let dj2 = Math.abs(j - sj);
							dj2 = Math.min(dj2, radial - dj2);
							const d = Math.hypot((i - si) * 1.1, dj2 * 2.7);
							strength = Math.max(strength, 1 - smooth(radius * 0.4, radius, d));
						}
					}
					return strength;
				};
				const colorAt = (t: number, lobe: number, i: number, j: number) => {
					let c: InstanceType<typeof THREE.Color>;
					if (t < 0.025) c = C.cut.clone();
					else if (t < 0.14) c = C.stalk.clone();
					else if (t < 0.3) c = C.stalk.clone().lerp(C.neck, smooth(0.14, 0.3, t));
					else if (t < 0.4) c = C.neck.clone().lerp(C.yellow, smooth(0.3, 0.4, t));
					else c = C.yellow.clone();
					// Only the dome at the blossom end is dark, like the dried flower remnant.
					if (t > 0.95) c.lerp(C.tip, smooth(0.955, 0.985, t));
					// The ridges' edges ripen a shade darker than the faces.
					if (t > 0.3 && t < 0.92) c.lerp(C.edge, 0.35 * lobe);
					// A few soft, round sugar spots on the ripe part.
					if (t > 0.36 && t < 0.88) c.lerp(C.spot, 0.6 * spotAt(i, j));
					return c;
				};

				const positions: number[] = [], colors: number[] = [], indices: number[] = [];
				for (let i = 0; i <= tubular; i++) {
					const t = i / tubular;
					const p = curve.getPointAt(t);
					const n = frames.normals[i], b = frames.binormals[i];
					const radius = radiusAt(t) * MM;
					for (let j = 0; j < radial; j++) {
						const v = (j / radial) * Math.PI * 2;
						// Five ridges with flat-ish faces between them.
						const lobe = Math.pow((1 + Math.cos(5 * v)) / 2, 3);
						const r = radius * (0.93 + 0.07 * lobe);
						const cx = Math.cos(v) * r, cy = Math.sin(v) * r;
						positions.push(p.x + cx * n.x + cy * b.x, p.y + cx * n.y + cy * b.y, p.z + cx * n.z + cy * b.z);
						const c = colorAt(t, lobe, i, j);
						colors.push(c.r, c.g, c.b);
					}
				}
				// Rings share their seam vertex (j wraps), so normals stay smooth all round.
				for (let i = 0; i < tubular; i++) {
					for (let j = 0; j < radial; j++) {
						const a = i * radial + j, a1 = i * radial + ((j + 1) % radial);
						const c = a + radial, c1 = a1 + radial;
						// Counter-clockwise seen from outside, so the skin faces out.
						indices.push(a, a1, c, c, a1, c1);
					}
				}
				// Close both ends: the stalk's cut face and the blossom tip.
				for (const [ring, t, reverse] of [[0, 0, true], [tubular, 1, false]] as const) {
					const centre = curve.getPointAt(t);
					const cap = positions.length / 3;
					positions.push(centre.x, centre.y, centre.z);
					const c = t === 0 ? C.cut : C.tip;
					colors.push(c.r, c.g, c.b);
					for (let j = 0; j < radial; j++) {
						const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
						if (reverse) indices.push(cap, b, a);
						else indices.push(cap, a, b);
					}
				}

				const geometry = new THREE.BufferGeometry();
				geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
				geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
				geometry.setIndex(indices);
				geometry.computeVertexNormals();
				// Peel has a faint waxy sheen, not a gloss.
				const group = new THREE.Group();
				group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));
				group.add(bananaSticker(curve, frames, tubular));
				return group;
			}

			/**
			 * The oval produce sticker: a patch hugging the peel on the upward-facing side of
			 * the body, about 26 × 18 mm, printed from a canvas (no image to download).
			 */
			function bananaSticker(
				curve: InstanceType<typeof THREE.CatmullRomCurve3>,
				frames: ReturnType<InstanceType<typeof THREE.CatmullRomCurve3>['computeFrenetFrames']>,
				tubular: number
			) {
				const canvas = document.createElement('canvas');
				canvas.width = 512;
				canvas.height = 352;
				const ctx = canvas.getContext('2d')!;
				const [cx, cy] = [256, 176];
				const oval = (rx: number, ry: number) => {
					ctx.beginPath();
					ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
				};
				oval(250, 170);
				ctx.fillStyle = '#f2c230';
				ctx.fill();
				oval(234, 154);
				ctx.fillStyle = '#1d4f9e';
				ctx.fill();
				oval(214, 136);
				ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
				ctx.lineWidth = 4;
				ctx.stroke();
				ctx.fillStyle = '#f2c230';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.font = 'italic 700 104px "Inter Variable", Inter, sans-serif';
				ctx.fillText('pcbgit', cx, cy - 12);
				ctx.fillStyle = '#ffffff';
				ctx.font = '600 34px "Inter Variable", Inter, sans-serif';
				ctx.fillText('KiCad · 4011', cx, cy + 74);
				const texture = new THREE.CanvasTexture(canvas);
				texture.colorSpace = THREE.SRGBColorSpace;
				texture.anisotropy = 4;

				// Rings 88-112 (~26 mm along the body); 1.03 rad round it (~18 mm).
				const [first, last, columns, span] = [88, 112, 18, 1.03];
				const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
				for (let i = first; i <= last; i++) {
					const p = curve.getPointAt(i / tubular);
					const n = frames.normals[i], b = frames.binormals[i];
					// Straight up on this ring: the angle where the surface normal is most +y.
					const up = Math.atan2(b.y, n.y);
					const radius = 17.5 * (1 + 0.04 * Math.sin((Math.PI * (i / tubular - 0.34)) / 0.48)) * MM;
					for (let k = 0; k <= columns; k++) {
						const v = up + (k / columns - 0.5) * span;
						const lobe = Math.pow((1 + Math.cos(5 * v)) / 2, 3);
						// Just proud of the peel so it never z-fights with it.
						const r = radius * (0.93 + 0.07 * lobe) + 0.25 * MM;
						const ox = Math.cos(v) * r, oy = Math.sin(v) * r;
						positions.push(p.x + ox * n.x + oy * b.x, p.y + ox * n.y + oy * b.y, p.z + ox * n.z + oy * b.z);
						uvs.push((i - first) / (last - first), 1 - k / columns);
					}
				}
				for (let i = 0; i < last - first; i++) {
					for (let k = 0; k < columns; k++) {
						const a = i * (columns + 1) + k, c = a + columns + 1;
						indices.push(a, a + 1, c, c, a + 1, c + 1);
					}
				}
				const geometry = new THREE.BufferGeometry();
				geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
				geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
				geometry.setIndex(indices);
				geometry.computeVertexNormals();
				// Glossy paper; the oval's outside is cut away by its alpha.
				return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.3 }));
			}

			function disposeObject(object: import('three/webgpu').Object3D) {
				object.traverse((child) => {
					const mesh = child as import('three/webgpu').Mesh;
					if (!mesh.isMesh && !(child as import('three/webgpu').Line).isLine) return;
					mesh.geometry.dispose();
					(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
						(m as import('three/webgpu').MeshStandardMaterial).map?.dispose();
						m.dispose();
					});
				});
			}

			setShown = (category, on) => {
				for (const mesh of categoryMeshes[category]) mesh.visible = on;
				requestRender();
			};

			setRuler = (on) => {
				if (!ruler) return;
				ruler.visible = on;
				reframe();
			};

			setCompare = async (kind) => {
				if (comparison) {
					scene.remove(comparison);
					disposeObject(comparison);
					comparison = null;
				}
				if (kind !== 'none') {
					const object = kind === 'card' ? bankCard() : kind === 'coin' ? euroCoin() : banana();
					// Lie it next to the board's right edge, resting on the board's plane.
					const size = boardBounds.getSize(new THREE.Vector3());
					const gap = Math.max(8 * MM, Math.max(size.x, size.z) * 0.08);
					const own = new THREE.Box3().setFromObject(object);
					object.position.set(
						boardBounds.max.x + gap - own.min.x,
						boardBounds.min.y - own.min.y,
						(boardBounds.min.z + boardBounds.max.z) / 2 - (own.min.z + own.max.z) / 2
					);
					comparison = object;
					scene.add(object);
					// New materials compile asynchronously; see compileAsync on load.
					await renderer.compileAsync(scene, camera);
				}
				reframe();
			};

			/**
			 * Renders the current view offscreen at the requested size, then composites it
			 * over the chosen background together with the ruler labels and caption.
			 */
			exportImage = async (options) => {
				if (!host) throw new Error(t('viewer3d.notReady'));
				const { width, height, keepsFraming } = exportDimensions(options.size);
				const saved = {
					position: camera.position.clone(),
					target: controls.target.clone(),
					aspect: camera.aspect,
					pixelRatio: renderer.getPixelRatio()
				};
				cancelAnimationFrame(pending);
				pending = 0;

				try {
					renderer.setPixelRatio(1);
					// updateStyle=false: the on-page canvas keeps its CSS size during export.
					renderer.setSize(width, height, false);
					camera.aspect = width / height;
					camera.updateProjectionMatrix();
					if (!keepsFraming && options.reframe) {
						// A different shape needs its own framing from the same viewing angle.
						const pose = poseFor(camera.position.clone().sub(controls.target));
						controls.target.copy(pose.target);
						camera.position.copy(pose.target).addScaledVector(pose.dir, pose.distance);
					}
					camera.lookAt(controls.target);
					camera.updateMatrixWorld();

					// The WebGL fallback presents one render late (see requestRender), so
					// render, yield a frame, render again and capture in the same task.
					renderer.render(scene, camera);
					await new Promise((resolve) => requestAnimationFrame(resolve));
					renderer.render(scene, camera);
					const shot = document.createElement('canvas');
					shot.width = width;
					shot.height = height;
					const ctx = shot.getContext('2d')!;
					if (options.background !== 'transparent' || options.format === 'jpeg') {
						ctx.fillStyle =
							options.background === 'white' || options.background === 'transparent'
								? '#ffffff'
								: options.background === 'custom'
									? options.customColor
									: getComputedStyle(host.parentElement!).backgroundColor;
						ctx.fillRect(0, 0, width, height);
					}
					ctx.drawImage(renderer.domElement, 0, 0, width, height);

					const unit = height / 900; // label size relative to a ~900 px tall view
					if (options.labels && ruler?.visible) {
						ctx.font = `${Math.round(13 * unit)}px "JetBrains Mono Variable", ui-monospace, monospace`;
						ctx.textAlign = 'center';
						ctx.textBaseline = 'middle';
						for (const { at } of labelAnchors) {
							const ndc = at.clone().project(camera);
							if (ndc.z >= 1) continue;
							const x = ((ndc.x + 1) / 2) * width, y = ((1 - ndc.y) / 2) * height;
							const text = at === labelAnchors[0].at ? rulerLabels.width : rulerLabels.depth;
							const w = ctx.measureText(text).width + 14 * unit, h = 22 * unit;
							ctx.fillStyle = 'rgba(10, 12, 14, 0.8)';
							ctx.beginPath();
							ctx.roundRect(x - w / 2, y - h / 2, w, h, 4 * unit);
							ctx.fill();
							ctx.fillStyle = '#f2d27a';
							ctx.fillText(text, x, y);
						}
					}
					if (options.caption && caption) {
						const size = Math.round(16 * unit);
						ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
						ctx.textAlign = 'left';
						ctx.textBaseline = 'alphabetic';
						const light = options.background === 'white' || (options.background === 'custom' && isLight(options.customColor));
						ctx.fillStyle = light ? 'rgba(20, 23, 28, 0.75)' : 'rgba(255, 255, 255, 0.8)';
						ctx.fillText(caption, size * 1.4, height - size * 1.4);
					}

					const type = `image/${options.format}`;
					const blob = await new Promise<Blob | null>((resolve) => shot.toBlob(resolve, type, 0.92));
					if (!blob) throw new Error(t('viewer3d.encodeFailed'));
					return blob;
				} finally {
					renderer.setPixelRatio(saved.pixelRatio);
					renderer.setSize(host.clientWidth, host.clientHeight);
					camera.aspect = saved.aspect;
					camera.updateProjectionMatrix();
					camera.position.copy(saved.position);
					controls.target.copy(saved.target);
					controls.update();
					requestAnimationFrame(() => requestRender());
				}
			};

			function isLight(hex: string) {
				const value = parseInt(hex.slice(1), 16);
				const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
				return 0.299 * r + 0.587 * g + 0.114 * b > 150;
			}

			/** Up to ~60k vertices, evenly strided; plenty for framing, fast to project. */
			function samplePoints(roots: import('three/webgpu').Object3D[], origin: import('three/webgpu').Vector3) {
				const positions: { attribute: import('three/webgpu').BufferAttribute; matrix: import('three/webgpu').Matrix4 }[] = [];
				let total = 0;
				for (const root of roots) {
					root.updateMatrixWorld(true);
					root.traverse((object) => {
						const drawable = object as import('three/webgpu').Mesh;
						if (!(drawable.isMesh || (object as import('three/webgpu').Line).isLine) || !object.visible) return;
						const attribute = drawable.geometry.getAttribute('position') as import('three/webgpu').BufferAttribute;
						positions.push({ attribute, matrix: object.matrixWorld });
						total += attribute.count;
					});
				}
				const stride = Math.max(1, Math.ceil(total / 60000));
				const out: number[] = [];
				const point = new THREE.Vector3();
				for (const { attribute, matrix } of positions) {
					for (let i = 0; i < attribute.count; i += stride) {
						point.fromBufferAttribute(attribute, i).applyMatrix4(matrix);
						out.push(point.x - origin.x, point.y - origin.y, point.z - origin.z);
					}
				}
				return new Float32Array(out);
			}

			// Renders since the GLB optimisation are meshopt-compressed (see render/glb.ts).
			new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
				url,
				async (gltf) => {
					if (disposed) return;
					// KiCad names the board's own meshes "<board>_PCB", "<board>_soldermask",
					// "<board>_silkscreen" and "<board>_pad". Component models can reuse those
					// suffixes (an ESP32 module ships "…_via" meshes), so the board's name is
					// taken from its body mesh and matched exactly. A daughterboard model even
					// has its own "…_PCB", but it sits under its footprint's node: the real
					// board is the shallowest "_PCB" mesh in the scene.
					const meshNames: string[] = (gltf.parser.json.meshes ?? []).map((m: { name?: string }) => m.name ?? '');
					let body: string | undefined;
					let bodyDepth = Infinity;
					gltf.scene.traverse((object) => {
						const index = gltf.parser.associations.get(object)?.meshes;
						const name = index === undefined ? '' : meshNames[index];
						if (!name.endsWith('_PCB')) return;
						let depth = 0;
						for (let node = object.parent; node; node = node.parent) depth++;
						if (depth < bodyDepth) [body, bodyDepth] = [name, depth];
					});
					const board = body ? body.slice(0, -'_PCB'.length) : null;
					const roles: Record<string, Role> = board
						? { [`${board}_soldermask`]: 'mask', [`${board}_silkscreen`]: 'silk', [`${board}_pad`]: 'pad', [`${board}_PCB`]: 'body' }
						: {};

					// Footprint nodes are named after their reference; the loader sanitises
					// node names the same way, and suffixes duplicates with _1, _2, ...
					const sanitize = (name: string) => name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
					const mountByNode = new Map(Object.entries(mounts).map(([ref, mount]) => [sanitize(ref), mount]));
					const mountOf = (object: import('three/webgpu').Object3D) => {
						for (let node: import('three/webgpu').Object3D | null = object; node; node = node.parent) {
							const mount = mountByNode.get(node.name) ?? mountByNode.get(node.name.replace(/_\d+$/, ''));
							if (mount) return mount;
						}
						return 'other';
					};

					const model = mergeByMaterial(gltf.scene, (mesh) => {
						const index = gltf.parser.associations.get(mesh)?.meshes;
						const name = index === undefined ? '' : meshNames[index];
						if (board && name.startsWith(`${board}_`)) return { role: roles[name] ?? null, category: 'board' };
						// Optimised files are already grouped: "pcbgit_smd", "pcbgit_tht", "pcbgit_other".
						const grouped = /^pcbgit_(smd|tht|other)$/.exec(name);
						if (grouped) return { role: null, category: grouped[1] as Category };
						return { role: null, category: mountOf(mesh) };
					});
					counts = { smd: categoryMeshes.smd.length, tht: categoryMeshes.tht.length };
					scene.add(model);
					drawCalls = model.children.length;
					recolorable = roleMaterials.mask.length > 0;
					applyColors();

					modelRoot = model;
					// The board body gives the true outline for the ruler and placement.
					boardBounds.makeEmpty();
					for (const mesh of categoryMeshes.board.filter((m) => roleMaterials.body.includes(m.material as never))) {
						boardBounds.expandByObject(mesh);
					}
					if (boardBounds.isEmpty()) boardBounds.setFromObject(model);
					ruler = buildRuler();
					ruler.visible = false;
					scene.add(ruler);
					refreshFit();
					// The renderer skips objects whose shaders are still compiling. With
					// on-demand rendering nothing would redraw once they are ready, so
					// compile everything first.
					await renderer.compileAsync(scene, camera);
					if (disposed) return;
					snapTo(new THREE.Vector3(...HOME));
					loaded = true;
				},
				(event) => {
					if (event.total) progress = Math.round((event.loaded / event.total) * 100);
				},
				() => {
					if (!disposed) error = t('viewer3d.loadFailed');
				}
			);

			const observer = new ResizeObserver(() => {
				if (!host || !host.clientWidth || !host.clientHeight) return;
				camera.aspect = host.clientWidth / host.clientHeight;
				camera.updateProjectionMatrix();
				renderer.setSize(host.clientWidth, host.clientHeight);
				// Keep the model framed until the user takes over the camera.
				if (!userMoved && !animation) snapTo(currentDir);
				requestRender();
			});
			observer.observe(host);

			cleanup = () => {
				cancelAnimationFrame(pending);
				clearInterval(fpsTimer);
				observer.disconnect();
				controls.dispose();
				envTarget.dispose();
				pmrem.dispose();
				scene.traverse((object) => {
					const mesh = object as import('three/webgpu').Mesh;
					if (mesh.isMesh) mesh.geometry?.dispose();
				});
				for (const material of materials) material.dispose();
				renderer.dispose();
				renderer.domElement.remove();
			};
		})().catch((thrown) => {
			console.error(thrown);
			if (!disposed) error = t('viewer3d.noWebgl');
		});

		return () => {
			disposed = true;
			cleanup?.();
		};
	});
</script>

<div
	class="relative overflow-hidden rounded-lg border {className}"
	style:background="var(--preview-bg)"
	data-backend={backend}
	data-draw-calls={drawCalls || undefined}
	data-fps={fps ?? 'idle'}
>
	<div bind:this={host} class="h-full w-full"></div>

	{#if loaded}
		<div class="absolute left-2 top-2 flex flex-col items-start gap-2">
			{#if recolorable}
				<div class="flex flex-col gap-1.5 rounded-md border bg-[var(--surface-1)]/92 px-2 py-1.5">
					<div class="flex items-center gap-1.5" role="radiogroup" aria-label={t('viewer3d.maskColour')}>
						<span class="w-10 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">{t('viewer3d.mask')}</span>
						{#each MASKS as option}
							<button
								class="swatch"
								class:active={mask === option.id}
								style:background={option.color}
								title={t('viewer3d.maskOption', { color: t(`colour.${option.id}`) })}
								aria-label={t('viewer3d.maskOption', { color: t(`colour.${option.id}`) })}
								role="radio"
								aria-checked={mask === option.id}
								onclick={() => choose({ mask: option.id })}
							></button>
						{/each}
					</div>
					<div class="flex items-center gap-1.5" role="radiogroup" aria-label={t('viewer3d.silkColour')}>
						<span class="w-10 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">{t('viewer3d.silk')}</span>
						{#each SILKS as option}
							<button
								class="swatch"
								class:active={silk === option.id}
								style:background={option.color}
								title={t('viewer3d.silkOption', { color: t(`colour.${option.id}`) })}
								aria-label={t('viewer3d.silkOption', { color: t(`colour.${option.id}`) })}
								role="radio"
								aria-checked={silk === option.id}
								onclick={() => choose({ silk: option.id })}
							></button>
						{/each}
					</div>
					<div class="flex items-center gap-1.5" role="radiogroup" aria-label={t('viewer3d.finishLabel')}>
						<span class="w-10 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">{t('viewer3d.finish')}</span>
						{#each FINISHES as option}
							<button
								class="finish"
								class:active={finish === option.id}
								style:--metal={option.color}
								title={t(option.title)}
								aria-label={t(option.title)}
								role="radio"
								aria-checked={finish === option.id}
								onclick={() => choose({ finish: option.id })}
							>
								<span class="metal" aria-hidden="true"></span>{option.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="flex flex-col gap-1.5 rounded-md border bg-[var(--surface-1)]/92 px-2 py-1.5">
				<div class="flex items-center gap-1.5">
					<span class="w-10 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">{t('viewer3d.show')}</span>
					{#if counts.smd}
						<button
							class="toggle"
							aria-pressed={showSmd}
							title={t('viewer3d.smd')}
							onclick={() => {
								showSmd = !showSmd;
								setShown('smd', showSmd);
							}}>SMD</button
						>
					{/if}
					{#if counts.tht}
						<button
							class="toggle"
							aria-pressed={showTht}
							title={t('viewer3d.tht')}
							onclick={() => {
								showTht = !showTht;
								setShown('tht', showTht);
							}}>THT</button
						>
					{/if}
					<button
						class="toggle"
						aria-pressed={showRuler}
						title={t('viewer3d.dimensions')}
						onclick={() => {
							showRuler = !showRuler;
							setRuler(showRuler);
						}}
					>
						<Icon name="ruler" size={11} /> {t('viewer3d.ruler')}
					</button>
				</div>
				<div class="flex items-center gap-1.5">
					<label for="compare-{url}" class="w-10 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">{t('viewer3d.scale')}</label>
					<select
						id="compare-{url}"
						class="compare"
						bind:value={compare}
						onchange={() => setCompare(compare)}
					>
						{#each COMPARISONS as option}<option value={option.id}>{t(option.label)}</option>{/each}
					</select>
				</div>
			</div>
		</div>
	{/if}

	{#if exportOpen && loaded}
		{@const dims = exportDimensions(exportOptions.size)}
		<div class="export-panel" role="dialog" aria-label={t('viewer3d.export')}>
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-xs font-semibold">{t('viewer3d.export')}</h3>
				<button class="viewer-btn !h-6 !w-6" onclick={() => (exportOpen = false)} aria-label={t('common.close')}><Icon name="x" size={12} /></button>
			</div>

			<label class="export-label" for="export-size">{t('viewer3d.size')}</label>
			<select id="export-size" class="compare w-full" bind:value={exportOptions.size}>
				{#each EXPORT_SIZES as option}
					{@const d = exportDimensions(option.id)}
					<option value={option.id}>{option.label.startsWith('viewer3d.') ? t(option.label as 'viewer3d.size.view2') : option.label}{'scale' in option ? ` — ${d.width} × ${d.height}` : ''}</option>
				{/each}
			</select>
			{#if !dims.keepsFraming}
				<label class="export-check">
					<input type="checkbox" bind:checked={exportOptions.reframe} /> {t('viewer3d.reframe')}
				</label>
			{/if}

			<span class="export-label">{t('viewer3d.background')}</span>
			<div class="flex flex-wrap gap-1">
				{#each [['viewer', t('viewer3d.bg.viewer')], ['transparent', t('viewer3d.bg.transparent')], ['white', t('colour.white')], ['custom', t('viewer3d.bg.custom')]] as [value, label]}
					<button
						class="toggle"
						aria-pressed={exportOptions.background === value}
						disabled={value === 'transparent' && exportOptions.format === 'jpeg'}
						title={value === 'transparent' && exportOptions.format === 'jpeg' ? t('viewer3d.jpegNoAlpha') : undefined}
						onclick={() => (exportOptions.background = value as ExportBackground)}>{label}</button
					>
				{/each}
				{#if exportOptions.background === 'custom'}
					<input type="color" class="h-5 w-8 cursor-pointer rounded border bg-transparent" bind:value={exportOptions.customColor} aria-label={t('viewer3d.bgColour')} />
				{/if}
			</div>

			<span class="export-label">{t('viewer3d.format')}</span>
			<div class="flex gap-1">
				{#each [['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']] as [value, label]}
					<button
						class="toggle"
						aria-pressed={exportOptions.format === value}
						onclick={() => {
							exportOptions.format = value as ExportFormat;
							if (value === 'jpeg' && exportOptions.background === 'transparent') exportOptions.background = 'white';
						}}>{label}</button
					>
				{/each}
			</div>

			<div class="mt-2 flex flex-col gap-1">
				{#if showRuler}
					<label class="export-check"><input type="checkbox" bind:checked={exportOptions.labels} /> {t('viewer3d.dimensionLabels')}</label>
				{/if}
				{#if caption}
					<label class="export-check"><input type="checkbox" bind:checked={exportOptions.caption} /> {t('viewer3d.caption')} <span class="truncate text-[var(--text-muted)]">({caption})</span></label>
				{/if}
			</div>

			{#if exportError}<p class="mt-2 text-[0.6875rem]" style:color="var(--err)">{exportError}</p>{/if}

			<button class="btn btn-primary btn-sm mt-3 w-full" onclick={runExport} disabled={exporting}>
				<Icon name="download" size={12} />
				{exporting ? t('viewer3d.rendering') : t('viewer3d.download', { size: `${dims.width} × ${dims.height}` })}
			</button>
		</div>
	{/if}

	<!-- Ruler labels: HTML, pinned to their 3D anchors on every render. -->
	<span bind:this={widthLabel} class="dim-label" style:display="none">{rulerLabels.width}</span>
	<span bind:this={depthLabel} class="dim-label" style:display="none">{rulerLabels.depth}</span>

	<!-- View cube: rotates with the camera; faces, edges and corners are clickable. -->
	<div class="absolute right-1 top-1 flex items-start" class:invisible={!loaded}>
		<div class="mt-2 flex flex-col gap-1">
			<button class="viewer-btn rounded-md border bg-[var(--surface-1)]/92" onclick={() => viewFrom(HOME)} title={t('viewer3d.home')} aria-label={t('viewer3d.home')}>
				<Icon name="home" size={14} />
			</button>
			<button
				class="viewer-btn rounded-md border bg-[var(--surface-1)]/92"
				class:!text-[var(--accent)]={exportOpen}
				onclick={() => (exportOpen = !exportOpen)}
				title={t('viewer3d.export')}
				aria-label={t('viewer3d.export')}
				aria-expanded={exportOpen}
			>
				<Icon name="camera" size={14} />
			</button>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="viewcube-stage"
			onpointerdown={cubePointerDown}
			onpointermove={cubePointerMove}
			onpointerup={cubePointerUp}
			onpointercancel={cubePointerUp}
		>
			<div class="viewcube" bind:this={cube}>
				{#each FACETS as facet (facet.name)}
					<button
						class="facet {facet.kind}"
						style:width="{facet.width}px"
						style:height="{facet.height}px"
						style:transform={facet.transform}
						style:clip-path={facet.clip}
						style:--shade="{facet.shade}%"
						onclick={() => viewFrom(facet.dir)}
						aria-label={t('viewer3d.viewFrom', { side: facetName(facet) })}
						title={facet.kind === 'face' ? undefined : facetName(facet)}
						tabindex={facet.kind === 'face' ? 0 : -1}
					>
						{facet.label ? t(facet.label as 'viewer3d.cube.top') : ''}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if loaded && backend}
		<span class="mono pointer-events-none absolute bottom-2 left-2 rounded bg-black/45 px-1.5 py-0.5 text-[0.625rem] text-white/70">
			{backend} · {fps === null ? t('viewer3d.idle') : `${fps} fps`}
		</span>
	{/if}

	{#if error}
		<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
			<Icon name="alert" size={24} style="color: var(--err)" />
			<p class="text-sm" style:color="var(--err)">{error}</p>
			<a href={url} download class="btn btn-sm">{t('viewer3d.downloadGlb')}</a>
		</div>
	{:else if !loaded}
		<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
			<Icon name="cube" size={28} class="animate-pulse text-[var(--text-muted)]" />
			<div class="h-1 w-40 overflow-hidden rounded-full bg-[var(--surface-3)]">
				<div class="h-full rounded-full bg-[var(--accent)] transition-all duration-200" style:width="{progress}%"></div>
			</div>
			<p class="text-xs text-[var(--text-muted)]">{t('viewer3d.loading', { progress })}</p>
		</div>
	{/if}
</div>

<style>
	.swatch {
		width: 1.05rem;
		height: 1.05rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
		cursor: pointer;
		transition: transform 100ms ease;
	}
	.swatch:hover {
		transform: scale(1.15);
	}
	.swatch.active,
	.finish.active {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.finish {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.05rem 0.4rem 0.05rem 0.2rem;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.finish .metal {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 999px;
		background: radial-gradient(circle at 35% 30%, #fff 0%, var(--metal) 45%, color-mix(in srgb, var(--metal) 55%, #000) 100%);
	}

	/* The cube is orthographic (no perspective), like Fusion 360's ViewCube. */
	.viewcube-stage {
		width: 112px;
		height: 112px;
		position: relative;
	}
	.viewcube {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 0;
		height: 0;
		transform-style: preserve-3d;
	}
	.facet {
		position: absolute;
		left: 0;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		backface-visibility: hidden;
		background: color-mix(in srgb, var(--surface-3) var(--shade), var(--surface-0));
		color: var(--text-secondary);
		font-size: 0.5625rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.facet.face {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-strong) 80%, transparent);
	}
	/* Bevels sit a touch darker so the chamfers read as separate surfaces. */
	.facet.edge,
	.facet.corner {
		background: color-mix(in srgb, var(--surface-3) calc(var(--shade) - 12%), var(--surface-0));
	}
	.facet:hover,
	.facet:focus-visible {
		background: color-mix(in srgb, var(--accent) 60%, var(--surface-2));
		color: var(--text-primary);
		outline: none;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		cursor: pointer;
	}
	.toggle[aria-pressed='true'] {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 22%, transparent);
		color: var(--text-primary);
	}
	.compare {
		font-size: 0.6875rem;
		padding: 0.1rem 0.35rem;
		border-radius: 0.3rem;
		border: 1px solid var(--border-strong);
		background: var(--surface-0);
		color: var(--text-primary);
	}
	.export-panel {
		position: absolute;
		right: 3.25rem;
		top: 2.75rem;
		z-index: 10;
		width: 15.5rem;
		padding: 0.6rem 0.7rem 0.7rem;
		border-radius: 0.5rem;
		border: 1px solid var(--border-strong);
		background: color-mix(in srgb, var(--surface-1) 96%, transparent);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
	}
	.export-label {
		display: block;
		margin: 0.55rem 0 0.25rem;
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}
	.export-check {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.35rem;
		font-size: 0.6875rem;
		color: var(--text-secondary);
		cursor: pointer;
		min-width: 0;
	}
	.toggle:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.dim-label {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: none;
		padding: 0.05rem 0.35rem;
		border-radius: 0.25rem;
		background: rgba(10, 12, 14, 0.78);
		color: #f2d27a;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		white-space: nowrap;
	}
	.viewcube-stage {
		cursor: grab;
		touch-action: none;
	}
	.viewcube-stage:active {
		cursor: grabbing;
	}
</style>
