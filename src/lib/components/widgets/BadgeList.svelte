<script lang="ts">
	import type { PriceListItem } from '$lib/types';
	import { AllColumns, ColumnToBadgeMap } from '$lib/utils/constants';
	import Badge from './Badge.svelte';

	const { item }: { item: PriceListItem } = $props();
</script>

{#each Object.entries(ColumnToBadgeMap) as [column, badgeInfo]}
	{#if item[column as keyof typeof ColumnToBadgeMap] && badgeInfo}
        {#if 'text' in badgeInfo && 'color' in badgeInfo && 'icon' in badgeInfo}
            <Badge text={badgeInfo.text} color={badgeInfo.color} icon={badgeInfo.icon} />
        {:else}
            {#each Object.entries(badgeInfo) as [subKey, subBadgeInfo]}
                {#if item[column as keyof typeof ColumnToBadgeMap] === subKey}
                    <Badge
                        text={subBadgeInfo.text}
                        color={subBadgeInfo.color}
                        {...'icon' in subBadgeInfo ? { icon: subBadgeInfo.icon } : {}}
                    />
                {/if}
            {/each}
        {/if}
    {/if}
{/each}
{#if item[AllColumns.AlcoholPercentage] === 0}
    <Badge text="Alkoholiton" color="blue" icon="percentage" />
{/if}
