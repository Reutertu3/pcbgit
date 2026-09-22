<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { t, tParts } from '$lib/i18n/t';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>{t('nav.signIn')} · {data.site.name}</title></svelte:head>

<AuthCard title={t('nav.signIn')} subtitle={t('auth.loginSubtitle')}>
	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<FormError message={form?.error} />
		<input type="hidden" name="next" value={data.next} />

		<div class="mb-3">
			<label class="label" for="login">{t('auth.usernameOrEmail')}</label>
			<input
				class="input"
				id="login"
				name="login"
				value={form?.login ?? ''}
				autocomplete="username"
				required
			/>
		</div>

		<div class="mb-5">
			<label class="label" for="password">{t('auth.password')}</label>
			<input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
		</div>

		<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
			{submitting ? t('auth.signingIn') : t('nav.signIn')}
		</button>
	</form>

	{#snippet footer()}
		{#if data.site.registrationOpen}
			{#each tParts('auth.noAccount') as part}{#if typeof part === 'string'}{part}{:else}<a href="/register" class="text-[var(--accent)] hover:underline">{t('auth.createOne')}</a>{/if}{/each}
		{:else}
			{t('auth.registrationClosedHint')}
		{/if}
	{/snippet}
</AuthCard>
