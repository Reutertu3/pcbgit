<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatBytes, formatDateTime, relativeTime } from '$lib/format';
	import { t, tParts } from '$lib/i18n/t';

	let { data, form } = $props();

	let creating = $state(false);
	let uploading = $state(false);
	let restoreTarget = $state<string | null>(null);
	let confirmText = $state('');
	let upload = $state<File | null>(null);

	// Piecewise upload (routes/admin/backups/upload): works for any size, a piece at a time.
	let progress = $state<{ sent: number; total: number } | null>(null);
	let joining = $state(false);
	let uploadResult = $state<{ kind: 'success' | 'error'; text: string } | null>(null);
	const percent = $derived(progress ? Math.floor((progress.sent / Math.max(1, progress.total)) * 100) : 0);

	// Leaving the page would abandon the upload.
	$effect(() => {
		if (!uploading) return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});

	// crypto.randomUUID() needs HTTPS; a LAN install is often plain HTTP.
	function uploadId() {
		const bytes = crypto.getRandomValues(new Uint8Array(16));
		return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	}

	/** Posts to the upload route; a piece lost on the way (network, restart) is sent again, a refusal is not. */
	async function send(url: string, body: Blob | null) {
		for (let attempt = 1; ; attempt++) {
			let response: Response | null = null;
			try {
				response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body });
			} catch {
				// Network error: retried below.
			}
			const result = response ? await response.json().catch(() => ({})) : {};
			if (response?.ok) return result as { message?: string };
			if (response && response.status < 500) throw new Error(result.error ?? t('backups.uploadFailed'));
			if (attempt === 3) throw new Error(result.error ?? t('backups.uploadFailed'));
			await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
		}
	}

	async function uploadInPieces(event: SubmitEvent) {
		event.preventDefault();
		if (!upload) return;
		// currentTarget is only set while the event is dispatched, not after an await.
		const formElement = event.currentTarget as HTMLFormElement;
		const file = upload;
		const size = data.pieceSize;
		const parts = Math.max(1, Math.ceil(file.size / size));
		const query = `id=${uploadId()}&name=${encodeURIComponent(file.name)}&parts=${parts}`;
		uploading = true;
		uploadResult = null;
		progress = { sent: 0, total: file.size };
		try {
			for (let part = 1; part <= parts; part++) {
				await send(`/admin-panel/backups/upload?${query}&part=${part}`, file.slice((part - 1) * size, part * size));
				progress = { sent: Math.min(part * size, file.size), total: file.size };
			}
			joining = true;
			const result = await send(`/admin-panel/backups/upload?${query}&join`, null);
			uploadResult = { kind: 'success', text: result.message ?? '' };
			upload = null;
			formElement.reset();
			await invalidateAll();
		} catch (error) {
			uploadResult = { kind: 'error', text: (error as Error).message };
		} finally {
			uploading = false;
			joining = false;
			progress = null;
		}
	}
</script>

<svelte:head><title>{t('admin.nav.backups')} · {t('admin.title')} · {data.site.name}</title></svelte:head>

<div class="mb-4">
	<h2 class="text-lg font-semibold tracking-tight">{t('backups.title')}</h2>
	<p class="text-xs leading-relaxed text-[var(--text-muted)]">
		{#each tParts('backups.intro') as part}{#if typeof part === 'string'}{part}{:else if part.slot === 'ext'}<span class="mono">.tar.gz</span>{:else}<span class="mono">PCBGIT_IMPORT_SNAPSHOT</span>{/if}{/each}
	</p>
</div>

{#if form?.message}<FormError message={form.message} kind="success" />{/if}
{#if form?.error}<FormError message={form.error} />{/if}

{#if data.pending && !form?.restarting}
	<div
		class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm"
		style:border-color="color-mix(in srgb, var(--warn) 45%, transparent)"
		style:background="color-mix(in srgb, var(--warn) 10%, transparent)"
	>
		<Icon name="alert" size={15} style="color: var(--warn)" />
		<span class="flex-1">
			{#each tParts('backups.pending') as part}{#if typeof part === 'string'}{part}{:else}<strong>{formatDateTime(data.pending.created_at)}</strong>{/if}{/each}
		</span>
		<form method="POST" action="?/cancel" use:enhance>
			<button class="btn btn-sm" type="submit">{t('backups.cancelRestore')}</button>
		</form>
	</div>
{/if}

<div class="grid gap-4 lg:grid-cols-2">
	<section class="surface p-4">
		<h3 class="mb-1 text-sm font-semibold">{t('backups.create')}</h3>
		<p class="mb-3 text-xs text-[var(--text-secondary)]">{t('backups.online')}</p>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				creating = true;
				return async ({ update }) => {
					await update();
					creating = false;
				};
			}}
		>
			<Switch name="artifacts" checked class="mb-3">
				<span class="block text-sm">{t('backups.includeOutput')}</span>
				<span class="block text-xs leading-relaxed text-[var(--text-muted)]">{t('backups.includeOutputHint')}</span>
			</Switch>
			<button class="btn btn-primary btn-sm" type="submit" disabled={creating}>
				<Icon name="download" size={13} />
				{creating ? t('backups.creating') : t('backups.createButton')}
			</button>
		</form>
	</section>

	<section class="surface p-4">
		<h3 class="mb-1 text-sm font-semibold">{t('backups.import')}</h3>
		<div class="mb-3 space-y-1 text-xs leading-relaxed text-[var(--text-secondary)]">
			<p>{t('backups.importHint')}</p>
			<p>{t('backups.importAnySize', { free: formatBytes(data.freeSpace) })}</p>
		</div>
		<!-- Without JavaScript the form posts the whole file at once (?/upload), up to the body limit. -->
		<form method="POST" action="?/upload" enctype="multipart/form-data" onsubmit={uploadInPieces} class="flex flex-wrap items-center gap-2">
			<label class="btn btn-sm cursor-pointer">
				<Icon name="upload" size={13} />
				{upload ? upload.name : t('backups.choose')}
				<input
					class="sr-only"
					type="file"
					name="snapshot"
					accept=".gz,.tar.gz,application/gzip"
					onchange={(event) => (upload = event.currentTarget.files?.[0] ?? null)}
				/>
			</label>
			{#if upload}<span class="text-xs text-[var(--text-muted)]">{formatBytes(upload.size)}</span>{/if}
			<button class="btn btn-primary btn-sm" type="submit" disabled={!upload || uploading}>
				{uploading ? t('backups.uploading') : t('backups.upload')}
			</button>
		</form>
		{#if progress}
			<div class="mt-3" role="status">
				<div class="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
					<div class="h-full bg-[var(--accent)] transition-[width]" style:width="{percent}%"></div>
				</div>
				<p class="mt-1 text-xs text-[var(--text-muted)]">
					{joining ? t('backups.joining') : t('backups.uploadProgress', { sent: formatBytes(progress.sent), total: formatBytes(progress.total), percent })}
				</p>
			</div>
		{/if}
		{#if uploadResult}
			<div class="mt-3 -mb-4"><FormError message={uploadResult.text} kind={uploadResult.kind} /></div>
		{/if}
	</section>
</div>

<section class="surface mt-4 overflow-hidden">
	<h3 class="border-b px-4 py-2.5 text-sm font-semibold">
		{t('backups.snapshots')} {#if data.snapshots.length}<span class="chip ml-1">{data.snapshots.length}</span>{/if}
	</h3>
	{#if !data.snapshots.length}
		<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">{t('backups.none')}</p>
	{:else}
		<ul class="divide-y">
			{#each data.snapshots as snap (snap.name)}
				<li class="px-4 py-3">
					<div class="flex flex-wrap items-center gap-3">
						<Icon name="folder" size={15} class="text-[var(--text-muted)]" />
						<div class="min-w-0 flex-1">
							<p class="mono truncate text-sm">{snap.name}</p>
							<p class="text-[0.6875rem] text-[var(--text-muted)]">
								{formatBytes(snap.size)} · {relativeTime(snap.modified)}
								{#if snap.manifest}
									· {t('backups.counts', { boards: snap.manifest.counts.projects, versions: snap.manifest.counts.commits, users: snap.manifest.counts.users })}
									· {snap.manifest.includes_artifacts ? t('backups.withOutput') : t('backups.withoutOutput')}
								{:else}
									· <span style:color="var(--err)">{t('backups.unreadable')}</span>
								{/if}
							</p>
						</div>
						<div class="flex gap-1">
							<a class="btn btn-sm" href="/admin-panel/backups/download/{snap.name}" title={t('backups.download')}>
								<Icon name="download" size={12} />
							</a>
							<button
								class="btn btn-sm"
								disabled={!snap.manifest}
								onclick={() => {
									restoreTarget = restoreTarget === snap.name ? null : snap.name;
									confirmText = '';
								}}
							>
								<Icon name="refresh" size={12} /> {t('backups.restore')}
							</button>
							<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
								if (!confirm(t('backups.confirmDelete', { name: snap.name }))) cancel();
							}}>
								<input type="hidden" name="name" value={snap.name} />
								<button class="btn btn-danger btn-sm" type="submit" title={t('common.delete')}><Icon name="trash" size={12} /></button>
							</form>
						</div>
					</div>

					{#if restoreTarget === snap.name}
						<form
							method="POST"
							action="?/restore"
							use:enhance={() => async ({ result, update }) => {
								await update();
								if (result.type === 'success') restoreTarget = null;
							}}
							class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border p-3"
							style:border-color="color-mix(in srgb, var(--err) 40%, transparent)"
							style:background="color-mix(in srgb, var(--err) 7%, transparent)"
						>
							<input type="hidden" name="name" value={snap.name} />
							<p class="w-full text-xs leading-relaxed">
								{#each tParts('backups.restoreWarning') as part}{#if typeof part === 'string'}{part}{:else}<strong>{t('backups.replacesAll')}</strong>{/if}{/each}
								{data.autoRestart ? t('backups.autoRestart') : t('backups.manualRestart')}
							</p>
							<label class="text-xs" for="confirm-{snap.name}">{#each tParts('backups.typeRestore') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono font-semibold">RESTORE</span>{/if}{/each}</label>
							<input id="confirm-{snap.name}" class="input mono !w-32 !py-1" name="confirm" bind:value={confirmText} autocomplete="off" />
							<button class="btn btn-danger btn-sm" type="submit" disabled={confirmText !== 'RESTORE'}>{t('backups.restoreSnapshot')}</button>
							<button class="btn btn-ghost btn-sm" type="button" onclick={() => (restoreTarget = null)}>{t('common.cancel')}</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if data.preRestore.length}
	<section class="surface mt-4 overflow-hidden">
		<h3 class="border-b px-4 py-2.5 text-sm font-semibold">{t('backups.preRestore')}</h3>
		<p class="px-4 pt-2.5 text-xs text-[var(--text-muted)]">
			{t('backups.preRestoreHint')}
		</p>
		<ul class="divide-y">
			{#each data.preRestore as entry (entry.name)}
				<li class="flex items-center gap-3 px-4 py-2.5">
					<span class="mono flex-1 truncate text-sm">{entry.name}</span>
					<span class="text-xs text-[var(--text-muted)]">{relativeTime(entry.modified)}</span>
					<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
						if (!confirm(t('backups.confirmDeletePermanent', { name: entry.name }))) cancel();
					}}>
						<input type="hidden" name="name" value={entry.name} />
						<button class="btn btn-danger btn-sm" type="submit"><Icon name="trash" size={12} /></button>
					</form>
				</li>
			{/each}
		</ul>
	</section>
{/if}
