<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { t } from '$lib/i18n/t';

	let { data, form } = $props();

	let copied = $state(false);
	const codes = $derived(form && 'codes' in form ? form.codes : null);

	async function copyCodes() {
		if (!codes) return;
		try {
			await navigator.clipboard.writeText(codes.join('\n'));
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			// Clipboard unavailable; the codes stay selectable on screen.
		}
	}

	function downloadHref(list: string[]) {
		return `data:text/plain;charset=utf-8,${encodeURIComponent(`${data.site.name} recovery codes\n\n${list.join('\n')}\n`)}`;
	}
</script>

<svelte:head><title>{t('twofactor.title')} · {data.site.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<div class="mb-1 flex items-center gap-2">
		<a href="/settings" class="btn btn-ghost btn-sm !px-1.5"><Icon name="chevronLeft" size={14} /></a>
		<h1 class="text-lg font-semibold tracking-tight">{t('twofactor.title')}</h1>
	</div>
	<p class="mb-5 text-sm leading-relaxed text-[var(--text-secondary)]">{t('twofactor.intro')}</p>

	{#if form && 'message' in form && form.message}<FormError message={form.message} kind="success" />{/if}
	{#if form?.error}<FormError message={form.error} />{/if}

	{#if codes}
		<div
			class="mb-5 rounded-lg border p-4"
			style:border-color="color-mix(in srgb, var(--ok) 40%, transparent)"
			style:background="color-mix(in srgb, var(--ok) 8%, transparent)"
		>
			<p class="mb-1 text-sm font-medium">{t('twofactor.codesTitle')}</p>
			<p class="mb-3 text-xs text-[var(--text-secondary)]">{t('twofactor.codesHint')}</p>
			<ul class="mono mb-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded border bg-[var(--surface-0)] px-3 py-2.5 text-sm">
				{#each codes as code}<li>{code}</li>{/each}
			</ul>
			<div class="flex flex-wrap gap-2">
				<button class="btn btn-sm" onclick={copyCodes}>
					<Icon name={copied ? 'check' : 'copy'} size={13} />
					{copied ? t('common.copied') : t('common.copy')}
				</button>
				<a class="btn btn-sm" href={downloadHref(codes)} download="{data.site.name}-recovery-codes.txt">
					<Icon name="download" size={13} /> {t('twofactor.download')}
				</a>
			</div>
		</div>
	{/if}

	{#if data.setup}
		<section class="surface p-5">
			<h2 class="mb-1 text-sm font-semibold">{data.enabled ? t('twofactor.replaceTitle') : t('twofactor.setupTitle')}</h2>
			<p class="mb-4 text-xs text-[var(--text-secondary)]">{data.enabled ? t('twofactor.replaceScan') : t('twofactor.scan')}</p>
			<div class="flex flex-wrap items-start gap-5">
				<!-- Our own SVG from uqr; a QR code needs a light background in either theme. -->
				<div class="w-44 shrink-0 overflow-hidden rounded-md border bg-white" aria-label={t('twofactor.qr')} role="img">
					{@html data.setup.qr}
				</div>
				<div class="min-w-0 flex-1">
					<p class="label">{t('twofactor.manual')}</p>
					<code class="mono mb-4 block break-all rounded border bg-[var(--surface-0)] px-2.5 py-2 text-xs">{data.setup.secret}</code>
					<form method="POST" action="?/enable" use:enhance>
						<label class="label" for="code">{t('twofactor.code')}</label>
						<div class="flex flex-wrap gap-2">
							<input
								class="input mono w-36 tracking-widest"
								id="code"
								name="code"
								inputmode="numeric"
								autocomplete="one-time-code"
								maxlength="7"
								required
							/>
							<button class="btn btn-primary" type="submit">{data.enabled ? t('twofactor.replaceConfirm') : t('twofactor.enable')}</button>
						</div>
					</form>
				</div>
			</div>
			<form method="POST" action="?/cancel" use:enhance class="mt-4">
				<button class="btn btn-ghost btn-sm" type="submit">{t('common.cancel')}</button>
			</form>
		</section>
	{:else if data.enabled}
		<section class="surface p-5">
			<h2 class="mb-1 flex items-center gap-2 text-sm font-semibold">
				<Icon name="shield" size={14} style="color: var(--ok)" /> {t('twofactor.on')}
			</h2>
			<p class="mb-4 text-xs text-[var(--text-secondary)]">
				{t('twofactor.codesLeft', { count: data.recoveryLeft })}
			</p>
			<form method="POST" action="?/recovery" use:enhance class="mb-5">
				<label class="label" for="recovery-password">{t('account.currentPassword')}</label>
				<div class="flex flex-wrap gap-2">
					<input class="input max-w-xs flex-1" id="recovery-password" name="password" type="password" autocomplete="current-password" required />
					<button class="btn" type="submit">{t('twofactor.regenerate')}</button>
				</div>
				<p class="hint">{t('twofactor.regenerateHint')}</p>
			</form>
			<form method="POST" action="?/replace" use:enhance class="mb-5">
				<label class="label" for="replace-password">{t('account.currentPassword')}</label>
				<div class="flex flex-wrap gap-2">
					<input class="input max-w-xs flex-1" id="replace-password" name="password" type="password" autocomplete="current-password" required />
					<button class="btn" type="submit">{t('twofactor.replace')}</button>
				</div>
				<p class="hint">{t('twofactor.replaceHint')}</p>
			</form>
			{#if data.locked}
				<p class="text-xs text-[var(--text-secondary)]">{t('twofactor.error.admin')}</p>
			{:else}
				<form method="POST" action="?/disable" use:enhance>
					<label class="label" for="disable-password">{t('account.currentPassword')}</label>
					<div class="flex flex-wrap gap-2">
						<input class="input max-w-xs flex-1" id="disable-password" name="password" type="password" autocomplete="current-password" required />
						<button class="btn btn-danger" type="submit">{t('twofactor.disable')}</button>
					</div>
				</form>
			{/if}
		</section>
	{:else}
		<section class="surface p-5">
			<h2 class="mb-1 text-sm font-semibold">{t('twofactor.off')}</h2>
			<p class="mb-4 text-xs text-[var(--text-secondary)]">{t('twofactor.offHint')}</p>
			<form method="POST" action="?/start" use:enhance>
				<button class="btn btn-primary" type="submit"><Icon name="shield" size={13} /> {t('twofactor.setUp')}</button>
			</form>
		</section>
	{/if}
</div>
