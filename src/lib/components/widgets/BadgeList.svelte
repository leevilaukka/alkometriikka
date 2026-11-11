<script lang="ts" module>
	import { MediaQuery } from 'svelte/reactivity';

	/**
	 * Icon-only badges say what they are in tooltips, which need a pointer that hovers. On touch
	 * screens the full badges wrap onto another line instead.
	 */
	const canHover = new MediaQuery('hover: hover');
</script>

<script lang="ts">
	import { type ColumnNames, type BadgeConfig, type PriceListItem } from '$lib/types';
	import { DynamicColumnToBadgeMap } from '$lib/utils/constants/badges';
	import { twMerge } from 'tailwind-merge';
	import Badge from './Badge.svelte';

	const {
		item,
		isProductPage,
		fit = false,
		class: _class = ''
	}: {
		item: PriceListItem;
		isProductPage?: boolean;
		/**
		 * Lays the badges out in a row of their own that shows only their icons when the full
		 * badges don't fit its width, or on touch screens wraps them. The row takes the space its
		 * parent gives it, e.g. `flex-1`.
		 */
		fit?: boolean;
		class?: string;
	} = $props();

	const isBadge = (value: unknown): value is BadgeConfig => {
		return typeof value === 'object' && value !== null && 'text' in value && 'color' in value;
	};

	const isSubBadge = (value: unknown): value is Record<string, BadgeConfig> => {
		return (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			!('text' in value) &&
			!('color' in value)
		);
	};

	const badgeMap = $derived(
		Object.entries(DynamicColumnToBadgeMap(item)) as [
			ColumnNames,
			BadgeConfig | Record<string, BadgeConfig>
		][]
	);

	const shown = (badge: BadgeConfig, compact: boolean) =>
		isProductPage
			? !badge.hideFromProductPage
			: !badge.productPageOnly && !(compact && badge.hideWhenCompact);

	let row = $state<HTMLElement>();
	let fullBadges = $state<HTMLElement>();
	let compact = $state(false);

	// An invisible copy of the full badges tells whether they'd fit, so the ones shown can switch
	// to icons and back without measuring themselves
	$effect(() => {
		if (!fit || !row || !fullBadges) return;
		const available = row;
		const needed = fullBadges;
		const observer = new ResizeObserver(() => {
			compact = needed.offsetWidth > available.clientWidth;
		});
		observer.observe(available);
		observer.observe(needed);
		return () => observer.disconnect();
	});
</script>

{#snippet badges(compact: boolean)}
	{#each badgeMap as [column, badgeInfo] (column)}
		{#if item[column] !== null && badgeInfo}
			{#if isBadge(badgeInfo) && shown(badgeInfo, compact)}
				<Badge
					text={badgeInfo.text}
					color={badgeInfo.color}
					icon={badgeInfo.icon}
					tooltip={badgeInfo.tooltip}
					{compact}
				/>
			{:else if isSubBadge(badgeInfo)}
				{#each Object.entries(badgeInfo) as [subKey, subBadgeInfo] (subKey)}
					{#if (item[column] === subKey || (item[column] instanceof Set && item[column].has(subKey))) && shown(subBadgeInfo, compact)}
						<Badge
							text={subBadgeInfo.text}
							color={subBadgeInfo.color}
							icon={subBadgeInfo.icon}
							tooltip={subBadgeInfo.tooltip}
							{compact}
						/>
					{/if}
				{/each}
			{/if}
		{/if}
	{/each}
{/snippet}

{#if fit}
	<div bind:this={row} class={twMerge('relative min-w-0 overflow-hidden', _class)}>
		{#if canHover.current}
			<div
				bind:this={fullBadges}
				class="invisible absolute top-0 left-0 flex w-max items-center gap-3"
				aria-hidden="true"
				inert
			>
				{@render badges(false)}
			</div>
			<div class={twMerge('flex items-center', compact ? 'flex-wrap gap-1.5' : 'gap-3')}>
				{@render badges(compact)}
			</div>
		{:else}
			<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
				{@render badges(false)}
			</div>
		{/if}
	</div>
{:else}
	{@render badges(false)}
{/if}
