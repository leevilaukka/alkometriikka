<script lang="ts">
	import type { BadgeConfig, PriceListItem } from '$lib/types';
	import { DynamicColumnToBadgeMap } from '$lib/utils/constants';
	import Badge from './Badge.svelte';

	const { item }: { item: PriceListItem } = $props();

    const isBadge = (value: unknown): value is BadgeConfig => {
        return typeof value === 'object' && value !== null && 'text' in value && 'color' in value;
    };

    const isSubBadge = (value: unknown): value is Record<string, BadgeConfig> => {
        return typeof value === 'object' && value !== null && !Array.isArray(value) && !('text' in value) && !('color' in value);
    };
</script>

{#each Object.entries(DynamicColumnToBadgeMap(item)) as [column, badgeInfo] (column)}
    {#if item[column] !== null  && badgeInfo}
        {#if isBadge(badgeInfo)}
            <Badge text={badgeInfo.text} color={badgeInfo.color} icon={badgeInfo.icon} tooltip={badgeInfo.tooltip} />
        {:else if isSubBadge(badgeInfo)}
            {#each Object.entries(badgeInfo) as [subKey, subBadgeInfo] (subKey)}
                {#if item[column] === subKey || (item[column] instanceof Set && item[column].has(subKey))}
                    <Badge
                        text={subBadgeInfo.text}
                        color={subBadgeInfo.color}
                        icon={subBadgeInfo.icon}
                        tooltip={subBadgeInfo.tooltip}
                    />
                {/if}
            {/each}
        {/if}
    {/if}
{/each}