<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	/** A pickable chip with an optional count, styled like the category pages' subcategory chips. */
	const {
		label,
		count,
		selected = false,
		onclick
	}: { label: string; count?: number; selected?: boolean; onclick: () => void } = $props();
</script>

<button
	type="button"
	aria-pressed={selected}
	{onclick}
	class={twMerge(
		'flex shrink-0 cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1 text-sm',
		selected
			? 'border-brand-3 bg-brand-3 text-white'
			: 'border-primary bg-primary hover:bg-secondary',
		count === 0 && !selected && 'text-secondary opacity-60'
	)}
>
	<span>{label}</span>
	{#if count !== undefined}
		<span
			class={twMerge(
				'rounded px-1 text-xs',
				selected ? 'bg-white/20' : 'bg-secondary text-secondary'
			)}
		>
			{count}
		</span>
	{/if}
</button>
