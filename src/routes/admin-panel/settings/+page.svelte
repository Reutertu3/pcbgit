<script lang="ts">
	import { enhance } from '$app/forms';
	import { keepValues } from '$lib/forms';
	import { invalidateAll } from '$app/navigation';
	import { formatDateTime, relativeTime } from '$lib/format';
	import Changelog from '$lib/components/Changelog.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { t, tParts } from '$lib/i18n/t';
	import type { ImageState, UpdateStatus, UpdateStep } from '$lib/types';

	let { data, form } = $props();

	const busy = $derived(Boolean(data.update?.requested || data.update?.status?.state === 'running'));

	/*
	 * "Check now": the server's check usually ends within a second or two, often
	 * before the next reload could see its request file, so going by that file left
	 * the click looking ignored and the "Checking…" note vanishing. The page holds on
	 * to its own click instead: running until the server records a check that ended
	 * after it (server time, from the action), then a result that stays until closed.
	 */
	const CHECK_TIMEOUT = 2 * 60_000;
	let checkSubmitting = $state(false);
	let checkSince = $state<number | null>(null);
	let checkClickedAt = $state(0);
	let now = $state(Date.now());
	const checkWaiting = $derived(
		checkSince !== null && (data.availability?.checked ?? 0) < checkSince - 1000 && now - checkClickedAt < CHECK_TIMEOUT
	);
	const checkTimedOut = $derived(
		checkSince !== null && (data.availability?.checked ?? 0) < checkSince - 1000 && now - checkClickedAt >= CHECK_TIMEOUT
	);
	const checking = $derived(checkSubmitting || checkWaiting || Boolean(data.availability?.checkRequested));
	const checkDone = $derived(checkSince !== null && !checking);

	function submitCheck() {
		checkSubmitting = true;
		checkClickedAt = Date.now();
		now = checkClickedAt;
		return async ({ result, update }: { result: { type: string; data?: Record<string, unknown> }; update: () => Promise<void> }) => {
			if (result.type === 'success' && typeof result.data?.checkRequestedAt === 'number') checkSince = result.data.checkRequestedAt;
			await update();
			checkSubmitting = false;
		};
	}

	// While an update or a check runs, poll. The server restarts mid-way through an
	// update, so failed reloads are expected and simply retried on the next tick.
	$effect(() => {
		if (!busy && !checking) return;
		const timer = setInterval(() => invalidateAll().catch(() => {}), 3000);
		return () => clearInterval(timer);
	});
	// A clock for the elapsed time and the check's timeout.
	$effect(() => {
		if (!busy && !checking) return;
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	const clock = (ms: number) => {
		const seconds = Math.max(0, Math.floor(ms / 1000));
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	};

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

	// update.sh's steps in order; downloading and building share a place. Installing
	// a release may wait for its image; the button's build of master never does. Both
	// back up before switching and check the new version starts (or go back).
	type Step = 'fetch' | 'wait' | 'install' | 'backup' | 'restart' | 'verify';
	const RELEASE_STEPS: Step[] = ['fetch', 'wait', 'install', 'backup', 'restart', 'verify'];
	const BUILD_STEPS: Step[] = ['fetch', 'install', 'backup', 'restart', 'verify'];
	function stepIndex(steps: Step[], step: UpdateStep | undefined) {
		if (step === 'pull' || step === 'build') return steps.indexOf('install');
		if (step === 'done') return steps.length;
		return Math.max(0, steps.indexOf((step ?? 'fetch') as Step));
	}
	function stepLabel(step: Step, status: UpdateStatus | null) {
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

<style>
	/* A light band travelling along the running step's segment. */
	.update-progress-run {
		position: absolute;
		inset: 0 auto 0 0;
		width: 40%;
		background: var(--info);
		border-radius: 999px;
		animation: update-progress 1.4s ease-in-out infinite;
	}
	@keyframes update-progress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
</style>

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
			<input class="input" id="site_tagline" name="site_tagline" value={data.settings.tagline} maxlength="160" />
		</div>
		<div class="mb-4">
			<label class="label" for="site_intro">{t('instance.intro')}</label>
			<textarea class="input min-h-20" id="site_intro" name="site_intro" maxlength="600">{data.settings.intro}</textarea>
			<p class="hint">{t('instance.textsHint')}</p>
		</div>
		<Switch name="registration_open" checked={data.settings.registrationOpen} class="mb-4">
			<span class="block text-sm font-medium">{t('instance.openRegistration')}</span>
			<span class="block text-xs leading-relaxed text-[var(--text-secondary)]">{t('instance.openRegistrationHint')}</span>
		</Switch>
		<Switch name="registration_approval" checked={data.settings.registrationApproval} class="mb-4">
			<span class="block text-sm font-medium">{t('instance.approval')}</span>
			<span class="block text-xs leading-relaxed text-[var(--text-secondary)]">{t('instance.approvalHint')}</span>
		</Switch>
		<div class="flex flex-wrap items-center gap-3">
			<button class="btn btn-primary" type="submit">{t('instance.save')}</button>
			<SavedNote message={form && 'saved' in form && form.scope === 'site' ? form.message : null} token={form} />
		</div>
	</form>
</section>

<section class="surface mt-4 p-5">
	<h3 class="mb-1 text-sm font-semibold">{t('instance.limits')}</h3>
	<p class="mb-3 text-xs leading-relaxed text-[var(--text-secondary)]">{t('instance.limitsHint')}</p>
	<form method="POST" action="?/saveLimits" use:enhance={keepValues}>
		<div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			<div>
				<label class="label" for="limit_boards">{t('instance.limitBoards')}</label>
				<input class="input" id="limit_boards" name="limit_boards" type="number" min="0" value={data.limits.boards} />
			</div>
			<div>
				<label class="label" for="limit_storage_mb">{t('instance.limitStorage')}</label>
				<input class="input" id="limit_storage_mb" name="limit_storage_mb" type="number" min="0" value={data.limits.storageMb} />
			</div>
			<div>
				<label class="label" for="limit_writes_per_hour">{t('instance.limitWrites')}</label>
				<input class="input" id="limit_writes_per_hour" name="limit_writes_per_hour" type="number" min="0" value={data.limits.writesPerHour} />
			</div>
			<div>
				<label class="label" for="limit_comments_per_hour">{t('instance.limitComments')}</label>
				<input class="input" id="limit_comments_per_hour" name="limit_comments_per_hour" type="number" min="0" value={data.limits.commentsPerHour} />
			</div>
			<div>
				<label class="label" for="limit_queued_renders">{t('instance.limitRenders')}</label>
				<input class="input" id="limit_queued_renders" name="limit_queued_renders" type="number" min="0" value={data.limits.queuedRenders} />
			</div>
			<div>
				<label class="label" for="limit_push_mb">{t('instance.limitPush')}</label>
				<input class="input" id="limit_push_mb" name="limit_push_mb" type="number" min="0" value={data.limits.pushMb} />
				{#if data.requestLimit}<p class="hint">{t('instance.limitPushHint', { size: data.requestLimit })}</p>{/if}
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<button class="btn btn-primary" type="submit">{t('instance.saveLimits')}</button>
			<SavedNote message={form && 'saved' in form && form.scope === 'limits' ? form.message : null} token={form} />
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
			{data.tag ? t('instance.runningTag', { tag: data.tag, version: data.version }) : t('instance.running', { version: data.version })}{#if runningHow}{' · '}{t(`instance.how.${runningHow}`)}{/if}
		</span>
	</div>

	{#if !data.update}
		<p class="text-xs leading-relaxed text-[var(--text-secondary)]">
			{#each tParts('instance.updatesOff') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">deploy/install.sh</span>{/if}{/each}
		</p>
	{:else}
		{@const available = data.availability}
		<p class="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
			{t('instance.updatesHint', { interval: t(`instance.interval.${data.checkInterval}`) })}
			<!-- Downloading release images is the normal case; only the exception is worth a word. -->
			{#if available?.checked && !available.source}
				{#each tParts('instance.sourceBuild') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">PCBGIT_UPDATE_IMAGE=build</span>{/if}{/each}
			{/if}
		</p>

		<form
			method="POST"
			action="?/autoUpdate"
			class="mb-4 flex items-center gap-3"
			use:enhance={() => {
				// Stay where the click put it; the page data confirms it.
				autoPending = !data.autoUpdate;
				return async ({ update }) => {
					await update();
					autoPending = null;
				};
			}}
		>
			<!-- Switching posts at once; without JavaScript, the button below does. -->
			<Switch name="enabled" value="true" checked={autoShown} onchange={(event) => event.currentTarget.form?.requestSubmit()}>
				<span class="block text-sm font-medium">{t('instance.auto')}</span>
				<span class="block text-xs leading-relaxed text-[var(--text-secondary)]">{t('instance.autoHint')}</span>
				{#if data.autoUpdate && data.update.status?.state === 'failed' && data.update.status.trigger === 'auto'}
					<span class="block text-xs" style:color="var(--warn)">{t('instance.autoPaused', { version: data.update.status.target ?? '' })}</span>
				{/if}
			</Switch>
			<noscript><button class="btn btn-sm" type="submit">{t('instance.save')}</button></noscript>
		</form>

		{#if available}
			<div class="mb-3">
				{#if !available.checked}
					<p class="text-xs text-[var(--text-muted)]">{t('instance.notChecked')}</p>
				{:else if !available.ok}
					<p class="text-xs" style:color="var(--err)">
						{#each tParts('instance.checkFailed', { time: relativeTime(available.checked) }) as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">/var/lib/pcbgit-control/check.log</span>{/if}{/each}
					</p>
				{:else}
					<!-- Releases: what automatic updates install, or the button right away. -->
					<div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
						{#if available.release && available.releaseNew}
							<span class="chip !border-[var(--accent)] !text-[var(--accent)]">{t('instance.releaseNew', { release: available.release })}</span>
							<form method="POST" action="?/installRelease" use:enhance>
								<input type="hidden" name="release" value={available.release} />
								<button class="btn btn-primary btn-sm" type="submit" disabled={busy}>
									<Icon name="download" size={13} />
									{t('instance.installRelease', { release: available.release })}
								</button>
							</form>
						{:else if available.release}
							<span class="text-[var(--text-secondary)]">{t('instance.releaseCurrent', { release: available.release })}</span>
						{:else}
							<span class="text-[var(--text-secondary)]">{t('instance.noRelease')}</span>
						{/if}
						<span class="text-[var(--text-muted)]">· {t('instance.checked', { time: relativeTime(available.checked) })}</span>
					</div>
					{#if available.releaseNew && available.image}
						<p class="mb-2 flex items-start gap-1.5 text-xs" style:color={IMAGE_COLOR[available.image]}>
							<Icon name={available.image === 'ready' ? 'check' : available.image === 'building' ? 'clock' : 'info'} size={13} class="mt-px shrink-0" />
							<span>{t(`instance.image.${available.image}`)}</span>
						</p>
					{/if}

					<!-- master: what the button builds here. -->
					{#if available.behind > 0}
						<p class="mb-2 mt-3 flex flex-wrap items-center gap-2 text-xs">
							<span class="chip">{t('instance.available', { count: available.behind })}</span>
							<span class="mono text-[var(--text-muted)]">{t('instance.range', { from: available.current, to: available.latest, branch: available.branch })}</span>
						</p>
						<Changelog commits={available.commits} total={available.behind} />
					{:else}
						<p class="mt-2 flex items-center gap-1.5 text-xs" style:color="var(--ok)">
							<Icon name="check" size={13} /> {t('instance.upToDate')}
							<span class="text-[var(--text-muted)]">· {#each tParts('instance.upToDateDetail', { branch: available.branch }) as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">{available.current}</span>{/if}{/each}</span>
						</p>
					{/if}
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
			{@const steps = !data.update.requested && status?.release ? RELEASE_STEPS : BUILD_STEPS}
			{@const current = data.update.requested ? -1 : stepIndex(steps, status?.step)}
			{@const running = data.update.requested || status?.state === 'running'}
			{@const active = data.update.requested ? 0 : current}
			<div class="mb-3 rounded-md border px-3 py-2 text-xs">
				<!-- One segment per step: done, running (moving), failed, still to come. -->
				<div
					class="mb-2 flex gap-1"
					role="progressbar"
					aria-label={t('instance.progress')}
					aria-valuemin="0"
					aria-valuemax={steps.length}
					aria-valuenow={Math.max(0, Math.min(current, steps.length))}
				>
					{#each steps as step, index (step)}
						{@const failedHere = status?.state === 'failed' && !data.update.requested && index === current}
						<span
							class="relative h-1.5 flex-1 overflow-hidden rounded-full"
							style:background={failedHere
								? 'var(--err)'
								: index < active
									? 'var(--ok)'
									: index === active && running
										? 'color-mix(in srgb, var(--info) 30%, var(--surface-3))'
										: 'var(--surface-3)'}
						>
							{#if index === active && running}<span class="update-progress-run"></span>{/if}
						</span>
					{/each}
				</div>
				<ol class="flex flex-wrap items-center gap-x-3 gap-y-1">
					{#each steps as step, index (step)}
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
						· {#if status.state === 'running'}{t('instance.runningFor', { time: clock(now - status.started * 1000) })}{:else}{formatDateTime((status.finished ?? status.started) * 1000)}{/if}
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

		<div class="flex flex-wrap items-center gap-3">
			<form method="POST" action="?/update" use:enhance class="flex flex-wrap items-center gap-3">
				<button class="btn btn-sm" type="submit" disabled={busy}>
					<Icon name="download" size={13} />
					{busy ? t('instance.updating') : t('instance.update')}
				</button>
				<Switch name="force" size="sm" class="text-xs text-[var(--text-secondary)]">{t('instance.force')}</Switch>
			</form>
			<form method="POST" action="?/check" use:enhance={submitCheck}>
				<button class="btn btn-sm" type="submit" disabled={checking || busy} aria-busy={checking}>
					<Icon name="refresh" size={13} class={checking ? 'animate-spin' : ''} />
					{checking ? t('instance.checking') : t('instance.checkNow')}
				</button>
			</form>
			<!-- How often the host's hourly timer really checks; saved on change. -->
			<form method="POST" action="?/checkInterval" use:enhance={keepValues} class="flex items-center gap-2">
				<label class="text-xs text-[var(--text-secondary)]" for="check-interval">{t('instance.checkInterval')}</label>
				<select
					id="check-interval"
					name="interval"
					class="select !w-auto !py-1 text-xs"
					value={data.checkInterval}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				>
					{#each ['hourly', 'daily', 'weekly', 'monthly'] as const as interval}
						<option value={interval}>{t(`instance.interval.${interval}`)}</option>
					{/each}
				</select>
				<noscript><button class="btn btn-sm" type="submit">{t('instance.save')}</button></noscript>
			</form>
		</div>
		<p class="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{t('instance.buildHint')}</p>

		<!-- Everything this section reports goes here, under its buttons. -->
		{#if form?.scope === 'updates' && 'error' in form && form.error}
			<div class="mt-3"><FormError message={form.error} /></div>
		{:else if checking || checkDone || checkTimedOut}
			{@const failed = checkTimedOut || (checkDone && available && !available.ok)}
			<div
				class="mt-3 rounded-lg border px-3 py-2.5 text-xs"
				style:border-color="color-mix(in srgb, {failed ? 'var(--err)' : checking ? 'var(--info)' : 'var(--ok)'} 40%, transparent)"
				role="status"
				aria-live="polite"
			>
				<div class="flex items-start gap-2">
					<Icon
						name={checking ? 'refresh' : failed ? 'alert' : 'check'}
						size={14}
						class="mt-px shrink-0 {checking ? 'animate-spin' : ''}"
						style="color: {failed ? 'var(--err)' : checking ? 'var(--info)' : 'var(--ok)'}"
					/>
					<div class="min-w-0 flex-1 space-y-1">
						{#if checking}
							<p class="font-medium">{t('instance.checkingGithub')} <span class="mono text-[var(--text-muted)]">{clock(now - checkClickedAt)}</span></p>
						{:else if checkTimedOut}
							<p class="font-medium" style:color="var(--err)">{t('instance.checkTimeout')}</p>
						{:else if available && !available.ok}
							<p class="font-medium" style:color="var(--err)">
								{#each tParts('instance.checkFailed', { time: relativeTime(available.checked) }) as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">/var/lib/pcbgit-control/check.log</span>{/if}{/each}
							</p>
						{:else if available}
							<p class="font-medium">{t('instance.checkResult', { time: formatDateTime(available.checked) })}</p>
							<p class="text-[var(--text-secondary)]">
								{#if available.release && available.releaseNew}
									{t('instance.releaseNew', { release: available.release })}{#if available.image}{' — '}{t(`instance.image.${available.image}`)}{/if}
								{:else if available.release}
									{t('instance.releaseCurrent', { release: available.release })}
								{:else}
									{t('instance.noRelease')}
								{/if}
							</p>
							<p class="text-[var(--text-secondary)]">
								{#if available.behind > 0}
									{t('instance.available', { count: available.behind })}
									<span class="mono text-[var(--text-muted)]">{t('instance.range', { from: available.current, to: available.latest, branch: available.branch })}</span>
								{:else}
									{t('instance.upToDate')} · {#each tParts('instance.upToDateDetail', { branch: available.branch }) as part}{#if typeof part === 'string'}{part}{:else}<span class="mono">{available.current}</span>{/if}{/each}
								{/if}
							</p>
						{/if}
					</div>
					{#if !checking}
						<button class="btn btn-ghost btn-sm !px-1.5" type="button" onclick={() => (checkSince = null)} title={t('common.close')} aria-label={t('common.close')}>
							<Icon name="x" size={12} />
						</button>
					{/if}
				</div>
			</div>
		{/if}

		{#if data.update.log}
			<details class="mt-3" open={status?.state === 'failed'}>
				<summary class="cursor-pointer text-xs text-[var(--text-muted)]">{t('instance.lastLog')}</summary>
				<pre class="mono mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border bg-[var(--surface-0)] px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--text-secondary)]">{data.update.log}</pre>
			</details>
		{/if}
	{/if}
</section>
