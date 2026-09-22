<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatBytes, relativeTime } from '$lib/format';
	import { t, tParts } from '$lib/i18n/t';

	let { data, form } = $props();

	let confirmDelete = $state<string | null>(null);
	let confirmText = $state('');
</script>

<svelte:head><title>{t('admin.nav.boards')} · {t('admin.title')} · {data.site.name}</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
	<h2 class="text-lg font-semibold tracking-tight">{t('admin.nav.boards')}</h2>
	<div class="flex gap-2">
		<form method="GET">
			<input class="input !w-48 !py-1.5 text-[0.8125rem]" type="search" name="q" value={data.search} placeholder={t('nav.search')} />
		</form>
		<form method="POST" action="?/rerenderFailed" use:enhance>
			<button class="btn btn-sm" type="submit" title={t('adminBoards.retryFailedTitle')}>
				<Icon name="refresh" size={13} /> {t('adminBoards.retryFailed')}
			</button>
		</form>
	</div>
</div>

{#if form?.message}<FormError message={form.message} kind="success" />{/if}
{#if form?.error}<FormError message={form.error} />{/if}

<div class="surface overflow-x-auto">
	<table class="w-full text-left text-[0.8125rem]">
		<thead class="bg-s2 text-xs">
			<tr>
				<th class="px-3 py-2 font-semibold">{t('adminBoards.board')}</th>
				<th class="px-3 py-2 font-semibold">{t('boardForm.visibility')}</th>
				<th class="px-3 py-2 font-semibold">{t('admin.card.versions')}</th>
				<th class="px-3 py-2 font-semibold">{t('adminBoards.stars')}</th>
				<th class="px-3 py-2 font-semibold">{t('overview.artifacts')}</th>
				<th class="px-3 py-2 font-semibold">{t('adminBoards.updated')}</th>
				<th class="px-3 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each data.projects as project (project.id)}
				<tr class="border-t">
					<td class="px-3 py-2">
						<div class="flex items-center gap-2">
							<StatusDot status={project.head_status} />
							<a href="/{project.owner_username}/{project.slug}" class="mono truncate hover:text-[var(--accent)]">
								{project.owner_username}/{project.slug}
							</a>
						</div>
					</td>
					<td class="px-3 py-2">
						<form method="POST" action="?/setVisibility" use:enhance>
							<input type="hidden" name="id" value={project.id} />
							<select
								class="select !w-auto !py-1 text-xs"
								name="visibility"
								value={project.visibility}
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							>
								<option value="public">{t('common.public')}</option>
								<option value="private">{t('common.private')}</option>
							</select>
						</form>
					</td>
					<td class="px-3 py-2 tabular-nums">{project.commit_count}</td>
					<td class="px-3 py-2 tabular-nums">{project.star_count}</td>
					<td class="px-3 py-2 text-xs text-[var(--text-muted)]">{formatBytes(project.artifact_bytes)}</td>
					<td class="px-3 py-2 text-xs text-[var(--text-muted)]">{relativeTime(project.updated_at)}</td>
					<td class="px-3 py-2">
						<div class="flex justify-end gap-1">
							<form method="POST" action="?/resync" use:enhance>
								<input type="hidden" name="id" value={project.id} />
								<button class="btn btn-sm" type="submit" title={t('adminBoards.resync')}>
									<Icon name="git" size={12} />
								</button>
							</form>
							<form method="POST" action="?/rerender" use:enhance>
								<input type="hidden" name="id" value={project.id} />
								<button class="btn btn-sm" type="submit" title={t('adminBoards.rerender')}>
									<Icon name="refresh" size={12} />
								</button>
							</form>
							<button
								class="btn btn-danger btn-sm"
								onclick={() => {
									confirmDelete = confirmDelete === project.id ? null : project.id;
									confirmText = '';
								}}
								title={t('boardForm.delete')}
							>
								<Icon name="trash" size={12} />
							</button>
						</div>
					</td>
				</tr>

				{#if confirmDelete === project.id}
					<tr class="border-t" style:background="color-mix(in srgb, var(--err) 8%, transparent)">
						<td colspan="7" class="px-3 py-2.5">
							<form method="POST" action="?/delete" use:enhance={() => async ({ update }) => {
								await update();
								confirmDelete = null;
							}} class="flex flex-wrap items-center gap-2">
								<input type="hidden" name="id" value={project.id} />
								<span class="text-xs">
									{#each tParts('adminBoards.deleteConfirm') as part}{#if typeof part === 'string'}{part}{:else}<span class="mono font-semibold">{project.slug}</span>{/if}{/each}
								</span>
								<input class="input mono !w-40 !py-1" name="confirm" bind:value={confirmText} autocomplete="off" />
								<button class="btn btn-danger btn-sm" type="submit" disabled={confirmText !== project.slug}>
									{t('users.deletePermanently')}
								</button>
								<button class="btn btn-ghost btn-sm" type="button" onclick={() => (confirmDelete = null)}>{t('common.cancel')}</button>
							</form>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
	{#if !data.projects.length}
		<p class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">{t('adminBoards.noMatch')}</p>
	{/if}
</div>
