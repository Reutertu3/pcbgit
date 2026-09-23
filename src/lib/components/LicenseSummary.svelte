<script lang="ts">
	import { licenseInfo, licenseUrl } from '$lib/licenses';
	import { t } from '$lib/i18n/t';

	interface Props {
		/** The stored license id; empty when none was chosen. */
		license: string;
	}
	let { license }: Props = $props();

	const info = $derived(licenseInfo(license));
	const url = $derived(license ? licenseUrl(license) : undefined);
	/** No license and "All rights reserved" mean the same thing legally. */
	const reserved = $derived(!license || (info !== undefined && info.commercial === undefined));

	const SHARING = {
		strong: 'license.sharingStrong',
		same: 'license.sharingSame',
		design: 'license.sharingDesign',
		none: 'license.sharingNone'
	} as const;
</script>

<div class="flex flex-col gap-2 text-xs">
	{#if reserved}
		<p class="text-[var(--text-secondary)]">{t('license.reserved')}</p>
	{:else if info}
		<dl class="flex flex-col gap-1.5">
			<div class="flex justify-between gap-3">
				<dt class="text-[var(--text-muted)]">{t('license.commercial')}</dt>
				<dd class="text-right" style:color={info.commercial ? undefined : 'var(--warn)'}>
					{info.commercial ? t('license.allowed') : t('license.notAllowed')}
				</dd>
			</div>
			<div class="flex justify-between gap-3">
				<dt class="shrink-0 text-[var(--text-muted)]">{t('license.sharing')}</dt>
				<dd class="text-right">{t(SHARING[info.sharing ?? 'none'])}</dd>
			</div>
			<div class="flex justify-between gap-3">
				<dt class="text-[var(--text-muted)]">{t('license.attribution')}</dt>
				<dd class="text-right">{t('license.required')}</dd>
			</div>
		</dl>
	{:else}
		<p class="text-[var(--text-secondary)]">{t('license.noSummary')}</p>
	{/if}
	{#if url || !reserved}
		<p class="text-[0.6875rem] text-[var(--text-muted)]">
			{#if !reserved}{t('license.disclaimer')}{/if}
			{#if url}
				<a href={url} target="_blank" rel="noopener" class="hover:text-[var(--accent)]">{t('license.fullText')} ↗</a>
			{/if}
		</p>
	{/if}
</div>
