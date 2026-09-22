<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { t, tParts } from '$lib/i18n/t';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>{t('nav.register')} · {data.site.name}</title></svelte:head>

{#if data.closed}
	<AuthCard title={t('auth.closedTitle')} subtitle={t('auth.closedSubtitle')}>
		<a href="/login" class="btn w-full">{t('auth.backToSignIn')}</a>
	</AuthCard>
{:else}
	<AuthCard title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
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

			<div class="mb-3">
				<label class="label" for="username">{t('auth.username')}</label>
				<input
					class="input mono"
					id="username"
					name="username"
					value={form?.username ?? ''}
					autocomplete="username"
					pattern="[A-Za-z0-9][A-Za-z0-9\-]&#123;1,30&#125;[A-Za-z0-9]"
					required
				/>
				<p class="hint">{t('auth.usernameHint')}</p>
			</div>

			<div class="mb-3">
				<label class="label" for="email">{t('auth.email')}</label>
				<input class="input" id="email" name="email" type="email" value={form?.email ?? ''} autocomplete="email" required />
			</div>

			<div class="mb-5">
				<label class="label" for="password">{t('auth.password')}</label>
				<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
				<p class="hint">{t('auth.passwordHint')}</p>
			</div>

			<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
				{submitting ? t('auth.creatingAccount') : t('nav.register')}
			</button>
		</form>

		{#snippet footer()}
			{#each tParts('auth.haveAccount') as part}{#if typeof part === 'string'}{part}{:else}<a href="/login" class="text-[var(--accent)] hover:underline">{t('nav.signIn')}</a>{/if}{/each}
		{/snippet}
	</AuthCard>
{/if}
