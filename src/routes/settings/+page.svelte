<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Settings · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<div class="mb-5 flex items-center gap-3">
		<Avatar name={data.profile.displayName || data.profile.username} size={44} />
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Account settings</h1>
			<p class="mono text-xs text-[var(--text-muted)]">@{data.profile.username}</p>
		</div>
		<div class="flex-1"></div>
		<a href="/settings/tokens" class="btn btn-sm"><Icon name="git" size={13} /> Access tokens</a>
	</div>

	{#if form?.message}<FormError message={form.message} kind="success" />{/if}
	{#if form?.error}<FormError message={form.error} />{/if}

	<section class="surface p-5">
		<h2 class="mb-4 text-sm font-semibold">Profile</h2>
		<form method="POST" action="?/profile" use:enhance>
			<div class="mb-4">
				<label class="label" for="display_name">Display name</label>
				<input class="input" id="display_name" name="display_name" value={data.profile.displayName} maxlength="80" />
			</div>
			<div class="mb-4">
				<label class="label" for="email">Email</label>
				<input class="input" id="email" name="email" type="email" value={data.profile.email} required />
				<p class="hint">Used as the author address for versions you upload.</p>
			</div>
			<div class="mb-4">
				<label class="label" for="bio">Bio</label>
				<textarea class="textarea !min-h-16" id="bio" name="bio" maxlength="300">{data.profile.bio}</textarea>
			</div>
			<button class="btn btn-primary" type="submit">Save profile</button>
		</form>
	</section>

	<section class="surface mt-4 p-5">
		<h2 class="mb-1 text-sm font-semibold">Change password</h2>
		<p class="mb-4 text-xs text-[var(--text-secondary)]">
			Changing your password signs you out of every device.
		</p>
		<form method="POST" action="?/password" use:enhance>
			<div class="mb-3">
				<label class="label" for="current">Current password</label>
				<input class="input" id="current" name="current" type="password" autocomplete="current-password" required />
			</div>
			<div class="mb-4">
				<label class="label" for="next">New password</label>
				<input class="input" id="next" name="next" type="password" autocomplete="new-password" minlength="8" required />
			</div>
			<button class="btn" type="submit">Change password</button>
		</form>
	</section>
</div>
