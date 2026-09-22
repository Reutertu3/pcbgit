<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import { relativeTime } from '$lib/format';
	import type { NotificationView } from '$lib/types';

	interface Props {
		/** Unread count from the layout; refreshed on every navigation. */
		unread: number;
	}
	let { unread }: Props = $props();

	let open = $state(false);
	let loading = $state(false);
	let items = $state<NotificationView[]>([]);
	let failed = $state(false);
	/** Set after actions in the dropdown until the next navigation reloads `unread`. */
	let override = $state<number | null>(null);

	const count = $derived(override ?? unread);

	$effect(() => {
		void unread;
		override = null;
	});

	async function load() {
		loading = true;
		failed = false;
		try {
			const response = await fetch('/notifications');
			if (!response.ok) throw new Error();
			const result = await response.json();
			items = result.notifications;
			override = result.unread;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	async function send(body: { id: string } | { all: true }) {
		const response = await fetch('/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (response.ok) override = (await response.json()).unread;
	}

	function toggle() {
		open = !open;
		if (open) load();
	}

	async function markOne(item: NotificationView) {
		if (item.read_at) return;
		item.read_at = Date.now();
		await send({ id: item.id });
	}

	async function markAll() {
		for (const item of items) item.read_at ??= Date.now();
		await send({ all: true });
	}

	async function openItem(item: NotificationView) {
		open = false;
		await markOne(item);
		goto(`/${item.project_owner}/${item.project_slug}#comment-${item.comment_id}`);
	}
</script>

<svelte:window
	onclick={() => (open = false)}
	onkeydown={(event) => event.key === 'Escape' && (open = false)}
/>

<div class="relative">
	<button
		class="btn btn-ghost relative !px-2"
		onclick={(event) => {
			event.stopPropagation();
			toggle();
		}}
		aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
		aria-haspopup="dialog"
		aria-expanded={open}
		title="Notifications"
	>
		<Icon name="bell" size={16} />
		{#if count > 0}
			<span class="badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>
		{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
		<div
			class="surface-raised absolute right-0 top-full z-50 mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden shadow-xl"
			role="dialog"
			aria-label="Notifications"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
		>
			<div class="flex items-center justify-between border-b px-3 py-2">
				<h2 class="text-sm font-semibold">Notifications</h2>
				<button
					class="text-xs text-[var(--accent)] hover:underline disabled:cursor-default disabled:text-[var(--text-muted)] disabled:no-underline"
					onclick={markAll}
					disabled={count === 0}
				>
					Mark all as read
				</button>
			</div>

			<div class="max-h-[26rem] overflow-y-auto">
				{#if loading && !items.length}
					<p class="px-3 py-6 text-center text-xs text-[var(--text-muted)]">Loading…</p>
				{:else if failed}
					<p class="px-3 py-6 text-center text-xs" style:color="var(--err)">Could not load notifications.</p>
				{:else if !items.length}
					<p class="px-3 py-8 text-center text-xs text-[var(--text-muted)]">
						No notifications yet. Comments on your boards and replies to you appear here.
					</p>
				{:else}
					<ul class="divide-y">
						{#each items as item (item.id)}
							<li class="group flex items-start gap-2 px-3 py-2.5 hover:bg-s3" class:unread={!item.read_at}>
								<span class="dot mt-1.5" aria-hidden="true"></span>
								<button class="min-w-0 flex-1 text-left" onclick={() => openItem(item)}>
									<span class="block text-xs leading-snug text-[var(--text-secondary)]">
										<strong class="font-semibold text-[var(--text-primary)]">{item.actor}</strong>
										{item.kind === 'reply' ? 'replied to your comment on' : 'commented on'}
										<strong class="font-semibold text-[var(--text-primary)]">{item.project_name}</strong>
									</span>
									<span class="excerpt mt-0.5 block text-xs text-[var(--text-muted)]">“{item.excerpt}”</span>
									<span class="mt-0.5 block text-[0.6875rem] text-[var(--text-muted)]">{relativeTime(item.created_at)}</span>
								</button>
								{#if !item.read_at}
									<button
										class="mt-0.5 rounded p-1 text-[var(--text-muted)] hover:bg-s2 hover:text-[var(--accent)]"
										onclick={() => markOne(item)}
										title="Mark as read"
										aria-label="Mark as read"
									>
										<Icon name="check" size={13} />
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.badge {
		position: absolute;
		top: 0.1rem;
		right: 0.05rem;
		min-width: 1rem;
		height: 1rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 0.5625rem;
		font-weight: 700;
		line-height: 1rem;
		text-align: center;
	}
	.dot {
		width: 0.45rem;
		height: 0.45rem;
		flex-shrink: 0;
		border-radius: 999px;
		background: transparent;
	}
	.unread .dot {
		background: var(--accent);
	}
	.unread {
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}
	.excerpt {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
