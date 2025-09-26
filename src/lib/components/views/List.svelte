<script lang="ts">
	import { personalInfo } from '$lib/global.svelte';
	import { components } from '$lib/utils/styles';
	import { generateTitle, productIdsToDataset } from '$lib/utils/helpers';
	import { Kaljakori } from '$lib/alko';
	import {
		getItemQuantity,
		getListById,
		listToURI,
		removeFromList,
		saveList
	} from '$lib/utils/lists';
	import Icon from '../widgets/Icon.svelte';
	import { generateImageUrl } from '$lib/utils/image.js';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import type { ColumnNames, ListObj, PriceListItem } from '$lib/types';
	import {
		filterToUnitMarker,
		shownColumnsToHighlight,
		defaultSortingColumn,
		AllColumns,
		shownSortingKeys,
		defaultSortingOrderMap
	} from '$lib/utils/constants';
	import {
		formatValue,
		headerToDisplayName,
		sortingOrderToString,
		valueToString
	} from '$lib/utils/helpers';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { addToList } from '$lib/utils/lists';
	import Filters from '../widgets/Filters.svelte';
	import { isMobile } from '$lib/global.svelte';
	import { goto } from '$app/navigation';

	const { list: importedList, dataset }: { list: ListObj; dataset: string[][] } = $props();

	const existingList = getListById(importedList.id);

	const list = existingList || importedList;

	document.title = generateTitle(`Lista - ${list.name}`);

	const listDataset = $derived.by(() => {
		return productIdsToDataset(
			dataset,
			list.items.map((i) => i.id)
		);
	});

	const kaljakori = $derived(new Kaljakori(listDataset, personalInfo));

	let listRef: SvelteVirtualList<PriceListItem> | null = $state(null);

	let filtersComponent: Filters | null = $state(null);
	let filterValues = $state({});
	let showFilters = $derived(!$isMobile);

	let selectedHighlight = $state(defaultSortingColumn);

	let selectedSortingColumn = $state(defaultSortingColumn);
	let asc: boolean = $derived(
		defaultSortingOrderMap[selectedSortingColumn as keyof typeof defaultSortingOrderMap] || false
	);

	let rows = $derived.by(() => {
		let filterValuesCopy: Record<string, any> = { ...filterValues };
		Object.keys(filterValuesCopy).forEach((key) => {
			if (
				Array.isArray(filterValuesCopy[key]) &&
				kaljakori.getFilterType(key as ColumnNames) !== 'number'
			)
				filterValuesCopy[key] = new Set(filterValuesCopy[key]);
		});
		let temp = kaljakori.filter(filterValuesCopy);
		if (!!selectedSortingColumn)
			temp = temp.sort((a, b) => (a[selectedSortingColumn] > b[selectedSortingColumn] ? 1 : -1));
		if (!asc) temp = temp.reverse();
		return temp;
	});

	function validateListName(name: string) {
		if (name.trim().length === 0) list.name = 'Nimetön lista';
		else list.name = name.trim();
	}

	$effect(() => {
		goto(`?list=${listToURI(list)}`, { replaceState: true, noScroll: true, keepFocus: true });
	});

	async function handleShare(): Promise<boolean> {
		if (navigator.canShare && navigator.canShare({ url: location.href })) {
			console.log('sharing via navigator.share');
			await navigator.share({
				title: `Alkometriikka | Lista - ${list.name}`,
				text: `Katso lista "${list.name}" Alkometriikassa!`,
				url: location.href
			});
			console.log('shared via navigator.share');
			return true;
		} else await navigator.clipboard.writeText(location.href);
		return false;
	}
</script>

<div
	class="flex flex-row items-center justify-between border-b border-gray-300 bg-gray-50 p-3 md:p-4"
>
	{#if existingList}
		<input
			type="text"
			onblur={() => validateListName(list.name)}
			class="w-full border-none bg-transparent p-0 text-2xl leading-none focus:ring-0"
			bind:value={list.name}
		/>
		<button
			class={twMerge(components.button({ type: 'positive', size: 'md' }), 'ml-4')}
			onclick={async () => {
				const shared = await handleShare();
				if (!shared) {
					alert('Linkki kopioitu leikepöydälle!');
				}
			}}
		>
			<Icon name="share" /><span>Jaa</span>
		</button>
	{:else}
		<h2 class="text-lg leading-none md:text-2xl">{list.name}</h2>
		<button
			class={twMerge(components.button({ type: 'positive', size: 'md' }), 'ml-4')}
			onclick={() => {
				saveList(list);
				location.reload();
			}}
		>
			<span>Tallenna lista</span>
			<Icon name="save" />
		</button>
	{/if}
</div>
<div class={twMerge('relative grid h-full', kaljakori.data.length > 1 && 'grid-cols-[auto_1fr]')}>
	{#if kaljakori.data.length === 0}
		<div class="grid flex-auto place-content-center">
			<div class="mx-auto prose text-center">
				<h2>Lista on tyhjä!</h2>
				<p>Lisää tuotteita listaan tuotevalikosta!</p>
				<a href="/" class={twMerge(components.button({ type: 'positive' }), 'mx-auto w-full')}
					><span>Tuotevalikkoon</span><Icon name="arrow_right" /></a
				>
			</div>
		</div>
	{:else}
		{#if kaljakori.data.length > 1}
			<aside
				class="z-10 flex h-full flex-col overflow-x-hidden overflow-y-auto border-gray-300 md:w-84 md:border-r"
			>
				<Filters {kaljakori} bind:filterValues bind:this={filtersComponent} />
			</aside>
		{/if}
		<main class="mx-auto flex h-full w-full flex-col gap-3 bg-gray-100 p-3 md:gap-4 md:p-6">
			<div class="flex w-full flex-col items-start gap-4">
				<div class={twMerge('flex flex-row flex-wrap items-end gap-2')}>
					<div class="flex flex-col">
						<label for={'sortingColumn'} class="text-sm">
							{'Järjestys'}
						</label>
						<div class="flex flex-row flex-nowrap items-center">
							<select
								name="sortingColumn"
								id="sortingColumn"
								bind:value={selectedSortingColumn}
								class={twMerge(components.input(), 'rounded-none rounded-s pe-8')}
							>
								{#each shownSortingKeys as filter}
									<option value={filter}>{headerToDisplayName(filter)}</option>
								{/each}
							</select>
							{#if selectedSortingColumn}
								<button
									onclick={() => {
										asc = !asc;
										listRef?.scroll({ index: 0, smoothScroll: false });
									}}
									class={twMerge(components.button(), 'rounded-none rounded-e border-s-0')}
								>
									<span>{sortingOrderToString(asc, selectedSortingColumn)}</span>
									<Icon name={asc ? 'arrow_up' : 'arrow_down'} />
								</button>
							{/if}
						</div>
					</div>
					<div class="flex flex-col">
						<label for={'selectedHighlight'} class="text-sm">
							{'Korostus'}
						</label>
						<select
							name="selectedHighlight"
							id="selectedHighlight"
							bind:value={selectedHighlight}
							class={twMerge(components.input(), 'pe-8')}
						>
							{#each shownColumnsToHighlight as filter}
								<option value={filter}>{headerToDisplayName(filter)}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
			<div class="flex flex-row flex-wrap justify-between gap-2">
				<p>Tuotteet: {rows.length}</p>
				<button
					onclick={() => {
						listRef?.scroll({ index: 0, smoothScroll: false });
					}}
					class={twMerge(components.button())}
				>
					<Icon name={'arrow_up'} />
					<span>Hyppää alkuun</span>
				</button>
			</div>
			<div class="flex flex-auto flex-col">
				<SvelteVirtualList
					items={rows}
					bufferSize={25}
					bind:this={listRef}
					itemsClass={'flex flex-col gap-3'}
				>
					{#snippet renderItem(item, idx: number)}
						{@const [_, max] = kaljakori.getMinAndMaxValues(selectedHighlight) as number[]}
						{@const multiplier = Number(item[selectedHighlight]) / max}
						{@const ratings = ['Matala', 'Kohtalainen', 'Korkea']}
						{@const rating = ratings[Number(((ratings.length - 1) * multiplier).toFixed(0))]}
						<div
							class={twMerge(
								'relative flex flex-col gap-3 overflow-clip rounded border border-gray-200 bg-white shadow'
							)}
						>
							<div
								class={twMerge('flex flex-col flex-nowrap items-center gap-4 p-4 pb-0 md:flex-row')}
							>
								<div class="flex aspect-square w-32 max-w-[8rem]">
									<img
										src={generateImageUrl(item[AllColumns.Number], item[AllColumns.Name])}
										alt={item[AllColumns.Name]}
										class="block h-full w-full object-contain"
									/>
								</div>
								<div class="flex w-full flex-col gap-2">
									<div class="flex flex-row items-center gap-3">
										<span
											class="absolute top-0 left-0 rounded-br bg-gray-100 p-0.5 text-sm text-gray-500"
										>
											{'#' + (idx + 1)}
										</span>
										<a href={`/tuotteet/${item[AllColumns.Number]}`} class="hover:underline">
											<h2 class="text-xl font-bold md:text-2xl">
												{item[AllColumns.Name]} ({formatValue(
													item[AllColumns.BottleSize],
													AllColumns.BottleSize
												)})
											</h2>
										</a>
									</div>
									<div class="flex flex-col items-start gap-0.5 md:flex-row md:gap-3">
										<div class="flex flex-col gap-0.5 md:gap-1">
											<p>{valueToString(item[AllColumns.Manufacturer], AllColumns.Manufacturer)}</p>
											<p>
												{valueToString(item[AllColumns.Type], AllColumns.Type)}
												{item[AllColumns.Type] === 'Oluet'
													? `- ${formatValue(item[AllColumns.BeerType], AllColumns.BeerType)}`
													: null}
											</p>
											<p>{valueToString(item[AllColumns.Availability], AllColumns.Availability)}</p>
										</div>
										<div class="flex flex-col gap-0.5 md:gap-1">
											<p>
												{valueToString(
													item[AllColumns.AlcoholPercentage],
													AllColumns.AlcoholPercentage
												)}
											</p>
											<p>
												{valueToString(
													item[AllColumns.AlcoholGramsPerEuro],
													AllColumns.AlcoholGramsPerEuro
												)}
											</p>
											<p>
												{valueToString(
													item[AllColumns.EstimatedPromille],
													AllColumns.EstimatedPromille
												)}
											</p>
										</div>
									</div>
									<div class="flex items-center gap-2 text-sm text-gray-500">
										<Icon name="map_pin" />
										<span class="text-sm">
											{item[AllColumns.Country]}
											{item[AllColumns.Region] ? ` - ${item[AllColumns.Region]}` : null}
										</span>
									</div>
									<div class="flex flex-col gap-4 md:flex-row md:items-center">
										<div class="flex items-center gap-2">
											<p class="text-2xl font-bold drop-shadow-lg">
												{Number.parseFloat(item[AllColumns.Price] as string).toFixed(2)} €
											</p>
											<span class="text-sm text-gray-500"
												>({item[AllColumns.PricePerLiter]} €/L)</span
											>
											<span class="text-sm text-gray-500">|</span>
											<span class="text-sm text-gray-500"
												>{getItemQuantity(list, item[AllColumns.Number])} kpl</span
											>
										</div>
										{#if !!item[AllColumns.New]}
											<p class="rounded bg-red-200 px-1.5 py-0.5 text-sm text-red-800">Uutuus</p>
										{/if}
										{#if item[AllColumns.SpecialGroup] === 'Luomu'}
											<p class="rounded bg-green-300 px-1.5 py-0.5 text-sm text-green-800">Luomu</p>
										{/if}
										{#if item[AllColumns.SpecialGroup] === 'Vegaaneille soveltuva tuote'}
											<p class="rounded bg-emerald-300 px-1.5 py-0.5 text-sm text-emerald-800">
												Vegaani
											</p>
										{/if}
										{#if item[AllColumns.AlcoholPercentage] === 0}
											<p class="rounded bg-blue-300 px-1.5 py-0.5 text-sm text-blue-800">
												Alkoholiton
											</p>
										{/if}

										{#if existingList}
											<button
												class={twMerge(components.button({ type: 'negative' }), 'ml-auto')}
												onclick={() => removeFromList(list, item[AllColumns.Number])}
											>
												<span>Poista listasta</span>
												<Icon name="trash" />
											</button>
										{:else}
											<Popup class="gap-4 p-4">
												{#snippet renderButton(dialogElement: HTMLDialogElement)}
													<button
														class={twMerge(components.button({ type: 'positive' }), 'ml-auto')}
														onclick={() => dialogElement.showModal()}
													>
														<span>Lisää listaan</span>
														<Icon name="plus" />
													</button>
												{/snippet}
												{#snippet renderContent(dialogElement: HTMLDialogElement)}
													<h2 class="text-xl">Valitse lista</h2>
													<AllLists
														action={(list: ListObj) => {
															addToList(list, item[AllColumns.Number]);
															dialogElement.close();
														}}
													/>
												{/snippet}
											</Popup>
										{/if}
									</div>
								</div>
							</div>
							<div class="relative block max-w-full">
								<div
									class="relative flex h-full w-fit shrink-0 flex-nowrap items-center gap-1 bg-black px-1.5 py-0.5 text-sm whitespace-nowrap text-white"
									style={`left: ${100 * multiplier}%; transform: translateX(-${100 * multiplier}%);`}
								>
									<p>
										{headerToDisplayName(selectedHighlight)}: {item[selectedHighlight]}
										{filterToUnitMarker[selectedHighlight as keyof typeof filterToUnitMarker]}
									</p>
									<span>- {rating}</span>
								</div>
								<div
									class="relative block h-4 w-full rounded-b bg-gradient-to-r from-red-500 via-amber-500 to-green-500"
								>
									<div
										class="absolute block h-full w-1 shrink-0 -translate-x-1/2 bg-black whitespace-nowrap"
										style={`left: ${100 * multiplier}%; transform: translateX(${50 - 100 * multiplier}%);`}
									></div>
								</div>
							</div>
						</div>
					{/snippet}
				</SvelteVirtualList>
			</div>
			{#if $isMobile}
				<button
					onclick={() => {
						filtersComponent?.toggleFilterElement();
						showFilters = !showFilters;
					}}
					class={twMerge(components.button(), 'w-full')}
				>
					<span>{showFilters ? 'Piilota suodattimet' : 'Näytä suodattimet'}</span>
					<Icon name={'filter'} />
				</button>
			{/if}
		</main>
	{/if}
</div>
