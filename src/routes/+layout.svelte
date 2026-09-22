<script lang="ts">
	// Self-hosted fonts (OFL-1.1), bundled by Vite: no request to Google on every page.
	import '@fontsource-variable/inter';
	import '@fontsource-variable/jetbrains-mono';
	import '../app.css';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';
	import { t } from '$lib/i18n/t';

	let { data, children } = $props();

	let menuOpen = $state(false);
	let mobileNavOpen = $state(false);

	const isAdmin = $derived(data.user?.role === 'admin');
	const current = $derived(page.url.pathname);

	function closeMenus() {
		menuOpen = false;
		mobileNavOpen = false;
	}
</script>

<svelte:head>
	<title>{data.site.name}</title>
	<meta name="description" content={data.site.tagline ?? t('site.tagline')} />
</svelte:head>

<svelte:window onclick={() => (menuOpen = false)} />

<div class="flex min-h-screen flex-col">
	<header
		class="sticky top-0 z-40 border-b backdrop-blur-md"
		style="background: color-mix(in srgb, var(--surface-1) 88%, transparent)"
	>
		<div class="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
			<a href="/" class="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
				<svg viewBox="0 0 32 32" class="h-7 w-7" aria-hidden="true">
					<rect width="32" height="32" rx="7" fill="var(--surface-3)" />
					<g stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round">
						<path d="M7 11h6l4 4h8" />
						<path d="M7 21h10l4-4" />
					</g>
					<circle cx="24" cy="15" r="2.6" fill="var(--accent)" />
					<circle cx="8" cy="11" r="2" fill="var(--ok)" />
					<circle cx="8" cy="21" r="2" fill="var(--ok)" />
				</svg>
				<span class="hidden sm:inline">{data.site.name}</span>
			</a>

			<nav class="hidden items-center gap-1 md:flex">
				<a
					href="/"
					class="btn btn-ghost"
					class:!text-[var(--text-primary)]={current === '/'}
					class:bg-s2={current === '/'}>{t('nav.browse')}</a
				>
				<a
					href="/tags"
					class="btn btn-ghost"
					class:!text-[var(--text-primary)]={current.startsWith('/tags')}
					class:bg-s2={current.startsWith('/tags')}>{t('nav.tags')}</a
				>
				{#if data.user}
					<a
						href="/stars"
						class="btn btn-ghost"
						class:!text-[var(--text-primary)]={current.startsWith('/stars')}
						class:bg-s2={current.startsWith('/stars')}>{t('nav.starred')}</a
					>
				{/if}
			</nav>

			<div class="flex-1"></div>

			<form action="/" method="GET" class="hidden lg:block">
				<div class="relative">
					<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
						<Icon name="search" size={14} />
					</span>
					<input
						class="input !w-64 !py-1.5 !pl-8 text-[0.8125rem]"
						type="search"
						name="q"
						placeholder={t('nav.search')}
						value={page.url.searchParams.get('q') ?? ''}
					/>
				</div>
			</form>

			<LanguagePicker />
			<ThemePicker />

			{#if data.user}
				<a href="/new" class="btn btn-primary btn-sm">
					<Icon name="plus" size={14} /><span class="hidden sm:inline">{t('nav.newBoard')}</span>
				</a>
				<NotificationBell unread={data.unreadNotifications} />
				<div class="relative">
					<button
						class="btn btn-ghost !px-1"
						onclick={(event) => {
							event.stopPropagation();
							menuOpen = !menuOpen;
						}}
						aria-haspopup="menu"
						aria-expanded={menuOpen}
					>
						<Avatar name={data.user.displayName} size={26} />
					</button>
					{#if menuOpen}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="surface-raised absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden p-1 shadow-xl"
							onclick={(event) => event.stopPropagation()}
							role="menu"
							tabindex="-1"
							onkeydown={(event) => event.key === 'Escape' && (menuOpen = false)}
						>
							<div class="border-b px-3 py-2">
								<div class="truncate text-sm font-medium">{data.user.displayName}</div>
								<div class="mono truncate text-[var(--text-muted)]">@{data.user.username}</div>
							</div>
							<a href="/{data.user.username}" class="menu-item" onclick={closeMenus}>
								<Icon name="user" size={14} /> {t('nav.yourBoards')}
							</a>
							<a href="/settings" class="menu-item" onclick={closeMenus}>
								<Icon name="settings" size={14} /> {t('nav.settings')}
							</a>
							<a href="/settings/tokens" class="menu-item" onclick={closeMenus}>
								<Icon name="git" size={14} /> {t('nav.tokens')}
							</a>
							{#if isAdmin}
								<a href="/admin" class="menu-item" onclick={closeMenus}>
									<Icon name="dashboard" size={14} /> {t('nav.admin')}
								</a>
							{/if}
							<form method="POST" action="/logout" class="border-t pt-1">
								<button class="menu-item w-full text-left" type="submit">
									<Icon name="logout" size={14} /> {t('nav.signOut')}
								</button>
							</form>
						</div>
					{/if}
				</div>
			{:else}
				<a href="/login" class="btn btn-sm">{t('nav.signIn')}</a>
				{#if data.site.registrationOpen}
					<a href="/register" class="btn btn-primary btn-sm hidden sm:inline-flex">{t('nav.register')}</a>
				{/if}
			{/if}

			<button
				class="btn btn-ghost !px-2 md:hidden"
				onclick={(event) => {
					event.stopPropagation();
					mobileNavOpen = !mobileNavOpen;
				}}
				aria-label={t('nav.menu')}
			>
				<Icon name="list" size={16} />
			</button>
		</div>

		{#if mobileNavOpen}
			<nav class="flex flex-col gap-1 border-t p-2 md:hidden">
				<a href="/" class="menu-item" onclick={closeMenus}>{t('nav.browse')}</a>
				<a href="/tags" class="menu-item" onclick={closeMenus}>{t('nav.tags')}</a>
				{#if data.user}<a href="/stars" class="menu-item" onclick={closeMenus}>{t('nav.starred')}</a>{/if}
				<form action="/" method="GET" class="p-1">
					<input class="input" type="search" name="q" placeholder={t('nav.search')} />
				</form>
			</nav>
		{/if}
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="mt-12 border-t py-6">
		<div
			class="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-3 px-4 text-xs text-[var(--text-muted)] sm:flex-row"
		>
			<span class="flex flex-wrap items-center justify-center gap-x-1.5">
				{#if data.site.name !== 'pcbgit'}<span>{data.site.name} ·</span>{/if}
				<a href="https://pcbgit.com" class="hover:text-[var(--text-primary)]">pcbgit.com</a>
				<span>·</span>
				<a href="https://www.gnu.org/licenses/agpl-3.0.html" class="hover:text-[var(--text-primary)]" rel="license">AGPL-3.0</a>
				<span>·</span>
				<a href={data.source} class="hover:text-[var(--text-primary)]">{t('footer.source')}</a>
			</span>
			<span class="flex items-center gap-4">
				<a href="/about" class="hover:text-[var(--text-primary)]">{t('footer.about')}</a>
				<a href="/tags" class="hover:text-[var(--text-primary)]">{t('nav.tags')}</a>
				<span class="mono">KiCad-native</span>
			</span>
		</div>
	</footer>
</div>

<style>
	:global(.menu-item) {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.7rem;
		border-radius: 0.35rem;
		font-size: 0.8125rem;
		color: var(--text-secondary);
		cursor: pointer;
		background: transparent;
		border: none;
		font-family: inherit;
	}
	:global(.menu-item:hover) {
		background: var(--surface-3);
		color: var(--text-primary);
	}
</style>
