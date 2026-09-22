<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		url: string;
		class?: string;
	}
	let { url, class: className = '' }: Props = $props();

	let host = $state<HTMLDivElement | null>(null);
	let progress = $state(0);
	let error = $state<string | null>(null);
	let loaded = $state(false);
	let wireframe = $state(false);

	// Assigned once three.js has loaded; called by the view preset buttons.
	let setView = $state<(preset: 'top' | 'bottom' | 'iso' | 'side') => void>(() => {});
	let setWireframe = $state<(on: boolean) => void>(() => {});

	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | undefined;

		(async () => {
			// three.js is heavy and only this tab needs it, so it is imported lazily.
			const THREE = await import('three');
			const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
			const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
			const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
			if (disposed || !host) return;

			const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
			renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
			renderer.setSize(host.clientWidth, host.clientHeight);
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.toneMappingExposure = 1.05;
			host.appendChild(renderer.domElement);

			const scene = new THREE.Scene();
			const pmrem = new THREE.PMREMGenerator(renderer);
			// A room environment gives solder mask and copper believable reflections
			// without shipping an HDRI file.
			scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

			const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.1, 5000);
			const controls = new OrbitControls(camera, renderer.domElement);
			controls.enableDamping = true;
			controls.dampingFactor = 0.08;
			controls.rotateSpeed = 0.8;
			controls.panSpeed = 0.9;

			const key = new THREE.DirectionalLight(0xffffff, 1.5);
			key.position.set(1, 2.2, 1.4);
			scene.add(key);
			const fill = new THREE.DirectionalLight(0xffffff, 0.55);
			fill.position.set(-1.4, -0.6, -1);
			scene.add(fill);
			scene.add(new THREE.AmbientLight(0xffffff, 0.22));

			let radius = 50;
			const centre = new THREE.Vector3();
			const meshes: import('three').Mesh[] = [];

			setView = (preset) => {
				const distance = radius * 2.6;
				const positions = {
					top: [0, distance, 0.001],
					bottom: [0, -distance, 0.001],
					side: [0, radius * 0.35, distance],
					iso: [distance * 0.62, distance * 0.55, distance * 0.62]
				} as const;
				const [x, y, z] = positions[preset];
				camera.position.set(centre.x + x, centre.y + y, centre.z + z);
				controls.target.copy(centre);
				controls.update();
			};

			setWireframe = (on) => {
				for (const mesh of meshes) {
					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					for (const material of materials) {
						(material as import('three').MeshStandardMaterial).wireframe = on;
					}
				}
			};

			new GLTFLoader().load(
				url,
				(gltf) => {
					if (disposed) return;
					scene.add(gltf.scene);
					gltf.scene.traverse((object) => {
						if ((object as import('three').Mesh).isMesh) meshes.push(object as import('three').Mesh);
					});

					const bounds = new THREE.Box3().setFromObject(gltf.scene);
					bounds.getCenter(centre);
					radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 1);
					camera.near = radius / 200;
					camera.far = radius * 60;
					camera.updateProjectionMatrix();
					controls.minDistance = radius * 0.35;
					controls.maxDistance = radius * 14;
					setView('iso');
					loaded = true;
				},
				(event) => {
					if (event.total) progress = Math.round((event.loaded / event.total) * 100);
				},
				() => {
					if (!disposed) error = 'The 3D model could not be loaded.';
				}
			);

			let frame = 0;
			const tick = () => {
				frame = requestAnimationFrame(tick);
				controls.update();
				renderer.render(scene, camera);
			};
			tick();

			const observer = new ResizeObserver(() => {
				if (!host) return;
				camera.aspect = host.clientWidth / host.clientHeight;
				camera.updateProjectionMatrix();
				renderer.setSize(host.clientWidth, host.clientHeight);
			});
			observer.observe(host);

			cleanup = () => {
				cancelAnimationFrame(frame);
				observer.disconnect();
				controls.dispose();
				pmrem.dispose();
				scene.traverse((object) => {
					const mesh = object as import('three').Mesh;
					if (!mesh.isMesh) return;
					mesh.geometry?.dispose();
					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
					for (const material of materials) material?.dispose();
				});
				renderer.dispose();
				renderer.domElement.remove();
			};
		})().catch((thrown) => {
			console.error(thrown);
			if (!disposed) error = 'WebGL is unavailable in this browser.';
		});

		return () => {
			disposed = true;
			cleanup?.();
		};
	});

	const VIEWS = [
		['iso', 'Isometric'],
		['top', 'Top'],
		['bottom', 'Bottom'],
		['side', 'Side']
	] as const;
</script>

<div class="relative overflow-hidden rounded-lg border {className}" style:background="var(--viewer-bg)">
	<div bind:this={host} class="h-full w-full"></div>

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
		<div class="flex overflow-hidden rounded-md border bg-[var(--surface-1)]/92 backdrop-blur">
			<button
				class="viewer-btn !w-auto gap-1.5 px-2 text-xs"
				onclick={() => {
					wireframe = !wireframe;
					setWireframe(wireframe);
				}}
				disabled={!loaded}
				title="Toggle wireframe"
			>
				<Icon name={wireframe ? 'eye' : 'eyeOff'} size={12} />
				Wireframe
			</button>
		</div>
	</div>

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
