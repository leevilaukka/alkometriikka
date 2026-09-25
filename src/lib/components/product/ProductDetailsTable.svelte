<script lang="ts">
	import { AllColumns, DatasetColumns, DrunkColumns, hideFromProductPageStats } from '$lib/utils/constants';
	import { headerToDisplayName, isNullish, sendAnalyticsEvent } from '$lib/utils/helpers';
	import { formatValue } from '$lib/utils/format';
	import type { PriceListItem } from '$lib/types';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const { product, class: _class = '' }: { product: PriceListItem; class?: string } = $props();

	let detailsEl: HTMLDetailsElement | undefined = $state();

	function handleToggle() {
		if (detailsEl?.open) {
			sendAnalyticsEvent('show_product_details', { product_number: product[AllColumns.Number] });
		}
	}

	type Row = { key: string; label: string; value: string };

	const rows = $derived.by<Row[]>(() => {
		const out: Row[] = [];
		for (const value of Object.values(DatasetColumns)) {
			const rawValue = product[value];
			const hasValue =
				!isNullish(rawValue) &&
				(!(rawValue instanceof Set) || rawValue.size > 0) &&
				(!Array.isArray(rawValue) || rawValue.length > 0) &&
				(typeof rawValue !== 'string' || rawValue.trim().length > 0);
			if (hasValue && !hideFromProductPageStats.has(value)) {
				out.push({
					key: value,
					label: headerToDisplayName(value),
					value: String(formatValue(rawValue as string | number | boolean | Set<string>, value))
				});
			}
		}
		for (const value of Object.values(DrunkColumns)) {
			const rawValue = product[value];
			if (rawValue !== null && rawValue !== undefined) {
				out.push({ key: value, label: headerToDisplayName(value), value: String(formatValue(rawValue, value)) });
			}
		}
		return out;
	});
</script>

{#snippet rowsList()}
	<div class="grid grid-cols-1 bg-primary sm:grid-cols-2">
		{#each rows as row (row.key)}
			<div
				class="grid grid-cols-[160px_minmax(0,1fr)] gap-3.5 border-b border-secondary px-4 py-3 sm:even:border-s sm:odd:pe-6 sm:even:ps-6"
			>
				<span class="text-sm text-secondary">{row.label}</span>
				<span class="text-wrap-pretty">{row.value}</span>
			</div>
		{/each}
	</div>
{/snippet}

<details
	bind:this={detailsEl}
	ontoggle={handleToggle}
	class={twMerge('group overflow-hidden rounded border border-primary bg-secondary', _class)}
>
	<summary
		class="flex cursor-pointer list-none items-center justify-between gap-3 p-3.5 text-lg font-bold group-open:border-b group-open:border-primary"
	>
		Tuotetiedot
		<Icon name="chevron_down" class="shrink-0 transition-transform group-open:rotate-180" />
	</summary>
	{@render rowsList()}
</details>
