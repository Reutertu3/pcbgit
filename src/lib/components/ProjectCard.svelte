<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import { formatCount, formatDimensions, relativeTime } from '$lib/format';
	import type { ProjectSummary } from '$lib/types';

	interface Props {
		project: ProjectSummary;
	}
	let { project }: Props = $props();

	const href = $derived(`/${project.owner_username}/${project.slug}`);
	const dimensions = $derived(formatDimensions(project.board_width, project.board_height));
	const previewSrc = $derived(
		project.head_commit_id ? `/artifacts/${project.head_commit_id}/preview-front.svg` : null
	);
	const schematicSrc = $derived(
		project.head_commit_id ? `/artifacts/${project.head_commit_id}/sheet-0.svg` : null
	);
</script>

<article
	class="surface group flex flex-col overflow-hidden transition-colors hover:border-[var(--border-strong)]"
>
	<a {href} class="relative block" aria-label={project.name}>
		<div class="grid h-40 grid-cols-2 gap-px bg-[var(--border-subtle)]">
			<!-- Schematic and board previews sit side by side, the way you compare them on a bench. -->
			<figure class="relative m-0 overflow-hidden bg-[var(--viewer-bg)]">
				{#if project.has_schematic && schematicSrc}
					<img
						src={schematicSrc}
						alt="Schematic preview of {project.name}"
						class="h-full w-full object-contain p-2 opacity-90 transition-transform duration-300 group-hover:scale-[1.04]"
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<div class="traces flex h-full items-center justify-center text-[var(--text-muted)]">
						<Icon name="schematic" size={22} />
					</div>
				{/if}
				<figcaption
					class="mono absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[0.625rem] text-white/80"
				>
					SCH
				</figcaption>
			</figure>

			<figure class="relative m-0 overflow-hidden bg-[var(--viewer-bg)]">
				{#if project.has_pcb && previewSrc}
					<img
						src={previewSrc}
						alt="Board preview of {project.name}"
						class="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.04]"
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<div class="traces flex h-full items-center justify-center text-[var(--text-muted)]">
						<Icon name="board" size={22} />
					</div>
				{/if}
				<figcaption
					class="mono absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[0.625rem] text-white/80"
				>
					PCB
				</figcaption>
			</figure>
		</div>

		{#if project.visibility === 'private'}
			<span class="chip absolute right-1.5 top-1.5 !bg-black/60 !text-white/85">
				<Icon name="lock" size={10} /> Private
			</span>
		{/if}
	</a>

	<div class="flex flex-1 flex-col gap-2 p-3">
		<div class="flex items-start justify-between gap-2">
			<h3 class="min-w-0 text-[0.9375rem] font-semibold leading-tight">
				<a {href} class="hover:text-[var(--accent)]">{project.name}</a>
			</h3>
			<StatusDot status={project.head_status} />
		</div>

		<a
			href="/{project.owner_username}"
			class="flex w-fit items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
		>
			<Avatar name={project.owner_display_name || project.owner_username} size={16} />
			{project.owner_username}
		</a>

		{#if project.description}
			<p class="truncate-2 text-xs leading-relaxed text-[var(--text-secondary)]">
				{project.description}
			</p>
		{/if}

		{#if project.tags.length}
			<div class="flex flex-wrap gap-1">
				{#each project.tags.slice(0, 4) as tag}
					<a href="/?tag={tag.slug}" class="chip hover:border-[var(--border-strong)]">{tag.name}</a>
				{/each}
				{#if project.tags.length > 4}
					<span class="chip">+{project.tags.length - 4}</span>
				{/if}
			</div>
		{/if}

		<div class="flex-1"></div>

		<!-- What this board actually ships: the four things you came to look at. -->
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-[var(--text-muted)]">
			{#if dimensions}<span class="flex items-center gap-1"><Icon name="ruler" size={11} />{dimensions}</span>{/if}
			{#if project.layer_count}<span class="flex items-center gap-1"><Icon name="layers" size={11} />{project.layer_count}L</span>{/if}
			{#if project.part_count}<span class="flex items-center gap-1"><Icon name="chip" size={11} />{project.part_count} parts</span>{/if}
			{#if project.drc_errors > 0}
				<span class="flex items-center gap-1" style:color="var(--err)">
					<Icon name="alert" size={11} />{project.drc_errors} DRC
				</span>
			{/if}
		</div>

		<div class="flex items-center justify-between border-t pt-2 text-[0.6875rem] text-[var(--text-muted)]">
			<div class="flex items-center gap-3">
				<span class="flex items-center gap-1" title="{project.star_count} stars">
					<Icon name="star" size={11} />{formatCount(project.star_count)}
				</span>
				<span class="flex items-center gap-1" title="{project.commit_count} versions">
					<Icon name="history" size={11} />{formatCount(project.commit_count)}
				</span>
				{#if project.comment_count}
					<span class="flex items-center gap-1"><Icon name="message" size={11} />{project.comment_count}</span>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if project.license}<span class="chip !px-1.5 !py-0 !text-[0.625rem]">{project.license}</span>{/if}
				<span>{relativeTime(project.updated_at)}</span>
			</div>
		</div>
	</div>
</article>
