<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();

	const PIPELINE = [
		{ icon: 'git' as const, title: 'Push or upload', body: 'A git push to your board repository, or a ZIP uploaded in the browser. Both land as ordinary commits.' },
		{ icon: 'refresh' as const, title: 'Render', body: 'A background worker checks out the commit and runs kicad-cli over it — schematic sheets, board layers, an assembled 3D model, the BOM, DRC and ERC.' },
		{ icon: 'layers' as const, title: 'Review', body: 'Every output is browsable and every commit keeps its own copy, so you can compare any two versions.' }
	];

	const FEATURES = [
		{ icon: 'schematic' as const, title: 'Schematics', body: 'Every sheet of a hierarchical design, pan and zoom, light or dark.' },
		{ icon: 'board' as const, title: 'Layered board view', body: 'Copper, silkscreen, mask, paste and fab layers stacked with per-layer visibility and a board flip.' },
		{ icon: 'cube' as const, title: 'Assembled 3D', body: 'The real board with its components, straight from the STEP models KiCad attaches to footprints.' },
		{ icon: 'list' as const, title: 'Bill of materials', body: 'Grouped line items with MPNs and datasheets, downloadable as CSV and diffable between versions.' },
		{ icon: 'shield' as const, title: 'DRC and ERC', body: 'KiCad’s own checks, grouped by severity, with board coordinates plotted on the layout.' },
		{ icon: 'history' as const, title: 'Version history', body: 'Every commit keeps its renders, so a change in part count or DRC state is visible at a glance.' }
	];
</script>

<svelte:head><title>About · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8">
	<h1 class="text-2xl font-bold tracking-tight">About {data.site.name}</h1>
	<p class="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
		A self-hosted repository for KiCad hardware projects. It stores real git repositories, renders
		every commit with KiCad's own command line tools, and puts the results in a browser so a board
		can be reviewed without installing anything.
	</p>

	<section class="mt-8">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">How it works</h2>
		<ol class="grid gap-3 sm:grid-cols-3">
			{#each PIPELINE as step, index}
				<li class="surface p-4">
					<div class="mb-2 flex items-center gap-2">
						<span class="mono text-xs text-[var(--accent)]">{index + 1}</span>
						<Icon name={step.icon} size={15} class="text-[var(--accent)]" />
					</div>
					<h3 class="text-sm font-semibold">{step.title}</h3>
					<p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{step.body}</p>
				</li>
			{/each}
		</ol>
	</section>

	<section class="mt-8">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">What you get</h2>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each FEATURES as feature}
				<div class="surface flex gap-3 p-4">
					<Icon name={feature.icon} size={16} class="mt-0.5 shrink-0 text-[var(--accent)]" />
					<div>
						<h3 class="text-sm font-semibold">{feature.title}</h3>
						<p class="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">{feature.body}</p>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="mt-8">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">This instance</h2>
		<dl class="surface divide-y text-sm">
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">Render engine</dt>
				<dd class="mono text-xs">
					{#if data.kicad}
						{data.kicad}
					{:else}
						<span style:color="var(--warn)">kicad-cli not installed</span>
					{/if}
				</dd>
			</div>
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">Render queue</dt>
				<dd class="mono text-xs">{data.queue.running} running, {data.queue.queued} queued</dd>
			</div>
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">Public boards</dt>
				<dd class="mono text-xs">{data.stats.boards}</dd>
			</div>
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">Versions rendered</dt>
				<dd class="mono text-xs">{data.stats.versions}</dd>
			</div>
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">Git endpoint</dt>
				<dd class="mono truncate text-xs">{data.gitBase}/&lt;user&gt;/&lt;board&gt;.git</dd>
			</div>
		</dl>
		{#if !data.kicad}
			<p class="hint">
				Without kicad-cli the server still tracks versions, parses board statistics and builds a BOM,
				but cannot produce schematic, board, 3D or DRC output.
			</p>
		{/if}
	</section>
</div>
