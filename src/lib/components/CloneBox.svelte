<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		url: string;
		username?: string;
	}
	let { url, username }: Props = $props();

	let copied = $state(false);
	let tab = $state<'clone' | 'push'>('clone');

	const pushScript = $derived(
		`git init -b main\ngit add .\ngit commit -m "Initial commit"\ngit remote add origin ${url}\ngit push -u origin main`
	);
	const text = $derived(tab === 'clone' ? `git clone ${url}` : pushScript);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			// Clipboard blocked; the text is selectable anyway.
		}
	}
</script>

<div class="surface overflow-hidden">
	<div class="flex items-center gap-1 border-b px-2 py-1.5">
		<Icon name="git" size={13} class="mx-1 text-[var(--text-muted)]" />
		{#each [['clone', 'Clone'], ['push', 'Push existing']] as [value, label]}
			<button
				class="rounded px-2 py-1 text-xs transition-colors"
				class:bg-s3={tab === value}
				class:text-[var(--text-primary)]={tab === value}
				class:text-[var(--text-muted)]={tab !== value}
				onclick={() => (tab = value as 'clone' | 'push')}
			>
				{label}
			</button>
		{/each}
		<div class="flex-1"></div>
		<button class="btn btn-ghost btn-sm" onclick={copy} title="Copy to clipboard">
			<Icon name={copied ? 'check' : 'copy'} size={12} />
			{copied ? 'Copied' : 'Copy'}
		</button>
	</div>
	<pre class="mono overflow-x-auto bg-[var(--surface-0)] px-3 py-2.5 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{text}</pre>
	<p class="border-t px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--text-muted)]">
		Pushing asks for a username and password. Use
		{#if username}<span class="mono text-[var(--text-secondary)]">{username}</span>{:else}your username{/if}
		and a <a href="/settings/tokens" class="text-[var(--accent)] hover:underline">personal access token</a>.
		Every push renders automatically.
	</p>
</div>
