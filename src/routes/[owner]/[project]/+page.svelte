<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import CloneBox from '$lib/components/CloneBox.svelte';
	import StatGrid from '$lib/components/StatGrid.svelte';
	import { formatBytes, formatDate, formatDimensions, relativeTime, shortSha } from '$lib/format';
	import type { CommentView } from '$lib/types';
	import { t, tParts } from '$lib/i18n/t';
	import { DEFAULT_FAB, fabProfile } from '$lib/fab';
	import LicenseSummary from '$lib/components/LicenseSummary.svelte';
	import { licenseName } from '$lib/licenses';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	/** Thread the reply box is open under; one at a time. */
	let replyingTo = $state<string | null>(null);
	let replyText = $state('');

	/** Replying to a reply stays in the same thread and addresses its author. */
	function startReply(threadId: string, mention: string | null) {
		replyingTo = threadId;
		replyText = mention ? `@${mention} ` : '';
	}

	/** Splits text into plain parts and @mentions, rendered as profile links. */
	function withMentions(text: string) {
		return text.split(/(@[A-Za-z0-9-]{3,32})/g).map((part) =>
			part.startsWith('@') && /^@[A-Za-z0-9-]{3,32}$/.test(part)
				? { text: part, mention: part.slice(1) }
				: { text: part, mention: null }
		);
	}

	const base = $derived(`/${data.project.owner_username}/${data.project.slug}`);
	const query = $derived(data.isHead ? '' : `?v=${data.commit?.sha}`);
	let side = $state<'front' | 'back'>('front');

	/* ---- fabrication ZIP: one per board house, the visitor's last pick remembered ---- */
	const FAB_KEY = 'pcbgit-fab';
	let fab = $state(DEFAULT_FAB);
	onMount(() => {
		try {
			fab = localStorage.getItem(FAB_KEY) ?? fab;
		} catch {
			// Storage blocked: the default board house it is.
		}
	});
	function pickFab(id: string) {
		fab = id;
		try {
			localStorage.setItem(FAB_KEY, id);
		} catch {
			// Remembering is a convenience only.
		}
	}
	const fabZip = $derived(data.fabZips.find((zip) => zip.profile === fab) ?? data.fabZips[0]);

	const preview = $derived(side === 'front' ? data.previews.front : data.previews.back);
	const stats = $derived([
		{ label: t('overview.boardSize'), value: formatDimensions(data.commit?.board_width ?? null, data.commit?.board_height ?? null) },
		{ label: t('overview.copperLayers'), value: data.commit?.layer_count ?? null },
		{ label: t('overview.nets'), value: data.commit?.net_count ?? null },
		{ label: t('overview.parts'), value: data.commit?.part_count ?? null },
		{
			label: t('overview.drcErrors'),
			value: data.commit ? data.commit.drc_errors : null,
			tone: (data.commit?.drc_errors ? 'err' : 'ok') as 'err' | 'ok'
		},
		{
			label: t('overview.ercErrors'),
			value: data.commit ? data.commit.erc_errors : null,
			tone: (data.commit?.erc_errors ? 'err' : 'ok') as 'err' | 'ok'
		}
	]);
</script>

<svelte:head>
	<title>{data.project.name} · {data.project.owner_username} · {data.site.name}</title>
	<meta name="description" content={data.project.description || data.project.name} />
</svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-6">
	{#if !data.commit}
		<!-- Empty repository: the only thing worth showing is how to fill it. -->
		<div class="surface traces mx-auto max-w-2xl p-8 text-center">
			<Icon name="git" size={28} class="mx-auto text-[var(--text-muted)]" />
			<h2 class="mt-3 text-base font-semibold">{t('overview.noVersionsTitle')}</h2>
			<p class="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
				{#each tParts('overview.noVersions') as part}
					{#if typeof part === 'string'}{part}{:else}<a href="{base}/settings" class="text-[var(--accent)] hover:underline">{t('overview.uploadZip')}</a>{/if}
				{/each}
			</p>
			<div class="mt-5 text-left"><CloneBox url={data.cloneUrl} username={data.user?.username} /></div>
		</div>
	{:else}
		<div class="grid gap-5 lg:grid-cols-[1fr_20rem]">
			<div class="min-w-0">
				<!-- Board preview -->
				<div class="surface overflow-hidden">
					<div class="flex items-center justify-between border-b px-3 py-2">
						<h2 class="text-sm font-semibold">{t('overview.preview')}</h2>
						<div class="flex items-center gap-1">
							{#if data.previews.back}
								{#each ['front', 'back'] as option}
									<button
										class="rounded px-2 py-1 text-xs transition-colors"
										class:bg-s3={side === option}
										class:text-[var(--text-muted)]={side !== option}
										onclick={() => (side = option as 'front' | 'back')}
									>
										{t(option === 'front' ? 'common.front' : 'common.back')}
									</button>
								{/each}
							{/if}
							<a href="{base}/pcb{query}" class="btn btn-ghost btn-sm">
								{t('overview.openViewer')} <Icon name="chevronRight" size={12} />
							</a>
						</div>
					</div>
					<div class="flex min-h-64 items-center justify-center bg-[var(--preview-bg)] p-5">
						{#if preview}
							<img
								src={preview}
								alt={t(side === 'front' ? 'overview.frontAlt' : 'overview.backAlt', { name: data.project.name })}
								class="max-h-[26rem] w-auto max-w-full"
							/>
						{:else if data.commit.render_status === 'failed'}
							<div class="flex flex-col items-center gap-2 py-10 text-center">
								<Icon name="alert" size={24} style="color: var(--err)" />
								<p class="text-sm" style:color="var(--err)">{t('overview.failed')}</p>
								<a href="{base}/history" class="btn btn-sm">{t('overview.seeLog')}</a>
							</div>
						{:else if data.commit.render_status !== 'success'}
							<div class="flex flex-col items-center gap-2 py-10 text-center">
								<StatusDot status={data.commit.render_status} label />
								<p class="text-xs text-[var(--text-muted)]">{t('overview.previewsPending')}</p>
							</div>
						{:else}
							<p class="py-10 text-sm text-[var(--text-muted)]">{t('overview.noBoard')}</p>
						{/if}
					</div>
				</div>

				<div class="mt-4"><StatGrid {stats} /></div>

				{#if data.readme}
					<article class="surface prose-pcb mt-4 p-5">
						<div class="mb-3 flex items-center gap-1.5 border-b pb-2 text-xs text-[var(--text-muted)]">
							<Icon name="file" size={13} />
							<span class="mono">{data.readme.name}</span>
						</div>
						{@html data.readme.html}
					</article>
				{/if}

				<!-- Discussion: top-level comments with one level of replies. -->
				<section class="surface mt-4 p-5">
					<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
						<Icon name="message" size={14} /> {t('comments.title')}
						{#if data.commentCount}<span class="chip">{data.commentCount}</span>{/if}
					</h2>

					{#snippet comment(item: CommentView, threadId: string, isReply: boolean)}
						<div id="comment-{item.id}" class="comment flex gap-2.5 rounded-md">
							{#if item.deleted}
								<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-s3">
									<Icon name="trash" size={11} class="text-[var(--text-muted)]" />
								</div>
								<p class="py-1 text-sm italic text-[var(--text-muted)]">{t('comments.deleted')}</p>
							{:else}
								<Avatar name={item.display_name || item.username} size={isReply ? 24 : 28} />
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-baseline gap-x-2">
										<a href="/{item.username}" class="text-sm font-medium hover:text-[var(--accent)]">{item.username}</a>
										<!-- The timestamp is the comment's permalink. -->
										<a href="#comment-{item.id}" class="text-[0.6875rem] text-[var(--text-muted)] hover:underline" title={new Date(item.created_at).toLocaleString()}>
											{relativeTime(item.created_at)}
										</a>
									</div>
									<p class="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-secondary)]">
										{#each withMentions(item.body) as part}
											{#if part.mention}<a href="/{part.mention}" class="text-[var(--accent)] hover:underline">{part.text}</a>{:else}{part.text}{/if}
										{/each}
									</p>
									<div class="mt-1 flex items-center gap-3 text-[0.6875rem]">
										{#if data.user}
											<button class="text-[var(--text-muted)] hover:text-[var(--accent)]" onclick={() => startReply(threadId, isReply ? item.username : null)}>
												{t('comments.reply')}
											</button>
										{/if}
										{#if data.user && (data.user.role === 'admin' || data.user.id === item.user_id)}
											<form
												method="POST"
												action="?/deleteComment"
												use:enhance={({ cancel }) => {
													if (!confirm(t('comments.confirmDelete'))) cancel();
												}}
											>
												<input type="hidden" name="id" value={item.id} />
												<button class="text-[var(--text-muted)] hover:text-[var(--err)]">{t('common.delete')}</button>
											</form>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					{/snippet}

					{#if data.threads.length === 0}
						<p class="text-sm text-[var(--text-muted)]">{t('comments.none')}</p>
					{:else}
						<ul class="flex flex-col gap-4">
							{#each data.threads as thread (thread.id)}
								<li>
									{@render comment(thread, thread.id, false)}

									{#if thread.replies.length || replyingTo === thread.id}
										<ul class="ml-3.5 mt-2 flex flex-col gap-2.5 border-l pl-5">
											{#each thread.replies as reply (reply.id)}
												<li>{@render comment(reply, thread.id, true)}</li>
											{/each}

											{#if replyingTo === thread.id}
												<li>
													<form
														method="POST"
														action="?/comment"
														use:enhance={() => async ({ result, update }) => {
															await update({ reset: false });
															if (result.type === 'success') {
																replyingTo = null;
																replyText = '';
															}
														}}
													>
														<input type="hidden" name="parent_id" value={thread.id} />
														{#if form?.error && form.parentId === thread.id}
															<p class="mb-2 text-xs" style:color="var(--err)">{form.error}</p>
														{/if}
														<!-- svelte-ignore a11y_autofocus -->
														<textarea
															class="textarea !min-h-16 text-sm"
															name="body"
															bind:value={replyText}
															placeholder={t('comments.replyPlaceholder')}
															maxlength="4000"
															autofocus
														></textarea>
														<div class="mt-2 flex gap-2">
															<button class="btn btn-primary btn-sm" type="submit">{t('comments.reply')}</button>
															<button class="btn btn-ghost btn-sm" type="button" onclick={() => (replyingTo = null)}>{t('common.cancel')}</button>
														</div>
													</form>
												</li>
											{/if}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if data.user}
						<form method="POST" action="?/comment" use:enhance class="mt-4 border-t pt-4">
							{#if form?.error && !form.parentId}<p class="mb-2 text-xs" style:color="var(--err)">{form.error}</p>{/if}
							<textarea
								class="textarea !min-h-20"
								name="body"
								placeholder={t('comments.placeholder')}
								maxlength="4000"
							></textarea>
							<button class="btn btn-primary btn-sm mt-2" type="submit">{t('comments.post')}</button>
						</form>
					{:else}
						<p class="mt-4 border-t pt-4 text-sm text-[var(--text-muted)]">
							{#each tParts('comments.signIn') as part}
								{#if typeof part === 'string'}{part}{:else}<a href="/login" class="text-[var(--accent)] hover:underline">{t('nav.signIn')}</a>{/if}
							{/each}
						</p>
					{/if}
				</section>
			</div>

			<!-- Sidebar -->
			<aside class="flex flex-col gap-4">
				<CloneBox url={data.cloneUrl} username={data.user?.username} />

				<div class="surface p-4">
					<h3 class="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						{t('overview.thisVersion')}
					</h3>
					<dl class="flex flex-col gap-2 text-xs">
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">{t('overview.commit')}</dt>
							<dd class="mono">{shortSha(data.commit.sha)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">{t('overview.author')}</dt>
							<dd class="truncate">{data.commit.author_name || '—'}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">{t('overview.committed')}</dt>
							<dd>{formatDate(data.commit.committed_at)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">{t('tabs.files')}</dt>
							<dd>{data.fileCount}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">{t('overview.artifacts')}</dt>
							<dd>{formatBytes(data.artifactBytes)}</dd>
						</div>
					</dl>
					{#if data.commit.message}
						<p class="mt-3 border-t pt-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
							{data.commit.message}
						</p>
					{/if}
				</div>

				<div class="surface p-4">
					<h3 class="mb-2.5 flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						{t('overview.license')}
						<span class="normal-case tracking-normal text-[var(--text-primary)]">
							{data.project.license ? licenseName(data.project.license, t('license.proprietary')) : t('boardForm.noLicense')}
						</span>
					</h3>
					<LicenseSummary license={data.project.license} />
				</div>

				<div class="surface p-4">
					<h3 class="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						{t('overview.downloads')}
					</h3>
					<div class="flex flex-col gap-1.5">
						{#if data.tabs.bom}
							<a href="{base}/bom/download{query}" class="btn btn-sm justify-start">
								<Icon name="download" size={13} /> {t('overview.dlBom')}
							</a>
						{/if}
						{#if data.schematicPdf}
							<a
								href={data.schematicPdf}
								download="{data.project.slug}-{shortSha(data.commit.sha)}-schematic.pdf"
								class="btn btn-sm justify-start"
							>
								<Icon name="download" size={13} /> {t('overview.dlSchematicPdf')}
							</a>
						{/if}
						{#if data.tabs.three}
							<a href="/artifacts/{data.commit.id}/board.glb" class="btn btn-sm justify-start">
								<Icon name="download" size={13} /> {t('overview.dlGlb')}
							</a>
						{/if}
						<a href="{base}/archive/{data.commit.sha}.zip" class="btn btn-sm justify-start">
							<Icon name="download" size={13} /> {t('overview.dlSource')}
						</a>
					</div>
				</div>

				{#if fabZip}
					<div class="surface p-4">
						<h3 class="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							{t('overview.gerbers')}
						</h3>
						<div class="flex flex-col gap-1.5">
							<!-- Renders before board-house profiles have one generic ZIP: no choice to offer. -->
							{#if data.fabZips.some((zip) => fabProfile(zip.profile))}
								<select
									class="select !py-1 text-xs"
									value={fabZip.profile}
									onchange={(event) => pickFab(event.currentTarget.value)}
									aria-label={t('overview.fabFor')}
									title={t('overview.fabFor')}
								>
									{#each data.fabZips as zip (zip.profile)}
										{@const profile = fabProfile(zip.profile)}
										{#if profile}<option value={zip.profile}>{t(profile.labelKey)}</option>{/if}
									{/each}
								</select>
							{/if}
							<a
								href={fabZip.url}
								download="{data.project.slug}-{shortSha(data.commit.sha)}-gerbers{fabProfile(fabZip.profile) ? `-${fabZip.profile}` : ''}.zip"
								class="btn btn-sm justify-start"
							>
								<Icon name="download" size={13} /> {t('overview.dlFab')}
							</a>
						</div>
					</div>
				{/if}

				{#if data.project.source_url}
					<a href={data.project.source_url} class="btn btn-sm justify-start" rel="nofollow noopener" target="_blank">
						<Icon name="external" size={13} /> {t('overview.upstream')}
					</a>
				{/if}

				<div class="surface p-4">
					<h3 class="mb-2.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						{t('overview.recent')}
						<a href="{base}/history" class="font-normal normal-case hover:text-[var(--accent)]">{t('common.all')}</a>
					</h3>
					<ul class="flex flex-col gap-2">
						{#each data.recentCommits as commit}
							<li>
								<a href="{base}?v={commit.sha}" class="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-s2">
									<StatusDot status={commit.render_status} />
									<span class="min-w-0 flex-1">
										<span class="block truncate text-xs">{commit.message || t('versions.noMessage')}</span>
										<span class="mono block text-[0.6875rem] text-[var(--text-muted)]">
											{shortSha(commit.sha)} · {relativeTime(commit.committed_at)}
										</span>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			</aside>
		</div>
	{/if}
</div>

<style>
	.comment:target {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
	/* Scoped README typography: markdown output is trusted-but-plain HTML. */
	:global(.prose-pcb) {
		font-size: 0.875rem;
		line-height: 1.7;
		color: var(--text-secondary);
	}
	:global(.prose-pcb h1),
	:global(.prose-pcb h2),
	:global(.prose-pcb h3),
	:global(.prose-pcb h4) {
		color: var(--text-primary);
		font-weight: 600;
		line-height: 1.3;
		margin: 1.4em 0 0.5em;
	}
	:global(.prose-pcb h1) {
		font-size: 1.4em;
		border-bottom: 1px solid var(--border-subtle);
		padding-bottom: 0.3em;
	}
	:global(.prose-pcb h2) {
		font-size: 1.2em;
		border-bottom: 1px solid var(--border-subtle);
		padding-bottom: 0.25em;
	}
	:global(.prose-pcb h3) {
		font-size: 1.05em;
	}
	:global(.prose-pcb > :first-child) {
		margin-top: 0;
	}
	:global(.prose-pcb p),
	:global(.prose-pcb ul),
	:global(.prose-pcb ol),
	:global(.prose-pcb blockquote),
	:global(.prose-pcb table) {
		margin: 0.75em 0;
	}
	:global(.prose-pcb ul),
	:global(.prose-pcb ol) {
		padding-left: 1.4em;
	}
	:global(.prose-pcb ul) {
		list-style: disc;
	}
	:global(.prose-pcb ol) {
		list-style: decimal;
	}
	:global(.prose-pcb li) {
		margin: 0.2em 0;
	}
	:global(.prose-pcb a) {
		color: var(--accent);
	}
	:global(.prose-pcb a:hover) {
		text-decoration: underline;
	}
	:global(.prose-pcb code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--surface-2);
		padding: 0.15em 0.35em;
		border-radius: 0.25rem;
	}
	:global(.prose-pcb pre) {
		background: var(--surface-0);
		border: 1px solid var(--border-subtle);
		border-radius: 0.45rem;
		padding: 0.8em 1em;
		overflow-x: auto;
		margin: 0.9em 0;
	}
	:global(.prose-pcb pre code) {
		background: none;
		padding: 0;
		font-size: 0.8125rem;
		line-height: 1.6;
	}
	:global(.prose-pcb blockquote) {
		border-left: 3px solid var(--border-strong);
		padding-left: 1em;
		color: var(--text-muted);
	}
	:global(.prose-pcb table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}
	:global(.prose-pcb th),
	:global(.prose-pcb td) {
		border: 1px solid var(--border-subtle);
		padding: 0.4em 0.7em;
		text-align: left;
	}
	:global(.prose-pcb th) {
		background: var(--surface-2);
		color: var(--text-primary);
		font-weight: 600;
	}
	:global(.prose-pcb img) {
		max-width: 100%;
		border-radius: 0.4rem;
	}
	:global(.prose-pcb hr) {
		border: none;
		border-top: 1px solid var(--border-subtle);
		margin: 1.5em 0;
	}
</style>
