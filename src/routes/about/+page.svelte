<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { t } from '$lib/i18n/t';
	import { onThisHost } from '$lib/origin';

	let { data } = $props();

	const PIPELINE = [
		{ icon: 'git' as const, key: 'push' },
		{ icon: 'refresh' as const, key: 'render' },
		{ icon: 'layers' as const, key: 'review' }
	] as const;

	const FEATURES = [
		{ icon: 'schematic' as const, key: 'schematics' },
		{ icon: 'board' as const, key: 'board' },
		{ icon: 'cube' as const, key: '3d' },
		{ icon: 'list' as const, key: 'bom' },
		{ icon: 'shield' as const, key: 'checks' },
		{ icon: 'history' as const, key: 'history' }
	] as const;
</script>

<svelte:head><title>{t('footer.about')} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8">
	<h1 class="text-2xl font-bold tracking-tight">{t('about.title', { name: data.site.name })}</h1>
	<p class="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
		{t('about.intro')}
	</p>

	<section class="mt-8">
		<h2 class="mb-3 text-base font-semibold">{t('about.how')}</h2>
		<ol class="grid gap-3 sm:grid-cols-3">
			{#each PIPELINE as step, index}
				<li class="surface p-4">
					<div class="mb-2 flex items-center gap-2">
						<span class="mono text-xs text-[var(--accent)]">{index + 1}</span>
						<Icon name={step.icon} size={15} class="text-[var(--accent)]" />
					</div>
					<h3 class="text-sm font-semibold">{t(`about.step.${step.key}.title`)}</h3>
					<p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{t(`about.step.${step.key}.body`)}</p>
				</li>
			{/each}
		</ol>
	</section>

	<section class="mt-8">
		<h2 class="mb-3 text-base font-semibold">{t('about.what')}</h2>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each FEATURES as feature}
				<div class="surface flex gap-3 p-4">
					<Icon name={feature.icon} size={16} class="mt-0.5 shrink-0 text-[var(--accent)]" />
					<div>
						<h3 class="text-sm font-semibold">{t(`about.feature.${feature.key}.title`)}</h3>
						<p class="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">{t(`about.feature.${feature.key}.body`)}</p>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="mt-8">
		<h2 class="mb-3 text-base font-semibold">{t('about.instance')}</h2>
		<dl class="surface divide-y text-sm">
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">{t('about.engine')}</dt>
				<dd class="mono text-xs">
					{#if data.kicad}
						{data.kicad}
					{:else}
						<span style:color="var(--warn)">{t('about.noKicad')}</span>
					{/if}
				</dd>
			</div>
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">{t('about.queue')}</dt>
				<dd class="mono text-xs">{t('about.queueState', { running: data.queue.running, queued: data.queue.queued })}</dd>
			</div>
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">{t('about.publicBoards')}</dt>
				<dd class="mono text-xs">{data.stats.boards}</dd>
			</div>
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">{t('about.versions')}</dt>
				<dd class="mono text-xs">{data.stats.versions}</dd>
			</div>
			<div class="flex justify-between gap-3 px-4 py-2.5">
				<dt class="text-[var(--text-secondary)]">{t('about.git')}</dt>
				<dd class="mono truncate text-xs">{onThisHost(data.gitBase)}/&lt;user&gt;/&lt;board&gt;.git</dd>
			</div>
		</dl>
		{#if !data.kicad}
			<p class="hint">
				{t('about.noKicadHint')}
			</p>
		{/if}
	</section>
</div>
