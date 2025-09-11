<script lang="ts">
	import { Kaljakori } from '$lib/alko/index.js';
	import StringInput from '$lib/components/inputs/String.svelte';
	import NumberInput from '$lib/components/inputs/Number.svelte';
	import { generateImageUrl } from '$lib/utils/image.js';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import logo from '$lib/assets/images/alko-juominen.png';
	const { data } = $props();

	let listRef: SvelteVirtualList | null = null;

	const kaljakori = new Kaljakori(data.data);

	const shownFilters = [
		'Nimi',
		'Tyyppi',
		'Valmistusmaa',
		'Valmistaja',
		'Pullokoko',
		'Hinta',
		'Promillet / €',
		'Alkoholi-%',
		'Valikoima'
	];

	const filterToUnitMarker: { [key: string]: string } = {
		Hinta: '€',
		'Pullokoko': 'L',
		'Promillet / €': '‰',
	};

	const filterRenameMap: { [key: string]: string } = {
		'Pullokoko': 'Pakkauskoko'
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

	let selectedSortingColumn: string = $state('Promillet / €');
	let asc = $state(false);

	const { min, max } = kaljakori;

	let rows = $derived.by(() => {
		let temp = kaljakori.filter(filterValues);
		if (!!selectedSortingColumn)
			temp = temp.sort((a, b) => (a[selectedSortingColumn] > b[selectedSortingColumn] ? 1 : -1));
		if (!asc) temp = temp.reverse();
		return temp;
	});
</script>


<main class="mx-auto flex h-full flex-col gap-4 p-4">
	<header class="flex flex-row items-center gap-4">
		<img src={logo} alt="Alkoassistentti Logo" class="aspect-square w-32" />
		<h1 class="text-4xl font-bold text-red-600">Assistentti</h1>
	</header>
	<div class="flex flex-row flex-wrap items-end gap-2">
		{#each filters as filter}
			{@const filterId = crypto.randomUUID()}
			{@const possibleValues = kaljakori.getFilterValues(filter)}
			{@const type = kaljakori.getFilterType(filter)}
			{#if type === 'number'}
				<div class="flex flex-col">
					<label for={filterId} class=" text-sm">
						{filterRenameMap[filter] ?? filter}
						{filterToUnitMarker[filter] ? ` (${filterToUnitMarker[filter]})` : ''}
					</label>
					<div class="flex flex-row gap-2">
						<NumberInput
							bind:value={filterValues[filter]}
							min={kaljakori.min[filter as keyof typeof min]}
							max={kaljakori.max[filter as keyof typeof max]}
							step={0.01}
						/>
					</div>
				</div>
			{:else if type === 'any'}
				<div class="flex flex-col text-sm">
					<label for={filterId}>{filter}</label>
					<select name={filterId} id={filterId} multiple size={5}>
						{#each possibleValues as value}
							<option {value}>{value}</option>
						{/each}
					</select>
				</div>
			{:else}
				<div class="flex flex-col text-sm">
					<label for={filterId}>{filter}</label>
					<StringInput options={possibleValues} bind:value={filterValues[filter]} />
				</div>
			{/if}
		{/each}
		<button
			onclick={() => {
				filterValues = initFilterValues();
				listRef?.scroll({ index: 0 });
			}}
			class="rounded border border-gray-300 px-1.5 py-0.5"
		>
			{'Tyhjennä suodattimet'}
		</button>
	</div>

	<div class="flex flex-col">
		<label for={'sortingColumn'}>
			{'Järjestys'}
		</label>
		<div class="flex flex-row flex-wrap gap-4">
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
					class="rounded border border-gray-300 px-1.5 py-0.5"
				>
					{asc ? 'Nouseva' : 'Laskeva'}
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
			class="rounded border border-gray-300 px-1.5 py-0.5"
		>
			Hyppää alkuun
		</button>
	</div>

	<div class="flex flex-auto flex-col">
		<SvelteVirtualList items={rows} bufferSize={50} bind:this={listRef}>
			{#snippet renderItem(item: any, idx: number)}
				{@const multiplier = item['Promillet / €'] / kaljakori.max['Promillet / €']}
				{@const colorR = 200 - 100 * multiplier}
				{@const colorG = 30 + 200 * multiplier * 1.5}
				{@const colorB = 20}
				{@const ratings = ['Huono', 'Ok', 'Hyvä', 'Erinomainen']}
				{@const rating = ratings[Number((3 * multiplier).toFixed(0))]}
				<div
					class={twMerge(
						'relative mb-2 flex flex-row flex-nowrap items-center gap-4 rounded border p-4',
						rating === 'Erinomainen'
							? 'rotate-text border-3 border-red-600 after:absolute after:top-1/2 after:right-0 after:block after:-translate-y-1/2 after:rounded-r after:bg-red-600 after:px-3 after:text-nowrap after:text-white after:content-["Erinomainen_‰/€-suhde"]'
							: 'border-gray-300'
					)}
				>
					<div class="flex aspect-square w-32">
						<img
							src={generateImageUrl(item.Numero, item.Nimi)}
							alt={item.Nimi}
							class="block h-full w-full object-contain"
						/>
					</div>
					<div class="flex flex-col gap-2">
						<div class="flex flex-row items-center gap-3">
							<span class="text-sm text-gray-500">{'#' + (idx + 1)}</span>
							<h2 class="text-2xl font-bold">
								<a
									href={`https://www.alko.fi/tuotteet/${item.Numero}`}
									target="_blank"
									rel="noopener noreferrer"
									class="hover:underline"
								>
									{item.Nimi} ({item.Pullokoko} L)
								</a>
							</h2>
						</div>
						<div class="flex flex-row items-start gap-3">
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
						<div class="flex flex-row items-center gap-4">
							<div class="flex items-center gap-2">
								<p class="text-xl font-bold">
									Hinta: {Number.parseFloat(item.Hinta).toFixed(2)} €
								</p>
								<span class="text-sm text-gray-500">({item.Litrahinta} €/L)</span>
							</div>
							<p
								class={twMerge('rounded px-1.5 py-0.5', multiplier <= 0.5 && 'text-white')}
								style={`background-color: rgba(${colorR}, ${colorG}, ${colorB}, 1)`}
							>
								Promillet / €: {item['Promillet / €']} <span class={'text-sm'}>({rating})</span>
							</p>
							{#if !!item.Uutuus}
								<p class="rounded bg-red-200 text-red-800 px-1.5 py-0.5">Uutuus</p>
							{/if}
							{#if item['Erityisryhmä'] === 'Luomu'}
								<p class="rounded bg-green-300 text-green-800 px-1.5 py-0.5">Luomu</p>
							{/if}
							{#if item['Erityisryhmä'] === 'Vegaaneille soveltuva tuote'}
								<p class="rounded bg-emerald-300 text-emerald-800 px-1.5 py-0.5">Vegaani</p>
							{/if}
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
