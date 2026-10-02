<script lang="ts">
	import { Kaljakori } from '$lib/alko';
	import type { AvailabilityData, PriceListItem } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants';
	import { categoryDescription, categorySlug, categoryTitle, type CategoryNode } from '$lib/utils/categories';
	import { generateTitle, setSEO } from '$lib/utils/helpers';
	import { formatValue } from '$lib/utils/format';
	import { personalInfo } from '$lib/global.svelte';
	import { twMerge } from 'tailwind-merge';
	import Main from './Main.svelte';
	import Breadcrumb from '../widgets/Breadcrumb.svelte';

	const {
		trail,
		table,
		availability,
		tree
	}: {
		trail: CategoryNode[];
		table: any[][];
		availability: AvailabilityData;
		tree: CategoryNode[];
	} = $props();

	const node = $derived(trail[trail.length - 1]);
	const parent = $derived(trail.length > 1 ? trail[0] : undefined);

	// A Kaljakori of just this category, so the list, filter options and number
	// ranges all match the category instead of the whole selection
	const kaljakori = $derived.by(() => {
		const [header, ...rows] = table;
		const typeIndex = header.indexOf(AllColumns.Type);
		const subTypeIndex = header.indexOf(AllColumns.SubType);
		const [type, subType] = trail;
		return new Kaljakori(
			[
				header,
				...rows.filter(
					(row) =>
						categorySlug(String(row[typeIndex] ?? '')) === type.slug &&
						(!subType || categorySlug(String(row[subTypeIndex] ?? '')) === subType.slug)
				)
			],
			personalInfo,
			availability
		);
	});

	const active = $derived(
		kaljakori.data.filter((item) => item[AllColumns.RemovedFromSelection] !== true)
	);

	function best(key: typeof AllColumns.Price | typeof AllColumns.AlcoholGramsPerEuro, lowest: boolean) {
		let result: PriceListItem | undefined;
		for (const item of active) {
			const value = Number(item[key]);
			if (!Number.isFinite(value) || value <= 0) continue;
			if (!result || (lowest ? value < result[key] : value > result[key])) result = item;
		}
		return result;
	}

	const cheapest = $derived(best(AllColumns.Price, true));
	const mostAlcoholPerEuro = $derived(best(AllColumns.AlcoholGramsPerEuro, false));
	const onSaleCount = $derived(active.filter((item) => item[AllColumns.OnSale]).length);
	const newCount = $derived(active.filter((item) => item[AllColumns.New]).length);

	// Type pages list their subcategories, subcategory pages their siblings
	const chips = $derived(parent ? parent.children : node.children);
	const siblingTypes = $derived(parent ? [] : tree.filter((type) => type.slug !== node.slug));

	const description = $derived(categoryDescription(trail));

	$effect(() => {
		const title = generateTitle(categoryTitle(trail));
		setSEO({
			description,
			og: { title, description, url: `https://alkometriikka.fi${node.path}` },
			twitter: { title, description },
			keywords: trail.map((item) => item.name).join(', ')
		});
	});
</script>

<svelte:head>
	<title>{generateTitle(categoryTitle(trail))}</title>
</svelte:head>

{#snippet stat(label: string, value: string, product?: PriceListItem)}
	{@const content = `${product ? product[AllColumns.Name] : ''}`}
	<div class="flex min-w-48 shrink-0 flex-col gap-0.5 rounded border border-primary bg-primary px-3 py-2 text-sm sm:shrink">
		<span class="text-xs text-secondary">{label}</span>
		{#if product}
			<a href={`/tuotteet/${product[AllColumns.Number]}/`} class="truncate font-bold hover:underline" title={content}>
				{content}
			</a>
		{/if}
		<span>{value}</span>
	</div>
{/snippet}

{#snippet header()}
	<div class="flex w-full flex-col gap-3">
		<Breadcrumb items={trail.slice(0, -1).map((item) => ({ label: item.name, href: item.path }))} current={node.name} />
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<h1 class="text-2xl font-bold">{node.name}</h1>
			<span class="text-sm text-secondary">{node.count.toLocaleString('fi-FI')} tuotetta valikoimassa</span>
		</div>
		{#if chips.length > 1 || siblingTypes.length}
			<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0">
				{#each chips as chip (chip.slug)}
					{@const selected = chip.slug === node.slug}
					<a
						href={chip.path}
						aria-current={selected ? 'page' : undefined}
						class={twMerge(
							'flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-sm',
							selected ? 'bg-brand-3 text-white' : 'border border-primary bg-primary hover:bg-secondary'
						)}
					>
						<span>{chip.name}</span>
						<span class={twMerge('rounded px-1 text-xs', selected ? 'bg-white/20' : 'bg-secondary text-secondary')}>
							{chip.count}
						</span>
					</a>
				{/each}
				{#each siblingTypes as type (type.slug)}
					<a
						href={type.path}
						class="flex shrink-0 items-center gap-1.5 rounded border border-dashed border-primary px-2.5 py-1 text-sm text-secondary hover:bg-secondary"
					>
						{type.name}
					</a>
				{/each}
			</div>
		{/if}
		<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:px-0">
			{#if cheapest}
				{@render stat('Halvin', formatValue(cheapest[AllColumns.Price], AllColumns.Price) as string, cheapest)}
			{/if}
			{#if mostAlcoholPerEuro}
				{@render stat(
					'Eniten alkoholia eurolla',
					formatValue(mostAlcoholPerEuro[AllColumns.AlcoholGramsPerEuro], AllColumns.AlcoholGramsPerEuro) as string,
					mostAlcoholPerEuro
				)}
			{/if}
			{@render stat('Alennuksessa', `${onSaleCount} tuotetta`)}
			{@render stat('Uutuuksia', `${newCount} tuotetta`)}
		</div>
	</div>
{/snippet}

{#key node.path}
	<Main {kaljakori} {header} showFilters={false} />
{/key}
