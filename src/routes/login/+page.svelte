<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import FormError from '$lib/components/FormError.svelte';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in · {data.site.name}</title></svelte:head>

<AuthCard title="Sign in" subtitle="Access your boards and push new versions.">
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
			<label class="label" for="login">Username or email</label>
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
			<label class="label" for="password">Password</label>
			<input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
		</div>

		<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
			{submitting ? 'Signing in…' : 'Sign in'}
		</button>
	</form>

	{#snippet footer()}
		{#if data.site.registrationOpen}
			No account? <a href="/register" class="text-[var(--accent)] hover:underline">Create one</a>
		{:else}
			Registration is closed on this instance.
		{/if}
	{/snippet}
</AuthCard>
