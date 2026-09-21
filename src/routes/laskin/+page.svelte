<script lang="ts">
	import { AllColumns, DrunkColumns, GenderOptionsMap } from '$lib/utils/constants';
	import { calculateDrunkValue } from '$lib/utils/alko';
	import { components } from '$lib/utils/styles';
	import { formatValue } from '$lib/utils/format';
	import { generateTitle, setSEO } from '$lib/utils/helpers';
	import { personalInfo } from '$lib/global.svelte';
	import type { GenderOptions } from '$lib/types';
	import { twMerge } from 'tailwind-merge';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let volume = $state<number | null>(0.5);
	let percentage = $state<number | null>(5);
	let price = $state<number | null>(5);
	let weight = $state<number | null>(null);
	let gender = $state<GenderOptions>(GenderOptionsMap.Unspecified);
	const savedValuesAvailable = $derived(personalInfo.weight != null || personalInfo.gender != null);
	let savedValuesOverride = $state<boolean | undefined>(undefined);
	const useSavedValues = $derived(savedValuesOverride ?? savedValuesAvailable);

	function toggleSavedValues() {
		savedValuesOverride = !useSavedValues;
	}

	function updateWeight(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		weight = value === '' ? null : Number(value);
	}

	function updateGender(event: Event) {
		gender = (event.currentTarget as HTMLSelectElement).value as GenderOptions;
	}

	const effectiveWeight = $derived(useSavedValues ? personalInfo.weight : weight);
	const effectiveGender = $derived(
		useSavedValues
			? (personalInfo.gender ?? GenderOptionsMap.Unspecified)
			: gender
	);

	const result = $derived.by(() => {
		if (
			volume == null ||
			percentage == null ||
			price == null ||
			volume <= 0 ||
			percentage < 0 ||
			price < 0 ||
			(effectiveWeight != null && effectiveWeight <= 0)
		) {
			return null;
		}

		return calculateDrunkValue(
			volume,
			percentage,
			price,
			effectiveGender,
			effectiveWeight ?? undefined
		);
	});

	const catalogRank = $derived.by(() => {
		if (!result || !data.alko) return null;

		return data.alko.then(({ kaljakori }) => {
			const catalogValues = kaljakori.data
				.filter((item) => item[AllColumns.RemovedFromSelection] !== true)
				.map((item) => Number(item[AllColumns.AlcoholGramsPerEuro]))
				.filter(Number.isFinite);
			const rank = 1 + catalogValues.filter((value) => value > result[DrunkColumns.AlcoholGramsPerEuro]).length;

			return { rank, total: catalogValues.length };
		});
	});

	const resultRows = [
		[DrunkColumns.AlcoholGrams, 'Puhdasta alkoholia'],
		[DrunkColumns.AlcoholGramsPerEuro, 'Alkoholia per euro (g)'],
		[DrunkColumns.EstimatedPromille, 'Arvioidut promillet'],
		[DrunkColumns.PromillePerEuro, 'Promillea per euro'],
		[DrunkColumns.Servings, 'Annokset'],
		[DrunkColumns.EuroPerLiterAlcohol, 'Hinta raakaa alkoholia kohden (€/l)']
	] as const;

	$effect(() => {
		setSEO({
			description: 'Laske juoman alkoholimäärä, annokset ja promillearvio omilla arvoillasi.',
			keywords: 'laskin, promillelaskuri, alkoholi, annokset'
		});
	});
</script>

<svelte:head>
	<title>{generateTitle('Laskin')}</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
	<header class="max-w-2xl">
		<h1 class="text-2xl font-bold md:text-3xl">Laskin</h1>
		<p class="mt-2 text-secondary">
			Laske Alkon valikoiman ulkopuolisen juoman arvot samoilla laskukaavoilla kuin tuotesivuilla.
		</p>
	</header>

	<form class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" onsubmit={(event) => event.preventDefault()}>
		<section class="flex flex-col gap-4 rounded border border-primary bg-secondary p-4 md:p-6">
			<h2 class="text-lg font-bold">Juoman tiedot</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="flex flex-col gap-1" for="volume">
					<span class="text-sm">Tilavuus (l)</span>
					<input id="volume" bind:value={volume} class={twMerge(components.input(), 'w-full')} type="number" min="0.001" step="0.001" required />
				</label>
				<label class="flex flex-col gap-1" for="percentage">
					<span class="text-sm">Alkoholipitoisuus (%)</span>
					<input id="percentage" bind:value={percentage} class={twMerge(components.input(), 'w-full')} type="number" min="0" max="100" step="0.1" required />
				</label>
				<label class="flex flex-col gap-1" for="price">
					<span class="text-sm">Hinta (€)</span>
					<input id="price" bind:value={price} class={twMerge(components.input(), 'w-full')} type="number" min="0" step="0.01" required />
				</label>
			</div>
		</section>

		<section class="flex flex-col gap-4 rounded border border-primary bg-secondary p-4 md:p-6">
			<div>
				<h2 class="text-lg font-bold">Promillearvion tiedot</h2>
				<p class="mt-1 text-sm text-secondary">Paino ja sukupuoli vaikuttavat vain promillearvioihin.</p>
			</div>
			<label class="flex items-center gap-2 text-sm">
				<input checked={useSavedValues} onclick={toggleSavedValues} type="checkbox" />
				<span>Käytä tallennettuja arvoja</span>
			</label>
			<label class="flex flex-col gap-1" for="weight">
				<span class="text-sm">Paino (kg)</span>
				<input id="weight" value={effectiveWeight ?? ''} oninput={updateWeight} disabled={useSavedValues} class={twMerge(components.input(), 'w-full')} type="number" min="1" max="500" step="0.1" placeholder="Oletusarvo" />
			</label>
			<label class="flex flex-col gap-1" for="gender">
				<span class="text-sm">Sukupuoli</span>
				<select id="gender" value={effectiveGender} onchange={updateGender} disabled={useSavedValues} class={twMerge(components.input(), 'w-full')}>
					{#each Object.values(GenderOptionsMap) as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
		</section>
	</form>

	<section aria-live="polite" class="flex flex-col gap-4">
		<h2 class="text-lg font-bold">Tulokset</h2>
		{#if result}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each resultRows as [column, label] (column)}
					<div class="rounded border border-primary bg-primary p-4">
						<p class="text-sm text-secondary">{label}</p>
						<p class="mt-1 text-xl font-bold">{formatValue(result[column], column)}</p>
					</div>
				{/each}
			</div>
			{#await catalogRank then rank}
				{#if rank}
					<div class="rounded border border-brand-2 bg-brand-4 p-4 text-white">
						<p class="text-sm text-white/75">Vertailu Alkon aktiiviseen valikoimaan</p>
						<p class="mt-1 text-xl font-bold">Sijoittuisi sijalle {rank.rank} / {rank.total}</p>
						<p class="mt-1 text-sm text-white/75">Vertailu perustuu alkoholigrammoihin euroa kohden.</p>
					</div>
				{/if}
			{:catch}
				<p class="rounded border border-primary bg-secondary p-4 text-secondary">
					Alkoholivalikoiman vertailua ei voitu ladata.
				</p>
			{/await}
		{:else}
			<p class="rounded border border-primary bg-secondary p-4 text-secondary">
				Anna kelvolliset arvot nähdäksesi tulokset.
			</p>
		{/if}
	</section>
</main>