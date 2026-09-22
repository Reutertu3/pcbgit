<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		url: string;
		class?: string;
	}
	let { url, class: className = '' }: Props = $props();

	type Vec3 = [number, number, number];

	/** Soldermask finishes offered by JLCPCB, as sRGB approximations of the real boards. */
	const MASKS = [
		{ id: 'green', label: 'Green', color: '#125c33' },
		{ id: 'blue', label: 'Blue', color: '#123f8c' },
		{ id: 'yellow', label: 'Yellow', color: '#c9a414' },
		{ id: 'purple', label: 'Purple', color: '#4a1f70' },
		{ id: 'red', label: 'Red', color: '#a31a1a' },
		{ id: 'white', label: 'White', color: '#eeeeea' },
		{ id: 'black', label: 'Black', color: '#141414' }
	] as const;
	const SILKS = [
		{ id: 'white', label: 'White', color: '#f4f4f0' },
		{ id: 'black', label: 'Black', color: '#111111' }
	] as const;
	/** Surface finish of the exposed pads. Roughness is a uniform too, so switching is free. */
	const FINISHES = [
		{ id: 'hasl', label: 'HASL', title: 'Solder (HASL)', color: '#c3c6c9', roughness: 0.34 },
		{ id: 'enig', label: 'ENIG', title: 'Immersion gold (ENIG)', color: '#dcb65e', roughness: 0.2 }
	] as const;
	type MaskId = (typeof MASKS)[number]['id'];
	type SilkId = (typeof SILKS)[number]['id'];
	type FinishId = (typeof FINISHES)[number]['id'];
	const COLOR_KEY = 'kupfergit-3d-colors';

	/** Home view: tilted top-down, the angle that fills a landscape viewport best. */
	const HOME: Vec3 = [0, 1, 0.62];

	let host = $state<HTMLDivElement | null>(null);
	let cube = $state<HTMLDivElement | null>(null);
	let progress = $state(0);
	let error = $state<string | null>(null);
	let loaded = $state(false);
	let backend = $state('');
	let drawCalls = $state(0);
	let mask = $state<MaskId>('green');
	let silk = $state<SilkId>('white');
	let finish = $state<FinishId>('hasl');
	/** False for models without KiCad's named board layers; the pickers are hidden then. */
	let recolorable = $state(false);

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
		'0,1,0': { label: 'Top', x: [1, 0, 0], y: [0, 0, -1] },
		'0,-1,0': { label: 'Bottom', x: [1, 0, 0], y: [0, 0, 1] },
		'0,0,1': { label: 'Front', x: [1, 0, 0], y: [0, 1, 0] },
		'0,0,-1': { label: 'Back', x: [-1, 0, 0], y: [0, 1, 0] },
		'1,0,0': { label: 'Right', x: [0, 0, -1], y: [0, 1, 0] },
		'-1,0,0': { label: 'Left', x: [0, 0, 1], y: [0, 1, 0] }
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
			renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
			let trailing = 0;
			const requestRender = () => {
				// The WebGL fallback of WebGPURenderer (three r174) presents a frame one
				// render late, so every burst of renders ends with one extra frame.
				trailing = 1;
				if (!pending) pending = requestAnimationFrame(frame);
			};
			function frame(now: number) {
				pending = 0;
				const animating = stepAnimation(now);
				// With damping, update() keeps emitting 'change' until the motion settles.
				controls.update();
				renderer.render(scene, camera);
				syncCube();
				if (animating) requestRender();
				else if (!pending && trailing > 0) {
					trailing--;
					pending = requestAnimationFrame(frame);
				}
			}
			controls.addEventListener('change', requestRender);

			/** Rotates the CSS cube with the camera (CSS3DRenderer's camera matrix, rotation only). */
			function syncCube() {
				if (!cube) return;
				const e = camera.matrixWorldInverse.elements;
				cube.style.transform = `matrix3d(${e[0]},${-e[1]},${e[2]},0,${e[4]},${-e[5]},${e[6]},0,${e[8]},${-e[9]},${e[10]},0,0,0,0,1)`;
			}

			let currentDir = new THREE.Vector3(...HOME).normalize();
			let userMoved = false;
			controls.addEventListener('start', () => {
				userMoved = true;
				animation = null;
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
				if (Math.abs(dir.y) > 0.9999) dir.set(0, Math.sign(dir.y), 1e-4).normalize();

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
			type Role = 'mask' | 'silk' | 'pad';
			const roleMaterials: Record<Role, import('three/webgpu').MeshStandardMaterial[]> = { mask: [], silk: [], pad: [] };
			const roleClones = new Map<string, import('three/webgpu').Material>();
			const materials = new Set<import('three/webgpu').Material>();

			applyColors = () => {
				const maskColor = MASKS.find((m) => m.id === mask)!.color;
				const silkColor = SILKS.find((m) => m.id === silk)!.color;
				const finishDef = FINISHES.find((m) => m.id === finish)!;
				// Colour and roughness are uniforms: no shader recompile, so this is instant.
				for (const material of roleMaterials.mask) material.color.set(maskColor);
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
			function mergeByMaterial(root: import('three/webgpu').Object3D, roleOf: (mesh: import('three/webgpu').Mesh) => Role | null) {
				root.updateMatrixWorld(true);
				const groups = new Map<string, { material: import('three/webgpu').Material; geometries: import('three/webgpu').BufferGeometry[] }>();
				const loose: import('three/webgpu').Mesh[] = [];

				root.traverse((object) => {
					const mesh = object as import('three/webgpu').Mesh;
					if (!mesh.isMesh) return;
					if (Array.isArray(mesh.material)) {
						loose.push(mesh);
						return;
					}
					let material = mesh.material;
					const role = roleOf(mesh);
					if (role) {
						// Cloned so recolouring the board never touches a component's material.
						let clone = roleClones.get(material.uuid);
						if (!clone) {
							clone = material.clone();
							// Real mask hides the substrate; KiCad's 0.83 lets too much through.
							if (role === 'mask') clone.opacity = Math.max(clone.opacity, 0.94);
							// Silkscreen ink is opaque; KiCad's 0.9 greys black print on a white mask.
							// It stays in the transparent pass so it can be ordered after the mask.
							if (role === 'silk') clone.opacity = 1;
							roleClones.set(material.uuid, clone);
							roleMaterials[role].push(clone as import('three/webgpu').MeshStandardMaterial);
						}
						material = clone;
					}
					const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
					const signature = Object.keys(geometry.attributes).sort().join(',');
					const key = `${material.uuid}|${signature}|${geometry.index ? 'i' : 'n'}`;
					if (!groups.has(key)) groups.set(key, { material, geometries: [] });
					groups.get(key)!.geometries.push(geometry);
				});

				const merged = new THREE.Group();
				for (const { material, geometries } of groups.values()) {
					const combined = geometries.length > 1 ? mergeGeometries(geometries, false) : geometries[0];
					const meshes = combined ? [combined] : geometries;
					for (const geometry of meshes) {
						const mesh = new THREE.Mesh(geometry, material);
						// Mask and silkscreen are nearly coplanar: draw the print after the mask
						// explicitly rather than trusting depth sorting between them.
						if (roleMaterials.mask.includes(material as never)) mesh.renderOrder = 1;
						if (roleMaterials.silk.includes(material as never)) mesh.renderOrder = 2;
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

			/** Up to ~60k vertices, evenly strided; plenty for framing, fast to project. */
			function samplePoints(model: import('three/webgpu').Object3D, origin: import('three/webgpu').Vector3) {
				const positions: import('three/webgpu').BufferAttribute[] = [];
				let total = 0;
				model.traverse((object) => {
					const mesh = object as import('three/webgpu').Mesh;
					if (!mesh.isMesh) return;
					const position = mesh.geometry.getAttribute('position') as import('three/webgpu').BufferAttribute;
					positions.push(position);
					total += position.count;
				});
				const stride = Math.max(1, Math.ceil(total / 60000));
				const out: number[] = [];
				for (const position of positions) {
					for (let i = 0; i < position.count; i += stride) {
						out.push(position.getX(i) - origin.x, position.getY(i) - origin.y, position.getZ(i) - origin.z);
					}
				}
				return new Float32Array(out);
			}

			new GLTFLoader().load(
				url,
				async (gltf) => {
					if (disposed) return;
					// KiCad names the board's own meshes "<board>_PCB", "<board>_soldermask",
					// "<board>_silkscreen" and "<board>_pad". Component models can reuse those
					// suffixes (an ESP32 module ships "…_via" meshes), so the board's name is
					// taken from its body mesh and matched exactly.
					const meshNames: string[] = (gltf.parser.json.meshes ?? []).map((m: { name?: string }) => m.name ?? '');
					const body = meshNames.find((name) => name.endsWith('_PCB'));
					const board = body ? body.slice(0, -'_PCB'.length) : null;
					const roles: Record<string, Role> = board
						? { [`${board}_soldermask`]: 'mask', [`${board}_silkscreen`]: 'silk', [`${board}_pad`]: 'pad' }
						: {};

					const model = mergeByMaterial(gltf.scene, (mesh) => {
						const index = gltf.parser.associations.get(mesh)?.meshes;
						return index === undefined ? null : (roles[meshNames[index]] ?? null);
					});
					scene.add(model);
					drawCalls = model.children.length;
					recolorable = roleMaterials.mask.length > 0;
					applyColors();

					bounds.setFromObject(model);
					bounds.getCenter(centre);
					fitPoints = samplePoints(model, centre);
					// KiCad exports in metres: a typical board is ~0.1 units across, so the
					// radius must not be clamped to a "sensible" minimum like 1.
					const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 1e-4);
					camera.near = radius / 500;
					camera.far = radius * 60;
					camera.updateProjectionMatrix();
					controls.minDistance = radius * 0.05;
					controls.maxDistance = radius * 14;
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
					if (!disposed) error = 'The 3D model could not be loaded.';
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
			if (!disposed) error = 'Neither WebGPU nor WebGL 2 is available in this browser.';
		});

		return () => {
			disposed = true;
			cleanup?.();
		};
	});
</script>

<div
	class="relative overflow-hidden rounded-lg border {className}"
	style:background="var(--viewer-bg)"
	data-backend={backend}
	data-draw-calls={drawCalls || undefined}
>
	<div bind:this={host} class="h-full w-full"></div>

	{#if loaded && recolorable}
		<div class="absolute left-2 top-2 flex flex-col gap-1.5 rounded-md border bg-[var(--surface-1)]/92 px-2 py-1.5 backdrop-blur">
			<div class="flex items-center gap-1.5" role="radiogroup" aria-label="Soldermask colour">
				<span class="w-10 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">Mask</span>
				{#each MASKS as option}
					<button
						class="swatch"
						class:active={mask === option.id}
						style:background={option.color}
						title="{option.label} soldermask"
						aria-label="{option.label} soldermask"
						role="radio"
						aria-checked={mask === option.id}
						onclick={() => choose({ mask: option.id })}
					></button>
				{/each}
			</div>
			<div class="flex items-center gap-1.5" role="radiogroup" aria-label="Silkscreen colour">
				<span class="w-10 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">Silk</span>
				{#each SILKS as option}
					<button
						class="swatch"
						class:active={silk === option.id}
						style:background={option.color}
						title="{option.label} silkscreen"
						aria-label="{option.label} silkscreen"
						role="radio"
						aria-checked={silk === option.id}
						onclick={() => choose({ silk: option.id })}
					></button>
				{/each}
			</div>
			<div class="flex items-center gap-1.5" role="radiogroup" aria-label="Pad finish">
				<span class="w-10 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">Finish</span>
				{#each FINISHES as option}
					<button
						class="finish"
						class:active={finish === option.id}
						style:--metal={option.color}
						title={option.title}
						aria-label={option.title}
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

	<!-- View cube: rotates with the camera; faces, edges and corners are clickable. -->
	<div class="absolute right-1 top-1 flex items-start" class:invisible={!loaded}>
		<button class="viewer-btn mt-2 rounded-md border bg-[var(--surface-1)]/92 backdrop-blur" onclick={() => viewFrom(HOME)} title="Home view" aria-label="Home view">
			<Icon name="home" size={14} />
		</button>
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
						aria-label="View from {facet.name}"
						title={facet.kind === 'face' ? undefined : facet.name}
						tabindex={facet.kind === 'face' ? 0 : -1}
					>
						{facet.label}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if loaded && backend}
		<span class="mono pointer-events-none absolute bottom-2 left-2 rounded bg-black/45 px-1.5 py-0.5 text-[0.625rem] text-white/70">
			{backend} · {drawCalls} draw call{drawCalls === 1 ? '' : 's'}
		</span>
	{/if}

	{#if error}
		<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
			<Icon name="alert" size={24} style="color: var(--err)" />
			<p class="text-sm" style:color="var(--err)">{error}</p>
			<a href={url} download class="btn btn-sm">Download the GLB instead</a>
		</div>
	{:else if !loaded}
		<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
			<Icon name="cube" size={28} class="animate-pulse text-[var(--text-muted)]" />
			<div class="h-1 w-40 overflow-hidden rounded-full bg-[var(--surface-3)]">
				<div class="h-full rounded-full bg-[var(--accent)] transition-all duration-200" style:width="{progress}%"></div>
			</div>
			<p class="text-xs text-[var(--text-muted)]">Loading 3D model… {progress}%</p>
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
	.viewcube-stage {
		cursor: grab;
		touch-action: none;
	}
	.viewcube-stage:active {
		cursor: grabbing;
	}
</style>
