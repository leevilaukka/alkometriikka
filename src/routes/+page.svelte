<script lang="ts">
	import { Kaljakori } from '$lib/alko/index.js';
	import StringInput from '$lib/components/inputs/String.svelte';
	import NumberInput from '$lib/components/inputs/Number.svelte';
	import { generateImageUrl } from '$lib/utils/image.js';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import logo from '$lib/assets/images/logo.png';
	const { data } = $props();

	let listRef: SvelteVirtualList | null = null;

	const personalData = JSON.parse(localStorage.getItem('personalData') ?? '{}');

	const kaljakori = new Kaljakori(data.data, personalData);

	const shownFilters = [
		'Nimi',
		'Tyyppi',
		'Valmistusmaa',
		'Valmistaja',
		'Pullokoko',
		'Hinta',
		'Promillet / €',
		'Alkoholi-%',
		'Valikoima',
		'Annokset'
	];

	const filterToUnitMarker: { [key: string]: string } = {
		Hinta: '€',
		Pullokoko: 'L',
		'Promillet / €': '‰'
	};

	const filterRenameMap: { [key: string]: string } = {
		Pullokoko: 'Pakkauskoko'
	};

	const filters = kaljakori.getFilterKeys().filter((f) => shownFilters.includes(f));

	function initFilterValues() {
		return shownFilters.reduce<{ [key: string]: any }>((obj, filter) => {
			if (kaljakori.getFilterType(filter) == 'number')
				obj[filter] = [
					kaljakori.min[filter as keyof typeof kaljakori.min],
					kaljakori.max[filter as keyof typeof kaljakori.max]
				];
			else if (kaljakori.getFilterType(filter) == 'string') obj[filter] = [];
			else if (kaljakori.getFilterType(filter) == 'any') obj[filter] = [null];
			return obj;
		}, {});
	}

	let filterValues = $state(initFilterValues());

	let selectedHighlight: string = $state('Promillet / €');

	let selectedSortingColumn: string = $state('Promillet / €');
	let asc = $state(false);

	let filtersElement: HTMLDialogElement;
	let isMobile = $state(window.matchMedia('(width <= 48rem)').matches);
	let showFilters = $derived(!isMobile);

	$effect(() => {
		if (isMobile) filtersElement.close();
		else filtersElement.show();
	})

	function toggleFilterElement() {
		if (!filtersElement) return;
		if (filtersElement.open) filtersElement.close();
		else if (isMobile) filtersElement.showModal();
		else filtersElement.show();
	}

	const { min, max } = kaljakori;

	let rows = $derived.by(() => {
		let filterValuesCopy = { ...filterValues };
		Object.keys(filterValuesCopy).forEach((key) => {
			if (Array.isArray(filterValuesCopy[key]) && kaljakori.getFilterType(key) !== 'number')
				filterValuesCopy[key] = new Set(filterValuesCopy[key]);
		});
		let temp = kaljakori.filter(filterValuesCopy);
		if (!!selectedSortingColumn)
			temp = temp.sort((a, b) => (a[selectedSortingColumn] > b[selectedSortingColumn] ? 1 : -1));
		if (!asc) temp = temp.reverse();
		return temp;
	});

	window.addEventListener('resize', () => {
		isMobile = window.matchMedia('(width <= 48rem)').matches;
	});
</script>

<div class="relative grid h-full grid-cols-[auto_1fr]">
	<aside class="flex flex-col h-full border-gray-300 md:border-r md:w-84">
		<div class="hidden flex-col items-center md:flex">
			<img src={logo} alt="Alkoassistentti Logo" class="aspect-video object-contain w-64" />
		</div>
		<dialog
			bind:this={filtersElement}
			class={twMerge(
				'm-auto hidden h-full w-full flex-col flex-wrap items-end gap-4 p-4 rounded-lg border border-gray-300 open:flex md:relative'
			)}
			open={showFilters}
			onclose={() => (showFilters = false)}
		>
			{#each filters as filter}
				{@const filterId = crypto.randomUUID()}
				{@const possibleValues = kaljakori.getFilterValues(filter)}
				{@const type = kaljakori.getFilterType(filter)}
				<div class="flex w-full flex-col text-sm">
					{#if type === 'number'}
						<label for={filterId} class=" text-sm">
							{filterRenameMap[filter] ?? filter}
							{filterToUnitMarker[filter] ? ` (${filterToUnitMarker[filter]})` : ''}
						</label>
						<div class="flex w-full flex-row gap-2">
							<NumberInput
								bind:value={filterValues[filter]}
								min={kaljakori.min[filter as keyof typeof min]}
								max={kaljakori.max[filter as keyof typeof max]}
								step={0.01}
							/>
						</div>
					{:else if type === 'any'}
						<label for={filterId}>{filter}</label>
						<select name={filterId} id={filterId} multiple size={5}>
							{#each possibleValues as value}
								<option {value}>{value}</option>
							{/each}
						</select>
					{:else}
						<label for={filterId}>{filter}</label>
						<StringInput options={possibleValues} bind:value={filterValues[filter]} name={filter} />
					{/if}
				</div>
			{/each}
			<button
				onclick={() => {
					filterValues = initFilterValues();
					listRef?.scroll({ index: 0 });
				}}
				class="mt-auto w-full rounded border border-gray-300 bg-white px-1.5 py-0.5"
			>
				{'Tyhjennä suodattimet'}
			</button>
			{#if isMobile}
				<button
					onclick={() => {
						toggleFilterElement();
						showFilters = !showFilters;
					}}
					class="w-full rounded bg-red-700 text-white px-3 py-2"
				>
					{'Sulje suodattimet'}
				</button>
			{/if}
		</dialog>
	</aside>
	<main class="mx-auto flex h-full w-full flex-col gap-4 bg-gray-100 p-6">
		<div class="flex w-full flex-col gap-4 items-start">
		<div class="flex md:hidden flex-col items-center border rounded border-gray-300 bg-white">
			<img src={logo} alt="Alkoassistentti Logo" class="aspect-video object-contain w-24" />
		</div>
			<div class={twMerge('flex flex-row flex-wrap items-end gap-2')}>
				<div class="flex flex-col">
					<label for={'sortingColumn'}>
						{'Järjestys'}
					</label>
					<div class="flex flex-row flex-wrap items-center gap-2">
						<select
							name="sortingColumn"
							id="sortingColumn"
							bind:value={selectedSortingColumn}
							class="rounded border border-gray-300 px-1.5 py-0.5"
						>
							<option value=""></option>
							{#each kaljakori.getFilterKeys() as filter}
								<option value={filter}>{filter}</option>
							{/each}
						</select>
						{#if selectedSortingColumn}
							<button
								onclick={() => {
									asc = !asc;
									listRef?.scroll({ index: 0, smoothScroll: false });
								}}
								class="rounded border border-gray-300 bg-white px-1.5 py-0.5"
							>
								{asc ? 'Nouseva' : 'Laskeva'}
							</button>
						{/if}
					</div>
				</div>
				<div class="flex flex-col">
					<label for={'selectedHighlight'}>
						{'Korostus'}
					</label>
					<select
						name="selectedHighlight"
						id="selectedHighlight"
						bind:value={selectedHighlight}
						class="rounded border border-gray-300 px-1.5 py-0.5"
					>
						{#each Object.keys(kaljakori.min) as filter}
							<option value={filter}>{filter}</option>
						{/each}
					</select>
				</div>

				{#if isMobile}
					<button
						onclick={() => {
							toggleFilterElement();
							showFilters = !showFilters;
						}}
						class="rounded border border-gray-300 bg-white px-1.5 py-0.5"
					>
						{showFilters ? 'Piilota suodattimet' : 'Näytä suodattimet'}
					</button>
				{/if}
			</div>
		</div>
		<div class="flex flex-row flex-wrap justify-between gap-2">
			<p>Tulosten määrä: {rows.length}</p>
			<button
				onclick={() => {
					listRef?.scroll({ index: 0, smoothScroll: false });
				}}
				class="rounded border border-gray-300 px-1.5 py-0.5 bg-white"
			>
				Hyppää alkuun
			</button>
		</div>

		<div class="flex flex-auto flex-col">
			<SvelteVirtualList items={rows} bufferSize={50} bind:this={listRef}>
				{#snippet renderItem(item: any, idx: number)}
					{@const multiplier =
						item[selectedHighlight] /
						kaljakori.max[selectedHighlight as keyof typeof kaljakori.max]}
					{@const ratings = ['Matala', 'Kohtalainen', 'Korkea']}
					{@const rating = ratings[Number(((ratings.length - 1) * multiplier).toFixed(0))]}
					<div
						class={twMerge(
							'relative mb-2 flex flex-col gap-3 rounded border border-gray-300 bg-white'
						)}
					>
						<div
							class={twMerge('flex flex-col flex-nowrap items-center gap-4 p-4 pb-0 md:flex-row')}
						>
							<div class="flex aspect-square w-32 max-w-[8rem]">
								<img
									src={generateImageUrl(item.Numero, item.Nimi)}
									alt={item.Nimi}
									class="block h-full w-full object-contain"
								/>
							</div>
							<div class="flex flex-col gap-2 w-full">
								<div class="flex flex-row items-center gap-3">
									<span class="text-sm text-gray-500">{'#' + (idx + 1)}</span>
									<a
										href={`https://www.alko.fi/tuotteet/${item.Numero}`}
										target="_blank"
										rel="noopener noreferrer"
										class="hover:underline"
									>
										<h2 class="text-2xl font-bold">
											{item.Nimi} ({item.Pullokoko} L)
										</h2>
									</a>
								</div>
								<div class="flex flex-col items-start gap-3 md:flex-row">
									<div class="flex flex-col gap-1">
										<p>Valmistaja: {item.Valmistaja}</p>
										<p>Tyyppi: {item.Tyyppi}</p>
										<p>Valmistusmaa: {item.Valmistusmaa}</p>
										<p>Pakkauskoko: {item.Pullokoko} L</p>
										<p>Valikoima: {item.Valikoima}</p>
									</div>
									<div class="flex flex-col gap-1">
										<p>Alkoholi-%: {item['Alkoholi-%']} %</p>
										<p>Alkoholi (g): {item['Alkoholigrammat']} g</p>
										<p>Annokset: {item['Annokset']}</p>
										<p>Alkoholi (g) / €: {item['Alkoholigrammat / €']} g</p>
										<p>Arvioidut promillet: {item['Arvioidut promillet']} ‰</p>
									</div>
								</div>
								<div class="flex flex-col gap-4 md:flex-row md:items-center">
									<div class="flex items-center gap-2">
										<p class="text-xl font-bold">
											Hinta: {Number.parseFloat(item.Hinta).toFixed(2)} €
										</p>
										<span class="text-sm text-gray-500">({item.Litrahinta} €/L)</span>
									</div>
									{#if !!item.Uutuus}
										<p class="rounded bg-red-200 px-1.5 py-0.5 text-red-800">Uutuus</p>
									{/if}
									{#if item['Erityisryhmä'] === 'Luomu'}
										<p class="rounded bg-green-300 px-1.5 py-0.5 text-green-800">Luomu</p>
									{/if}
									{#if item['Erityisryhmä'] === 'Vegaaneille soveltuva tuote'}
										<p class="rounded bg-emerald-300 px-1.5 py-0.5 text-emerald-800">Vegaani</p>
									{/if}
								</div>
							</div>
						</div>
						<div class="relative block max-w-full">
							<div
								class="relative flex h-full w-fit shrink-0 flex-nowrap items-center gap-1 bg-black px-1.5 py-0.5 text-sm whitespace-nowrap text-white"
								style={`left: ${100 * multiplier}%; transform: translateX(-${100 * multiplier}%);`}
							>
								<p>{selectedHighlight}: {item[selectedHighlight]}</p>
								<span class="text-xs">{rating}</span>
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
		{#if rows.length == 0}
			<p>Ei tuloksia</p>
		{/if}
	</main>
</div>
