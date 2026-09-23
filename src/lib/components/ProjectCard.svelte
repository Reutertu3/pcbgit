<script lang="ts">
	import { t } from '$lib/i18n/t';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { formatCount, formatDimensions, relativeTime } from '$lib/format';
	import type { ProjectSummary } from '$lib/types';

	interface Props {
		project: ProjectSummary;
	}
	let { project }: Props = $props();

	const href = $derived(`/${project.owner_username}/${project.slug}`);
	const dimensions = $derived(formatDimensions(project.board_width, project.board_height));
	const previewSrc = $derived(
		project.head_commit_id ? `/artifacts/${project.head_commit_id}/thumb/preview-front` : null
	);
	const schematicSrc = $derived(
		project.head_commit_id ? `/artifacts/${project.head_commit_id}/thumb/sheet-0` : null
	);
</script>

<!--
	The whole card opens the board: the title link stretches over it (after:inset-0).
	Links that go somewhere else sit above that overlay (z-10): the two previews open
	their own tab, the owner and tags their own pages.
-->
<article
	class="surface board-card group relative flex flex-col overflow-hidden"
>
	<div class="relative">
		<div class="grid h-40 grid-cols-2 gap-px bg-[var(--border-subtle)]">
			<!-- Schematic and board previews sit side by side, the way you compare them on a bench. -->
			<svelte:element
				this={project.has_schematic && schematicSrc ? 'a' : 'div'}
				href={project.has_schematic && schematicSrc ? `${href}/schematic` : undefined}
				class="relative m-0 block overflow-hidden bg-[var(--preview-bg)]"
				class:board-card-preview={project.has_schematic && schematicSrc}
				class:z-10={project.has_schematic && schematicSrc}
			>
				{#if project.has_schematic && schematicSrc}
					<img
						src={schematicSrc}
						alt={t('card.schematicAlt', { name: project.name })}
						class="h-full w-full object-contain p-2 opacity-90 transition-transform duration-[1600ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] group-hover:duration-300"
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<div class="traces flex h-full items-center justify-center text-[var(--text-muted)]">
						<Icon name="schematic" size={22} />
					</div>
				{/if}
				<span
					class="board-card-label mono absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[0.625rem]"
				>
					SCH
				</span>
			</svelte:element>

			<svelte:element
				this={project.has_pcb && previewSrc ? 'a' : 'div'}
				href={project.has_pcb && previewSrc ? `${href}/pcb` : undefined}
				class="relative m-0 block overflow-hidden bg-[var(--preview-bg)]"
				class:board-card-preview={project.has_pcb && previewSrc}
				class:z-10={project.has_pcb && previewSrc}
			>
				{#if project.has_pcb && previewSrc}
					<img
						src={previewSrc}
						alt={t('card.boardAlt', { name: project.name })}
						class="h-full w-full object-contain p-2 transition-transform duration-[1600ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] group-hover:duration-300"
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<div class="traces flex h-full items-center justify-center text-[var(--text-muted)]">
						<Icon name="board" size={22} />
					</div>
				{/if}
				<span
					class="board-card-label mono absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[0.625rem]"
				>
					PCB
				</span>
			</svelte:element>
		</div>

		{#if project.visibility === 'private'}
			<span class="chip absolute right-1.5 top-1.5 z-20 !bg-black/60 !text-white/85 pointer-events-none">
				<Icon name="lock" size={10} /> {t('common.private')}
			</span>
		{/if}
	</div>

	<div class="flex flex-1 flex-col gap-2 p-3">
		<div class="flex items-start justify-between gap-2">
			<h3 class="min-w-0 text-[0.9375rem] font-semibold leading-tight">
				<a {href} class="after:absolute after:inset-0 hover:text-[var(--accent)] group-hover:text-[var(--accent)]">{project.name}</a>
			</h3>
			<StatusDot status={project.head_status} />
		</div>

		<a
			href="/{project.owner_username}"
			class="relative z-10 flex w-fit items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
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
			<!-- Only the chips take the click; the gaps between them still open the board. -->
			<div class="pointer-events-none relative z-10 flex flex-wrap gap-1">
				{#each project.tags.slice(0, 4) as tag}
					<span class="pointer-events-auto"><TagChip {tag} href="/?tag={tag.slug}" /></span>
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
			{#if project.part_count}<span class="flex items-center gap-1"><Icon name="chip" size={11} />{t('card.parts', { count: project.part_count })}</span>{/if}
			{#if project.drc_errors > 0}
				<span class="flex items-center gap-1" style:color="var(--err)">
					<Icon name="alert" size={11} />{project.drc_errors} DRC
				</span>
			{/if}
		</div>

		<div class="flex items-center justify-between border-t pt-2 text-[0.6875rem] text-[var(--text-muted)]">
			<div class="flex items-center gap-3">
				<span class="flex items-center gap-1" title={t('card.stars', { count: project.star_count })}>
					<Icon name="star" size={11} />{formatCount(project.star_count)}
				</span>
				<span class="flex items-center gap-1" title={t('card.versions', { count: project.commit_count })}>
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
