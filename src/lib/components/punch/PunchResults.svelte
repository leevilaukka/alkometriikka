<script lang="ts">
	import type { PunchLine, PunchTotals } from '$lib/utils/catalog/punch';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';

	let {
		totals,
		lines,
		colors,
		glass,
		people,
		rank,
		hasPersonalInfo,
		hasSavedBody,
		useSavedBody = $bindable(false),
		onopensettings,
		class: _class = ''
	}: {
		totals: PunchTotals;
		lines: PunchLine[];
		/** Each line's `[light, dark]` colour, in the order of the lines */
		colors: (readonly [string, string])[];
		glass: number;
		people: number;
		/** Where the punch's alcohol per euro would place it among Alko's products */
		rank: { rank: number; total: number } | null;
		hasPersonalInfo: boolean;
		/** Whether a weight or gender is saved, otherwise the defaults are used anyway */
		hasSavedBody: boolean;
		/** Estimate with the saved weight and gender instead of the defaults */
		useSavedBody?: boolean;
		onopensettings: () => void;
		class?: string;
	} = $props();

	const decimals = (value: number, max: number, min = 0) =>
		formatValue(value, undefined, {
			numberFormatOptions: { minimumFractionDigits: min, maximumFractionDigits: max }
		});
	const litres = (value: number) => `${decimals(value, 2)} l`;
	const euros = (value: number) => formatValue(value, AllColumns.Price);
	const promille = (value: number) => `${decimals(value, 2, 2)} ‰`;
	const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
	const percent = (value: number) => `${decimals(value * 100, 0)} %`;

	const tiles = $derived([
		{ label: 'Alkoholia', value: `${decimals(totals.abv, 1)} %` },
		{ label: 'Hinta yhteensä', value: euros(totals.price) },
		{ label: `Lasillisia (${decimals(glass * 10, 1)} dl)`, value: decimals(totals.glasses, 1) },
		{ label: 'Hinta per lasi', value: euros(totals.perGlass.price) }
	]);

	const bars = $derived(
		(
			[
				['Määrä', 'volume', litres(totals.volume), undefined],
				['Alkoholi (100 %)', 'alcohol', litres(totals.alcohol), 'Puhtaan alkoholin määrä'],
				['Hinta', 'price', euros(totals.price), undefined]
			] as const
		).map(([label, key, total, tooltip]) => {
			const whole =
				key === 'volume' ? totals.volume : key === 'alcohol' ? totals.alcohol : totals.price;
			return {
				label,
				total,
				tooltip,
				segments: totals.lines
					.map((line, index) => ({ index, share: share(line[key], whole) }))
					.filter((segment) => segment.share > 0)
			};
		})
	);

	/** Ingredients that show up in at least one bar, for the legend table */
	const legend = $derived(
		lines
			.map((line, index) => ({ line, index, amounts: totals.lines[index] }))
			.filter(({ amounts }) => amounts.volume > 0 || amounts.price > 0)
	);

	const details = $derived([
		['Kokonaismäärä', litres(totals.volume)],
		// Only worth a row when there are mixers, otherwise it repeats the total
		...(totals.alcoholicVolume < totals.volume
			? ([['Alkoholijuomia', litres(totals.alcoholicVolume)]] as const)
			: []),
		['Puhdasta alkoholia', `${decimals(totals.grams, 0)} g`],
		['Annokset (12 g)', decimals(totals.servings, 1)],
		[
			'Hinta per annos',
			totals.euroPerServing !== null
				? formatValue(totals.euroPerServing, AllColumns.EuroPerServing)
				: '–'
		],
		[
			'Litrahinta',
			totals.euroPerLitre !== null
				? formatValue(totals.euroPerLitre, AllColumns.PricePerLiter)
				: '–'
		],
		[
			'Alkoholia per euro',
			totals.gramsPerEuro !== null ? `${decimals(totals.gramsPerEuro, 2, 2)} g` : '–'
		],
		['Annoksia per lasi', decimals(totals.perGlass.servings, 2)],
		['Promilleja per lasi', promille(totals.perGlass.promille)]
	] as const);

	const perPerson = $derived([
		['Hinta', euros(totals.perPerson.price)],
		['Lasillisia', decimals(totals.perPerson.glasses, 1)],
		['Annoksia', decimals(totals.perPerson.servings, 1)],
		['Promilleja', promille(totals.perPerson.promille)]
	] as const);
</script>

<section
	aria-live="polite"
	aria-labelledby="punch-results-title"
	class={twMerge('flex flex-col gap-5', _class)}
>
	<h2 id="punch-results-title" class="text-lg font-bold">Tulokset</h2>

	<div class="grid grid-cols-2 overflow-hidden rounded border border-primary">
		{#each tiles as tile, index (tile.label)}
			<div
				class={twMerge(
					'flex min-w-0 flex-col gap-1 border-primary bg-primary p-4',
					['border-r border-b', 'border-b', 'border-r', ''][index]
				)}
			>
				<span class="truncate text-xs text-secondary">{tile.label}</span>
				<strong class="text-2xl tabular-nums">{tile.value}</strong>
			</div>
		{/each}
	</div>

	{#if legend.length > 1}
		<div class="flex flex-col gap-3">
			<h3 class="font-semibold">Koostumus</h3>
			{#each bars as bar (bar.label)}
				<div class="flex flex-col gap-1">
					<div class="flex justify-between text-sm">
						<span title={bar.tooltip} class={bar.tooltip ? 'cursor-help' : undefined}
							>{bar.label}</span
						>
						<span class="text-secondary tabular-nums">{bar.total}</span>
					</div>
					<div class="flex h-3 gap-0.5 overflow-hidden rounded bg-secondary">
						{#each bar.segments as segment (segment.index)}
							<div
								class="h-full bg-(--segment) dark:bg-(--segment-dark)"
								style:--segment={colors[segment.index][0]}
								style:--segment-dark={colors[segment.index][1]}
								style:flex-grow={segment.share}
								style:flex-basis="0"
								title={`${lines[segment.index].name || 'Ainesosa'}: ${percent(segment.share)}`}
							></div>
						{/each}
					</div>
				</div>
			{/each}
			<!-- The bars' legend, and the same numbers as a table -->
			<table class="w-full text-sm">
				<thead class="text-xs text-secondary">
					<tr>
						<th class="py-1 text-start font-normal">Ainesosa</th>
						<th class="py-1 text-end font-normal">Määrä</th>
						<th class="py-1 text-end font-normal">Alkoholi</th>
						<th class="py-1 text-end font-normal">Hinta</th>
					</tr>
				</thead>
				<tbody>
					{#each legend as { line, index, amounts } (index)}
						<tr class="border-t border-primary">
							<td class="max-w-0 py-1.5 pe-2">
								<span class="flex items-center gap-2">
									<span
										class="h-2.5 w-2.5 shrink-0 rounded-sm bg-(--segment) dark:bg-(--segment-dark)"
										style:--segment={colors[index][0]}
										style:--segment-dark={colors[index][1]}
										aria-hidden="true"
									></span>
									<span class="truncate">{line.name || 'Ainesosa'}</span>
								</span>
							</td>
							<td class="py-1.5 text-end tabular-nums"
								>{percent(share(amounts.volume, totals.volume))}</td
							>
							<td class="py-1.5 text-end tabular-nums">
								{percent(share(amounts.alcohol, totals.alcohol))}
							</td>
							<td class="py-1.5 text-end tabular-nums"
								>{percent(share(amounts.price, totals.price))}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<dl
		class="grid grid-cols-1 overflow-hidden rounded border border-primary bg-primary sm:grid-cols-2"
	>
		{#each details as [label, value] (label)}
			<div
				class="flex justify-between gap-3 border-b border-primary px-4 py-2.5 sm:odd:border-r sm:odd:last:col-span-2 sm:odd:last:border-r-0"
			>
				<dt class="text-sm text-secondary">{label}</dt>
				<dd class="font-semibold whitespace-nowrap tabular-nums">{value}</dd>
			</div>
		{/each}
	</dl>

	{#if people > 1}
		<div class="flex flex-col gap-2">
			<h3 class="font-semibold">Per henkilö ({people} hlö)</h3>
			<dl class="grid grid-cols-2 overflow-hidden rounded border border-primary bg-primary">
				{#each perPerson as [label, value], index (label)}
					<div
						class={twMerge(
							'flex flex-col gap-0.5 border-primary px-4 py-2.5',
							['border-r border-b', 'border-b', 'border-r', ''][index]
						)}
					>
						<dt class="text-xs text-secondary">{label}</dt>
						<dd class="text-lg font-semibold tabular-nums">{value}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	{#if hasSavedBody}
		<label class="flex cursor-pointer items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={useSavedBody} class="shrink-0 rounded" />
			Käytä tallennettua painoa ja sukupuolta
		</label>
	{/if}

	<p class="text-xs text-secondary">
		Promillet ovat arvio Widmarkin kaavalla, jos alkoholi juodaan kerralla. Elimistö polttaa
		alkoholia noin 0,1 g painokiloa kohden tunnissa, joten todellinen lukema jää pienemmäksi.
		{#if !hasPersonalInfo}
			<button type="button" class="underline" onclick={onopensettings}>
				Lisää paino ja sukupuoli asetuksiin
			</button>
			laskeaksesi promillet omilla tiedoillasi.
		{/if}
	</p>

	{#if rank}
		<div class="rounded border border-brand-2 bg-brand-4 p-4 text-white">
			<p class="text-sm text-white/75">Vertailu Alkon valikoimaan</p>
			<p class="mt-1 text-xl font-bold">
				Sijoittuisi sijalle {rank.rank} / {rank.total}
			</p>
			<p class="mt-1 text-sm text-white/75">
				Alkoholigrammoina euroa kohden, jos booli olisi Alkon tuote.
			</p>
		</div>
	{/if}

	{#if lines.some((line) => line.missing)}
		<p class="flex items-center gap-2 text-sm text-secondary">
			<Icon name="alert_triangle" />
			Osaa tuotteista ei löytynyt hinnastosta, joten ne puuttuvat laskuista.
		</p>
	{/if}
</section>
