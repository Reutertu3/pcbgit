<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import CloneBox from '$lib/components/CloneBox.svelte';
	import StatGrid from '$lib/components/StatGrid.svelte';
	import { formatBytes, formatDate, formatDimensions, relativeTime, shortSha } from '$lib/format';

	let { data, form } = $props();

	const base = $derived(`/${data.project.owner_username}/${data.project.slug}`);
	const query = $derived(data.isHead ? '' : `?v=${data.commit?.sha}`);
	let side = $state<'front' | 'back'>('front');

	const preview = $derived(side === 'front' ? data.previews.front : data.previews.back);
	const stats = $derived([
		{ label: 'Board size', value: formatDimensions(data.commit?.board_width ?? null, data.commit?.board_height ?? null) },
		{ label: 'Copper layers', value: data.commit?.layer_count ?? null },
		{ label: 'Nets', value: data.commit?.net_count ?? null },
		{ label: 'Parts', value: data.commit?.part_count ?? null },
		{
			label: 'DRC errors',
			value: data.commit ? data.commit.drc_errors : null,
			tone: (data.commit?.drc_errors ? 'err' : 'ok') as 'err' | 'ok'
		},
		{
			label: 'ERC errors',
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
			<h2 class="mt-3 text-base font-semibold">This board has no versions yet</h2>
			<p class="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
				Push a KiCad project to the repository below, or
				<a href="{base}/settings" class="text-[var(--accent)] hover:underline">upload a ZIP</a>.
				Schematics, board layers, the 3D model, BOM and DRC are rendered on every push.
			</p>
			<div class="mt-5 text-left"><CloneBox url={data.cloneUrl} username={data.user?.username} /></div>
		</div>
	{:else}
		<div class="grid gap-5 lg:grid-cols-[1fr_20rem]">
			<div class="min-w-0">
				<!-- Board preview -->
				<div class="surface overflow-hidden">
					<div class="flex items-center justify-between border-b px-3 py-2">
						<h2 class="text-sm font-semibold">Board preview</h2>
						<div class="flex items-center gap-1">
							{#if data.previews.back}
								{#each ['front', 'back'] as option}
									<button
										class="rounded px-2 py-1 text-xs capitalize transition-colors"
										class:bg-s3={side === option}
										class:text-[var(--text-muted)]={side !== option}
										onclick={() => (side = option as 'front' | 'back')}
									>
										{option}
									</button>
								{/each}
							{/if}
							<a href="{base}/pcb{query}" class="btn btn-ghost btn-sm">
								Open viewer <Icon name="chevronRight" size={12} />
							</a>
						</div>
					</div>
					<div class="flex min-h-64 items-center justify-center bg-[var(--viewer-bg)] p-5">
						{#if preview}
							<img
								src={preview}
								alt="{side} side of {data.project.name}"
								class="max-h-[26rem] w-auto max-w-full"
							/>
						{:else if data.commit.render_status === 'failed'}
							<div class="flex flex-col items-center gap-2 py-10 text-center">
								<Icon name="alert" size={24} style="color: var(--err)" />
								<p class="text-sm" style:color="var(--err)">This version failed to render.</p>
								<a href="{base}/history" class="btn btn-sm">See the render log</a>
							</div>
						{:else if data.commit.render_status !== 'success'}
							<div class="flex flex-col items-center gap-2 py-10 text-center">
								<StatusDot status={data.commit.render_status} label />
								<p class="text-xs text-[var(--text-muted)]">Previews appear when the render finishes.</p>
							</div>
						{:else}
							<p class="py-10 text-sm text-[var(--text-muted)]">No board file in this version.</p>
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

				<!-- Discussion -->
				<section class="surface mt-4 p-5">
					<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
						<Icon name="message" size={14} /> Discussion
						{#if data.comments.length}<span class="chip">{data.comments.length}</span>{/if}
					</h2>

					{#if data.comments.length === 0}
						<p class="text-sm text-[var(--text-muted)]">No comments yet.</p>
					{:else}
						<ul class="flex flex-col gap-3">
							{#each data.comments as comment (comment.id)}
								<li class="flex gap-2.5">
									<Avatar name={comment.display_name || comment.username} size={28} />
									<div class="min-w-0 flex-1">
										<div class="flex items-baseline gap-2">
											<a href="/{comment.username}" class="text-sm font-medium hover:text-[var(--accent)]">
												{comment.username}
											</a>
											<span class="text-[0.6875rem] text-[var(--text-muted)]">
												{relativeTime(comment.created_at)}
											</span>
											{#if data.user && (data.user.id === data.project.owner_id || data.user.role === 'admin' || data.user.username === comment.username)}
												<form method="POST" action="?/deleteComment" use:enhance class="ml-auto">
													<input type="hidden" name="id" value={comment.id} />
													<button class="btn btn-ghost btn-sm !px-1" title="Delete comment">
														<Icon name="trash" size={11} />
													</button>
												</form>
											{/if}
										</div>
										<p class="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
											{comment.body}
										</p>
									</div>
								</li>
							{/each}
						</ul>
					{/if}

					{#if data.user}
						<form method="POST" action="?/comment" use:enhance class="mt-4 border-t pt-4">
							{#if form?.error}<p class="mb-2 text-xs" style:color="var(--err)">{form.error}</p>{/if}
							<textarea
								class="textarea !min-h-20"
								name="body"
								placeholder="Ask about a design choice, or leave a review note…"
								maxlength="4000"
							></textarea>
							<button class="btn btn-primary btn-sm mt-2" type="submit">Post comment</button>
						</form>
					{:else}
						<p class="mt-4 border-t pt-4 text-sm text-[var(--text-muted)]">
							<a href="/login" class="text-[var(--accent)] hover:underline">Sign in</a> to join the discussion.
						</p>
					{/if}
				</section>
			</div>

			<!-- Sidebar -->
			<aside class="flex flex-col gap-4">
				<CloneBox url={data.cloneUrl} username={data.user?.username} />

				<div class="surface p-4">
					<h3 class="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						This version
					</h3>
					<dl class="flex flex-col gap-2 text-xs">
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">Commit</dt>
							<dd class="mono">{shortSha(data.commit.sha)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">Author</dt>
							<dd class="truncate">{data.commit.author_name || '—'}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">Committed</dt>
							<dd>{formatDate(data.commit.committed_at)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">Files</dt>
							<dd>{data.fileCount}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-[var(--text-muted)]">Artifacts</dt>
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
					<h3 class="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						Downloads
					</h3>
					<div class="flex flex-col gap-1.5">
						{#if data.tabs.bom}
							<a href="{base}/bom/download{query}" class="btn btn-sm justify-start">
								<Icon name="download" size={13} /> Bill of materials (CSV)
							</a>
						{/if}
						{#if data.hasFab}
							<a href="/artifacts/{data.commit.id}/fabrication.zip" class="btn btn-sm justify-start">
								<Icon name="download" size={13} /> Gerbers + drill (ZIP)
							</a>
						{/if}
						{#if data.tabs.three}
							<a href="/artifacts/{data.commit.id}/board.glb" class="btn btn-sm justify-start">
								<Icon name="download" size={13} /> 3D model (GLB)
							</a>
						{/if}
						<a href="{base}/archive/{data.commit.sha}.zip" class="btn btn-sm justify-start">
							<Icon name="download" size={13} /> Source files (ZIP)
						</a>
					</div>
				</div>

				{#if data.project.source_url}
					<a href={data.project.source_url} class="btn btn-sm justify-start" rel="nofollow noopener" target="_blank">
						<Icon name="external" size={13} /> Upstream repository
					</a>
				{/if}

				<div class="surface p-4">
					<h3 class="mb-2.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						Recent versions
						<a href="{base}/history" class="font-normal normal-case hover:text-[var(--accent)]">All</a>
					</h3>
					<ul class="flex flex-col gap-2">
						{#each data.recentCommits as commit}
							<li>
								<a href="{base}?v={commit.sha}" class="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-s2">
									<StatusDot status={commit.render_status} />
									<span class="min-w-0 flex-1">
										<span class="block truncate text-xs">{commit.message || '(no message)'}</span>
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
