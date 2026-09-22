<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import CloneBox from '$lib/components/CloneBox.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { formatBytes } from '$lib/format';

	let { data, form } = $props();

	let file = $state<File | null>(null);
	let confirmText = $state('');
	let uploading = $state(false);

</script>

<svelte:head><title>Settings · {data.project.name} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
	{#if form?.message}<FormError message={form.message} kind="success" />{/if}
	{#if form?.error}<FormError message={form.error} />{/if}

	<!-- Metadata -->
	<section class="surface p-5">
		<h2 class="mb-4 text-sm font-semibold">Board details</h2>
		<form method="POST" action="?/save" use:enhance>
			<div class="mb-4">
				<label class="label" for="name">Name</label>
				<input class="input" id="name" name="name" value={data.project.name} required />
			</div>

			<div class="mb-4">
				<label class="label" for="description">Description</label>
				<textarea class="textarea" id="description" name="description" maxlength="500">{data.project.description}</textarea>
			</div>

			<div class="mb-4 grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="license">License</label>
					<select class="select" id="license" name="license">
						<option value="">No license</option>
						{#each data.licenses as license}
							<option value={license} selected={data.project.license === license}>{license}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="label" for="visibility">Visibility</label>
					<select class="select" id="visibility" name="visibility">
						<option value="public" selected={data.project.visibility === 'public'}>Public</option>
						<option value="private" selected={data.project.visibility === 'private'}>Private</option>
					</select>
				</div>
			</div>

			<div class="mb-4 grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="default_branch">Default branch</label>
					<input class="input mono" id="default_branch" name="default_branch" value={data.project.default_branch} />
					<p class="hint">Renders track this branch.</p>
				</div>
				<div>
					<label class="label" for="source_url">Upstream repository</label>
					<input class="input" id="source_url" name="source_url" type="url" value={data.project.source_url} placeholder="https://github.com/…" />
				</div>
			</div>

			<div class="mb-4">
				<span class="label">Tags</span>
				<TagPicker tags={data.allTags} selected={data.project.tags.map((tag) => tag.slug)} />
			</div>

			<button class="btn btn-primary" type="submit">Save changes</button>
		</form>
	</section>

	<!-- Upload -->
	<section class="surface mt-4 p-5">
		<h2 class="mb-1 text-sm font-semibold">Upload a new version</h2>
		<p class="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
			The archive replaces the whole working tree and becomes one commit on
			<span class="mono">{data.project.default_branch}</span>, exactly as a push would.
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
					file = null;
				};
			}}
		>
			<div class="mb-3">
				<label class="label" for="message">Version message</label>
				<input class="input" id="message" name="message" placeholder="Fix USB differential pair impedance" />
			</div>

			<label class="traces mb-3 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
				<Icon name="upload" size={20} class="text-[var(--text-muted)]" />
				{#if file}
					<span class="mono text-sm">{file.name}</span>
					<span class="text-xs text-[var(--text-muted)]">{formatBytes(file.size)}</span>
				{:else}
					<span class="text-sm">Choose a <span class="mono">.zip</span></span>
				{/if}
				<input
					class="sr-only"
					type="file"
					name="archive"
					accept=".zip,application/zip"
					onchange={(event) => (file = event.currentTarget.files?.[0] ?? null)}
				/>
			</label>

			<button class="btn btn-primary" type="submit" disabled={!file || uploading}>
				{uploading ? 'Uploading…' : 'Upload version'}
			</button>
		</form>

		<div class="mt-5 border-t pt-4">
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
				Or push over git
			</h3>
			<CloneBox url={data.cloneUrl} username={data.user?.username} />
		</div>
	</section>

	<!-- Danger zone -->
	<section
		class="mt-4 rounded-lg border p-5"
		style:border-color="color-mix(in srgb, var(--err) 35%, transparent)"
	>
		<h2 class="mb-1 text-sm font-semibold" style:color="var(--err)">Delete this board</h2>
		<p class="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
			The repository, every version and all rendered output are removed permanently. This cannot be
			undone.
		</p>
		<form method="POST" action="?/delete" use:enhance>
			<label class="label" for="confirm">
				Type <span class="mono text-[var(--text-primary)]">{data.project.slug}</span> to confirm
			</label>
			<div class="flex flex-wrap gap-2">
				<input class="input mono !w-auto flex-1" id="confirm" name="confirm" bind:value={confirmText} autocomplete="off" />
				<button class="btn btn-danger" type="submit" disabled={confirmText !== data.project.slug}>
					<Icon name="trash" size={13} /> Delete board
				</button>
			</div>
		</form>
	</section>
</div>
