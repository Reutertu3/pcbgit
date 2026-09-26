<script lang="ts">
	interface Stat {
		label: string;
		value: string | number | null;
		tone?: 'default' | 'ok' | 'warn' | 'err';
	}
	interface Props {
		stats: Stat[];
	}
	let { stats }: Props = $props();

	const tones = {
		default: 'var(--text-primary)',
		ok: 'var(--ok)',
		warn: 'var(--warn)',
		err: 'var(--err)'
	};
</script>

<dl class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-[var(--border-subtle)] sm:grid-cols-3">
	{#each stats.filter((stat) => stat.value !== null && stat.value !== undefined) as stat}
		<div class="bg-s1 px-3 py-2.5">
			<dt class="text-[0.6875rem] uppercase tracking-wide text-[var(--text-muted)]">{stat.label}</dt>
			<dd class="mt-0.5 text-sm font-semibold tabular-nums" style:color={tones[stat.tone ?? 'default']}>
				{stat.value}
			</dd>
		</div>
	{/each}
</dl>
