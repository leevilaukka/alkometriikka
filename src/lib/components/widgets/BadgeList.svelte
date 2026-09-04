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

{#each Object.entries(DynamicColumnToBadgeMap(item)) as [column, badgeInfo]}
    {#if item[column] !== null  && badgeInfo}
        {#if isBadge(badgeInfo)}
            <Badge text={badgeInfo.text} color={badgeInfo.color} icon={badgeInfo.icon} />
        {:else if isSubBadge(badgeInfo)}
            {#each Object.entries(badgeInfo) as [subKey, subBadgeInfo]}
                {#if item[column] === subKey}
                    <Badge
                        text={subBadgeInfo.text}
                        color={subBadgeInfo.color}
                        icon={subBadgeInfo.icon}
                    />
                {/if}
            {/each}
        {/if}
    {/if}
{/each}