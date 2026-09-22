<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		url: string;
		class?: string;
	}
	let { url, class: className = '' }: Props = $props();

	type Preset = 'default' | 'top' | 'bottom' | 'iso';

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
	type MaskId = (typeof MASKS)[number]['id'];
	type SilkId = (typeof SILKS)[number]['id'];
	const COLOR_KEY = 'kupfergit-3d-colors';

	let host = $state<HTMLDivElement | null>(null);
	let progress = $state(0);
	let error = $state<string | null>(null);
	let loaded = $state(false);
	let backend = $state('');
	let drawCalls = $state(0);
	let mask = $state<MaskId>('green');
	let silk = $state<SilkId>('white');
	/** False for models without KiCad's named board layers; the picker is hidden then. */
	let recolorable = $state(false);

	// Assigned once three.js has loaded.
	let setView = $state<(preset: Preset) => void>(() => {});
	let applyColors = $state<() => void>(() => {});

	try {
		const saved = JSON.parse(localStorage.getItem(COLOR_KEY) ?? 'null');
		if (MASKS.some((m) => m.id === saved?.mask)) mask = saved.mask;
		if (SILKS.some((m) => m.id === saved?.silk)) silk = saved.silk;
	} catch {
		// No storage (private mode, SSR): keep the defaults.
	}

	function choose(next: { mask?: MaskId; silk?: SilkId }) {
		if (next.mask) {
			mask = next.mask;
			// As at JLCPCB: white mask gets black print, black mask gets white print.
			if (next.mask === 'white') silk = 'black';
			if (next.mask === 'black') silk = 'white';
		}
		if (next.silk) silk = next.silk;
		applyColors();
		try {
			localStorage.setItem(COLOR_KEY, JSON.stringify({ mask, silk }));
		} catch {
			// Not persisted; the choice still applies to this view.
		}
	}

	/** Directions from the board centre toward the camera (glTF is Y-up, board in XZ). */
	const DIRECTIONS: Record<Preset, [number, number, number]> = {
		default: [0, 1, 0.62],
		// The tiny Z offset keeps lookAt well defined and puts the board's top edge up.
		top: [0, 1, 0.0001],
		bottom: [0, -1, 0.0001],
		iso: [1, 0.9, 1]
	};

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

			/* ---- render on demand: nothing runs while the view is still ---- */
			let pending = 0;
			let trailing = 0;
			const requestRender = () => {
				// The WebGL fallback of WebGPURenderer (three r174) presents a frame one
				// render late, so every burst of renders ends with one extra frame.
				trailing = 1;
				if (!pending) pending = requestAnimationFrame(frame);
			};
			function frame() {
				pending = 0;
				// With damping, update() keeps emitting 'change' until the motion settles.
				controls.update();
				renderer.render(scene, camera);
				if (!pending && trailing > 0) {
					trailing--;
					pending = requestAnimationFrame(frame);
				}
			}
			controls.addEventListener('change', requestRender);

			let current: Preset = 'default';
			let userMoved = false;
			controls.addEventListener('start', () => (userMoved = true));

			const bounds = new THREE.Box3();
			const centre = new THREE.Vector3();
			/** Sampled model vertices (x,y,z…), relative to the centre, used for framing. */
			let fitPoints = new Float32Array(0);

			/**
			 * Frames the model from a given direction using its actual vertices. A
			 * bounding box would waste space: one tall part makes the box far higher
			 * than the board, and in angled views its empty corners stick out.
			 */
			function fit(preset: Preset, fill = 0.92) {
				if (!fitPoints.length) return;
				const dir = new THREE.Vector3(...DIRECTIONS[preset]).normalize();
				camera.position.copy(centre).add(dir);
				camera.lookAt(centre);
				camera.updateMatrixWorld();

				const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
				const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
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
				camera.position.copy(aim).addScaledVector(dir, distance);
				controls.target.copy(aim);
				controls.update();
				current = preset;
				requestRender();
			}

			setView = (preset) => {
				userMoved = false;
				fit(preset);
			};

			const materials = new Set<import('three/webgpu').Material>();
			/**
			 * KiCad exports one primitive per footprint face, often tens of thousands of
			 * them, and every one is a draw call. Baking transforms and merging all
			 * meshes that share a material collapses that to one draw call per material.
			 */
			/** Board soldermask and silkscreen materials, cloned so recolouring touches nothing else. */
			const roleMaterials = { mask: [] as import('three/webgpu').MeshStandardMaterial[], silk: [] as import('three/webgpu').MeshStandardMaterial[] };
			const roleClones = new Map<string, import('three/webgpu').Material>();

			applyColors = () => {
				const maskColor = MASKS.find((m) => m.id === mask)!.color;
				const silkColor = SILKS.find((m) => m.id === silk)!.color;
				// Colour is a uniform: no shader recompile, so this is instant.
				for (const material of roleMaterials.mask) material.color.set(maskColor);
				for (const material of roleMaterials.silk) material.color.set(silkColor);
				requestRender();
			};

			function mergeByMaterial(
				root: import('three/webgpu').Object3D,
				roleOf: (mesh: import('three/webgpu').Mesh) => 'mask' | 'silk' | null
			) {
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
					if (combined) {
						const mesh = new THREE.Mesh(combined, material);
						// Mask and silkscreen are nearly coplanar: draw the print after the mask
						// explicitly rather than trusting depth sorting between them.
						if (roleMaterials.mask.includes(material as never)) mesh.renderOrder = 1;
						if (roleMaterials.silk.includes(material as never)) mesh.renderOrder = 2;
						merged.add(mesh);
						if (combined !== geometries[0]) geometries.forEach((geometry) => geometry.dispose());
					} else {
						// Attribute layouts that cannot be merged are drawn individually.
						for (const geometry of geometries) merged.add(new THREE.Mesh(geometry, material));
					}
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
					// KiCad names the board's layer meshes "<board>_soldermask" / "_silkscreen";
					// the loader's associations map each object back to its source mesh.
					const meshNames: string[] = (gltf.parser.json.meshes ?? []).map((m: { name?: string }) => m.name ?? '');
					const model = mergeByMaterial(gltf.scene, (mesh) => {
						const index = gltf.parser.associations.get(mesh)?.meshes;
						const name = index === undefined ? '' : meshNames[index];
						return name.endsWith('_soldermask') ? 'mask' : name.endsWith('_silkscreen') ? 'silk' : null;
					});
					recolorable = roleMaterials.mask.length > 0;
					applyColors();
					scene.add(model);
					drawCalls = model.children.length;

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
					fit('default');
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
				if (!userMoved) fit(current);
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

	const VIEWS: [Preset, string][] = [
		['default', 'Fit'],
		['top', 'Top'],
		['bottom', 'Bottom'],
		['iso', 'Isometric']
	];
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
				<span class="w-9 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">Mask</span>
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
				<span class="w-9 text-[0.625rem] uppercase tracking-wide text-[var(--text-muted)]">Silk</span>
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
		</div>
	{/if}

	<div class="absolute right-2 top-2 flex gap-2">
		<div class="flex overflow-hidden rounded-md border bg-[var(--surface-1)]/92 backdrop-blur">
			{#each VIEWS as [preset, label]}
				<button
					class="viewer-btn !w-auto border-l px-2 text-xs first:border-l-0"
					onclick={() => setView(preset)}
					disabled={!loaded}
				>
					{label}
				</button>
			{/each}
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
	.swatch.active {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
