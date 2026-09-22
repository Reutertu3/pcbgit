<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatDate, relativeTime } from '$lib/format';

	let { data, form } = $props();

	let showCreate = $state(false);
	let resetting = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);
</script>

<svelte:head><title>Users · Admin · {data.site.name}</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
	<h2 class="text-lg font-semibold tracking-tight">Users</h2>
	<div class="flex gap-2">
		<form method="GET" class="flex gap-2">
			<input class="input !w-48 !py-1.5 text-[0.8125rem]" type="search" name="q" value={data.search} placeholder="Search users…" />
		</form>
		<button class="btn btn-primary btn-sm" onclick={() => (showCreate = !showCreate)}>
			<Icon name="plus" size={13} /> Add user
		</button>
	</div>
</div>

{#if form?.message}<FormError message={form.message} kind="success" />{/if}
{#if form?.error}<FormError message={form.error} />{/if}

{#if showCreate}
	<section class="surface mb-4 p-4">
		<h3 class="mb-3 text-sm font-semibold">Create a user</h3>
		<form method="POST" action="?/create" use:enhance={() => async ({ update }) => {
			await update();
			showCreate = false;
		}}>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="new-username">Username</label>
					<input class="input mono" id="new-username" name="username" required />
				</div>
				<div>
					<label class="label" for="new-email">Email</label>
					<input class="input" id="new-email" name="email" type="email" required />
				</div>
				<div>
					<label class="label" for="new-password">Password</label>
					<input class="input" id="new-password" name="password" type="password" minlength="8" required />
				</div>
				<div>
					<label class="label" for="new-role">Role</label>
					<select class="select" id="new-role" name="role">
						<option value="user">User</option>
						<option value="admin">Administrator</option>
					</select>
				</div>
			</div>
			<div class="mt-3 flex gap-2">
				<button class="btn btn-primary btn-sm" type="submit">Create user</button>
				<button class="btn btn-ghost btn-sm" type="button" onclick={() => (showCreate = false)}>Cancel</button>
			</div>
		</form>
	</section>
{/if}

<div class="surface overflow-x-auto">
	<table class="w-full text-left text-[0.8125rem]">
		<thead class="bg-s2 text-xs">
			<tr>
				<th class="px-3 py-2 font-semibold">User</th>
				<th class="px-3 py-2 font-semibold">Role</th>
				<th class="px-3 py-2 font-semibold">Boards</th>
				<th class="px-3 py-2 font-semibold">Joined</th>
				<th class="px-3 py-2 font-semibold">Last sign-in</th>
				<th class="px-3 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as user (user.id)}
				<tr class="border-t" class:opacity-55={!user.is_active}>
					<td class="px-3 py-2">
						<div class="flex items-center gap-2">
							<Avatar name={user.display_name || user.username} size={26} />
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
						<form method="POST" action="?/setRole" use:enhance>
							<input type="hidden" name="id" value={user.id} />
							<select
								class="select !w-auto !py-1 text-xs"
								name="role"
								value={user.role}
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							>
								<option value="user">User</option>
								<option value="admin">Admin</option>
							</select>
						</form>
					</td>
					<td class="px-3 py-2 tabular-nums">{user.project_count}</td>
					<td class="px-3 py-2 text-xs text-[var(--text-muted)]">{formatDate(user.created_at)}</td>
					<td class="px-3 py-2 text-xs text-[var(--text-muted)]">
						{user.last_session ? relativeTime(user.last_session) : 'never'}
					</td>
					<td class="px-3 py-2">
						<div class="flex justify-end gap-1">
							<form method="POST" action="?/toggleActive" use:enhance>
								<input type="hidden" name="id" value={user.id} />
								<button class="btn btn-sm" type="submit" title={user.is_active ? 'Disable account' : 'Enable account'}>
									<Icon name={user.is_active ? 'lock' : 'check'} size={12} />
								</button>
							</form>
							<button
								class="btn btn-sm"
								onclick={() => (resetting = resetting === user.id ? null : user.id)}
								title="Reset password"
							>
								<Icon name="refresh" size={12} />
							</button>
							<button
								class="btn btn-danger btn-sm"
								onclick={() => (confirmDelete = confirmDelete === user.id ? null : user.id)}
								title="Delete user"
							>
								<Icon name="trash" size={12} />
							</button>
						</div>
					</td>
				</tr>

				{#if resetting === user.id}
					<tr class="border-t bg-s2">
						<td colspan="6" class="px-3 py-2.5">
							<form method="POST" action="?/resetPassword" use:enhance={() => async ({ update }) => {
								await update();
								resetting = null;
							}} class="flex flex-wrap items-end gap-2">
								<input type="hidden" name="id" value={user.id} />
								<div class="min-w-48 flex-1">
									<label class="label" for="pw-{user.id}">New password for @{user.username}</label>
									<input class="input !py-1.5" id="pw-{user.id}" name="password" type="password" minlength="8" required />
								</div>
								<button class="btn btn-sm" type="submit">Set password</button>
								<button class="btn btn-ghost btn-sm" type="button" onclick={() => (resetting = null)}>Cancel</button>
							</form>
							<p class="hint">This also signs the user out everywhere.</p>
						</td>
					</tr>
				{/if}

				{#if confirmDelete === user.id}
					<tr class="border-t" style:background="color-mix(in srgb, var(--err) 8%, transparent)">
						<td colspan="6" class="px-3 py-2.5">
							<form method="POST" action="?/delete" use:enhance={() => async ({ update }) => {
								await update();
								confirmDelete = null;
							}} class="flex flex-wrap items-center gap-2">
								<input type="hidden" name="id" value={user.id} />
								<span class="flex-1 text-xs">
									Delete <strong>@{user.username}</strong> and all
									{user.project_count} of their board{user.project_count === 1 ? '' : 's'}, including the
									repositories and rendered output. This cannot be undone.
								</span>
								<button class="btn btn-danger btn-sm" type="submit">Delete permanently</button>
								<button class="btn btn-ghost btn-sm" type="button" onclick={() => (confirmDelete = null)}>Cancel</button>
							</form>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
	{#if !data.users.length}
		<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No users match that search.</p>
	{/if}
</div>
