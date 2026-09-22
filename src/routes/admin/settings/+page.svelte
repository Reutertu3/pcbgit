<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Instance · Admin · {data.site.name}</title></svelte:head>

<h2 class="mb-4 text-lg font-semibold tracking-tight">Instance settings</h2>

{#if form?.message}<FormError message={form.message} kind="success" />{/if}

<section class="surface p-5">
	<form method="POST" action="?/save" use:enhance>
		<div class="mb-4">
			<label class="label" for="site_name">Site name</label>
			<input class="input" id="site_name" name="site_name" value={data.settings.siteName} maxlength="60" />
		</div>
		<div class="mb-4">
			<label class="label" for="site_tagline">Tagline</label>
			<input class="input" id="site_tagline" name="site_tagline" value={data.settings.siteTagline} maxlength="160" />
			<p class="hint">Shown on the browse page and in the page description.</p>
		</div>
		<label class="mb-4 flex cursor-pointer items-start gap-2.5">
			<input type="checkbox" name="registration_open" checked={data.settings.registrationOpen} class="mt-0.5" />
			<span>
				<span class="block text-sm font-medium">Open registration</span>
				<span class="block text-xs leading-relaxed text-[var(--text-secondary)]">
					When off, only an administrator can create accounts. Existing users are unaffected.
				</span>
			</span>
		</label>
		<button class="btn btn-primary" type="submit">Save settings</button>
	</form>
</section>

<section class="surface mt-4 p-5">
	<h3 class="mb-1 text-sm font-semibold">Render engine</h3>
	<p class="mb-3 text-xs leading-relaxed text-[var(--text-secondary)]">
		The version of kicad-cli is cached at boot. Re-check after installing or upgrading KiCad.
	</p>
	<form method="POST" action="?/recheckKicad" use:enhance>
		<button class="btn btn-sm" type="submit"><Icon name="refresh" size={13} /> Re-check kicad-cli</button>
	</form>
</section>
