<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import StatusDot from './StatusDot.svelte';
	import { relativeTime, shortSha } from '$lib/format';
	import { t } from '$lib/i18n/t';

	interface Version {
		id: string;
		sha: string;
		message: string;
		committed_at: number;
		render_status: string;
	}

	interface Props {
		versions: Version[];
		current: { sha: string } | null;
		isHead: boolean;
	}
	let { versions, current, isHead }: Props = $props();

	let open = $state(false);

	/** Keeps the current tab while swapping the pinned version. */
	function urlFor(sha: string | null) {
		const params = new URLSearchParams(page.url.searchParams);
		if (sha) params.set('v', sha);
		else params.delete('v');
		const query = params.toString();
		return `${page.url.pathname}${query ? `?${query}` : ''}`;
	}
</script>

<svelte:window onclick={() => (open = false)} />

<div class="relative">
	<button
		class="btn btn-sm"
		onclick={(event) => {
			event.stopPropagation();
			open = !open;
		}}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<Icon name="history" size={13} />
		<span class="mono">{current ? shortSha(current.sha) : t('versions.none')}</span>
		{#if isHead}<span class="chip !py-0 !text-[0.625rem]">{t('versions.latest')}</span>{/if}
		<Icon name="chevronDown" size={12} />
	</button>

	{#if open && versions.length}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<ul
			class="surface-raised absolute right-0 z-50 mt-1.5 max-h-96 w-80 overflow-y-auto p-1 shadow-xl"
			onclick={(event) => event.stopPropagation()}
			role="listbox"
			tabindex="-1"
			onkeydown={(event) => event.key === 'Escape' && (open = false)}
		>
			{#each versions as version, index}
				{@const selected = current?.sha === version.sha}
				<li>
					<a
						href={urlFor(index === 0 ? null : version.sha)}
						class="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-s3"
						class:bg-s3={selected}
						onclick={() => (open = false)}
						role="option"
						aria-selected={selected}
					>
						<StatusDot status={version.render_status} />
						<span class="min-w-0 flex-1">
							<span class="block truncate text-xs">{version.message || t('versions.noMessage')}</span>
							<span class="mono block text-[0.6875rem] text-[var(--text-muted)]">
								{shortSha(version.sha)} · {relativeTime(version.committed_at)}
								{#if index === 0}· {t('versions.latest')}{/if}
							</span>
						</span>
					</a>
				</li>
			{/each}
			<li class="border-t pt-1">
				<a href={`/${page.params.owner}/${page.params.project}/history`} class="menu-item text-xs" onclick={() => (open = false)}>
					<Icon name="history" size={13} /> {t('versions.fullHistory')}
				</a>
			</li>
		</ul>
	{/if}
</div>
