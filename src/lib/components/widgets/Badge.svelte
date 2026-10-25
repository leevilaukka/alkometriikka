<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';
	import { components } from '$lib/utils/ui/styles';
	import type { BadgeConfig } from '$lib/types';

	const {
		text,
		color = 'default',
		icon,
		tooltip,
		compact = false
	}: BadgeConfig & {
		/** Only the icon, with the text in the tooltip. A badge without an icon keeps its text. */
		compact?: boolean;
	} = $props();

	const iconOnly = $derived(compact && !!icon);
</script>

<p
	class={twMerge(components.badge({ color }), iconOnly && 'gap-0')}
	title={iconOnly ? (tooltip ? `${text}: ${tooltip}` : text) : tooltip}
>
	{#if icon}
		<Icon name={icon} />
	{/if}
	<!-- Hidden at zero width rather than taken out of the layout, so the badge keeps the text's
	     line height and is as tall as the ones with text -->
	<span class={iconOnly ? 'w-0 overflow-hidden whitespace-nowrap' : undefined}>{text}</span>
</p>
