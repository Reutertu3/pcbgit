<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { formatBytes, shortSha } from '$lib/format';
	import { t, tParts } from '$lib/i18n/t';

	let { data } = $props();

	const base = $derived(`/${data.project.owner_username}/${data.project.slug}`);
	const previewableSet = $derived(new Set(data.previewable ?? []));

	/** Groups a flat path list into a directory tree for display. */
	const grouped = $derived.by(() => {
		const directories = new Map<string, { path: string; size: number }[]>();
		for (const file of data.tree) {
			const slash = file.path.lastIndexOf('/');
			const directory = slash === -1 ? '' : file.path.slice(0, slash);
			if (!directories.has(directory)) directories.set(directory, []);
			directories.get(directory)!.push(file);
		}
		return [...directories.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	function fileHref(path: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (params.get('file') === path) params.delete('file');
		else params.set('file', path);
		return `${base}/files?${params.toString()}`;
	}

	function iconFor(path: string) {
		if (/\.kicad_pcb$/.test(path)) return 'board' as const;
		if (/\.kicad_sch$/.test(path)) return 'schematic' as const;
		if (/\.(step|stp|wrl|glb)$/i.test(path)) return 'cube' as const;
		return 'file' as const;
	}
</script>

<svelte:head><title>{t('tabs.files')} · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-4">
	{#if !data.tree.length}
		<div class="surface traces px-6 py-16 text-center">
			<Icon name="folder" size={28} class="mx-auto text-[var(--text-muted)]" />
			<p class="mt-3 text-sm text-[var(--text-secondary)]">{t('files.none')}</p>
		</div>
	{:else}
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
			<span>
				{#each tParts('files.summary', { count: data.tree.length, size: formatBytes(data.totalBytes) }) as part}
					{#if typeof part === 'string'}{part}{:else if part.slot === 'n'}<strong class="text-[var(--text-primary)]">{data.tree.length}</strong
						>{:else}<span class="mono">{shortSha(data.commit?.sha)}</span>{/if}
				{/each}
			</span>
			<a href="{base}/archive/{data.commit?.sha}.zip" class="btn btn-sm">
				<Icon name="download" size={12} /> {t('files.downloadZip')}
			</a>
		</div>

		<div class="grid gap-3" class:lg:grid-cols-[22rem_1fr]={data.preview}>
			<div class="surface divide-y overflow-hidden">
				{#each grouped as [directory, files]}
					{#if directory}
						<div class="flex items-center gap-1.5 bg-s2 px-3 py-1.5 text-xs text-[var(--text-secondary)]">
							<Icon name="folder" size={12} />
							<span class="mono">{directory}/</span>
						</div>
					{/if}
					{#each files as file}
						{@const name = file.path.split('/').pop()}
						{@const canPreview = previewableSet.has(file.path)}
						<!-- Indented under their folder's row, which would otherwise read as a divider. -->
						<div class="flex items-center gap-2 py-1.5 pr-3 text-[0.8125rem] hover:bg-s2" class:pl-3={!directory} class:pl-8={directory}>
							<Icon name={iconFor(file.path)} size={13} class="shrink-0 text-[var(--text-muted)]" />
							{#if canPreview}
								<a
									href={fileHref(file.path)}
									class="mono min-w-0 flex-1 truncate hover:text-[var(--accent)]"
									class:text-[var(--accent)]={data.preview?.path === file.path}
								>
									{name}
								</a>
							{:else}
								<span class="mono min-w-0 flex-1 truncate text-[var(--text-secondary)]">{name}</span>
							{/if}
							<span class="shrink-0 text-[0.6875rem] tabular-nums text-[var(--text-muted)]">
								{formatBytes(file.size)}
							</span>
						</div>
					{/each}
				{/each}
			</div>

			{#if data.preview}
				<div class="surface flex min-w-0 flex-col overflow-hidden">
					<div class="flex items-center gap-2 border-b bg-s2 px-3 py-2">
						<Icon name={iconFor(data.preview.path)} size={13} />
						<span class="mono min-w-0 flex-1 truncate text-xs">{data.preview.path}</span>
						<a href="{base}/files" class="btn btn-ghost btn-sm !px-1.5" title={t('files.closePreview')} aria-label={t('files.closePreview')}>
							<Icon name="x" size={12} />
						</a>
					</div>
					<pre class="mono max-h-[calc(100svh-18rem)] overflow-auto bg-[var(--surface-0)] px-3 py-2.5 text-[0.6875rem] leading-relaxed text-[var(--text-secondary)]">{data.preview.content}</pre>
					{#if data.preview.truncated}
						<p class="border-t px-3 py-1.5 text-[0.6875rem] text-[var(--text-muted)]">
							{t('files.truncated')}
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
