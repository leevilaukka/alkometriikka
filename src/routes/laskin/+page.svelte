<script lang="ts">
	import { AllColumns, DrunkColumns } from '$lib/utils/constants/columns';
	import { GenderOptionsMap } from '$lib/utils/constants/app';
	import { calculateDrunkValue } from '$lib/utils/catalog/alko';
	import { components } from '$lib/utils/ui/styles';
	import { formatValue } from '$lib/utils/format/format';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { staticPage } from '$lib/utils/app/seo';
	import { personalInfo } from '$lib/global.svelte';
	import type { GenderOptions } from '$lib/types';
	import { twMerge } from 'tailwind-merge';
	import type { PageProps } from './$types';
	import { genderLabel } from '$lib/utils/format/labels';
	import { locale, m } from '$lib/i18n';

	const calculatorAnalytics = (() => {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const track = (usingSavedValues: boolean) => {
			if (!volume || !percentage || !price) return;
			sendAnalyticsEvent('calculator_used', {
				using_saved_values: usingSavedValues,
				state: { volume, percentage, price },
				result: {
					perEuro: result?.[DrunkColumns.AlcoholGramsPerEuro] || 0,
					rawAlcohol: result?.[DrunkColumns.AlcoholGrams] || 0
				}
			});
		};

		return {
			schedule(usingSavedValues: boolean) {
				if (timeout) clearTimeout(timeout);
				timeout = setTimeout(() => track(usingSavedValues), 1000);
			},
			flush(usingSavedValues: boolean) {
				if (timeout) clearTimeout(timeout);
				timeout = undefined;
				track(usingSavedValues);
			}
		};
	})();

	let { data }: PageProps = $props();

	let volume = $state<number | null>(0.5);
	let percentage = $state<number | null>(5);
	let price = $state<number | null>(5);
	let weight = $state<number | null>(null);
	let gender = $state<GenderOptions>(GenderOptionsMap.Unspecified);
	const savedValuesAvailable = $derived(personalInfo.weight != null || personalInfo.gender != null);
	let savedValuesOverride = $state<boolean | undefined>(undefined);
	const useSavedValues = $derived(savedValuesOverride ?? savedValuesAvailable);
	let hasUserEdited = false;

	function toggleSavedValues() {
		hasUserEdited = true;
		savedValuesOverride = !useSavedValues;
	}

	function updateWeight(event: Event) {
		hasUserEdited = true;
		const value = (event.currentTarget as HTMLInputElement).value;
		weight = value === '' ? null : Number(value);
	}

	function updateGender(event: Event) {
		hasUserEdited = true;
		gender = (event.currentTarget as HTMLSelectElement).value as GenderOptions;
	}

	function markCalculatorEdited() {
		hasUserEdited = true;
	}

	function flushWhenLeavingCalculator(event: FocusEvent) {
		const form = event.currentTarget as HTMLFormElement;
		const nextFocusedElement = event.relatedTarget as Node | null;
		if (nextFocusedElement && form.contains(nextFocusedElement)) return;
		if (hasUserEdited && result) calculatorAnalytics.flush(useSavedValues);
	}

	const effectiveWeight = $derived(useSavedValues ? personalInfo.weight : weight);
	const effectiveGender = $derived(
		useSavedValues ? (personalInfo.gender ?? GenderOptionsMap.Unspecified) : gender
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
			const rank =
				1 +
				catalogValues.filter((value) => value > result[DrunkColumns.AlcoholGramsPerEuro]).length;

			return { rank, total: catalogValues.length };
		});
	});

	const resultRows = [
		[DrunkColumns.AlcoholGrams, m.calculator_pure_alcohol()],
		[DrunkColumns.AlcoholGramsPerEuro, m.calculator_alcohol_per_euro()],
		[DrunkColumns.EstimatedPromille, m.column_estimated_promille()],
		[DrunkColumns.PromillePerEuro, m.calculator_promille_per_euro()],
		[DrunkColumns.Servings, m.column_servings()],
		[DrunkColumns.EuroPerLiterAlcohol, m.calculator_price_per_liter_alcohol()]
	] as const;

	$effect(() => {
		const { description, keywords } = staticPage('/laskin/', locale);
		setSEO({ description, keywords });
	});

	$effect(() => {
		if (hasUserEdited && result) {
			calculatorAnalytics.schedule(useSavedValues);
		}
	});
</script>

<svelte:head>
	<title>{generateTitle(m.nav_calculator())}</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
	<header class="max-w-2xl">
		<h1 class="text-2xl font-bold md:text-3xl">{m.nav_calculator()}</h1>
		<p class="mt-2 text-secondary">{m.calculator_intro()}</p>
	</header>

	<form
		class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
		onsubmit={(event) => event.preventDefault()}
		onfocusout={flushWhenLeavingCalculator}
	>
		<section class="flex flex-col gap-4 rounded border border-primary bg-secondary p-4 md:p-6">
			<h2 class="text-lg font-bold">{m.calculator_drink_title()}</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="flex flex-col gap-1" for="volume">
					<span class="text-sm">{m.calculator_volume()}</span>
					<input
						id="volume"
						bind:value={volume}
						oninput={markCalculatorEdited}
						class={twMerge(components.input(), 'w-full')}
						type="number"
						min="0.001"
						step="0.001"
						required
					/>
				</label>
				<label class="flex flex-col gap-1" for="percentage">
					<span class="text-sm">{m.calculator_alcohol()}</span>
					<input
						id="percentage"
						bind:value={percentage}
						oninput={markCalculatorEdited}
						class={twMerge(components.input(), 'w-full')}
						type="number"
						min="0"
						max="100"
						step="0.1"
						required
					/>
				</label>
				<label class="flex flex-col gap-1" for="price">
					<span class="text-sm">{m.chart_price_axis()}</span>
					<input
						id="price"
						bind:value={price}
						oninput={markCalculatorEdited}
						class={twMerge(components.input(), 'w-full')}
						type="number"
						min="0"
						step="0.01"
						required
					/>
				</label>
			</div>
		</section>

		<section class="flex flex-col gap-4 rounded border border-primary bg-secondary p-4 md:p-6">
			<div>
				<h2 class="text-lg font-bold">{m.calculator_promille_title()}</h2>
				<p class="mt-1 text-sm text-secondary">{m.calculator_promille_description()}</p>
			</div>
			<label class="flex items-center gap-2 text-sm">
				<input checked={useSavedValues} onclick={toggleSavedValues} type="checkbox" />
				<span>{m.calculator_use_saved()}</span>
			</label>
			<label class="flex flex-col gap-1" for="weight">
				<span class="text-sm">{m.personal_weight()}</span>
				<input
					id="weight"
					value={effectiveWeight ?? ''}
					oninput={updateWeight}
					disabled={useSavedValues}
					aria-describedby="saved-values-help"
					class={twMerge(
						components.input(),
						'w-full',
						useSavedValues ? 'cursor-not-allowed opacity-60' : ''
					)}
					type="number"
					min="1"
					max="500"
					step="0.1"
					placeholder={m.calculator_default_value()}
				/>
			</label>
			<label class="flex flex-col gap-1" for="gender">
				<span class="text-sm">{m.personal_gender()}</span>
				<select
					id="gender"
					value={effectiveGender}
					onchange={updateGender}
					disabled={useSavedValues}
					aria-describedby="saved-values-help"
					class={twMerge(
						components.input(),
						'w-full',
						useSavedValues ? 'cursor-not-allowed opacity-60' : ''
					)}
				>
					{#each Object.values(GenderOptionsMap) as option (option)}
						<option value={option}>{genderLabel(option)}</option>
					{/each}
				</select>
			</label>
		</section>
	</form>

	<section aria-live="polite" class="flex flex-col gap-4">
		<h2 class="text-lg font-bold">{m.calculator_results()}</h2>
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
						<p class="text-sm text-white/75">{m.calculator_rank_title()}</p>
						<p class="mt-1 text-xl font-bold">
							{m.calculator_rank({ rank: rank.rank, total: rank.total })}
						</p>
						<p class="mt-1 text-sm text-white/75">{m.calculator_rank_note()}</p>
					</div>
				{/if}
			{:catch}
				<p class="rounded border border-primary bg-secondary p-4 text-secondary">
					{m.calculator_rank_failed()}
				</p>
			{/await}
		{:else}
			<p class="rounded border border-primary bg-secondary p-4 text-secondary">
				{m.calculator_invalid()}
			</p>
		{/if}
	</section>
</main>
