<script lang="ts">
	import { Kaljakori } from '$lib/alko/index.js';
	import StringInput from '$lib/components/inputs/String.svelte';
	import Number from '$lib/components/inputs/Number.svelte';
	import { generateImageUrl } from '$lib/utils/image.js';
	const { data } = $props();

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

<main class="flex flex-col p-6 gap-6">
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
						<Number
							bind:value={filterValues[filter]}
							min={minPrice}
                            max={maxPrice}
							step={0.01}
						/>
					</div>
				{:else if filter === 'Pullokoko'}
					<div class="flex flex-row gap-2">
						<Number
							bind:value={filterValues[filter]}
							min={minBottleSize}
                            max={maxBottleSize}
							step={0.1}
						/>
					</div>
                    {:else if filter === "Promillet / €"}
					<div class="flex flex-row gap-2">
						<Number
							bind:value={filterValues[filter]}
							min={kaljakori.minBacPerEuro}
                            max={kaljakori.maxBacPerEuro}
							step={0.01}
						/>
					</div>
					{:else if filter === "Alkoholi-%"}
					<div class="flex flex-row gap-2">
						<Number
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

<div class="flex flex-col gap-4">
    {#each rows as item}
        <div class="border border-gray-300 rounded p-4 mb-2">
            <h2 class="font-bold text-lg"><a href={`https://www.alko.fi/tuotteet/${item.Numero}`}>{item.Nimi} ({item.Pullokoko} l)</a></h2>
            <p>Tyyppi: {item.Tyyppi}</p>
            <p>Valmistusmaa: {item.Valmistusmaa}</p>
            <p>Valmistaja: {item.Valmistaja}</p>
            <p>Pullokoko: {item.Pullokoko} L</p>
            <p>Hinta: {item.Hinta} €</p>
            <p>Alkoholi-%: {item["Alkoholi-%"]} %</p>
            <p>Alkoholigrammat / €: {item["Alkoholigrammat / €"]} g</p>
            <p>Promillet / €: {item["Promillet / €"]}</p>
			<img src={generateImageUrl(item.Numero, item.Nimi)} loading="lazy" alt={item.Nimi} class="w-32 h-auto mt-2"/>
        </div>
    {/each}
    {#if rows.length == 0}
        <p>Ei tuloksia</p>
    {/if}
</div>
</main>