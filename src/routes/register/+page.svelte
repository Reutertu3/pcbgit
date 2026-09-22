<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import FormError from '$lib/components/FormError.svelte';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Create account · {data.site.name}</title></svelte:head>

{#if data.closed}
	<AuthCard title="Registration closed" subtitle="This instance is not accepting new accounts.">
		<a href="/login" class="btn w-full">Back to sign in</a>
	</AuthCard>
{:else}
	<AuthCard title="Create your account" subtitle="Publish boards and push versions over git.">
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
				<label class="label" for="username">Username</label>
				<input
					class="input mono"
					id="username"
					name="username"
					value={form?.username ?? ''}
					autocomplete="username"
					pattern="[A-Za-z0-9][A-Za-z0-9\-]&#123;1,30&#125;[A-Za-z0-9]"
					required
				/>
				<p class="hint">Used in your board URLs and git remotes.</p>
			</div>

			<div class="mb-3">
				<label class="label" for="email">Email</label>
				<input class="input" id="email" name="email" type="email" value={form?.email ?? ''} autocomplete="email" required />
			</div>

			<div class="mb-5">
				<label class="label" for="password">Password</label>
				<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
				<p class="hint">At least 8 characters.</p>
			</div>

			<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
				{submitting ? 'Creating account…' : 'Create account'}
			</button>
		</form>

		{#snippet footer()}
			Already have an account? <a href="/login" class="text-[var(--accent)] hover:underline">Sign in</a>
		{/snippet}
	</AuthCard>
{/if}
