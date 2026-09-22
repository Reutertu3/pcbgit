<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { formatDateTime, relativeTime } from '$lib/format';
	import Changelog from '$lib/components/Changelog.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';

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

	const STATE_COLOR = { running: 'var(--info)', success: 'var(--ok)', failed: 'var(--err)' } as const;
</script>

<svelte:head><title>Instance · Admin · {data.site.name}</title></svelte:head>

<h2 class="mb-4 text-lg font-semibold tracking-tight">Instance settings</h2>

{#if form?.message}<FormError message={form.message} kind="success" />{/if}
{#if form && 'error' in form && form.error}<FormError message={form.error} />{/if}

<section class="surface p-5">
	<form method="POST" action="?/save" use:enhance>
		<div class="mb-4">
			<label class="label" for="site_name">Site name</label>
			<input class="input" id="site_name" name="site_name" value={data.settings.siteName} maxlength="60" />
		</div>
		<div class="mb-4">
			<label class="label" for="site_tagline">Tagline</label>
			<input class="input" id="site_tagline" name="site_tagline" value={data.settings.siteTagline} maxlength="160" />
			<p class="hint">Shown on the browse page and in the page description.</p>
		</div>
		<label class="mb-4 flex cursor-pointer items-start gap-2.5">
			<input type="checkbox" name="registration_open" checked={data.settings.registrationOpen} class="mt-0.5" />
			<span>
				<span class="block text-sm font-medium">Open registration</span>
				<span class="block text-xs leading-relaxed text-[var(--text-secondary)]">
					When off, only an administrator can create accounts. Existing users are unaffected.
				</span>
			</span>
		</label>
		<button class="btn btn-primary" type="submit">Save settings</button>
	</form>
</section>

<section class="surface mt-4 p-5">
	<h3 class="mb-1 text-sm font-semibold">Render engine</h3>
	<p class="mb-3 text-xs leading-relaxed text-[var(--text-secondary)]">
		The version of kicad-cli is cached at boot. Re-check after installing or upgrading KiCad.
	</p>
	<form method="POST" action="?/recheckKicad" use:enhance>
		<button class="btn btn-sm" type="submit"><Icon name="refresh" size={13} /> Re-check kicad-cli</button>
	</form>
</section>

<section class="surface mt-4 p-5" id="updates">
	<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-sm font-semibold">Updates</h3>
		<span class="mono text-xs text-[var(--text-muted)]">running {data.version}</span>
	</div>

	{#if !data.update}
		<p class="text-xs leading-relaxed text-[var(--text-secondary)]">
			In-app updates are off. On a server set up with <span class="mono">deploy/install.sh</span> this
			section pulls the latest version from GitHub and restarts pcbgit.
		</p>
	{:else}
		<p class="mb-3 text-xs leading-relaxed text-[var(--text-secondary)]">
			Pulls from GitHub (fast-forward only) and rebuilds. The site is unavailable for a moment while it
			restarts.
		</p>

		{@const available = data.availability}
		{#if available}
			<div class="mb-3">
				{#if checking}
					<p class="text-xs" style:color="var(--info)">Checking GitHub…</p>
				{:else if !available.checked}
					<p class="text-xs text-[var(--text-muted)]">Not checked yet — the server checks hourly, or use Check now.</p>
				{:else if !available.ok}
					<p class="text-xs" style:color="var(--err)">
						The last check could not reach GitHub ({relativeTime(available.checked)}). See
						<span class="mono">/var/lib/pcbgit-control/check.log</span> on the server.
					</p>
				{:else if available.behind > 0}
					<p class="mb-2 flex flex-wrap items-center gap-2 text-xs">
						<span class="chip !border-[var(--accent)] !text-[var(--accent)]">
							{available.behind} update{available.behind === 1 ? '' : 's'} available
						</span>
						<span class="mono text-[var(--text-muted)]">{available.current} → {available.latest} on {available.branch}</span>
						<span class="text-[var(--text-muted)]">· checked {relativeTime(available.checked)}</span>
					</p>
					<Changelog commits={available.commits} total={available.behind} />
				{:else}
					<p class="flex items-center gap-1.5 text-xs" style:color="var(--ok)">
						<Icon name="check" size={13} /> Up to date
						<span class="text-[var(--text-muted)]">· {available.branch} at <span class="mono">{available.current}</span>, checked {relativeTime(available.checked)}</span>
					</p>
				{/if}
				{#if available.ahead > 0}
					<p class="mt-2 text-xs" style:color="var(--warn)">
						The server copy has {available.ahead} commit{available.ahead === 1 ? '' : 's'} of its own, so an update will
						stop instead of merging. Resolve it on the server (for example <span class="mono">git reset --hard origin/{available.branch}</span>).
					</p>
				{/if}
			</div>
		{/if}

		{#if data.update.requested}
			<p class="mb-3 text-xs" style:color="var(--info)">Update requested — waiting for the server to pick it up…</p>
		{:else if data.update.status}
			{@const status = data.update.status}
			<div class="mb-3 rounded-md border px-3 py-2 text-xs">
				<span class="font-semibold" style:color={STATE_COLOR[status.state]}>{status.message}</span>
				<span class="text-[var(--text-muted)]">
					· {status.state === 'running' ? `started ${relativeTime(status.started * 1000)}` : formatDateTime((status.finished ?? status.started) * 1000)}
				</span>
			</div>
		{/if}

		<form method="POST" action="?/update" use:enhance class="flex flex-wrap items-center gap-3">
			<button class="btn btn-primary btn-sm" type="submit" disabled={busy}>
				<Icon name="download" size={13} />
				{busy ? 'Updating…' : 'Update from GitHub'}
			</button>
			<button class="btn btn-sm" type="submit" formaction="?/check" disabled={checking || busy}>
				<Icon name="refresh" size={13} />
				{checking ? 'Checking…' : 'Check now'}
			</button>
			<label class="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-secondary)]">
				<input type="checkbox" name="force" /> Rebuild even if nothing changed
			</label>
		</form>

		{#if data.update.log}
			<details class="mt-3" open={data.update.status?.state === 'failed'}>
				<summary class="cursor-pointer text-xs text-[var(--text-muted)]">Last update log</summary>
				<pre class="mono mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border bg-[var(--surface-0)] px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--text-secondary)]">{data.update.log}</pre>
			</details>
		{/if}
	{/if}
</section>
