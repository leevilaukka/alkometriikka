<script lang="ts">
	import type { SimilarProductChip } from '$lib/utils/metrics';
	import { twMerge } from 'tailwind-merge';

	let {
		chips,
		selected = $bindable(null),
		class: _class = ''
	}: { chips: SimilarProductChip[]; selected: string | null; class?: string } = $props();
</script>

<div class={twMerge('-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0', _class)}>
	{#each chips as chip (chip.value ?? '__all__')}
		<button
			type="button"
			aria-pressed={selected === chip.value}
			class={twMerge(
				'flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-sm',
				selected === chip.value
					? 'bg-brand-3 text-white'
					: 'border border-primary bg-primary hover:bg-secondary'
			)}
			onclick={() => (selected = chip.value)}
		>
			<span>{chip.label}</span>
			<span
				class={twMerge(
					'rounded px-1 text-xs',
					selected === chip.value ? 'bg-white/20' : 'bg-secondary text-secondary'
				)}
			>
				{chip.count}
			</span>
		</button>
	{/each}
</div>
