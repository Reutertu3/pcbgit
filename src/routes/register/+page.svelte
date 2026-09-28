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
{:else if form && 'pending' in form && form.pending}
	<AuthCard title={t('auth.pendingTitle')} subtitle={t('auth.pendingSubtitle', { name: form.username })}>
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
			<FormError message={form && 'error' in form ? form.error : null} />
			{#if data.approval}<p class="mb-3 text-xs leading-relaxed text-[var(--text-secondary)]">{t('auth.approvalNote')}</p>{/if}

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

			<!-- Honeypot: off-screen rather than display:none, which some bots skip; hidden
			     from screen readers and the tab order, never autofilled. People leave it
			     empty; a bot that fills it gets the "waiting" page and no account. -->
			<div class="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
				<label for="leave_empty">{t('auth.honeypot')}</label>
				<input id="leave_empty" name="leave_empty" type="text" tabindex="-1" autocomplete="off" />
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
