<script lang="ts">
	import { Kaljakori } from '$lib/alko/index.js';
	import StringInput from '$lib/components/inputs/String.svelte';
	import NumberInput from '$lib/components/inputs/Number.svelte';
	import { generateImageUrl } from '$lib/utils/image.js';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	const { data } = $props();

	let listRef: SvelteVirtualList | null = null;

	const kaljakori = new Kaljakori(data.data);

	const shownFilters = ['Nimi','Tyyppi', 'Valmistusmaa', 'Valmistaja', 'Pullokoko', 'Hinta', 'Promillet / €', "Alkoholi-%"];
	const filters = kaljakori.getFilterKeys().filter((f) => shownFilters.includes(f));

    function initFilterValues() {
        return shownFilters.reduce<{[key: string]: any}>((obj, filter) => {
        if(filter == "Hinta") obj[filter] = [kaljakori.minPrice, kaljakori.maxPrice];
        else if(filter == "Pullokoko") obj[filter] = [kaljakori.minBottleSize, kaljakori.maxBottleSize];
        else if(filter == "Promillet / €") obj[filter] = [kaljakori.minBacPerEuro, kaljakori.maxBacPerEuro];
        else if (filter == "Alkoholi-%") obj[filter] = [kaljakori.minAlcohol, kaljakori.maxAlcohol];
        else if (kaljakori.getFilterType(filter) == "number") obj[filter] = [0, Infinity];
        else if (kaljakori.getFilterType(filter) == "string") obj[filter] = [];
        else if (kaljakori.getFilterType(filter) == "any") obj[filter] = [null];

        return obj;
    }, {})
    }

    const filterValues = $state(initFilterValues());

    $inspect(filterValues)

	const { maxBottleSize, minBottleSize, maxPrice, minPrice } = kaljakori;

    let rows = $derived.by(() => {
        return kaljakori.filter(filterValues)
    })
</script>

<main class="flex flex-col p-6 gap-6 h-full">
<div class="flex flex-row flex-wrap gap-4">
	{#each filters as filter}
		{@const filterId = crypto.randomUUID()}
		{@const possibleValues = kaljakori.getFilterValues(filter)}
		{@const type = kaljakori.getFilterType(filter)}
		{console.log(filter, type, possibleValues)}
		{#if type === 'number'}
			<div class="flex flex-col">
				<label for={filterId}>{filter == "Pullokoko" ? "Tilavuus": filter} {filter == "Hinta" ? "(€)" : filter == "Pullokoko" ? "(L)" : "(‰)"}</label>
				{#if filter === 'Hinta'}
					<div class="flex flex-row gap-2">
						<NumberInput
							bind:value={filterValues[filter]}
							min={minPrice}
                            max={maxPrice}
							step={0.01}
						/>
					</div>
				{:else if filter === 'Pullokoko'}
					<div class="flex flex-row gap-2">
						<NumberInput
							bind:value={filterValues[filter]}
							min={minBottleSize}
                            max={maxBottleSize}
							step={0.1}
						/>
					</div>
                    {:else if filter === "Promillet / €"}
					<div class="flex flex-row gap-2">
						<NumberInput
							bind:value={filterValues[filter]}
							min={kaljakori.minBacPerEuro}
                            max={kaljakori.maxBacPerEuro}
							step={0.01}
						/>
					</div>
					{:else if filter === "Alkoholi-%"}
					<div class="flex flex-row gap-2">
						<NumberInput
							bind:value={filterValues[filter]}
							min={kaljakori.minAlcohol}
                            max={kaljakori.maxAlcohol}
							step={0.1}
						/>
					</div>
				{/if}
			</div>
		{:else if type === 'any'}
			<div class="flex flex-col gap-0.5">
				<label for={filterId}>{filter}</label>
				<select name={filterId} id={filterId} multiple size={5}>
					{#each possibleValues as value}
						<option {value}>{value}</option>
					{/each}
				</select>
			</div>
		{:else}
            <div class="flex flex-col gap-0.5">
                <label for={filterId}>{filter}</label>
                <StringInput options={possibleValues} bind:value={filterValues[filter]} />
			</div>
		{/if}
	{/each}
</div>

<div class="flex flex-row flex-wrap gap-4">
    <p>Tulosten määrä: {rows.length}</p>
</div>

<div class="flex flex-col flex-auto">

<SvelteVirtualList items={rows} bufferSize={50} bind:this={listRef}>
	{#snippet renderItem(item: any)}
		{@const multiplier = (item["Promillet / €"] / kaljakori.maxBacPerEuro)}
		{@const colorR = (255 -  (255 * multiplier))}
		{@const colorG = (55 + (255 * multiplier) * 2)}
		{@const colorB = 75}
		{@const ratings = ["Huono", "Ok", "Hyvä", "Erinomainen"]}
		{@const rating = ratings[Number((3 * multiplier).toFixed(0))]}
		<div class={twMerge("relative flex flex-row items-center flex-nowrap border rounded p-6 gap-6 mb-2", rating === "Erinomainen" ? 'border-amber-500 border-3 rotate-text after:absolute after:content-["Erinomainen_känni_suhde"] after:text-nowrap after:rounded-l after:-translate-y-1/2 after:px-1 after:py-0.5 after:top-1/2 after:left-0 after:block after:bg-amber-500' : "border-gray-300")}>
			<div class="flex w-32 aspect-square">
				<img src={generateImageUrl(item.Numero, item.Nimi)} alt={item.Nimi} class="block w-full h-full object-contain"/>
			</div>
			<div class="flex flex-col gap-2">
				<h2 class="font-bold text-2xl"><a href={`https://www.alko.fi/tuotteet/${item.Numero}`} target="_blank">{item.Nimi} ({item.Pullokoko} L)</a></h2>
				<div class="flex flex-row items-start gap-6">
					<div class="flex flex-col gap-2">
						<p>Valmistaja: {item.Valmistaja}</p>
						<p>Tyyppi: {item.Tyyppi}</p>
						<p>Valmistusmaa: {item.Valmistusmaa}</p>
						<p>Pullokoko: {item.Pullokoko} L</p>
					</div>
					<div class="flex flex-col gap-2">
						<p>Alkoholi-%: {item["Alkoholi-%"]} %</p>
						<p>Alkoholi (g): {item["Alkoholigrammat"]} g</p>
						<p>Annokset: {item["Annokset"]}</p>
						<p>Alkoholi (g) / €: {item["Alkoholigrammat / €"]} g</p>
					</div>
					<div class="flex flex-col gap-2">
						<p>Arvioidut promillet: {item["Arvioidut promillet"]} ‰</p>
						<p class="px-2 py-1 rounded" style={`background-color: rgba(${colorR}, ${colorG}, ${colorB}, 1)`}>Promillet / €: {item["Promillet / €"]} ({rating})</p>
					</div>
				</div>
				<p class="text-xl font-bold">Hinta: {Number.parseFloat(item.Hinta).toFixed(2)} €</p>
			</div>
        </div>
	{/snippet}
</SvelteVirtualList>
</div>
{#if rows.length == 0}
	<p>Ei tuloksia</p>
{/if}
</main>