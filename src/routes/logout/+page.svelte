<script lang="ts">
	// Reached only if JavaScript posts here without a redirect; offer the button.
	import { t } from '$lib/i18n/t';
</script>

<div class="mx-auto max-w-md px-4 py-20 text-center">
	<form method="POST">
		<button class="btn btn-primary" type="submit">{t('nav.signOut')}</button>
	</form>
</div>
