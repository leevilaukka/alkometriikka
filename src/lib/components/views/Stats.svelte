<script lang="ts">
	import type { ChartConfiguration } from 'chart.js';
import { Kaljakori } from '$lib/alko';
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { theme } from '$lib/global.svelte';
	import type { AvailabilityData, ColumnNames, PersonalInfo } from '$lib/types';
	import {
		bandHistogram,
		bestValueRanks,
		categoryDistribution,
		computeSummary,
		formatFinNumber,
		subcategoryDistribution,
		topCategories
	} from '$lib/utils/stats';
	import ChartCard from '$lib/components/widgets/ChartCard.svelte';

	const {
		dataset,
		availability,
		personalInfo
	}: {
		dataset: any[][];
		availability: AvailabilityData;
		personalInfo: PersonalInfo;
	} = $props();

	const kaljakori = $derived(new Kaljakori(dataset, personalInfo, availability));
	const items = $derived(kaljakori.data);

	const summary = $derived(computeSummary(items));

	const headingGrid = 'grid grid-cols-2 gap-3 md:grid-cols-4';

	const priceBands = $derived(
		bandHistogram(items, AllColumns.Price, [0, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 25_000], '€')
	);
	const literBands = $derived(
		bandHistogram(
			items,
			AllColumns.PricePerLiter,
			[0, 2, 5, 10, 20, 50, 100, 200, 500, 2500],
			'€/l'
		)
	);
	const typeDistribution = $derived(topCategories(categoryDistribution(items, AllColumns.Type), 12));
	const subtypeDistribution = $derived(
		topCategories(subcategoryDistribution(items), 10)
	);
	const countryDistribution = $derived(
		topCategories(categoryDistribution(items, AllColumns.Country), 12)
	);
	const cheaps = $derived(bestValueRanks(items, 25));
	const alcoholBands = $derived(
		bandHistogram(
			items,
			AllColumns.AlcoholPercentage,
			[0, 0.5, 1, 2, 5, 7, 9, 11, 13, 15, 20, 25, 30, 40, 50, 80, 100],
			'%'
		)
	);
	const scatterPoints = $derived(
		items
			.filter(
				(item) =>
					Number.isFinite(Number(item[AllColumns.Price])) &&
					Number.isFinite(Number(item[AllColumns.AlcoholGramsPerEuro])) &&
					Number(item[AllColumns.Price]) > 0
			)
			.map((item) => ({
				x: Number(item[AllColumns.AlcoholGramsPerEuro]),
				y: Number(item[AllColumns.Price])
			}))
	);

	const isDark = $derived(
		(() => {
			void $theme;
			return document.documentElement.classList.contains('dark');
		})()
	);
	const gridColor = $derived(isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.16)');
	const tickColor = $derived(isDark ? '#a1a1aa' : '#3f3f46');
	const barColor = $derived(isDark ? 'rgba(229, 27, 21, 0.75)' : 'rgba(229, 27, 21, 0.92)');
	const scatterColor = $derived(isDark ? 'rgba(229, 27, 21, 0.65)' : 'rgba(201, 21, 15, 1)');
	const scatterBorderColor = $derived(isDark ? 'rgba(255, 255, 255, 0.55)' : '#8f100a');

	const barConfig = (
		labels: string[],
		values: number[],
		colors: string[] | string,
		opts: {
			indexAxis?: 'x' | 'y';
			logY?: boolean;
			tooltipLabel?: (context: { dataIndex: number; formattedValue: string }) => string;
		} = {}
	): ChartConfiguration => ({
		type: 'bar',
		data: {
			labels,
			datasets: [
				{
					label: 'Tuotteet',
					data: values,
					backgroundColor: colors,
					borderRadius: 4,
					maxBarThickness: 48
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			indexAxis: opts.indexAxis ?? 'x',
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (context) =>
							opts.tooltipLabel?.(context) ?? `${context.formattedValue} tuotetta`
					}
				}
			},
			scales: {
				x: { ticks: { color: tickColor, autoSkip: false }, grid: { color: gridColor } },
				y: opts.logY

					? {
							type: 'logarithmic',
							ticks: {
								color: tickColor,
								autoSkip: true,
								maxTicksLimit: 12,
								callback: (value) => {
									const v = Number(value);
									if (v <= 0 || !Number.isInteger(Math.log10(v))) return '';
									return formatFinNumber(v);
								}
							},
							grid: { color: gridColor }
						}
					: {
							beginAtZero: true,
							ticks: {
								color: tickColor,
								autoSkip: true,
								maxTicksLimit: 10
							},
							grid: { color: gridColor }
						}
			}
		}
	});

	const horizontalBarConfig = (
		labels: string[],
		values: number[],
		colors: string[] | string
	): ChartConfiguration => ({
		type: 'bar',
		data: {
			labels,
			datasets: [
				{
					label: 'Tuotteet',
					data: values,
					backgroundColor: colors,
					borderRadius: 4,
					maxBarThickness: 48
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			indexAxis: 'y',
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (context) => `${context.formattedValue} tuotetta`
					}
				}
			},
			scales: {
				x: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } },
				y: {
					ticks: {
						color: tickColor,
						autoSkip: false,
						font: { size: 12 }
					},
					grid: { color: gridColor }
				}
			}
		}
	});

	const doughnutConfig = (
		labels: string[],
		values: number[],
		colors: string[]
	): ChartConfiguration<'doughnut'> => ({
		type: 'doughnut',
		data: {
			labels,
			datasets: [
				{
					data: values,
					backgroundColor: colors,
					borderWidth: 2,
					borderColor: isDark ? '#18181b' : '#ffffff'
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			cutout: '55%',
			plugins: {
				legend: {
					position: 'right',
					labels: { color: tickColor }
				},
				tooltip: {
					callbacks: {
						label: (context) =>
							`${context.label}: ${context.formattedValue} tuotetta (${context.parsed.toLocaleString('fi-FI')})`
					}
				}
			}
		}
	});

	const priceConfig = $derived(
		barConfig(
			priceBands.map((band) => band.label),
			priceBands.map((band) => band.count),
			barColor,
			{ logY: true, tooltipLabel: (context) => `${context.formattedValue} tuotetta` }
		)
	);
	const literConfig = $derived(
		barConfig(
			literBands.map((band) => band.label),
			literBands.map((band) => band.count),
			barColor,
			{ logY: true, tooltipLabel: (context) => `${context.formattedValue} tuotetta` }
		)
	);
	const typeConfig = $derived(
		barConfig(
			typeDistribution.map((entry) => entry.key),
			typeDistribution.map((entry) => entry.count),
			barColor
		)
	);
	const subtypeConfig = $derived(
		horizontalBarConfig(
			subtypeDistribution.map((entry) => entry.key),
			subtypeDistribution.map((entry) => entry.count),
			barColor
		)
	);

	const countryConfig = $derived(doughnutConfig(countryDistribution.map((e) => e.key), countryDistribution.map((e) => e.count),
		[
			'#E51B15',
			'#EF6C00',
			'#FBC02D',
			'#43A047',
			'#00897B',
			'#00ACC1',
			'#1E88E5',
			'#3949AB',
			'#8E24AA',
			'#D81B60',
			'#6D4C41',
			'#546E7A',
			'#FF7043',
		]
	));

	const alcoholConfig = $derived(
		barConfig(
			alcoholBands.map((band) => band.label),
			alcoholBands.map((band) => band.count),
			barColor,
			{ logY: true }
		)
	);

	const scatterConfig = $derived<ChartConfiguration>({
		type: 'scatter',
		data: {
			datasets: [
				{
					label: 'Tuote',
					data: scatterPoints,
					backgroundColor: scatterColor,
					borderColor: scatterBorderColor,
					pointRadius: 2
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				x: {
					title: { display: true, text: 'Alkoholigrammat / €', color: tickColor },
					ticks: { color: tickColor },
					grid: { color: gridColor }
				},
				y: {
					type: 'logarithmic',
					title: { display: true, text: 'Hinta (€)', color: tickColor },
					ticks: { color: tickColor },
					grid: { color: gridColor }
				}
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (context) => {
							const point = scatterPoints[context.dataIndex];
							return `${formatFinNumber(point.x, 1)} g/€ · ${formatFinNumber(point.y)} €`;
						}
					}
				}
			}
		}
	});

	function formatOverview(value: number | null, column: ColumnNames): string {
		if (value === null) return '–';
		return String(formatValue(value, column, { includeUnit: true }));
	}
</script>

<div class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-bold md:text-3xl">Tilastot</h1>
		<p class="text-secondary">Alkon valikoima numeroina ja kuvaajina.</p>
	</header>

	<section class={headingGrid}>
		<div class="rounded border border-primary bg-secondary p-4">
			<p class="text-sm text-secondary">Tuotteita valikoimassa</p>
			<p class="mt-1 text-2xl font-bold">{summary.total.toLocaleString('fi-FI')}</p>
		</div>
		<div class="rounded border border-primary bg-secondary p-4">
			<p class="text-sm text-secondary">Keskihinta</p>
			<p class="mt-1 text-2xl font-bold">{formatOverview(summary.avgPrice, AllColumns.Price)}</p>
		</div>
		<div class="rounded border border-primary bg-secondary p-4">
			<p class="text-sm text-secondary">Keskim. litrahinta</p>
			<p class="mt-1 text-2xl font-bold">
				{formatOverview(summary.avgPricePerLiter, AllColumns.PricePerLiter)}
			</p>
		</div>
		<div class="rounded border border-primary bg-secondary p-4">
			<p class="text-sm text-secondary">Keskim. alkoholiprosentti</p>
			<p class="mt-1 text-2xl font-bold">
				{formatOverview(summary.avgAlcoholPercentage, AllColumns.AlcoholPercentage)}
			</p>
		</div>
	</section>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<ChartCard title="Hinnat" subtitle="Tuotteiden määrä hintaluokittain (logaritminen pystyasteikko)" config={priceConfig} />
		<ChartCard title="Litrahinnat" subtitle="Tuotteiden määrä litrahintaluokittain (logaritminen pystyasteikko)" config={literConfig} />
	</div>

	<h2 class="text-xl font-semibold">Kategoriat</h2>
	<p class="text-secondary">Yleisimmät tuoteryhmät valikoimassa.</p>
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<ChartCard title="Pääkategoriat" subtitle="Tuotemäärä tuotetyypeittäin" config={typeConfig} />
		<ChartCard title="Alakategoriat" subtitle="Suosituimmat alatyyypit (top 10)" config={subtypeConfig} />
	</div>

	<h2 class="text-xl font-semibold">Alkoholi</h2>
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<ChartCard title="Alkoholin määrä" subtitle="Tuotteiden määrä alkoholiprosenttiluokittain (logaritminen pystyasteikko)" config={alcoholConfig} />
	</div>

	<h2 class="text-xl font-semibold">Hinta vs "teho"</h2>
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<ChartCard title='"Tehokkuus" pistepilvenä' subtitle="Alkoholigrammat / € (vaaka) ja hinta (pysty)" config={scatterConfig} />

		<section class="overflow-hidden rounded border border-primary bg-secondary">
			<header class="border-b border-primary px-4 py-3">
				<h2 class="text-lg font-semibold">Paras hinta-tehosuhde</h2>
				<p class="text-sm text-secondary">Top {cheaps.length} alkoholigrammat / €</p>
			</header>
			<ul class="max-h-80 overflow-y-auto">
				{#each cheaps as product, index (product.number)}
					{@const gramsPerEuro = formatFinNumber(product.gramsPerEuro, 1)}
					{@const price = formatValue(product.price, AllColumns.Price)}
					<li
						class="flex items-center gap-3 border-b border-primary px-4 py-2 last:border-b-0"
					>
						<span class="w-6 shrink-0 text-sm text-secondary">{index + 1}.</span>
						<a
							href={`/tuotteet/${product.number}/`}
							class="min-w-0 flex-1 truncate hover:underline"
							title={product.name}
						>
							{product.name}
							{#if product.removed}
								<span class="text-xs text-secondary">(poistettu)</span>
							{/if}
						</a>
						<span class="shrink-0 text-sm font-semibold">{gramsPerEuro} g/€</span>
						<span class="shrink-0 text-sm text-secondary">{price}</span>
					</li>
				{/each}
			</ul>
		</section>
	</div>

	<h2 class="text-xl font-semibold">Alkuperä</h2>
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<ChartCard title="Alkuperämaa" subtitle="Tuotemäärä valmistusmaittain (top 12)" config={countryConfig} />
	</div>
</div>