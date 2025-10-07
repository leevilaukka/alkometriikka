<script lang="ts">
	import type { PriceListItem } from '$lib/types';
    import type { IconName } from '$lib/icons';
	import { DynamicColumnToBadgeMap } from '$lib/utils/constants';
	import Badge from './Badge.svelte';

	const { item }: { item: PriceListItem } = $props();

</script>

{#each Object.entries(DynamicColumnToBadgeMap(item)) as [column, badgeInfo]}
    {#if item[column] !== null  && badgeInfo}
        {#if typeof badgeInfo.text === 'string' && typeof badgeInfo.color === 'string'}
            <Badge text={badgeInfo.text} color={badgeInfo.color} icon={badgeInfo.icon as IconName} />
        {:else if typeof badgeInfo === 'object' && !Array.isArray(badgeInfo) && badgeInfo !== null}
            {#each Object.entries(badgeInfo) as [subKey, subBadgeInfo]}
                {#if item[column] === subKey}
                    <Badge
                        text={subBadgeInfo.text}
                        color={subBadgeInfo.color}
                        icon={subBadgeInfo.icon as IconName}
                    />
                {/if}
            {/each}
        {/if}
    {/if}
{/each}