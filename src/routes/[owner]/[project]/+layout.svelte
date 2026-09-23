<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import VersionPicker from '$lib/components/VersionPicker.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { formatCount } from '$lib/format';
	import type { IconName } from '$lib/icons';
	import { t } from '$lib/i18n/t';
	import { licenseName } from '$lib/licenses';

	let { data, children } = $props();

	const base = $derived(`/${data.project.owner_username}/${data.project.slug}`);
	const query = $derived(page.url.searchParams.get('v') ? `?v=${page.url.searchParams.get('v')}` : '');

	interface Tab {
		href: string;
		label: string;
		icon: IconName;
		badge?: number | string;
		muted?: boolean;
	}

	const tabs = $derived<Tab[]>([
		{ href: '', label: t('tabs.overview'), icon: 'dashboard' },
		{ href: '/schematic', label: t('tabs.schematic'), icon: 'schematic', muted: !data.tabs.schematic },
		{ href: '/pcb', label: t('tabs.pcb'), icon: 'board', muted: !data.tabs.pcb },
		{ href: '/3d', label: '3D', icon: 'cube', muted: !data.tabs.three },
		{ href: '/bom', label: t('tabs.bom'), icon: 'list', badge: data.tabs.bom || undefined, muted: !data.tabs.bom && !data.tabs.ibom },
		{
			href: '/drc',
			label: t('tabs.checks'),
			icon: 'shield',
			badge: data.tabs.drc || undefined,
			muted: !data.tabs.drc
		},
		{ href: '/files', label: t('tabs.files'), icon: 'folder' },
		{ href: '/history', label: t('tabs.history'), icon: 'history', badge: data.project.commit_count || undefined }
	]);

	const activePath = $derived(page.url.pathname.replace(base, '') || '');

	let starring = $state(false);
	// Keyed by project so navigating to another board falls back to its own data.
	let starOverride = $state<Record<string, { starred: boolean; count: number }>>({});

	const starred = $derived(starOverride[data.project.id]?.starred ?? data.starred);
	const starCount = $derived(starOverride[data.project.id]?.count ?? data.project.star_count);

	async function toggleStar() {
		if (!data.user || starring) return;
		starring = true;
		// Optimistic: the count is cosmetic and the server remains the source of truth.
		const optimistic = { starred: !starred, count: starCount + (starred ? -1 : 1) };
		starOverride = { ...starOverride, [data.project.id]: optimistic };
		try {
			const response = await fetch(`${base}/star`, { method: 'POST' });
			if (response.ok) {
				const result = await response.json();
				starOverride = {
					...starOverride,
					[data.project.id]: { starred: result.starred, count: result.count }
				};
			}
		} finally {
			starring = false;
		}
	}
</script>

<div class="border-b bg-s1">
	<div class="mx-auto max-w-[1400px] px-4 pt-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<a
						href="/{data.project.owner_username}"
						class="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
					>
						<Avatar name={data.project.owner_display_name || data.project.owner_username} size={18} />
						{data.project.owner_username}
					</a>
					<span class="text-[var(--text-muted)]">/</span>
					<h1 class="text-lg font-semibold tracking-tight">{data.project.name}</h1>
					{#if data.project.visibility === 'private'}
						<span class="chip"><Icon name="lock" size={10} /> {t('common.private')}</span>
					{/if}
					{#if data.project.license}
						<span class="chip">{licenseName(data.project.license, t('license.proprietary'))}</span>
					{/if}
				</div>
				{#if data.project.description}
					<p class="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
						{data.project.description}
					</p>
				{/if}
				{#if data.project.tags.length}
					<div class="mt-2 flex flex-wrap gap-1">
						{#each data.project.tags as tag}
							<TagChip {tag} href="/?tag={tag.slug}" />
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex shrink-0 items-center gap-2">
				{#if data.commit}
					<StatusDot status={data.commit.render_status} label />
				{/if}
				<VersionPicker versions={data.versions} current={data.commit} isHead={data.isHead} />
				<button
					class="btn btn-sm"
					class:!text-[var(--accent)]={starred}
					class:!border-[var(--accent)]={starred}
					onclick={toggleStar}
					disabled={!data.user || starring}
					title={data.user ? (starred ? t('board.unstar') : t('board.star')) : t('board.signInToStar')}
				>
					<Icon name="star" size={13} fill={starred} />
					{formatCount(starCount)}
				</button>
				{#if data.editable}
					<a href="{base}/settings" class="btn btn-sm" title={t('board.settings')}>
						<Icon name="settings" size={13} />
					</a>
				{/if}
			</div>
		</div>

		<nav class="-mb-px mt-4 flex gap-0.5 overflow-x-auto" aria-label={t('board.sections')}>
			{#each tabs as tab}
				{@const active = activePath === tab.href}
				<a
					href="{base}{tab.href}{query}"
					class="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[0.8125rem] transition-colors"
					class:!border-[var(--accent)]={active}
					class:text-[var(--text-primary)]={active}
					class:font-medium={active}
					class:text-[var(--text-muted)]={!active && tab.muted}
					class:text-[var(--text-secondary)]={!active && !tab.muted}
					class:hover:text-[var(--text-primary)]={!active}
					aria-current={active ? 'page' : undefined}
				>
					<Icon name={tab.icon} size={14} />
					{tab.label}
					{#if tab.badge}<span class="chip !px-1.5 !py-0 !text-[0.625rem]">{tab.badge}</span>{/if}
				</a>
			{/each}
		</nav>
	</div>
</div>

{@render children()}
