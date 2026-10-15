<script lang="ts">
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';
	import { m } from '$lib/i18n';

	/** Bottom bar button that opens the filter dialog on phones. */
	const { activeCount, onclick }: { activeCount: number; onclick: () => void } = $props();
</script>

<button
	{onclick}
	aria-haspopup="dialog"
	aria-label={activeCount > 0 ? m.filters_button_label({ count: activeCount }) : undefined}
	class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}
>
	<Icon name="filter" />
	<span>{m.filters_title()}{activeCount > 0 ? ` (${activeCount})` : ''}</span>
</button>
