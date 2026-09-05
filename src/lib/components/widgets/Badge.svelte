<script lang="ts">
    import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';
	import { components } from '$lib/utils/styles';
	import type { BadgeConfig } from '$lib/types';
    
    const { text, color = "default", icon, tooltip }: BadgeConfig = $props();
</script>

<p class={twMerge(components.badge({ color }))} title={tooltip}>
    {#if icon}
        <Icon name={icon} />
    {/if}
    <span>{text}</span>
</p>
