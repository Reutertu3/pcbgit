<script lang="ts">
	import { enhance } from '$app/forms';
	import { keepValues } from '$lib/forms';
	import { invalidateAll } from '$app/navigation';
	import { formatDateTime, relativeTime } from '$lib/format';
	import Changelog from '$lib/components/Changelog.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import { t, tParts } from '$lib/i18n/t';
	import type { ImageState, UpdateStatus, UpdateStep } from '$lib/types';

	let { data, form } = $props();

	const busy = $derived(Boolean(data.update?.requested || data.update?.status?.state === 'running'));
	const checking = $derived(Boolean(data.availability?.checkRequested));

	// While an update runs, poll. The server restarts mid-way, so failed
	// reloads are expected and simply retried on the next tick.
	$effect(() => {
		if (!busy && !checking) return;
		const timer = setInterval(() => invalidateAll().catch(() => {}), 3000);
		return () => clearInterval(timer);
	});

	// The switch moves on click; the page data takes over once the server answers.
	let autoPending = $state<boolean | null>(null);
	const autoShown = $derived(autoPending ?? data.autoUpdate);

	const STATE_COLOR = { running: 'var(--info)', success: 'var(--ok)', failed: 'var(--err)' } as const;

	// Only "ready" updates in a minute; the others wait for GitHub or build here.
	const IMAGE_COLOR: Record<ImageState, string> = {
		ready: 'var(--ok)',
		building: 'var(--info)',
		failed: 'var(--warn)',
		missing: 'var(--warn)',
		unreadable: 'var(--warn)',
		local: 'var(--warn)',
		off: 'var(--text-muted)'
	};

	// update.sh's steps in order; downloading and building share a place.
	const STEPS = ['fetch', 'wait', 'install', 'restart'] as const;
	function stepIndex(step: UpdateStep | undefined) {
		if (step === 'pull' || step === 'build') return 2;
		if (step === 'done') return STEPS.length;
		return Math.max(0, STEPS.indexOf((step ?? 'fetch') as (typeof STEPS)[number]));
	}
	function stepLabel(step: (typeof STEPS)[number], status: UpdateStatus | null) {
		if (step !== 'install') return t(`instance.step.${step}`);
		if (status?.step === 'build' || status?.how === 'built') return t('instance.step.build');
		if (status?.step === 'pull' || status?.how === 'pulled') return t('instance.step.pull');
		return t('instance.step.install');
	}

	// How the running version got here, when the last update installed it.
	const runningHow = $derived.by(() => {
		const status = data.update?.status;
		if (status?.state !== 'success' || !status.how || !status.to) return null;
		return data.version.startsWith(status.to) || status.to.startsWith(data.version) ? status.how : null;
	});
</script>

<svelte:head><title>{t('admin.nav.instance')} · {t('admin.title')} · {data.site.name}</title></svelte:head>

<h2 class="mb-4 text-lg font-semibold tracking-tight">{t('instance.title')}</h2>

<section class="surface p-5">
	<form method="POST" action="?/save" use:enhance={keepValues}>
		<div class="mb-4">
			<label class="label" for="site_name">{t('instance.siteName')}</label>
			<input class="input" id="site_name" name="site_name" value={data.settings.siteName} maxlength="60" />
		</div>
		<div class="mb-4">
			<label class="label" for="site_tagline">{t('instance.tagline')}</label>
			<input class="input" id="site_tagline" name="site_tagline" value={data.settings.siteTagline} maxlength="160" />
			<p class="hint">{t('instance.taglineHint')}</p>
		</div>
		<label class="mb-4 flex cursor-pointer items-start gap-2.5">
			<input type="checkbox" name="registration_open" checked={data.settings.registrationOpen} class="mt-0.5" />
			<span>
				<span class="block text-sm font-medium">{t('instance.openRegistration')}</span>
				<span class="block text-xs leading-relaxed text-[var(--text-secondary)]">
					{t('instance.openRegistrationHint')}
				</span>
			</span>
		</label>
		<div class="flex flex-wrap items-center gap-3">
			<button class="btn btn-primary" type="submit">{t('instance.save')}</button>
			<SavedNote message={form && 'saved' in form ? form.message : null} token={form} />
		</div>
	</form>
</section>

<section class="surface mt-4 p-5">
	<h3 class="mb-1 text-sm font-semibold">{t('about.engine')}</h3>
	<p class="mb-3 text-xs leading-relaxed text-[var(--text-secondary)]">
		{t('instance.engineHint')}
	</p>
	<form method="POST" action="?/recheckKicad" use:enhance>
		<button class="btn btn-sm" type="submit"><Icon name="refresh" size={13} /> {t('instance.recheck')}</button>
	</form>
	{#if form?.scope === 'kicad' && 'message' in form}
		<div class="mt-3 -mb-4"><FormError message={form.message} kind="info" /></div>
	{/if}
</section>

<section class="surface mt-4 p-5" id="updates">
	<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-sm font-semibold">{t('instance.updates')}</h3>
		<span class="mono text-xs text-[var(--text-muted)]">
			{t('instance.running', { version: data.version })}{#if runningHow}{' · '}{t(`instance.how.${runningHow}`)}{/if}
		</span>
	</div>

	{#if !data.update}
		<p class="text-xs leading-relaxed text-[var(--text-secondary)]">
			{#each tParts('instance.updatesOff') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">deploy/install.sh</span>{/if}{/each}
		</p>
	{:else}
		{@const available = data.availability}
		<p class="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
			{t('instance.updatesHint')}
			{#if available?.checked}
				{#if available.source}
					{#each tParts('instance.sourceImage') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">{available.source}</span>{/if}{/each}
				{:else}
					{#each tParts('instance.sourceBuild') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">PCBGIT_UPDATE_IMAGE=build</span>{/if}{/each}
				{/if}
			{/if}
		</p>

		<form
			method="POST"
			action="?/autoUpdate"
			class="mb-4 flex items-center gap-3"
			use:enhance={() => {
				// Slide at once; the page data confirms it.
				autoPending = !data.autoUpdate;
				return async ({ update }) => {
					await update();
					autoPending = null;
				};
			}}
		>
			<input type="hidden" name="enabled" value={data.autoUpdate ? 'false' : 'true'} />
			<Toggle checked={autoShown} label={t('instance.auto')} onText={t('instance.autoOn')} offText={t('instance.autoOff')} />
			<div class="min-w-0">
				<p class="text-sm font-medium">{t('instance.auto')}</p>
				<p class="text-xs leading-relaxed text-[var(--text-secondary)]">{t('instance.autoHint')}</p>
				{#if data.autoUpdate && data.update.status?.state === 'failed' && data.update.status.trigger === 'auto'}
					<p class="text-xs" style:color="var(--warn)">{t('instance.autoPaused', { version: data.update.status.target ?? '' })}</p>
				{/if}
			</div>
		</form>

		{#if available}
			<div class="mb-3">
				{#if !available.checked}
					<p class="text-xs text-[var(--text-muted)]">{t('instance.notChecked')}</p>
				{:else if !available.ok}
					<p class="text-xs" style:color="var(--err)">
						{#each tParts('instance.checkFailed', { time: relativeTime(available.checked) }) as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">/var/lib/pcbgit-control/check.log</span>{/if}{/each}
					</p>
				{:else if available.behind > 0}
					<p class="mb-2 flex flex-wrap items-center gap-2 text-xs">
						<span class="chip !border-[var(--accent)] !text-[var(--accent)]">
							{t('instance.available', { count: available.behind })}
						</span>
						<span class="mono text-[var(--text-muted)]">{t('instance.range', { from: available.current, to: available.latest, branch: available.branch })}</span>
						<span class="text-[var(--text-muted)]">· {t('instance.checked', { time: relativeTime(available.checked) })}</span>
					</p>
					{#if available.image}
						<p class="mb-2 flex items-start gap-1.5 text-xs" style:color={IMAGE_COLOR[available.image]}>
							<Icon name={available.image === 'ready' ? 'check' : available.image === 'building' ? 'clock' : 'info'} size={13} class="mt-px shrink-0" />
							<span>{t(`instance.image.${available.image}`)}</span>
						</p>
					{/if}
					<Changelog commits={available.commits} total={available.behind} />
				{:else}
					<p class="flex items-center gap-1.5 text-xs" style:color="var(--ok)">
						<Icon name="check" size={13} /> {t('instance.upToDate')}
						<span class="text-[var(--text-muted)]">· {#each tParts('instance.upToDateDetail', { branch: available.branch, time: relativeTime(available.checked) }) as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">{available.current}</span>{/if}{/each}</span>
					</p>
				{/if}
				{#if available.ahead > 0}
					<p class="mt-2 text-xs" style:color="var(--warn)">
						{#each tParts('instance.ahead', { count: available.ahead }) as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">git reset --hard origin/{available.branch}</span>{/if}{/each}
					</p>
				{/if}
			</div>
		{/if}

		{@const status = data.update.status}
		{#if data.update.requested || status?.state === 'running' || (status?.state === 'failed' && status.step)}
			<!-- Where the update is: every step before the current one is done. -->
			{@const current = data.update.requested ? -1 : stepIndex(status?.step)}
			<div class="mb-3 rounded-md border px-3 py-2 text-xs">
				<ol class="flex flex-wrap items-center gap-x-3 gap-y-1">
					{#each STEPS as step, index (step)}
						{@const failed = status?.state === 'failed' && !data.update.requested && index === current}
						<li
							class="flex items-center gap-1"
							style:color={failed ? 'var(--err)' : index < current ? 'var(--ok)' : index === current ? 'var(--info)' : 'var(--text-muted)'}
						>
							<Icon
								name={failed ? 'x' : index < current ? 'check' : index === current ? 'refresh' : 'chevronRight'}
								size={12}
								class={index === current && !failed ? 'animate-pulse' : ''}
							/>
							{stepLabel(step, status)}
						</li>
					{/each}
				</ol>
				<p class="mt-1.5 text-[var(--text-muted)]">
					{#if data.update.requested}
						{t('instance.requested')}
					{:else if status}
						{status.message}{#if status.trigger === 'auto'}{' · '}{t('instance.automatic')}{/if}
						· {status.state === 'running' ? t('instance.started', { time: relativeTime(status.started * 1000) }) : formatDateTime((status.finished ?? status.started) * 1000)}
					{/if}
				</p>
			</div>
		{:else if status}
			<div class="mb-3 rounded-md border px-3 py-2 text-xs">
				<span class="font-semibold" style:color={STATE_COLOR[status.state]}>{status.message}</span>
				<span class="text-[var(--text-muted)]">
					{#if status.how}{' · '}{t(`instance.how.${status.how}`)}{/if}{#if status.trigger === 'auto'}{' · '}{t('instance.automatic')}{/if}
					· {formatDateTime((status.finished ?? status.started) * 1000)}
				</span>
			</div>
		{/if}

		<form method="POST" action="?/update" use:enhance class="flex flex-wrap items-center gap-3">
			<button class="btn btn-primary btn-sm" type="submit" disabled={busy}>
				<Icon name="download" size={13} />
				{busy ? t('instance.updating') : t('instance.update')}
			</button>
			<button class="btn btn-sm" type="submit" formaction="?/check" disabled={checking || busy}>
				<Icon name="refresh" size={13} />
				{checking ? t('instance.checking') : t('instance.checkNow')}
			</button>
			<label class="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-secondary)]">
				<input type="checkbox" name="force" /> {t('instance.force')}
			</label>
		</form>

		<!-- Everything this section reports goes here, under its buttons. -->
		{#if form?.scope === 'updates' && 'error' in form && form.error}
			<div class="mt-3"><FormError message={form.error} /></div>
		{:else if checking}
			<div class="mt-3"><FormError message={t('instance.checkingGithub')} kind="info" /></div>
		{/if}

		{#if data.update.log}
			<details class="mt-3" open={status?.state === 'failed'}>
				<summary class="cursor-pointer text-xs text-[var(--text-muted)]">{t('instance.lastLog')}</summary>
				<pre class="mono mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border bg-[var(--surface-0)] px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--text-secondary)]">{data.update.log}</pre>
			</details>
		{/if}
	{/if}
</section>
