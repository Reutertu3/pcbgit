<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { t } from '$lib/i18n/t';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>{t('twofactor.loginTitle')} · {data.site.name}</title></svelte:head>

<AuthCard title={t('twofactor.loginTitle')} subtitle={t('twofactor.loginSubtitle')}>
	<FormError message={form?.error} />
	{#if form && 'expired' in form}
		<a href="/login" class="btn btn-primary w-full">{t('auth.backToSignIn')}</a>
	{:else}
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
			<div class="mb-5">
				<label class="label" for="code">{t('twofactor.code')}</label>
				<!-- Text, not numeric: recovery codes have letters. Focused: the page has nothing else to do. -->
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="input mono tracking-widest"
					id="code"
					name="code"
					autocomplete="one-time-code"
					autocapitalize="off"
					spellcheck="false"
					maxlength="16"
					required
					autofocus
				/>
				<p class="hint">{t('twofactor.codeHint')}</p>
			</div>
			<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
				{submitting ? t('auth.signingIn') : t('twofactor.verify')}
			</button>
		</form>
	{/if}

	{#snippet footer()}
		<a href="/login" class="text-[var(--accent)] hover:underline">{t('auth.backToSignIn')}</a>
	{/snippet}
</AuthCard>
