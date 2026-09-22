<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatBytes } from '$lib/format';

	let { data, form } = $props();

	let typedName = $state<string | null>(null);
	let typedSlug = $state<string | null>(null);
	let file = $state<File | null>(null);
	let dragging = $state(false);
	let submitting = $state(false);

	// A failed submit re-renders with `form`; typed values win once the user edits.
	const name = $derived(typedName ?? form?.name ?? '');

	/** Mirror the name into the slug until the user edits the slug directly. */
	const autoSlug = $derived(
		name
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 64)
	);
	const effectiveSlug = $derived(typedSlug ?? form?.slug ?? autoSlug);

	function pickFile(list: FileList | null) {
		const picked = list?.[0] ?? null;
		if (picked && !/\.zip$/i.test(picked.name)) {
			file = null;
			return;
		}
		file = picked;
	}
</script>

<svelte:head><title>New board · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8">
	<h1 class="text-xl font-semibold tracking-tight">Create a board</h1>
	<p class="mt-1 text-sm text-[var(--text-secondary)]">
		Upload a KiCad project now, or create it empty and push over git.
	</p>

	<form
		class="mt-6"
		method="POST"
		enctype="multipart/form-data"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
				submitting = false;
			};
		}}
	>
		<FormError message={form?.error} />

		<div class="surface p-5">
			<div class="mb-4">
				<label class="label" for="name">Board name</label>
				<input
					class="input"
					id="name"
					name="name"
					value={name}
					oninput={(event) => (typedName = event.currentTarget.value)}
					placeholder="Sensor Hub v2"
					required
				/>
			</div>

			<div class="mb-4">
				<label class="label" for="slug">URL</label>
				<div class="flex items-center gap-1.5">
					<span class="mono shrink-0 text-sm text-[var(--text-muted)]">/{data.user?.username}/</span>
					<input
						class="input mono"
						id="slug"
						name="slug"
						value={effectiveSlug}
						oninput={(event) => (typedSlug = event.currentTarget.value)}
						required
					/>
				</div>
			</div>

			<div class="mb-4">
				<label class="label" for="description">Description</label>
				<textarea
					class="textarea"
					id="description"
					name="description"
					maxlength="500"
					placeholder="What the board does, and anything a reader should know before opening the schematic."
					>{form?.description ?? ''}</textarea
				>
			</div>

			<div class="mb-4 grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="license">License</label>
					<select class="select" id="license" name="license">
						<option value="">No license</option>
						{#each data.licenses as license}
							<option value={license} selected={form?.license === license}>{license}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="label" for="visibility">Visibility</label>
					<select class="select" id="visibility" name="visibility">
						<option value="public" selected={form?.visibility !== 'private'}>Public — anyone can view</option>
						<option value="private" selected={form?.visibility === 'private'}>Private — only you</option>
					</select>
				</div>
			</div>

			<div class="mb-4">
				<label class="label" for="tags">Tags</label>
				<input
					class="input"
					id="tags"
					name="tags"
					list="tag-suggestions"
					value={form?.tags ?? ''}
					placeholder="ESP32, USB-C, 4-layer"
				/>
				<datalist id="tag-suggestions">
					{#each data.allTags as tag}<option value={tag}></option>{/each}
				</datalist>
				<p class="hint">Comma separated. New tags are created as you use them.</p>
			</div>

			<div>
				<label class="label" for="source_url">Source repository <span class="font-normal text-[var(--text-muted)]">(optional)</span></label>
				<input class="input" id="source_url" name="source_url" type="url" value={form?.source_url ?? ''} placeholder="https://github.com/you/board" />
			</div>
		</div>

		<!-- Upload -->
		<div class="surface mt-4 p-5">
			<h2 class="mb-1 text-sm font-semibold">Initial files</h2>
			<p class="mb-3 text-xs text-[var(--text-secondary)]">
				A ZIP of your KiCad project. Leave empty to start with a bare repository.
			</p>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<label
				class="traces flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors"
				class:!border-[var(--accent)]={dragging}
				class:bg-[var(--accent-soft)]={dragging}
				ondragover={(event) => {
					event.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(event) => {
					event.preventDefault();
					dragging = false;
					pickFile(event.dataTransfer?.files ?? null);
				}}
			>
				<Icon name="upload" size={22} class="text-[var(--text-muted)]" />
				{#if file}
					<span class="mono text-sm">{file.name}</span>
					<span class="text-xs text-[var(--text-muted)]">{formatBytes(file.size)}</span>
				{:else}
					<span class="text-sm">Drop a <span class="mono">.zip</span> here, or click to browse</span>
					<span class="text-xs text-[var(--text-muted)]">Up to 200 MB</span>
				{/if}
				<input
					class="sr-only"
					type="file"
					name="archive"
					accept=".zip,application/zip"
					onchange={(event) => pickFile(event.currentTarget.files)}
				/>
			</label>
		</div>

		<div class="mt-5 flex items-center gap-3">
			<button class="btn btn-primary" type="submit" disabled={submitting}>
				{submitting ? 'Creating…' : 'Create board'}
			</button>
			<a href="/" class="btn btn-ghost">Cancel</a>
		</div>
	</form>
</div>
