<script lang="ts">
	import { isLaptop, personalInfo, searchQuery, isMobile } from '$lib/global.svelte';
	import { components } from '$lib/utils/styles';
	import { handleShare, productIdsToDataset } from '$lib/utils/helpers';
	import { Kaljakori } from '$lib/alko';
	import {
		getItemQuantity,
		getListById,
		getListItem,
		listToURI,
		removeFromList,
		saveList,
		updateQuantity
	} from '$lib/utils/lists';
	import Icon from '../widgets/Icon.svelte';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import type { ColumnNames, ListObj, PriceListItem } from '$lib/types';
	import {
		shownColumnsToHighlight,
		defaultSortingColumn,
		AllColumns,
		shownSortingKeys,
		defaultSortingOrderMap,
		ContextKeys,
		GenderOptionsMap
	} from '$lib/utils/constants';
	import {
		headerToDisplayName,
		sortingOrderToString,
	} from '$lib/utils/helpers';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { addToList } from '$lib/utils/lists';
	import Filters from '../widgets/Filters.svelte';
	import { goto } from '$app/navigation';
	import { getContext, untrack } from 'svelte';
	import { initFilterValues } from '$lib/utils/filters';
	import type { SearchParamsManager } from '$lib/utils/url';
	import ProductPreview from '../widgets/ProductPreview.svelte';

	let activeFilters: ColumnNames[] = $state([]);

	const { list: importedList, dataset }: { list: ListObj; dataset: string[][] } = $props();

	let searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);

	const existingList = getListById(importedList.id);
	const list = existingList || importedList;

	const listDataset = $derived.by(() => {
		return productIdsToDataset(
			dataset,
			list.items.map((i) => i.id)
		);
	});

	const kaljakori = $derived(new Kaljakori(listDataset, personalInfo));

	let listRef: SvelteVirtualList<PriceListItem> | null = $state(null);

	let detailsElement: HTMLDialogElement | null = $state(null);

	export function toggleDetailsElement() {
		if (!detailsElement) return;
		if (detailsElement.open) detailsElement.close();
		else if ($isLaptop) detailsElement.showModal();
		else detailsElement.show();
	}

	$effect(() => {
		if (detailsElement?.open) detailsElement.close();
		if ($isLaptop) return;
		detailsElement?.show();
	});

	let filtersComponent: Filters | null = $state(null);
	let filterValues = $state(initFilterValues(untrack(() => kaljakori)));

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
		let temp = kaljakori.fuzzySearchAndFilter($searchQuery, filterValuesCopy);
		if (!!selectedSortingColumn)
			temp = temp.sort((a, b) => (a[selectedSortingColumn] > b[selectedSortingColumn] ? 1 : -1));
		if (!asc) temp = temp.reverse();
		return temp;
	});

	function getListDetails() {
		let totalPrice = 0;
		let totalAlcoholGrams = 0;
		let totalItems = 0;
		let totalSugar = 0;
		let totalVolume = 0;
		list.items.forEach((item) => {
			const product = kaljakori.data.find((p) => p[AllColumns.Number] === item.id);
			if (product) {
				totalItems += item.q;
				totalPrice += product[AllColumns.Price] * item.q;
				totalAlcoholGrams += product[AllColumns.AlcoholGrams] * item.q;
				totalSugar += (product[AllColumns.Sugar] || 0) * item.q;
				totalVolume += product[AllColumns.BottleSize] * item.q;
			}
		});

		const totalAlcoholGramsPerEuro = totalPrice > 0 ? totalAlcoholGrams / totalPrice : 0;
		const totalBAC =
			totalAlcoholGrams /
			((personalInfo.weight ||
				(personalInfo.gender === GenderOptionsMap.Female
					? 76
					: personalInfo.gender === GenderOptionsMap.Male
						? 86
						: 79)) *
				(personalInfo.gender === GenderOptionsMap.Male ? 0.68 : 0.55));

		return {
			totalPrice: totalPrice.toFixed(2),
			totalAlcoholGrams: totalAlcoholGrams.toFixed(2),
			totalAlcoholGramsPerEuro: totalAlcoholGramsPerEuro.toFixed(2),
			totalItems,
			totalSugar: totalSugar.toFixed(2),
			totalBAC: totalBAC.toFixed(2),
			totalVolume: totalVolume.toFixed(2)
		};
	}

	let details = $derived.by(getListDetails);

	function validateListName(name: string) {
		if (name.trim().length === 0) list.name = 'Nimetön lista';
		else list.name = name.trim();
	}

	function modifyQuantity(item: PriceListItem, delta: number) {
		updateQuantity(
			list,
			item[AllColumns.Number],
			getItemQuantity(list, item[AllColumns.Number]) + delta
		);
	}

	$effect(() => {
		searchParamsManager.setParameter('list', listToURI(list));
	});
</script>

<div class="flex flex-row items-center justify-between gap-4 border-b border-primary p-3 md:p-4">
	<button
		onclick={() => (window.history.length > 1 ? window.history.back() : goto('/'))}
		class={twMerge(components.button({ size: 'md' }), 'aspect-square md:aspect-auto')}
	>
		<Icon name="arrow_back" class="inline-block" />
		<span class="hidden md:block">{window.history.length > 1 ? 'Takaisin' : 'Etusivulle'}</span>
	</button>
	{#if existingList}
		<input
			type="text"
			name="listName"
			onblur={() => validateListName(list.name)}
			class="w-full border-none bg-transparent p-0 text-2xl leading-none focus:ring-0"
			bind:value={list.name}
		/>
		{#if list.items.length > 0}
			<button
				class={twMerge(components.button({ size: 'md' }), 'aspect-square md:aspect-auto')}
				onclick={() => {
					toggleDetailsElement();
				}}
			>
				<Icon name="sidebar" class="inline-block " />
				<span class="hidden md:block"> Tiedot </span>
			</button>
			<button
				class={twMerge(
					components.button({ type: 'positive', size: 'md' }),
					'aspect-square md:aspect-auto'
				)}
				onclick={async () => {
					const shared = await handleShare({
						title: `Alkometriikka - ${list.name}`,
						text: `Katso lista: ${list.name}`,
						url: `${location.origin}/listat?list=${listToURI(list)}`
					});

					if (!shared) alert('Linkki kopioitu leikepöydälle!');
				}}
			>
				<Icon name="share" class="inline-block " /><span class="hidden md:block">Jaa</span>
			</button>
		{/if}
	{:else}
		<h2 class="text-lg leading-none md:text-2xl">{list.name}</h2>
		<button
			class={twMerge(components.button({ type: 'positive', size: 'md' }))}
			onclick={() => {
				const saved = saveList(list);
				goto(`?list=${listToURI(saved)}`);
			}}
		>
			<span>Tallenna lista</span>
			<Icon name="save" />
		</button>
	{/if}
</div>
<div
	class={twMerge(
		'relative grid h-full max-h-full grid-cols-[1fr_auto] overflow-hidden',
		kaljakori.data.length > 1 && 'grid-cols-[auto_1fr_auto]'
	)}
>
	{#if kaljakori.data.length === 0}
		<div class="grid flex-auto place-content-center">
			<div class="mx-auto prose text-center">
				<h2>Lista on tyhjä!</h2>
				<p>Lisää tuotteita listaan tuotevalikosta!</p>
				<a href="/" class={twMerge(components.button({ type: 'positive' }), 'mx-auto w-full')}>
					<span>Tuotevalikkoon</span>
					<Icon name="arrow_right_stroke" />
				</a>
			</div>
		</div>
	{:else}
		{#if kaljakori.data.length > 1}
			<aside class="z-10 flex h-full flex-col overflow-hidden border-primary md:w-84 md:border-e">
				<Filters
					{kaljakori}
					bind:filterValues
					bind:activeFilters
					bind:this={filtersComponent}
					useURLParams={false}
				/>
			</aside>
		{/if}
		<main class="mx-auto flex h-full w-full flex-col gap-3 bg-secondary p-3 md:gap-4 md:p-6">
			<div class="flex w-full flex-col items-start gap-4">
				<div class={twMerge('grid w-full grid-cols-2 items-end gap-2 md:w-fit')}>
					<div class="flex flex-col">
						<label for={'sortingColumn'} class="text-sm">
							{'Järjestys'}
						</label>
						<div class="flex flex-row flex-nowrap">
							<select
								name="sortingColumn"
								id="sortingColumn"
								bind:value={selectedSortingColumn}
								class={twMerge(components.input(), 'w-full rounded-none rounded-s pe-8')}
							>
								{#each shownSortingKeys as filter}
									{@const hasValues = kaljakori.getFilterValues(filter).length > 0}
									{#if hasValues}
										<option value={filter}>{headerToDisplayName(filter)}</option>
									{/if}
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
									<span class="hidden whitespace-nowrap md:block">
										{sortingOrderToString(asc, selectedSortingColumn)}
									</span>
									<Icon name={asc ? 'up_arrow_alt' : 'down_arrow_alt'} />
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
							class={twMerge(components.input(), 'w-full pe-8')}
						>
							{#each shownColumnsToHighlight as filter}
								{@const hasValues = kaljakori.getFilterValues(filter).length > 0}
								{#if hasValues}
									<option value={filter}>{headerToDisplayName(filter)}</option>
								{/if}
							{/each}
						</select>
					</div>
				</div>
			</div>
			<div class="flex flex-row flex-nowrap items-center justify-between gap-2">
				{#if $isMobile}
					<button
						onclick={() => {
							filtersComponent?.toggleFilterElement();
						}}
						class={twMerge(components.button(), 'w-full')}
					>
						<span>Näytä suodattimet</span>
						<Icon name={'filter'} />
					</button>
				{/if}
				<button
					onclick={() => {
						listRef?.scroll({ index: 0, smoothScroll: false });
					}}
					class={twMerge(components.button(), 'ml-auto')}
				>
					<Icon name={'arrow_to_top'} />
					<span>{$isMobile ? 'Alkuun' : 'Hyppää alkuun'}</span>
				</button>
			</div>
			<div class="flex flex-auto flex-col">
				<SvelteVirtualList items={rows} bind:this={listRef} itemsClass={'flex flex-col gap-3'}>
					{#snippet renderItem(item, idx: number)}
						{@const listItem = getListItem(list, item[AllColumns.Number])}
						<ProductPreview product={item} quantity={listItem?.q} highlight={selectedHighlight} {kaljakori}>
							{#snippet renderExtras()}
								<div
									class="absolute top-0 left-0 flex flex-nowrap items-center gap-0.5 rounded-br bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 text-sm text-secondary"
								>
									<Icon name="hashtag" />
									<span>{`${(idx + 1)}`}</span>
								</div>	
								{#if listItem}
									<div class={twMerge('flex flex-row')}>
										<button
											class={twMerge(
												components.button(),
												'rounded-e-none border-e-0',
												listItem.q === 1 && 'cursor-not-allowed opacity-50'
											)}
											disabled={listItem.q === 1}
											onclick={() => {
												modifyQuantity(item, -1);
											}}
										>
											<Icon name="minus" />
										</button>
										<input
											type="number"
											bind:value={listItem.q}
											min={1}
											oninput={(e) => {
												const target = e.target as HTMLInputElement;
												if (!target) return;
												if (target.valueAsNumber <= 1) {
													target.valueAsNumber = 1;
													listItem.q = 1;
												}
											}}
											onblur={(e) => {
												const target = e.target as HTMLInputElement;
												if (!target) return;
												if (!target.value || target.valueAsNumber <= 1) {
													target.valueAsNumber = 1;
													listItem.q = 1;
												}
											}}
											class={twMerge(
												components.input(),
												'hide-number-input w-[6ch] rounded-none text-center'
											)}
										/>
										<button
											class={twMerge(components.button(), 'rounded-s-none border-s-0')}
											onclick={() => {
												modifyQuantity(item, 1);
											}}
										>
											<Icon name="plus" />
										</button>
									</div>
								{/if}
								{#if existingList}
									<button
										class={twMerge(components.button({ type: 'negative' }))}
										onclick={() => removeFromList(list, item[AllColumns.Number])}
									>
										<span>Poista listasta</span>
										<Icon name="trash" />
									</button>
								{:else}
									<Popup class="gap-4 p-4">
										{#snippet renderButton(dialogElement: HTMLDialogElement)}
											<button
												class={twMerge(components.button({ type: 'positive' }))}
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
							{/snippet}
						</ProductPreview>
					{/snippet}
				</SvelteVirtualList>
			</div>
		</main>
		<aside
			class="z-10 flex h-full flex-col overflow-x-hidden overflow-y-auto border-primary xl:border-s"
		>
			<dialog
				bind:this={detailsElement}
				class={twMerge(
					'fixed m-auto hidden h-full w-full flex-col gap-4 rounded-lg bg-primary border border-primary p-4 backdrop:backdrop-blur-sm open:flex xl:relative xl:w-84 xl:rounded-none xl:border-0 transition open:starting:scale-0 md:open:starting:scale-100 open:scale-100'
				)}
			>
				<h2 class="text-2xl font-bold">Listan tiedot</h2>
				<div class="flex flex-auto flex-col gap-4">
					<p>Tuotteita listassa: {details.totalItems}</p>
					<p>Kokonaismäärä: {details.totalVolume} L</p>
					<p>Yhteensä alkoholia: {details.totalAlcoholGrams} g</p>
					<p>Yhteensä sokeria: {details.totalSugar} g</p>
					<p>Alkoholia per euro: {details.totalAlcoholGramsPerEuro} g/€</p>
					<p>Arvioitu promillemäärä: {details.totalBAC} ‰</p>
					<div
						class={twMerge(components.button({ size: "lg" }), "w-full mt-auto hover:cursor-default")}
					>
						<Icon name="shopping_bag" />
						<h2>Yhteensä: {details.totalPrice} €</h2>
					</div>
				</div>
				{#if $isLaptop}
					<div class="flex flex-row flex-wrap justify-end gap-4">
						<button
							onclick={() => {
								toggleDetailsElement();
							}}
							class={twMerge(components.button({ type: 'negative' }))}
						>
							Sulje
						</button>
					</div>
				{/if}
			</dialog>
		</aside>
	{/if}
</div>
