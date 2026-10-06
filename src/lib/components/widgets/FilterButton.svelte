<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';

	/** Bottom bar button that opens the filter dialog on phones. */
	const { activeCount, onclick }: { activeCount: number; onclick: () => void } = $props();
</script>

<button
	{onclick}
	aria-haspopup="dialog"
	aria-label={activeCount > 0 ? `Suodattimet, ${activeCount} valittu` : undefined}
	class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}
>
	<Icon name="filter" />
	<span>Suodattimet{activeCount > 0 ? ` (${activeCount})` : ''}</span>
</button>
