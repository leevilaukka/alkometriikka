<script lang="ts">
	import { resolve } from '$app/paths';
	import { isLaptop, pageBottomBar, personalInfo, searchQuery, isMobile } from '$lib/global.svelte';
	import { components } from '$lib/utils/ui/styles';
	import { handleShare } from '$lib/utils/app/share';
	import { showToast } from '$lib/utils/app/toast.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { formatValue } from '$lib/utils/format/format';
	import type { Kaljakori } from '$lib/alko';
	import {
		getListById,
		getListItem,
		listToURI,
		removeFromList,
		saveList,
		updateQuantity
	} from '$lib/utils/user/lists';
	import Icon from '../widgets/Icon.svelte';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import type { ColumnNames, FilterValues, ListObj, PriceListItem } from '$lib/types';
	import {
		shownColumnsToHighlight,
		defaultSortingColumn,
		shownSortingKeys,
		defaultSortingOrderMap,
		LIST_BUFFER_SIZE,
		productKey,
		LIST_ROW_ESTIMATE
	} from '$lib/utils/constants/display';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { ContextKeys, GenderOptionsMap } from '$lib/utils/constants/app';
	import { headerToDisplayName, sortingOrderToString } from '$lib/utils/format/labels';
	import Popup from '../widgets/Popup.svelte';
	import FoldableSidebar from '../widgets/FoldableSidebar.svelte';
	import AddToListContent from '../widgets/AddToListContent.svelte';
	import Breadcrumb from '../widgets/Breadcrumb.svelte';
	import Chip from '../widgets/Chip.svelte';
	import CategorySection from '../category/CategorySection.svelte';
	import StringInput from '../inputs/StringInput.svelte';
	import { goto } from '$app/navigation';
	import { getContext, untrack } from 'svelte';
	import {
		initFilterValues,
		searchParametersFromFilterValues,
		sortRows
	} from '$lib/utils/catalog/filters';
	import { trackFilterUsage } from '$lib/utils/app/filterAnalytics.svelte';
	import { SERVING_GRAMS } from '$lib/utils/catalog/alko';
	import type { SearchParamsManager } from '$lib/utils/app/url';
	import ProductPreview from '../widgets/ProductPreview.svelte';
	import BottomBar from '../widgets/BottomBar.svelte';
	import FilterButton from '../widgets/FilterButton.svelte';
	import { compareURL, MAX_COMPARE_PRODUCTS } from '$lib/utils/user/compare';

	const { list: importedList, kaljakori: source }: { list: ListObj; kaljakori: Kaljakori } =
		$props();

	let searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);

	const existingList = untrack(() => getListById(importedList.id));
	const list = untrack(() => existingList || importedList);

	// The list's products, with filter values and ranges covering just them
	const kaljakori = $derived.by(() => {
		const ids = new Set(list.items.map((i) => i.id));
		return source.subset(
			source.data.filter((item) => ids.has(item[AllColumns.Number])),
			personalInfo
		);
	});

	let listRef: SvelteVirtualList<PriceListItem> | null = $state(null);

	// Lighter filters than the product list's, as on the Stats page: Kategoria / Tyyppi chips and a
	// few dropdowns, which is plenty for a list
	const dropdownFilters = [
		AllColumns.Country,
		AllColumns.PackagingType
	] as const satisfies ColumnNames[];
	const ownFilters: ColumnNames[] = [AllColumns.Type, AllColumns.SubType, ...dropdownFilters];
	const defaultFilterValues = () => initFilterValues(untrack(() => kaljakori));
	let filterValues = $state(defaultFilterValues());

	const filterParams = $derived(
		searchParametersFromFilterValues(
			Object.fromEntries(
				ownFilters.map((column) => [column, filterValues[column]])
			) as FilterValues,
			kaljakori
		)
	);
	const activeFilterCount = $derived(
		Object.values(filterParams).filter((value) => value.length > 0).length
	);
	const dropdownFilterCount = $derived(
		dropdownFilters.filter((filter) => filterParams[filter]?.length > 0).length
	);

	/** The list's products matching the search and the given filters */
	const matching = (columns: readonly ColumnNames[]) =>
		kaljakori.fuzzySearchAndFilter(
			$searchQuery,
			Object.fromEntries(columns.map((column) => [column, new Set(filterValues[column])]))
		);

	let selectedHighlight = $state(defaultSortingColumn);

	let selectedSortingColumn = $state(defaultSortingColumn);
	let asc: boolean = $derived(
		defaultSortingOrderMap[selectedSortingColumn as keyof typeof defaultSortingOrderMap] || false
	);

	let rows = $derived.by(() => {
		let temp = matching(ownFilters);
		if (!!selectedSortingColumn) temp = sortRows(temp, selectedSortingColumn, asc);
		else if (!asc) temp = temp.reverse();
		return temp;
	});

	// A new search, filter or sort gives a different list, so start it from the top. The
	// virtual list keeps the old scroll position otherwise, and once a short result list
	// has scrolled it to the bottom it stays pinned there as more results come back.
	let listInputs: string | undefined;
	$effect(() => {
		const inputs = JSON.stringify(
			[$searchQuery, $state.snapshot(filterValues), selectedSortingColumn, asc],
			(_, value) => (value instanceof Set ? [...value] : value)
		);
		if (listInputs !== undefined && inputs !== listInputs)
			untrack(() => listRef)?.scroll({ index: 0, smoothScroll: false });
		listInputs = inputs;
	});

	trackFilterUsage(
		'list',
		() => filterParams,
		() => rows.length
	);

	// Every Kategoria / Tyyppi in the list gets a chip, counted with the dropdown filters like on
	// the Stats page, so the chips stay put while the counts follow
	function countBy(items: PriceListItem[], column: ColumnNames) {
		const counts = new Map<string, number>();
		for (const item of items) {
			const value = item[column];
			if (typeof value === 'string' && value.trim())
				counts.set(value, (counts.get(value) ?? 0) + 1);
		}
		return counts;
	}
	const dropdownMatches = $derived(matching(dropdownFilters));
	const selectedType = $derived(
		filterValues[AllColumns.Type].length === 1
			? String(filterValues[AllColumns.Type][0])
			: undefined
	);
	const chips = (items: PriceListItem[], column: ColumnNames) => {
		const counts = countBy(
			dropdownMatches.filter((item) => items.includes(item)),
			column
		);
		return [...countBy(items, column)]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fi'))
			.map(([value]) => ({ value, count: counts.get(value) ?? 0 }));
	};
	const typeChips = $derived(chips(kaljakori.data, AllColumns.Type));
	const subTypeChips = $derived(
		selectedType
			? chips(
					kaljakori.data.filter((item) => item[AllColumns.Type] === selectedType),
					AllColumns.SubType
				)
			: []
	);

	function pick(column: typeof AllColumns.Type | typeof AllColumns.SubType, value?: string) {
		filterValues[column] = value ? [value] : [];
		// A Tyyppi belongs to its Kategoria
		if (column === AllColumns.Type) filterValues[AllColumns.SubType] = [];
	}

	// What's selected, shown under the heading when the filters are in a sheet
	const selection = $derived(
		ownFilters.flatMap((column) =>
			filterValues[column].map((value) => ({ column, value: String(value) }))
		)
	);
	function deselect(column: ColumnNames, value: string) {
		filterValues[column] = filterValues[column].filter((v) => String(v) !== value);
		if (column === AllColumns.Type) filterValues[AllColumns.SubType] = [];
	}

	let highlightMax = $derived.by(() => {
		if (!selectedHighlight) return null;
		const maxValue = rows.reduce((max, item) => {
			const value = Number(item[selectedHighlight] ?? 0);
			return value > max ? value : max;
		}, 0);
		return maxValue > 0 ? maxValue : null;
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
				totalSugar += (product[AllColumns.Sugar] || 0) * product[AllColumns.BottleSize] * item.q;
				totalVolume += product[AllColumns.BottleSize] * item.q;
			}
		});

		const totalAlcoholGramsPerEuro = totalPrice > 0 ? totalAlcoholGrams / totalPrice : 0;
		const totalServings = totalAlcoholGrams / SERVING_GRAMS;
		const totalEuroPerServing = totalServings > 0 ? totalPrice / totalServings : 0;
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
			totalPrice,
			totalAlcoholGrams,
			totalAlcoholGramsPerEuro,
			totalServings,
			totalEuroPerServing,
			totalItems,
			totalSugar,
			totalBAC,
			totalVolume
		};
	}

	let details = $derived.by(getListDetails);

	// Compares the products in their current order, capped to what the comparison view fits
	const compareIds = $derived(
		rows.slice(0, MAX_COMPARE_PRODUCTS).map((item) => item[AllColumns.Number])
	);
	const compareTruncated = $derived(rows.length > MAX_COMPARE_PRODUCTS);

	function validateListName(name: string) {
		if (name.trim().length === 0) list.name = 'Nimetön lista';
		else list.name = name.trim();
	}

	function modifyQuantity(item: PriceListItem, delta: number) {
		updateQuantity(list, item[AllColumns.Number], delta);
	}

	$effect(() => {
		searchParamsManager.setParameter('list', listToURI(list));
	});

	// Below the sidebar breakpoint the list's details, filters and actions live in a bottom bar,
	// like on category pages
	$effect(() => {
		if (!$isLaptop || (kaljakori.data.length === 0 && existingList)) return;
		pageBottomBar.snippet = actionBar;
		return () => {
			if (pageBottomBar.snippet === actionBar) pageBottomBar.snippet = undefined;
		};
	});
</script>

<!-- The list's actions: the sidebar's footer on wide screens, the Tiedot sheet and bottom bar otherwise -->
{#snippet shareButton(large: boolean)}
	{#if existingList && list.items.length > 0}
		<button
			aria-label="Jaa lista"
			class={twMerge(
				components.button({ type: 'positive', size: large ? 'lg' : 'sm' }),
				large ? 'h-11 flex-1' : 'flex-1'
			)}
			onclick={async (e) => {
				const anchor = e.currentTarget;
				// Omit SID from the URL if shift key is held down
				const includeSID = !e.shiftKey;

				const shared = await handleShare({
					type: 'list',
					title: `Alkometriikka - ${list.name}`,
					text: `Katso lista: ${list.name}`,
					url: `${location.origin}/listat/?list=${listToURI(list)}`,
					includeSID
				});

				if (!shared) showToast({ text: 'Linkki kopioitu leikepöydälle', anchor });
			}}
		>
			<Icon name="share" /><span>Jaa</span>
		</button>
	{/if}
{/snippet}

{#snippet saveButton(large: boolean)}
	{#if !existingList}
		<button
			class={twMerge(
				components.button({ type: 'positive', size: large ? 'lg' : 'sm' }),
				large ? 'h-11 flex-1' : 'flex-1'
			)}
			onclick={() => {
				sendAnalyticsEvent('save_list', { url: location.href });
				const saved = saveList(list);
				goto(`?list=${listToURI(saved)}`);
			}}
		>
			<Icon name="save" />
			<span>{large ? 'Tallenna' : 'Tallenna lista'}</span>
		</button>
	{/if}
{/snippet}

<!-- Stays in place while filtering, disabled when fewer than two products show, so the actions
     next to it don't shift -->
{#snippet compareButton(large: boolean)}
	{#if kaljakori.data.length > 1}
		{@const enabled = compareIds.length > 1}
		<a
			href={enabled ? resolve(compareURL(compareIds)) : undefined}
			aria-disabled={!enabled}
			aria-label="Vertaile listan tuotteita"
			title={!enabled
				? 'Vertailuun tarvitaan vähintään kaksi tuotetta'
				: compareTruncated
					? `Vertaile ${MAX_COMPARE_PRODUCTS} ensimmäistä tuotetta nykyisessä järjestyksessä`
					: 'Vertaile listan tuotteita rinnakkain'}
			class={twMerge(
				components.button({ size: large ? 'lg' : 'sm' }),
				large ? 'h-11 flex-1' : 'flex-1',
				!enabled && 'cursor-not-allowed opacity-50 hover:bg-white dark:hover:bg-zinc-800'
			)}
		>
			<Icon name="compare" />
			<span>Vertaile</span>
		</a>
	{/if}
{/snippet}

{#snippet nameInput(className: string)}
	<input
		type="text"
		name="listName"
		aria-label="Listan nimi"
		onblur={() => validateListName(list.name)}
		class={twMerge(
			'min-w-0 border-none bg-transparent p-0 text-2xl font-bold focus:ring-0',
			className
		)}
		bind:value={list.name}
	/>
{/snippet}

{#snippet heading(inSidebar = false)}
	<Breadcrumb items={[{ label: 'Listat', href: '/listat/' }]} current={list.name} />
	<div class="flex flex-col gap-1">
		{#if existingList}
			<h1 class="sr-only">{list.name}</h1>
			{#if inSidebar}
				<!-- A faint pencil hints the name can be edited; clicking it focuses the name too -->
				<label
					class="group -mx-1 flex items-center gap-1.5 rounded px-1 focus-within:bg-secondary hover:bg-secondary"
					title="Muokkaa nimeä"
				>
					{@render nameInput('w-full flex-1')}
					<Icon
						name="pencil"
						class="shrink-0 text-sm text-secondary opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
					/>
				</label>
			{:else}
				<!-- The name is as wide as its text, so the pencil sits right after it until editing starts.
				     The hidden copy of the name sizes the field, as inputs don't size to their text. -->
				<label class="group flex max-w-full min-w-0 items-center gap-1.5 self-start">
					<span class="inline-grid max-w-full min-w-0">
						<span
							aria-hidden="true"
							class="invisible col-start-1 row-start-1 overflow-hidden text-2xl font-bold whitespace-pre"
						>
							{list.name || ' '}
						</span>
						{@render nameInput('col-start-1 row-start-1 w-0 min-w-full')}
					</span>
					<Icon
						name="pencil"
						class="shrink-0 text-sm text-secondary opacity-60 group-focus-within:hidden"
					/>
				</label>
			{/if}
		{:else}
			<h1 class="text-2xl font-bold wrap-break-word">{list.name}</h1>
		{/if}
		<span class="text-sm text-secondary">
			{#if activeFilterCount}
				{rows.length} / {kaljakori.data.length} tuotetta
			{:else}
				{kaljakori.data.length} tuotetta
			{/if}
			{#if kaljakori.data.length}
				· {formatValue(details.totalPrice, AllColumns.Price)}
			{/if}
		</span>
	</div>
{/snippet}

{#snippet stat(label: string, value: string, extra?: string, wide = false)}
	<div
		class={twMerge(
			'flex min-w-0 flex-col gap-0.5 rounded border border-primary bg-primary px-3 py-2 text-sm',
			wide && 'col-span-2'
		)}
	>
		<span class="text-xs text-secondary">{label}</span>
		<span class={twMerge('font-bold', wide && 'text-xl')}>{value}</span>
		{#if extra}<span class="text-xs text-secondary">{extra}</span>{/if}
	</div>
{/snippet}

<!-- The list's totals, whatever the filters show -->
{#snippet summary()}
	<div class="grid grid-cols-2 gap-2">
		{@render stat(
			'Yhteensä',
			formatValue(details.totalPrice, AllColumns.Price) as string,
			`${details.totalItems} kpl`,
			true
		)}
		{@render stat('Tilavuus', formatValue(details.totalVolume, AllColumns.BottleSize) as string)}
		{@render stat(
			'Alkoholia',
			formatValue(details.totalAlcoholGrams, AllColumns.AlcoholGrams) as string
		)}
		{@render stat(
			'Alkoholia per euro',
			`${formatValue(details.totalAlcoholGramsPerEuro, AllColumns.AlcoholGramsPerEuro)} g`
		)}
		{@render stat(
			'Arvioidut promillet',
			formatValue(details.totalBAC, AllColumns.PromillePerEuro) as string
		)}
		{#if details.totalServings > 0}
			{@render stat(
				'Annoksia',
				formatValue(details.totalServings, AllColumns.Servings) as string,
				`${formatValue(details.totalEuroPerServing, AllColumns.EuroPerServing)} / annos`
			)}
		{/if}
		{@render stat(
			'Sokeria',
			`${formatValue(details.totalSugar, AllColumns.Sugar, { includeUnit: false })} g`
		)}
	</div>
{/snippet}

<!-- The sidebar's filters on wide screens, the Suodattimet sheet otherwise (which has its own
     Tyhjennä next to Sulje) -->
{#snippet filters(inSidebar = false)}
	{#if typeChips.length > 1 || selectedType}
		<nav aria-label="Kategoria" class="flex flex-col gap-2">
			<span class="text-xs text-secondary">Kategoria</span>
			<div class="flex flex-wrap gap-2">
				<Chip
					label="Kaikki"
					selected={filterValues[AllColumns.Type].length === 0}
					onclick={() => pick(AllColumns.Type)}
				/>
				{#each typeChips as { value, count } (value)}
					<Chip
						label={value}
						{count}
						selected={filterValues[AllColumns.Type].includes(value)}
						onclick={() => pick(AllColumns.Type, value)}
					/>
				{/each}
			</div>
			{#if subTypeChips.length > 1}
				<span class="text-xs text-secondary">Tyyppi</span>
				<div class="flex flex-wrap gap-2">
					<Chip
						label="Kaikki"
						selected={filterValues[AllColumns.SubType].length === 0}
						onclick={() => pick(AllColumns.SubType)}
					/>
					{#each subTypeChips as { value, count } (value)}
						<Chip
							label={value}
							{count}
							selected={filterValues[AllColumns.SubType].includes(value)}
							onclick={() => pick(AllColumns.SubType, value)}
						/>
					{/each}
				</div>
			{/if}
		</nav>
	{/if}
	{#if dropdownFilters.some((filter) => kaljakori.getFilterValues(filter).length > 1)}
		<div class="flex flex-col">
			<CategorySection
				title="Rajaa"
				hint={dropdownFilterCount ? `${dropdownFilterCount} valittu` : undefined}
				open
			>
				<div class="flex flex-col gap-4">
					{#each dropdownFilters as filter (filter)}
						{@const options = kaljakori.getFilterValues(filter)}
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
	{/if}
	{#if inSidebar && activeFilterCount}
		<button
			type="button"
			onclick={() => (filterValues = defaultFilterValues())}
			class="flex cursor-pointer items-center gap-1 self-start text-sm text-secondary hover:underline"
		>
			<Icon name="x_circle" />
			<span>Tyhjennä suodattimet</span>
		</button>
	{/if}
{/snippet}

{#snippet clearFiltersButton()}
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
{/snippet}

<!-- A bottom sheet like the category page's Tiedot sheet, its close button pinned to the bottom
     where the button that opened it was. Sticky offsets count from inside the sheet's p-4, so
     -bottom-4 reaches its edge. -->
{#snippet sheet(
	title: string,
	content: import('svelte').Snippet,
	button: import('svelte').Snippet<[HTMLDialogElement]>,
	actions: import('svelte').Snippet
)}
	<Popup
		class="mb-0 max-h-[85dvh] w-full max-w-none gap-4 overflow-y-auto rounded-b-none p-4 open:translate-y-0 open:starting:translate-y-full open:starting:scale-100"
	>
		{#snippet renderButton(dialogElement: HTMLDialogElement)}
			{@render button(dialogElement)}
		{/snippet}
		{#snippet renderContent(dialogElement: HTMLDialogElement)}
			<h2 class="text-xl font-bold">{title}</h2>
			{@render content()}
			<div
				class="sticky -bottom-4 -mx-4 -mb-4 flex gap-2 bg-primary px-4 pt-2.5 pb-[calc(--spacing(2.5)_+_env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
			>
				{@render actions()}
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
{/snippet}

{#snippet detailsButton(dialogElement: HTMLDialogElement)}
	<button
		type="button"
		aria-haspopup="dialog"
		class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}
		onclick={() => dialogElement.showModal()}
	>
		<Icon name="info_circle" />
		<span>Tiedot</span>
	</button>
{/snippet}

{#snippet filterSheetButton(dialogElement: HTMLDialogElement)}
	<FilterButton activeCount={activeFilterCount} onclick={() => dialogElement.showModal()} />
{/snippet}

{#snippet detailsActions()}
	{@render compareButton(true)}
	{@render shareButton(true)}
{/snippet}

<!-- Kept to two or three buttons like the category pages' bar: sharing and comparing are in the
     Tiedot sheet, saving stays out as it's what an unsaved list is for -->
{#snippet actionBar()}
	<BottomBar class="xl:hidden">
		{#if kaljakori.data.length > 0}
			{@render sheet('Listan tiedot', summary, detailsButton, detailsActions)}
		{/if}
		{@render saveButton(true)}
		{#if kaljakori.data.length > 1}
			{@render sheet('Suodattimet', filters, filterSheetButton, clearFiltersButton)}
		{/if}
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
			id="list"
			title={list.name}
			icon="list_ul"
			label="sivupalkki"
			class="flex max-h-full w-80 flex-col overflow-hidden border-e border-primary bg-primary"
		>
			<div class="flex flex-auto flex-col gap-3 overflow-y-auto p-4">
				{@render heading(true)}
				{#if kaljakori.data.length > 0}
					{@render summary()}
				{/if}
				{#if kaljakori.data.length > 1}
					{@render filters(true)}
				{/if}
			</div>
			<div class="flex flex-wrap gap-2 border-t border-primary p-4 empty:hidden">
				{@render compareButton(false)}
				{@render shareButton(false)}
				{@render saveButton(false)}
			</div>
		</FoldableSidebar>
	{/if}
	<div
		id="results"
		tabindex="-1"
		class="flex h-full min-w-0 flex-col gap-3 bg-secondary p-3 outline-none md:gap-4 md:p-6"
	>
		{#if $isLaptop}
			<div class="flex w-full flex-col gap-3">
				{@render heading()}
				{#if selection.length}
					<div class="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 md:mx-0 md:flex-wrap md:px-0">
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
		{#if kaljakori.data.length === 0}
			<div class="grid flex-auto place-content-center">
				<div class="mx-auto prose text-center dark:prose-invert">
					<h2>Lista on tyhjä!</h2>
					<p>Lisää tuotteita listaan tuotevalikosta!</p>
					<a
						href={resolve('/')}
						class={twMerge(components.button({ type: 'positive' }), 'mx-auto w-full')}
					>
						<span>Tuotevalikkoon</span>
						<Icon name="arrow_right_stroke" />
					</a>
				</div>
			</div>
		{:else}
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
				<SvelteVirtualList
					items={rows}
					bind:this={listRef}
					itemsClass={'flex flex-col gap-3'}
					bufferSize={LIST_BUFFER_SIZE}
					itemKey={productKey}
					defaultEstimatedItemHeight={LIST_ROW_ESTIMATE}
				>
					{#snippet renderItem(item, idx: number)}
						{@const listItem = getListItem(list, item[AllColumns.Number])}
						<ProductPreview
							product={item}
							quantity={listItem?.q}
							highlight={selectedHighlight}
							{kaljakori}
							{highlightMax}
						>
							{#snippet renderExtras()}
								<div
									class="absolute top-0 left-0 flex flex-nowrap items-center gap-0.5 rounded-br bg-gray-100 px-1.5 py-0.5 text-sm text-secondary dark:bg-zinc-700"
								>
									<Icon name="hashtag" />
									<span>{`${idx + 1}`}</span>
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
												aria-label="Lisää listaan tai booliin"
												onclick={() => dialogElement.showModal()}
											>
												<span>Lisää</span>
												<Icon name="plus" />
											</button>
										{/snippet}
										{#snippet renderContent(dialogElement: HTMLDialogElement)}
											<AddToListContent
												productNumber={item[AllColumns.Number]}
												onadded={() => dialogElement.close()}
											/>
										{/snippet}
									</Popup>
								{/if}
							{/snippet}
						</ProductPreview>
					{/snippet}
				</SvelteVirtualList>
			</div>
		{/if}
	</div>
</div>
