<script lang="ts">
    import { twMerge } from 'tailwind-merge';
	import type { IconName } from '$lib/icons';
	import Icon from './Icon.svelte';
	import { components } from '$lib/utils/styles';
	import type { VariantProps } from 'class-variance-authority';
    const { text, color = "default", icon }: { text: string, color?: VariantProps<typeof components.badge>["color"], icon?: IconName } = $props();
</script>

<p class={twMerge(components.badge({ color }))}>
    {#if icon}
        <Icon name={icon} />
    {/if}
    <span>{text}</span>
</p>
