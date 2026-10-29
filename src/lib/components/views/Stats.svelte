<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { ChartConfiguration } from 'chart.js';
	import { twMerge } from 'tailwind-merge';
	import type { Kaljakori } from '$lib/alko';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { ContextKeys } from '$lib/utils/constants/app';
	import { formatValue } from '$lib/utils/format/format';
	import { isLaptop, pageBottomBar, theme } from '$lib/global.svelte';
	import { appPath } from '$lib/utils/app/paths';
	import type { SearchParamsManager } from '$lib/utils/app/url';
	import { serializeSearchParams } from '$lib/utils/app/compressedParams';
	import { trackFilterUsage } from '$lib/utils/app/filterAnalytics.svelte';
	import { categorySlug, type CategoryNode } from '$lib/utils/catalog/categories';
	import { initFilterValues, searchParametersFromFilterValues } from '$lib/utils/catalog/filters';
	import { headerToDisplayName } from '$lib/utils/format/labels';
	import { components } from '$lib/utils/ui/styles';
	import type { ColumnNames, PersonalInfo } from '$lib/types';
	import {
		bandHistogram,
		bestValueRanks,
		categoryDistribution,
		computeSummary,
		formatFinNumber,
		subcategoryDistribution,
		topCategories
	} from '$lib/utils/stats/stats';
	import ChartCard from '$lib/components/widgets/ChartCard.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import Breadcrumb from '$lib/components/widgets/Breadcrumb.svelte';
	import CategorySection from '$lib/components/category/CategorySection.svelte';
	import StringInput from '$lib/components/inputs/StringInput.svelte';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import BottomBar from '$lib/components/widgets/BottomBar.svelte';
	import FilterButton from '$lib/components/widgets/FilterButton.svelte';
	import FoldableSidebar from '$lib/components/widgets/FoldableSidebar.svelte';
	import Chip from '$lib/components/widgets/Chip.svelte';

	const {
		kaljakori: source,
		personalInfo
	}: {
		kaljakori: Kaljakori;
		personalInfo: PersonalInfo;
	} = $props();

	// Follows personal info changes made after the data was loaded
	const kaljakori = $derived(source.subset(source.data, personalInfo));
	const tree = $derived(source.getCategoryTree());

	/** Narrow the stats down besides the category chips, a few of the product list's filters */
	const sidebarFilters = [
		AllColumns.Country,
		AllColumns.PackagingType,
		AllColumns.Availability
	] as const satisfies ColumnNames[];
	const ownFilters: ColumnNames[] = [AllColumns.Type, AllColumns.SubType, ...sidebarFilters];

	// The same URL parameters as the product list, so the products behind the stats are a link away.
	// Filters the sidebar has no input for are dropped instead of narrowing the stats unseen.
	const searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);
	const defaultFilterValues = () => initFilterValues(kaljakori, undefined, false);
	let filterValues = $state(
		untrack(() => {
			const linked = initFilterValues(kaljakori, searchParamsManager.params, false);
			const defaults = defaultFilterValues();
			for (const filter of Object.keys(linked) as ColumnNames[])
				if (!ownFilters.includes(filter)) linked[filter] = defaults[filter];
			return linked;
		})
	);

	const filterParams = $derived(searchParametersFromFilterValues(filterValues, kaljakori, false));
	const activeFilterCount = $derived(
		Object.values(filterParams).filter((value) => value.length > 0).length
	);
	const extraFilterCount = $derived(
		sidebarFilters.filter((filter) => filterParams[filter]?.length > 0).length
	);
	const productsHref = $derived.by(() => {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(filterParams))
			for (const v of Array.isArray(value) ? value : [value]) if (v) params.append(key, v);
		return resolve('/') + serializeSearchParams(params);
	});

	$effect(() => {
		searchParamsManager.setParametersFromObject(filterParams).update();
	});

	trackFilterUsage('stats', () => filterParams);

	// Hand the filter sheet's bottom bar to the layout; the sidebar covers wide screens
	$effect(() => {
		if (!$isLaptop) return;
		pageBottomBar.snippet = bottomBar;
		return () => {
			if (pageBottomBar.snippet === bottomBar) pageBottomBar.snippet = undefined;
		};
	});

	const allItems = $derived(
		kaljakori.data.filter((item) => item[AllColumns.RemovedFromSelection] !== true)
	);
	const items = $derived.by(() => {
		const filters: Record<string, unknown> = { ...filterValues };
		for (const [key, value] of Object.entries(filters))
			if (Array.isArray(value) && kaljakori.getFilterType(key as ColumnNames) !== 'number')
				filters[key] = new Set(value);
		return kaljakori
			.fuzzySearchAndFilter('', filters)
			.filter((item) => item[AllColumns.RemovedFromSelection] !== true);
	});

	// The chips count what picking them would give with the Rajaa filters, so they ignore the category
	const chipCounts = $derived.by(() => {
		const filters = Object.fromEntries(
			sidebarFilters.map((column) => [column, new Set(filterValues[column])])
		);
		const counts = new Map<string, number>();
		for (const item of kaljakori.fuzzySearchAndFilter('', filters)) {
			if (item[AllColumns.RemovedFromSelection] === true) continue;
			const slugs = source.categoryOf(item[AllColumns.Number]);
			if (!slugs) continue;
			for (const key of [slugs[0], `${slugs[0]}/${slugs[1]}`])
				counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return counts;
	});

	// The chips pick a single Kategoria / Tyyppi by its category page, the filters hold Alko's own values
	const valuesBySlug = (column: ColumnNames) =>
		new Map(kaljakori.getFilterValues(column, false).map((v) => [categorySlug(String(v)), v]));
	const typeValues = $derived(valuesBySlug(AllColumns.Type));
	const subTypeValues = $derived(valuesBySlug(AllColumns.SubType));
	const single = (column: ColumnNames) => {
		const values = filterValues[column];
		return values.length === 1 ? categorySlug(String(values[0])) : undefined;
	};
	const selectedType = $derived(tree.find((node) => node.slug === single(AllColumns.Type)));
	const selectedSubType = $derived(
		selectedType?.children.find((node) => node.slug === single(AllColumns.SubType))
	);
	const trail = $derived(
		selectedType ? (selectedSubType ? [selectedType, selectedSubType] : [selectedType]) : []
	);

	function selectCategory(next: CategoryNode[]) {
		const [type, subType] = next;
		const value = (values: Map<string, string | number>, node?: CategoryNode) => {
			const match = node && values.get(node.slug);
			return match === undefined ? [] : [match];
		};
		filterValues[AllColumns.Type] = value(typeValues, type);
		filterValues[AllColumns.SubType] = value(subTypeValues, subType);
	}

	// What's selected, shown under the heading when the filters are in the sheet
	const selection = $derived(
		ownFilters.flatMap((column) =>
			filterValues[column].map((value) => ({ column, value: String(value) }))
		)
	);

	function deselect(column: ColumnNames, value: string) {
		filterValues[column] = filterValues[column].filter((v) => String(v) !== value);
		// A Tyyppi belongs to its Kategoria
		if (column === AllColumns.Type) filterValues[AllColumns.SubType] = [];
	}

	const isSelected = (column: ColumnNames, node: CategoryNode) =>
		filterValues[column].some((value) => categorySlug(String(value)) === node.slug);

	const summary = $derived(computeSummary(items));
	const overallSummary = $derived(activeFilterCount ? computeSummary(allItems) : undefined);

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
	const allTypes = $derived(categoryDistribution(items, AllColumns.Type));
	const allSubtypes = $derived(subcategoryDistribution(items));
	const allCountries = $derived(categoryDistribution(items, AllColumns.Country));
	// Within a Tyyppi every Alatyyppi counts, taste descriptors included, as they have pages too
	const typeSubtypes = $derived(
		selectedType
			? categoryDistribution(items, AllColumns.SubType).filter(
					(entry) => entry.key !== 'Ei määritelty' && categorySlug(entry.key) !== selectedType.slug
				)
			: []
	);
	const typeDistribution = $derived(topCategories(allTypes, 12));
	const subtypeDistribution = $derived(
		selectedType ? topCategories(typeSubtypes, 12) : topCategories(allSubtypes, 10)
	);
	const countryDistribution = $derived(topCategories(allCountries, 12));

	const sumCounts = (entries: { count: number }[]) =>
		entries.reduce((sum, entry) => sum + entry.count, 0);
	const typeTotal = $derived(sumCounts(allTypes));
	const subtypeTotal = $derived(sumCounts(selectedType ? typeSubtypes : allSubtypes));
	const countryTotal = $derived(sumCounts(allCountries));

	// The category each bar opens when clicked, undefined for "Muu" and others without a page
	const typeTrails = $derived(
		typeDistribution.map((entry) => {
			const type = tree.find((node) => node.slug === categorySlug(entry.key));
			return type ? [type] : undefined;
		})
	);
	const subtypeTrails = $derived(
		subtypeDistribution.map((entry) => {
			const slug = categorySlug(entry.key);
			const type = selectedType
				? selectedType
				: tree.find((node) => node.children.some((child) => child.slug === slug));
			const subType = type?.children.find((child) => child.slug === slug);
			return type && subType ? [type, subType] : undefined;
		})
	);

	const formatShare = (count: number, total: number) =>
		total > 0 ? `${formatFinNumber((count / total) * 100, 1)} %` : '–';
	const shareLabels = (entries: { key: string; count: number }[], total: number) =>
		entries.map((entry) => `${entry.key} (${formatShare(entry.count, total)})`);
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

	const pickOptions = (trails?: (CategoryNode[] | undefined)[]): ChartConfiguration['options'] =>
		trails
			? {
					onClick: (_event, elements) => {
						const next = trails[elements[0]?.index ?? -1];
						if (next) selectCategory(next);
					},
					onHover: (event, elements) => {
						const target = event.native?.target as HTMLElement | undefined;
						if (target)
							target.style.cursor = trails[elements[0]?.index ?? -1] ? 'pointer' : 'default';
					}
				}
			: {};

	const barConfig = (
		labels: string[],
		values: number[],
		colors: string[] | string,
		opts: {
			indexAxis?: 'x' | 'y';
			logY?: boolean;
			tooltipLabel?: (context: { dataIndex: number; formattedValue: string }) => string;
			trails?: (CategoryNode[] | undefined)[];
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
			...pickOptions(opts.trails),
			responsive: true,
			maintainAspectRatio: false,
			indexAxis: opts.indexAxis ?? 'x',
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (context) => opts.tooltipLabel?.(context) ?? `${context.formattedValue} tuotetta`
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
		colors: string[] | string,
		total?: number,
		trails?: (CategoryNode[] | undefined)[]
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
			...pickOptions(trails),
			responsive: true,
			maintainAspectRatio: false,
			indexAxis: 'y',
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (context) =>
							total === undefined
								? `${context.formattedValue} tuotetta`
								: `${context.formattedValue} tuotetta (${formatShare(Number(context.raw), total)})`
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
		colors: string[],
		total: number
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
							`${context.label}: ${context.formattedValue} tuotetta (${formatShare(context.parsed, total)})`
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
			shareLabels(typeDistribution, typeTotal),
			typeDistribution.map((entry) => entry.count),
			barColor,
			{
				tooltipLabel: (context) =>
					`${context.formattedValue} tuotetta (${formatShare(typeDistribution[context.dataIndex].count, typeTotal)})`,
				trails: typeTrails
			}
		)
	);
	const subtypeConfig = $derived(
		horizontalBarConfig(
			shareLabels(subtypeDistribution, subtypeTotal),
			subtypeDistribution.map((entry) => entry.count),
			barColor,
			subtypeTotal,
			subtypeTrails
		)
	);

	const countryConfig = $derived(
		doughnutConfig(
			shareLabels(countryDistribution, countryTotal),
			countryDistribution.map((e) => e.count),
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
				'#FF7043'
			],
			countryTotal
		)
	);

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

{#snippet summaryCard(label: string, value: string, comparison?: string)}
	<div class="rounded border border-primary bg-secondary p-4">
		<p class="text-sm text-secondary">{label}</p>
		<p class="mt-1 text-2xl font-bold">{value}</p>
		{#if comparison}<p class="mt-1 text-xs text-secondary">{comparison}</p>{/if}
	</div>
{/snippet}

{#snippet heading()}
	<Breadcrumb items={[]} current="Tilastot" />
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<h1 class="text-2xl font-bold">Tilastot</h1>
		<span class="text-sm text-secondary">
			{#if activeFilterCount}
				{items.length.toLocaleString('fi-FI')} / {allItems.length.toLocaleString('fi-FI')} tuotetta
			{:else}
				{allItems.length.toLocaleString('fi-FI')} tuotetta valikoimassa
			{/if}
		</span>
	</div>
{/snippet}

<!-- The category page's sidebar on wide screens, the filter sheet of the bottom bar otherwise -->
{#snippet filters()}
	<div class="flex w-full flex-col gap-3">
		<nav aria-label="Kategoria" class="flex flex-col gap-2">
			<span class="text-xs text-secondary">Kategoria</span>
			<div class="flex flex-wrap gap-2">
				<Chip
					label="Kaikki"
					selected={filterValues[AllColumns.Type].length === 0}
					onclick={() => selectCategory([])}
				/>
				{#each tree as type (type.slug)}
					<Chip
						label={type.name}
						count={chipCounts.get(type.slug) ?? 0}
						selected={isSelected(AllColumns.Type, type)}
						onclick={() => selectCategory([type])}
					/>
				{/each}
			</div>
			<!-- Always there and as tall whatever the Kategoria, scrolling inside, so nothing below it jumps -->
			<div class="flex items-baseline justify-between gap-2">
				<span class="text-xs text-secondary">Tyyppi</span>
				{#if selectedType}
					<a
						href={appPath(trail[trail.length - 1].path)}
						class="flex items-center gap-0.5 text-xs text-secondary hover:underline"
					>
						Kategoriasivu
						<Icon name="chevron_right" />
					</a>
				{/if}
			</div>
			<div class="h-52 overflow-y-auto">
				{#if selectedType && selectedType.children.length > 0}
					<div class="flex flex-wrap gap-2">
						<Chip
							label="Kaikki"
							selected={filterValues[AllColumns.SubType].length === 0}
							onclick={() => selectCategory([selectedType])}
						/>
						{#each selectedType.children as subType (subType.slug)}
							<Chip
								label={subType.name}
								count={chipCounts.get(`${selectedType.slug}/${subType.slug}`) ?? 0}
								selected={isSelected(AllColumns.SubType, subType)}
								onclick={() => selectCategory([selectedType, subType])}
							/>
						{/each}
					</div>
				{:else}
					<p class="grid h-full place-content-center px-4 text-center text-sm text-secondary">
						{selectedType
							? `${selectedType.name}: ei tyyppejä`
							: filterValues[AllColumns.Type].length > 1
								? 'Valitse yksi kategoria nähdäksesi sen tyypit'
								: 'Valitse kategoria nähdäksesi sen tyypit'}
					</p>
				{/if}
			</div>
		</nav>
		<div class="flex flex-col">
			<CategorySection
				title="Rajaa"
				hint={extraFilterCount ? `${extraFilterCount} valittu` : undefined}
				open
			>
				<div class="flex flex-col gap-4">
					{#each sidebarFilters as filter (filter)}
						{@const options = kaljakori.getFilterValues(filter, false)}
						{#if options.length > 1}
							<div class="flex w-full flex-col gap-2 text-sm">
								<StringInput
									defaultValue={[]}
									label={headerToDisplayName(filter)}
									{options}
									bind:value={filterValues[filter]}
									name={filter}
								/>
							</div>
						{/if}
					{/each}
				</div>
			</CategorySection>
		</div>
	</div>
{/snippet}

{#snippet actions()}
	<div class="flex flex-wrap gap-2">
		<a href={productsHref} class={twMerge(components.button(), 'flex-1')}>
			<Icon name="list_ul" />
			<span>Näytä tuotteet</span>
		</a>
		{#if activeFilterCount}
			<button
				onclick={() => (filterValues = defaultFilterValues())}
				class={twMerge(components.button(), 'flex-1')}
			>
				<Icon name="x_circle" />
				<span>Tyhjennä</span>
			</button>
		{/if}
	</div>
{/snippet}

<!-- Below the sidebar breakpoint the filters open in a sheet from the bottom bar, the same as on category pages -->
{#snippet bottomBar()}
	<BottomBar class="xl:hidden">
		<a href={productsHref} class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}>
			<Icon name="list_ul" />
			<span>Tuotteet</span>
		</a>
		<Popup
			class="mb-0 max-h-[85dvh] w-full max-w-none gap-4 overflow-y-auto rounded-b-none p-4 open:translate-y-0 open:starting:translate-y-full open:starting:scale-100"
		>
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<FilterButton activeCount={activeFilterCount} onclick={() => dialogElement.showModal()} />
			{/snippet}
			{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<h2 class="text-xl font-bold">Suodattimet</h2>
				{@render filters()}
				<!-- Pinned to the bottom of the scrolling sheet, where the button that opened it was. Sticky offsets count from inside the sheet's p-4, so -bottom-4 reaches its edge -->
				<div
					class="sticky -bottom-4 -mx-4 -mb-4 flex gap-2 bg-primary px-4 pt-2.5 pb-[calc(--spacing(2.5)_+_env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
				>
					{#if activeFilterCount}
						<button
							type="button"
							class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}
							onclick={() => (filterValues = defaultFilterValues())}
						>
							<Icon name="x_circle" />
							<span>Tyhjennä</span>
						</button>
					{/if}
					<button
						type="button"
						class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}
						onclick={() => dialogElement.close()}
					>
						<Icon name="x" />
						<span>Sulje</span>
					</button>
				</div>
			{/snippet}
		</Popup>
	</BottomBar>
{/snippet}

<div
	class={twMerge(
		'grid h-full max-h-full overflow-hidden',
		$isLaptop ? 'grid-cols-1' : 'grid-cols-[auto_1fr]'
	)}
>
	{#if !$isLaptop}
		<FoldableSidebar
			id="stats"
			title="Tilastot"
			icon="stats"
			label="suodattimet"
			class="flex max-h-full w-80 flex-col overflow-hidden border-e border-primary bg-primary"
		>
			<div class="flex flex-auto flex-col gap-3 overflow-y-auto p-4">
				{@render heading()}
				{@render filters()}
			</div>
			<div class="border-t border-primary p-4">
				{@render actions()}
			</div>
		</FoldableSidebar>
	{/if}
	<div class="max-h-full overflow-y-auto">
		<div class="flex w-full flex-col gap-6 p-4 md:p-6">
			{#if $isLaptop}
				<div class="flex w-full flex-col gap-3">
					{@render heading()}
					{#if selection.length}
						<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0">
							{#each selection as { column, value } (`${column}|${value}`)}
								<button
									type="button"
									onclick={() => deselect(column, value)}
									title={`${headerToDisplayName(column)}: ${value}`}
									aria-label={`Poista ${headerToDisplayName(column).toLowerCase()} ${value}`}
									class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded bg-brand-3 px-2.5 py-1 text-sm text-white"
								>
									<span>{value}</span>
									<Icon name="x" />
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<section class={headingGrid}>
				{@render summaryCard(
					activeFilterCount ? 'Tuotteita valinnassa' : 'Tuotteita valikoimassa',
					summary.total.toLocaleString('fi-FI'),
					overallSummary && `${formatShare(summary.total, overallSummary.total)} valikoimasta`
				)}
				{@render summaryCard(
					'Keskihinta',
					formatOverview(summary.avgPrice, AllColumns.Price),
					overallSummary &&
						`Koko valikoima: ${formatOverview(overallSummary.avgPrice, AllColumns.Price)}`
				)}
				{@render summaryCard(
					'Keskim. litrahinta',
					formatOverview(summary.avgPricePerLiter, AllColumns.PricePerLiter),
					overallSummary &&
						`Koko valikoima: ${formatOverview(overallSummary.avgPricePerLiter, AllColumns.PricePerLiter)}`
				)}
				{@render summaryCard(
					'Keskim. alkoholiprosentti',
					formatOverview(summary.avgAlcoholPercentage, AllColumns.AlcoholPercentage),
					overallSummary &&
						`Koko valikoima: ${formatOverview(overallSummary.avgAlcoholPercentage, AllColumns.AlcoholPercentage)}`
				)}
			</section>

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<ChartCard
					title="Hinnat"
					subtitle="Tuotteiden määrä hintaluokittain (logaritminen pystyasteikko)"
					config={priceConfig}
				/>
				<ChartCard
					title="Litrahinnat"
					subtitle="Tuotteiden määrä litrahintaluokittain (logaritminen pystyasteikko)"
					config={literConfig}
				/>
			</div>

			{#if !selectedSubType && subtypeDistribution.length > 0}
				<h2 class="text-xl font-semibold">Kategoriat</h2>
				<p class="text-secondary">
					{selectedType
						? `${selectedType.name}: alakategoriat.`
						: 'Yleisimmät tuoteryhmät valikoimassa.'}
					{#if subtypeTrails.some(Boolean)}Valitse kategoria napsauttamalla palkkia.{/if}
				</p>
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
					{#if !selectedType}
						<ChartCard
							title="Pääkategoriat"
							subtitle="Tuotemäärä tuotetyypeittäin"
							config={typeConfig}
						/>
					{/if}
					<ChartCard
						title="Alakategoriat"
						subtitle={selectedType
							? `Tuotemäärä alatyypeittäin${typeSubtypes.length > 12 ? ' (top 12)' : ''}`
							: 'Suosituimmat alatyypit (top 10)'}
						config={subtypeConfig}
					/>
				</div>
			{/if}

			<h2 class="text-xl font-semibold">Alkoholi</h2>
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<ChartCard
					title="Alkoholin määrä"
					subtitle="Tuotteiden määrä alkoholiprosenttiluokittain (logaritminen pystyasteikko)"
					config={alcoholConfig}
				/>
			</div>

			<h2 class="text-xl font-semibold">Hinta vs "teho"</h2>
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<ChartCard
					title={'"Tehokkuus" pistepilvenä'}
					subtitle="Alkoholigrammat / € (vaaka) ja hinta (pysty)"
					config={scatterConfig}
				/>

				<section class="overflow-hidden rounded border border-primary bg-secondary">
					<header class="border-b border-primary px-4 py-3">
						<h2 class="text-lg font-semibold">Paras hinta-tehosuhde</h2>
						<p class="text-sm text-secondary">Top {cheaps.length} alkoholigrammat / €</p>
					</header>
					<ul class="max-h-80 overflow-y-auto">
						{#each cheaps as product, index (product.number)}
							{@const gramsPerEuro = formatFinNumber(product.gramsPerEuro, 1)}
							{@const price = formatValue(product.price, AllColumns.Price)}
							<li class="flex items-center gap-3 border-b border-primary px-4 py-2 last:border-b-0">
								<span class="w-6 shrink-0 text-sm text-secondary">{index + 1}.</span>
								<a
									href={resolve(`/tuotteet/${product.number}/`)}
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
				<ChartCard
					title="Alkuperämaa"
					subtitle="Tuotemäärä valmistusmaittain (top 12)"
					config={countryConfig}
				/>
			</div>
		</div>
	</div>
</div>
