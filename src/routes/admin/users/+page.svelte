<script lang="ts">
	import { enhance } from '$app/forms';
	import { keepValues } from '$lib/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatBytes, formatDate, relativeTime } from '$lib/format';
	import { t, tParts } from '$lib/i18n/t';

	let { data, form } = $props();

	let showCreate = $state(false);
	let resetting = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);
	let editingLimits = $state<string | null>(null);

	/** "12 MB / 500 MB", or just the usage when there is no limit. */
	const ofLimit = (used: string | number, limit: string | number | null) => (limit === null ? `${used}` : `${used} / ${limit}`);
</script>

<svelte:head><title>{t('admin.nav.users')} · {t('admin.title')} · {data.site.name}</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
	<h2 class="text-lg font-semibold tracking-tight">{t('admin.nav.users')}</h2>
	<div class="flex gap-2">
		<form method="GET" class="flex gap-2">
			<input class="input !w-48 !py-1.5 text-[0.8125rem]" type="search" name="q" value={data.search} placeholder={t('users.search')} />
		</form>
		<button class="btn btn-primary btn-sm" onclick={() => (showCreate = !showCreate)}>
			<Icon name="plus" size={13} /> {t('users.add')}
		</button>
	</div>
</div>

{#if form?.message}<FormError message={form.message} kind="success" />{/if}
{#if form?.error}<FormError message={form.error} />{/if}

{#if showCreate}
	<section class="surface mb-4 p-4">
		<h3 class="mb-3 text-sm font-semibold">{t('users.createTitle')}</h3>
		<form method="POST" action="?/create" use:enhance={() => async ({ update }) => {
			await update();
			showCreate = false;
		}}>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="new-username">{t('auth.username')}</label>
					<input class="input mono" id="new-username" name="username" required />
				</div>
				<div>
					<label class="label" for="new-email">{t('auth.email')}</label>
					<input class="input" id="new-email" name="email" type="email" required />
				</div>
				<div>
					<label class="label" for="new-password">{t('auth.password')}</label>
					<input class="input" id="new-password" name="password" type="password" minlength="8" required />
				</div>
				<div>
					<label class="label" for="new-role">{t('users.role')}</label>
					<select class="select" id="new-role" name="role">
						<option value="user">{t('users.roleUser')}</option>
						<option value="admin">{t('users.roleAdmin')}</option>
					</select>
				</div>
			</div>
			<div class="mt-3 flex gap-2">
				<button class="btn btn-primary btn-sm" type="submit">{t('users.create')}</button>
				<button class="btn btn-ghost btn-sm" type="button" onclick={() => (showCreate = false)}>{t('common.cancel')}</button>
			</div>
		</form>
	</section>
{/if}

<div class="surface overflow-x-auto">
	<table class="w-full text-left text-[0.8125rem]">
		<thead class="bg-s2 text-xs">
			<tr>
				<th class="px-3 py-2 font-semibold">{t('users.roleUser')}</th>
				<th class="px-3 py-2 font-semibold">{t('users.role')}</th>
				<th class="px-3 py-2 font-semibold">{t('admin.nav.boards')}</th>
				<th class="px-3 py-2 font-semibold">{t('users.storage')}</th>
				<th class="px-3 py-2 font-semibold">{t('users.joined')}</th>
				<th class="px-3 py-2 font-semibold">{t('users.lastSignIn')}</th>
				<th class="px-3 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as user (user.id)}
				<tr class="border-t" class:opacity-55={user.approved && !user.is_active}>
					<td class="px-3 py-2">
						<div class="flex items-center gap-2">
							<Avatar name={user.display_name || user.username} username={user.username} avatar={user.avatar} size={26} />
							<div class="min-w-0">
								<a href="/{user.username}" class="block truncate font-medium hover:text-[var(--accent)]">
									{user.display_name || user.username}
								</a>
								<span class="mono block truncate text-[0.6875rem] text-[var(--text-muted)]">
									@{user.username} · {user.email}
								</span>
							</div>
						</div>
					</td>
					<td class="px-3 py-2">
						{#if !user.approved}
							<span class="chip !border-[var(--accent)] !text-[var(--accent)]">{t('users.pending')}</span>
						{:else}
							<form method="POST" action="?/setRole" use:enhance={keepValues}>
								<input type="hidden" name="id" value={user.id} />
								<select
									class="select !w-auto !py-1 text-xs"
									name="role"
									value={user.role}
									onchange={(event) => event.currentTarget.form?.requestSubmit()}
								>
									<option value="user">{t('users.roleUser')}</option>
									<option value="admin">{t('profile.admin')}</option>
								</select>
							</form>
						{/if}
					</td>
					<td class="px-3 py-2 tabular-nums">{ofLimit(user.project_count, user.boardLimit)}</td>
					<td
						class="px-3 py-2 text-xs tabular-nums"
						style:color={user.storageLimit !== null && user.storage >= user.storageLimit ? 'var(--err)' : undefined}
					>
						{ofLimit(formatBytes(user.storage), user.storageLimit === null ? null : formatBytes(user.storageLimit))}
					</td>
					<td class="px-3 py-2 text-xs text-[var(--text-muted)]">{formatDate(user.created_at)}</td>
					<td class="px-3 py-2 text-xs text-[var(--text-muted)]">
						{user.last_session ? relativeTime(user.last_session) : t('time.never')}
					</td>
					<td class="px-3 py-2">
						<div class="flex justify-end gap-1">
							{#if !user.approved}
								<form method="POST" action="?/approve" use:enhance>
									<input type="hidden" name="id" value={user.id} />
									<button class="btn btn-primary btn-sm" type="submit"><Icon name="check" size={12} /> {t('users.approve')}</button>
								</form>
								<button class="btn btn-danger btn-sm" onclick={() => (confirmDelete = confirmDelete === user.id ? null : user.id)}>
									{t('users.reject')}
								</button>
							{:else}
								<form method="POST" action="?/toggleActive" use:enhance>
									<input type="hidden" name="id" value={user.id} />
									<button class="btn btn-sm" type="submit" title={user.is_active ? t('users.disable') : t('users.enable')}>
										<Icon name={user.is_active ? 'lock' : 'check'} size={12} />
									</button>
								</form>
								<button
									class="btn btn-sm"
									onclick={() => (editingLimits = editingLimits === user.id ? null : user.id)}
									title={t('users.limits')}
								>
									<Icon name="settings" size={12} />
								</button>
								<button
									class="btn btn-sm"
									onclick={() => (resetting = resetting === user.id ? null : user.id)}
									title={t('users.resetPassword')}
								>
									<Icon name="refresh" size={12} />
								</button>
								<button
									class="btn btn-danger btn-sm"
									onclick={() => (confirmDelete = confirmDelete === user.id ? null : user.id)}
									title={t('users.delete')}
								>
									<Icon name="trash" size={12} />
								</button>
							{/if}
						</div>
					</td>
				</tr>

				{#if editingLimits === user.id}
					<tr class="border-t bg-s2">
						<td colspan="7" class="px-3 py-2.5">
							<form method="POST" action="?/setLimits" use:enhance={keepValues} class="flex flex-wrap items-end gap-2">
								<input type="hidden" name="id" value={user.id} />
								<div class="w-36">
									<label class="label" for="boards-{user.id}">{t('users.limitBoards')}</label>
									<input class="input !py-1.5" id="boards-{user.id}" name="boards" type="number" min="0" value={user.limit_boards ?? ''} placeholder={String(data.defaults.boards || '∞')} />
								</div>
								<div class="w-36">
									<label class="label" for="storage-{user.id}">{t('users.limitStorage')}</label>
									<input class="input !py-1.5" id="storage-{user.id}" name="storage_mb" type="number" min="0" value={user.limit_storage_mb ?? ''} placeholder={String(data.defaults.storageMb || '∞')} />
								</div>
								<button class="btn btn-sm" type="submit">{t('users.saveLimits')}</button>
								<button class="btn btn-ghost btn-sm" type="button" onclick={() => (editingLimits = null)}>{t('common.cancel')}</button>
							</form>
							<p class="hint">{user.role === 'admin' ? t('users.limitsAdmin') : t('users.limitsHint')}</p>
						</td>
					</tr>
				{/if}

				{#if resetting === user.id}
					<tr class="border-t bg-s2">
						<td colspan="7" class="px-3 py-2.5">
							<form method="POST" action="?/resetPassword" use:enhance={() => async ({ update }) => {
								await update();
								resetting = null;
							}} class="flex flex-wrap items-end gap-2">
								<input type="hidden" name="id" value={user.id} />
								<div class="min-w-48 flex-1">
									<label class="label" for="pw-{user.id}">{t('users.newPasswordFor', { user: user.username })}</label>
									<input class="input !py-1.5" id="pw-{user.id}" name="password" type="password" minlength="8" required />
								</div>
								<button class="btn btn-sm" type="submit">{t('users.setPassword')}</button>
								<button class="btn btn-ghost btn-sm" type="button" onclick={() => (resetting = null)}>{t('common.cancel')}</button>
							</form>
							<p class="hint">{t('users.signsOut')}</p>
						</td>
					</tr>
				{/if}

				{#if confirmDelete === user.id}
					<tr class="border-t" style:background="color-mix(in srgb, var(--err) 8%, transparent)">
						<td colspan="7" class="px-3 py-2.5">
							<form method="POST" action="?/delete" use:enhance={() => async ({ update }) => {
								await update();
								confirmDelete = null;
							}} class="flex flex-wrap items-center gap-2">
								<input type="hidden" name="id" value={user.id} />
								<span class="flex-1 text-xs">
									{#each tParts('users.deleteConfirm', { count: user.project_count }) as part}{#if typeof part === 'string'}{part}{:else}<strong>@{user.username}</strong>{/if}{/each}
								</span>
								<button class="btn btn-danger btn-sm" type="submit">{t('users.deletePermanently')}</button>
								<button class="btn btn-ghost btn-sm" type="button" onclick={() => (confirmDelete = null)}>{t('common.cancel')}</button>
							</form>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
	{#if !data.users.length}
		<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">{t('users.noMatch')}</p>
	{/if}
</div>
