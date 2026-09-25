<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import type { IconName } from '$lib/icons';
	import { t } from '$lib/i18n/t';

	let { data, children } = $props();

	const NAV: { href: string; label: string; icon: IconName; badge?: keyof typeof data.badges }[] = $derived([
		{ href: '/admin-panel', label: t('admin.nav.overview'), icon: 'dashboard' },
		{ href: '/admin-panel/users', label: t('admin.nav.users'), icon: 'users', badge: 'users' },
		{ href: '/admin-panel/projects', label: t('admin.nav.boards'), icon: 'board', badge: 'projects' },
		{ href: '/admin-panel/tags', label: t('nav.tags'), icon: 'tag', badge: 'tags' },
		{ href: '/admin-panel/jobs', label: t('about.queue'), icon: 'refresh', badge: 'jobs' },
		{ href: '/admin-panel/backups', label: t('admin.nav.backups'), icon: 'folder' },
		{ href: '/admin-panel/settings', label: t('admin.nav.instance'), icon: 'settings', badge: 'updates' }
	]);
</script>

<div class="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 lg:flex-row">
	<aside class="lg:w-48 lg:shrink-0">
		<h1 class="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
			<Icon name="shield" size={15} class="text-[var(--accent)]" /> {t('admin.title')}
		</h1>
		<nav class="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col">
			{#each NAV as item}
				{@const active = page.url.pathname === item.href}
				<a
					href={item.href}
					class="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8125rem] transition-colors"
					class:bg-s2={active}
					class:text-[var(--text-primary)]={active}
					class:font-medium={active}
					class:text-[var(--text-secondary)]={!active}
					class:hover:bg-s2={!active}
					aria-current={active ? 'page' : undefined}
				>
					<Icon name={item.icon} size={14} />
					<span class="flex-1">{item.label}</span>
					{#if item.badge === 'users' && data.badges.pending}
						<span class="chip !border-[var(--accent)] !px-1.5 !py-0 !text-[0.625rem] !text-[var(--accent)]" title={t('users.pendingBadge', { count: data.badges.pending })}>
							{t('users.pendingShort', { count: data.badges.pending })}
						</span>
					{/if}
					{#if item.badge && data.badges[item.badge]}
						<span class="chip !px-1.5 !py-0 !text-[0.625rem]">{data.badges[item.badge]}</span>
					{/if}
				</a>
			{/each}
		</nav>
	</aside>

	<div class="min-w-0 flex-1">{@render children()}</div>
</div>
