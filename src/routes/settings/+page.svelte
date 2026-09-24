<script lang="ts">
	import { enhance } from '$app/forms';
	import { keepValues } from '$lib/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { t } from '$lib/i18n/t';

	let { data, form } = $props();

	let picture = $state<File | null>(null);
	let uploading = $state(false);
	const inAvatar = $derived(Boolean(form && 'avatar' in form));
</script>

<svelte:head><title>{t('nav.userCenter')} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<div class="mb-5 flex items-center gap-3">
		<Avatar name={data.profile.displayName || data.profile.username} username={data.profile.username} avatar={data.profile.avatar} size={44} />
		<div>
			<h1 class="text-lg font-semibold tracking-tight">{t('account.title')}</h1>
			<p class="mono text-xs text-[var(--text-muted)]">@{data.profile.username}</p>
		</div>
		<div class="flex-1"></div>
		<a href="/settings/tokens" class="btn btn-sm"><Icon name="git" size={13} /> {t('nav.tokens')}</a>
	</div>

	{#if form?.error && !inAvatar}<FormError message={form.error} />{/if}

	<section class="surface p-5">
		<h2 class="mb-1 text-sm font-semibold">{t('avatar.title')}</h2>
		<p class="mb-4 text-xs text-[var(--text-secondary)]">{t('avatar.hint')}</p>
		{#if inAvatar && form?.error}<FormError message={form.error} />{/if}
		<div class="flex flex-wrap items-center gap-4">
			<Avatar name={data.profile.displayName || data.profile.username} username={data.profile.username} avatar={data.profile.avatar} size={72} />
			<form
				method="POST"
				action="?/avatar"
				enctype="multipart/form-data"
				class="flex flex-wrap items-center gap-2"
				use:enhance={() => {
					uploading = true;
					return async ({ update }) => {
						await update();
						uploading = false;
						picture = null;
					};
				}}
			>
				<label class="btn btn-sm cursor-pointer">
					<Icon name="upload" size={13} />
					{picture ? picture.name : t('avatar.choose')}
					<input
						class="sr-only"
						type="file"
						name="picture"
						accept="image/png,image/jpeg,image/webp,image/gif"
						onchange={(event) => (picture = event.currentTarget.files?.[0] ?? null)}
					/>
				</label>
				<button class="btn btn-primary btn-sm" type="submit" disabled={!picture || uploading}>
					{uploading ? t('avatar.uploading') : t('avatar.upload')}
				</button>
			</form>
			{#if data.profile.avatar}
				<form method="POST" action="?/removeAvatar" use:enhance>
					<button class="btn btn-sm" type="submit"><Icon name="trash" size={12} /> {t('avatar.remove')}</button>
				</form>
			{/if}
			<SavedNote message={inAvatar && form && 'message' in form ? form.message : null} token={form} />
		</div>
	</section>

	<section class="surface mt-4 p-5">
		<h2 class="mb-4 text-sm font-semibold">{t('account.profile')}</h2>
		<form method="POST" action="?/profile" use:enhance={keepValues}>
			<div class="mb-4">
				<label class="label" for="display_name">{t('account.displayName')}</label>
				<input class="input" id="display_name" name="display_name" value={data.profile.displayName} maxlength="80" />
			</div>
			<div class="mb-4">
				<label class="label" for="email">{t('auth.email')}</label>
				<input class="input" id="email" name="email" type="email" value={data.profile.email} required />
				<p class="hint">{t('account.emailHint')}</p>
			</div>
			<div class="mb-4">
				<label class="label" for="bio">{t('account.bio')}</label>
				<textarea class="textarea !min-h-16" id="bio" name="bio" maxlength="300">{data.profile.bio}</textarea>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<button class="btn btn-primary" type="submit">{t('account.saveProfile')}</button>
				<SavedNote message={form && 'saved' in form ? form.message : null} token={form} />
			</div>
		</form>
	</section>

	<section class="surface mt-4 p-5">
		<h2 class="mb-1 text-sm font-semibold">{t('account.changePassword')}</h2>
		<p class="mb-4 text-xs text-[var(--text-secondary)]">
			{t('account.passwordHint')}
		</p>
		<form method="POST" action="?/password" use:enhance>
			<div class="mb-3">
				<label class="label" for="current">{t('account.currentPassword')}</label>
				<input class="input" id="current" name="current" type="password" autocomplete="current-password" required />
			</div>
			<div class="mb-4">
				<label class="label" for="next">{t('account.newPassword')}</label>
				<input class="input" id="next" name="next" type="password" autocomplete="new-password" minlength="8" required />
			</div>
			<button class="btn" type="submit">{t('account.changePassword')}</button>
		</form>
	</section>
</div>

