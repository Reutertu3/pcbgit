<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatBytes, formatDateTime, relativeTime } from '$lib/format';

	let { data, form } = $props();

	let creating = $state(false);
	let uploading = $state(false);
	let restoreTarget = $state<string | null>(null);
	let confirmText = $state('');
	let upload = $state<File | null>(null);
</script>

<svelte:head><title>Backups · Admin · {data.site.name}</title></svelte:head>

<div class="mb-4">
	<h2 class="text-lg font-semibold tracking-tight">Backups &amp; snapshots</h2>
	<p class="text-xs leading-relaxed text-[var(--text-muted)]">
		A snapshot is one <span class="mono">.tar.gz</span> holding the database, every git repository and
		optionally the rendered output. Restore it here, or deploy a new server straight from it with
		<span class="mono">KUPFERGIT_IMPORT_SNAPSHOT</span>.
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
			A restore of the snapshot from <strong>{formatDateTime(data.pending.created_at)}</strong> is staged and
			applies on the next restart. Changes made until then will be replaced.
		</span>
		<form method="POST" action="?/cancel" use:enhance>
			<button class="btn btn-sm" type="submit">Cancel restore</button>
		</form>
	</div>
{/if}

<div class="grid gap-4 lg:grid-cols-2">
	<section class="surface p-4">
		<h3 class="mb-1 text-sm font-semibold">Create a snapshot</h3>
		<p class="mb-3 text-xs text-[var(--text-secondary)]">Runs while the server stays online.</p>
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
			<label class="mb-3 flex cursor-pointer items-start gap-2.5">
				<input type="checkbox" name="artifacts" checked class="mt-0.5" />
				<span>
					<span class="block text-sm">Include rendered output</span>
					<span class="block text-xs leading-relaxed text-[var(--text-muted)]">
						Larger, but a restored server is ready immediately. Without it, every version is rendered
						again after restore.
					</span>
				</span>
			</label>
			<button class="btn btn-primary btn-sm" type="submit" disabled={creating}>
				<Icon name="download" size={13} />
				{creating ? 'Creating snapshot…' : 'Create snapshot'}
			</button>
		</form>
	</section>

	<section class="surface p-4">
		<h3 class="mb-1 text-sm font-semibold">Import a snapshot</h3>
		<p class="mb-3 text-xs text-[var(--text-secondary)]">
			It is checked and added to the list; nothing changes until you restore it. Larger than the upload
			limit? Copy it into <span class="mono">/data/backups/</span> instead and it appears below.
		</p>
		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			use:enhance={() => {
				uploading = true;
				return async ({ update }) => {
					await update();
					uploading = false;
					upload = null;
				};
			}}
			class="flex flex-wrap items-center gap-2"
		>
			<label class="btn btn-sm cursor-pointer">
				<Icon name="upload" size={13} />
				{upload ? upload.name : 'Choose .tar.gz'}
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
				{uploading ? 'Verifying…' : 'Upload'}
			</button>
		</form>
	</section>
</div>

<section class="surface mt-4 overflow-hidden">
	<h3 class="border-b px-4 py-2.5 text-sm font-semibold">
		Snapshots {#if data.snapshots.length}<span class="chip ml-1">{data.snapshots.length}</span>{/if}
	</h3>
	{#if !data.snapshots.length}
		<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No snapshots yet.</p>
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
									· {snap.manifest.counts.projects} boards, {snap.manifest.counts.commits} versions,
									{snap.manifest.counts.users} users
									· {snap.manifest.includes_artifacts ? 'with rendered output' : 'without rendered output'}
								{:else}
									· <span style:color="var(--err)">unreadable manifest</span>
								{/if}
							</p>
						</div>
						<div class="flex gap-1">
							<a class="btn btn-sm" href="/admin/backups/download/{snap.name}" title="Download">
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
								<Icon name="refresh" size={12} /> Restore
							</button>
							<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
								if (!confirm(`Delete ${snap.name}?`)) cancel();
							}}>
								<input type="hidden" name="name" value={snap.name} />
								<button class="btn btn-danger btn-sm" type="submit" title="Delete"><Icon name="trash" size={12} /></button>
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
								This <strong>replaces all current data</strong> — users, boards, repositories and settings —
								with the snapshot. The current data is moved aside to a pre-restore copy, not deleted.
								{data.autoRestart
									? 'The server restarts to apply it.'
									: 'Restart the server afterwards to apply it.'}
							</p>
							<label class="text-xs" for="confirm-{snap.name}">Type <span class="mono font-semibold">RESTORE</span></label>
							<input id="confirm-{snap.name}" class="input mono !w-32 !py-1" name="confirm" bind:value={confirmText} autocomplete="off" />
							<button class="btn btn-danger btn-sm" type="submit" disabled={confirmText !== 'RESTORE'}>Restore snapshot</button>
							<button class="btn btn-ghost btn-sm" type="button" onclick={() => (restoreTarget = null)}>Cancel</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if data.preRestore.length}
	<section class="surface mt-4 overflow-hidden">
		<h3 class="border-b px-4 py-2.5 text-sm font-semibold">Pre-restore copies</h3>
		<p class="px-4 pt-2.5 text-xs text-[var(--text-muted)]">
			The data that was in place before a restore. Kept on disk until you delete it.
		</p>
		<ul class="divide-y">
			{#each data.preRestore as entry (entry.name)}
				<li class="flex items-center gap-3 px-4 py-2.5">
					<span class="mono flex-1 truncate text-sm">{entry.name}</span>
					<span class="text-xs text-[var(--text-muted)]">{relativeTime(entry.modified)}</span>
					<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
						if (!confirm(`Permanently delete ${entry.name}?`)) cancel();
					}}>
						<input type="hidden" name="name" value={entry.name} />
						<button class="btn btn-danger btn-sm" type="submit"><Icon name="trash" size={12} /></button>
					</form>
				</li>
			{/each}
		</ul>
	</section>
{/if}
