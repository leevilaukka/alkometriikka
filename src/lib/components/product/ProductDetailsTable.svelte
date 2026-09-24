<script lang="ts">
	import { DatasetColumns, DrunkColumns, hideFromProductPageStats } from '$lib/utils/constants';
	import { headerToDisplayName, isNullish } from '$lib/utils/helpers';
	import { formatValue } from '$lib/utils/format';
	import type { PriceListItem } from '$lib/types';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		asDetails = false,
		class: _class = ''
	}: { product: PriceListItem; asDetails?: boolean; class?: string } = $props();

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
	<div class="grid grid-cols-1 gap-x-6 bg-primary sm:grid-cols-2">
		{#each rows as row (row.key)}
			<div class="grid grid-cols-[160px_minmax(0,1fr)] gap-3.5 border-b border-secondary px-4 py-3">
				<span class="text-sm text-secondary">{row.label}</span>
				<span class="text-wrap-pretty">{row.value}</span>
			</div>
		{/each}
	</div>
{/snippet}

{#if asDetails}
	<details open class={twMerge('overflow-hidden rounded border border-primary bg-secondary', _class)}>
		<summary class="border-b border-primary p-3.5 text-lg font-bold">Tuotetiedot</summary>
		{@render rowsList()}
	</details>
{:else}
	<section class={twMerge('overflow-hidden rounded border border-primary bg-secondary', _class)}>
		<header class="border-b border-primary p-3.5">
			<h2 class="text-lg font-bold">Tuotetiedot</h2>
		</header>
		{@render rowsList()}
	</section>
{/if}
