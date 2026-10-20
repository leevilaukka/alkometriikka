<script lang="ts">
	import { appPath } from '$lib/utils/app/paths';
	import { resolve } from '$app/paths';
	import type { Kaljakori } from '$lib/alko';
	import type { AvailabilityData, PriceListItem } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { AUTO_STORE_ID } from '$lib/utils/constants/app';
	import {
		currentSeasons,
		SEASONS,
		seasonPath,
		seasonTitle,
		type Season
	} from '$lib/utils/catalog/seasons';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { formatValue } from '$lib/utils/format/format';
	import {
		isLaptop,
		onlyPreferredStore,
		personalInfo,
		preferredStoreId,
		userLocation
	} from '$lib/global.svelte';
	import { resolvePreferredStore } from '$lib/utils/catalog/availability';
	import { keepAutoLocationFresh } from '$lib/utils/device/location';
	import { twMerge } from 'tailwind-merge';
	import Main from './Main.svelte';
	import Icon from '../widgets/Icon.svelte';
	import Breadcrumb from '../widgets/Breadcrumb.svelte';
	import CategoryStats from '../category/CategoryStats.svelte';
	import CategorySection from '../category/CategorySection.svelte';

	const {
		season,
		kaljakori: source,
		availability
	}: { season: Season; kaljakori: Kaljakori; availability: AvailabilityData } = $props();

	$effect(() => {
		if ($preferredStoreId === AUTO_STORE_ID) return keepAutoLocationFresh();
	});

	const preferredStore = $derived(
		resolvePreferredStore(availability.stores, $preferredStoreId, $userLocation)
	);
	const storeFilter = $derived(
		$onlyPreferredStore && preferredStore ? preferredStore.id : undefined
	);

	// Active products only: a season page is for buying now
	const seasonProducts = $derived(
		source.data.filter(
			(item) =>
				!item[AllColumns.RemovedFromSelection] &&
				season.matches({
					name: String(item[AllColumns.Name]),
					type: String(item[AllColumns.Type] ?? ''),
					subType: String(item[AllColumns.SubType] ?? '')
				})
		)
	);
	const kaljakori = $derived(
		source.subset(
			storeFilter
				? seasonProducts.filter((item) =>
						(availability.product[item[AllColumns.Number]] ?? []).includes(storeFilter)
					)
				: seasonProducts,
			personalInfo
		)
	);
	const active = $derived(kaljakori.data);

	function best(
		key: typeof AllColumns.Price | typeof AllColumns.AlcoholGramsPerEuro,
		lowest: boolean
	) {
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

	const otherSeasons = $derived.by(() => {
		const current = new Set(currentSeasons());
		return SEASONS.filter((other) => other !== season).sort(
			(a, b) => Number(current.has(b)) - Number(current.has(a))
		);
	});

	$effect(() => {
		const title = generateTitle(seasonTitle(season));
		setSEO({
			description: season.description,
			og: {
				title,
				description: season.description,
				url: `https://alkometriikka.fi${seasonPath(season)}`
			},
			twitter: { title, description: season.description },
			keywords: season.keywords
		});
	});
</script>

<svelte:head>
	<title>{generateTitle(seasonTitle(season))}</title>
</svelte:head>

{#snippet stat(label: string, value: string, product?: PriceListItem)}
	<div
		class="flex min-w-0 flex-col gap-0.5 rounded border border-primary bg-primary px-3 py-2 text-sm"
	>
		<span class="text-xs text-secondary">{label}</span>
		{#if product}
			<a
				href={resolve(`/tuotteet/${product[AllColumns.Number]}/`)}
				class="truncate font-bold hover:underline"
				title={product[AllColumns.Name]}
			>
				{product[AllColumns.Name]}
			</a>
		{/if}
		<span>{value}</span>
	</div>
{/snippet}

{#snippet header()}
	<div class="flex w-full flex-col gap-3">
		<Breadcrumb items={[{ label: 'Kausijuomat', href: '/kausi/' }]} current={season.title} />
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<h1 class="text-2xl font-bold">{season.title}</h1>
			<span class="text-sm text-secondary">
				{#if storeFilter}
					{active.length.toLocaleString('fi-FI')} / {seasonProducts.length.toLocaleString('fi-FI')} tuotetta
					myymälässä
				{:else}
					{seasonProducts.length.toLocaleString('fi-FI')} tuotetta valikoimassa
				{/if}
			</span>
		</div>
		<p class="text-sm text-secondary">{season.intro}</p>
		{#if preferredStore}
			<label class="flex cursor-pointer items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={$onlyPreferredStore} class="shrink-0 rounded" />
				<span class="min-w-0 truncate"
					>Vain myymälässäni: <strong>{preferredStore.name}</strong></span
				>
			</label>
		{:else if Object.keys(availability.stores).length}
			<a href={resolve('/myymalat/')} class="group flex items-center gap-1 text-sm text-secondary">
				<Icon name="map_pin" />
				<span class="group-hover:underline">Valitse myymälä nähdäksesi sen valikoiman</span>
			</a>
		{/if}
		<div
			class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0 xl:overflow-visible"
		>
			{#each otherSeasons as other (other.slug)}
				<a
					href={appPath(seasonPath(other))}
					class="flex shrink-0 items-center gap-1.5 rounded border border-dashed border-primary px-2.5 py-1 text-sm text-secondary hover:bg-secondary"
				>
					{other.title}
				</a>
			{/each}
		</div>
		<div class="flex flex-col">
			{#if cheapest || mostAlcoholPerEuro || onSaleCount > 0 || newCount > 0}
				<CategorySection title="Kohokohdat" open={!$isLaptop}>
					<div class={twMerge('flex flex-col gap-2', $isLaptop && 'grid grid-cols-2')}>
						{#if cheapest}
							{@render stat(
								'Halvin',
								formatValue(cheapest[AllColumns.Price], AllColumns.Price) as string,
								cheapest
							)}
						{/if}
						{#if mostAlcoholPerEuro}
							{@render stat(
								'Eniten alkoholia eurolla',
								formatValue(
									mostAlcoholPerEuro[AllColumns.AlcoholGramsPerEuro],
									AllColumns.AlcoholGramsPerEuro
								) as string,
								mostAlcoholPerEuro
							)}
						{/if}
						{#if onSaleCount > 0}
							{@render stat('Alennuksessa', `${onSaleCount} tuotetta`)}
						{/if}
						{#if newCount > 0}
							{@render stat('Uutuuksia', `${newCount} tuotetta`)}
						{/if}
					</div>
				</CategorySection>
			{/if}
			<CategoryStats products={active} />
		</div>
	</div>
{/snippet}

{#key `${season.slug}|${storeFilter ?? ''}`}
	<Main {kaljakori} {header} showFilters={false} />
{/key}
