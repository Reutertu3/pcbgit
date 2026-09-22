<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatDate, relativeTime } from '$lib/format';

	let { data, form } = $props();

	let copied = $state(false);

	async function copyToken() {
		if (!form?.created) return;
		try {
			await navigator.clipboard.writeText(form.created);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			// Clipboard unavailable; the token stays selectable on screen.
		}
	}
</script>

<svelte:head><title>Access tokens · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<div class="mb-1 flex items-center gap-2">
		<a href="/settings" class="btn btn-ghost btn-sm !px-1.5"><Icon name="chevronLeft" size={14} /></a>
		<h1 class="text-lg font-semibold tracking-tight">Personal access tokens</h1>
	</div>
	<p class="mb-5 text-sm leading-relaxed text-[var(--text-secondary)]">
		Use a token as the password when git asks. Your username stays the same.
	</p>

	{#if form?.message}<FormError message={form.message} kind="success" />{/if}
	{#if form?.error}<FormError message={form.error} />{/if}

	{#if form?.created}
		<div
			class="mb-5 rounded-lg border p-4"
			style:border-color="color-mix(in srgb, var(--ok) 40%, transparent)"
			style:background="color-mix(in srgb, var(--ok) 8%, transparent)"
		>
			<p class="mb-2 flex items-center gap-1.5 text-sm font-medium" style:color="var(--ok)">
				<Icon name="check" size={14} /> Token "{form.name}" created
			</p>
			<p class="mb-2.5 text-xs text-[var(--text-secondary)]">
				Copy it now — it is not shown again.
			</p>
			<div class="flex gap-2">
				<code class="mono flex-1 overflow-x-auto rounded border bg-[var(--surface-0)] px-2.5 py-2 text-xs">{form.created}</code>
				<button class="btn btn-sm" onclick={copyToken}>
					<Icon name={copied ? 'check' : 'copy'} size={13} />
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<pre class="mono mt-3 overflow-x-auto rounded border bg-[var(--surface-0)] px-2.5 py-2 text-[0.6875rem] leading-relaxed text-[var(--text-secondary)]">git remote add kupfergit {data.gitBase}/&lt;board&gt;.git
git push kupfergit main</pre>
		</div>
	{/if}

	<section class="surface p-5">
		<h2 class="mb-3 text-sm font-semibold">Create a token</h2>
		<form method="POST" action="?/create" use:enhance class="flex flex-wrap gap-2">
			<input class="input !w-auto flex-1" name="name" placeholder="Laptop, CI runner, …" maxlength="80" required />
			<button class="btn btn-primary" type="submit"><Icon name="plus" size={13} /> Generate</button>
		</form>
	</section>

	<section class="surface mt-4 overflow-hidden">
		<h2 class="border-b px-5 py-3 text-sm font-semibold">
			Your tokens
			{#if data.tokens.length}<span class="chip ml-1">{data.tokens.length}</span>{/if}
		</h2>
		{#if !data.tokens.length}
			<p class="px-5 py-8 text-center text-sm text-[var(--text-muted)]">No tokens yet.</p>
		{:else}
			<ul class="divide-y">
				{#each data.tokens as token (token.id)}
					<li class="flex flex-wrap items-center gap-3 px-5 py-3">
						<Icon name="git" size={15} class="text-[var(--text-muted)]" />
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{token.name}</p>
							<p class="mono text-[0.6875rem] text-[var(--text-muted)]">
								{token.prefix}… · created {formatDate(token.created_at)} ·
								{token.last_used_at ? `last used ${relativeTime(token.last_used_at)}` : 'never used'}
							</p>
						</div>
						<form method="POST" action="?/revoke" use:enhance>
							<input type="hidden" name="id" value={token.id} />
							<button class="btn btn-danger btn-sm" type="submit"><Icon name="trash" size={12} /> Revoke</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
