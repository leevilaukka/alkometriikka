<script lang="ts">
	import {
		AllColumns,
		DatasetColumns,
		DrunkColumns,
		hideFromProductPageStats
	} from '$lib/utils/constants';
	import {
		generateTitle,
		sendAnalyticsEvent,
		setSEO,
		isNullish,
		valueToString
	} from '$lib/utils/helpers';
	import { formatValue } from '$lib/utils/format';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { type AvailabilityStore, type ListObj, type PriceListItem } from '$lib/types';
	import { addToList } from '$lib/utils/lists';
	import BadgeList from '../widgets/BadgeList.svelte';
	import { afterNavigate } from '$app/navigation';
	import type { Kaljakori } from '$lib/alko';
	import { findDifferentSizeOfProduct, findSimilarProducts } from '$lib/utils/filters';
	import {
		formatStoreDistance,
		getStoreDistance,
		getTodaysOpeningHours,
		rankStoresByDistance
	} from '$lib/utils/availability';
	import { requestSettingsOpen } from '$lib/utils/settings';
	import ProductImage from '../widgets/ProductImage.svelte';
	import { generateImageUrl } from '$lib/utils/image';
	import {
		Chart,
		CategoryScale,
		LinearScale,
		PointElement,
		LineElement,
		Title,
		Tooltip,
		Legend,
		LineController,
		Filler
	} from 'chart.js';
	
	import { dev } from '$app/environment';

	// Register Chart.js components
	Chart.register(
		CategoryScale,
		LinearScale,
		PointElement,
		LineElement,
		Title,
		Tooltip,
		Legend,
		LineController,
		Filler
	);

	const {
		product,
		kaljakori,
		availabilityStores,
		preferredStore
	}: {
		product: PriceListItem;
		kaljakori: Kaljakori;
		availabilityStores: AvailabilityStore[];
		preferredStore?: AvailabilityStore;
	} = $props();

	const rankedAvailabilityStores = $derived(
		rankStoresByDistance(availabilityStores, preferredStore)
	);
	const availableInPreferredStore = $derived(
		preferredStore
			? availabilityStores.some((store) => store.id === preferredStore.id)
			: false
	);
	const closestAvailableStore = $derived(rankedAvailabilityStores[0]);
	const closestAvailableDistance = $derived(
		formatStoreDistance(getStoreDistance(preferredStore, closestAvailableStore))
	);

	let productElement: HTMLDivElement;

	let similarProducts = $derived(
		findSimilarProducts(
			product,
			kaljakori,
			new Set([
				AllColumns.Type,
				AllColumns.SubType,
				AllColumns.BeerType,
				AllColumns.Price,
				AllColumns.BottleSize,
				AllColumns.Sugar,
				AllColumns.PackagingType,
				AllColumns.AlcoholGramsPerEuro,
				AllColumns.GrapeVarieties,
				AllColumns.Description
			]),
			20
		)
	);

	let historyChartElem: HTMLCanvasElement | null = $state(null);
	$effect(() => {
		if (!historyChartElem) return;

		const chart = new Chart(historyChartElem, {
			type: 'line',
			data: {
				labels:
					product[AllColumns.History]?.map((entry) =>
						new Date(entry.date).toLocaleDateString('fi-FI')
					) || [],
				datasets: [
					{
						label: 'Hinta',
						data: product[AllColumns.History]?.map((entry) => entry.price) || [],
						borderColor: 'rgba(75, 192, 192, 1)',
						backgroundColor: 'rgba(75, 192, 192, 0.2)',
						fill: true,
						tension: 0.1,
						tooltip: {
							callbacks: {
								label: function (context) {
									return `Hinta: ${formatValue(context?.parsed?.y || 0, AllColumns.Price)}`;
								}
							}
						}
					}
				]
			},
			options: {
				scales: {	
					x: {
						title: {
							display: true,
							text: 'Päivämäärä'
						}
					},
					y: {
						ticks: {
							callback: function (value) {
								return String(formatValue(Number(value), AllColumns.Price));
							}
						},
						title: {
							display: true,
							text: 'Hinta (€)',
						},
					}
				},

				plugins: {
					legend: {
						display: false,
						position: 'top'
					},
					title: {
						display: false
					},
					tooltip: {
						enabled: true,
						mode: 'index',
						intersect: false
					}
				}
			}
		});

		return () => chart.destroy();
	});

	afterNavigate(() => {
		productElement?.scrollIntoView({ behavior: 'smooth' });
	});

	function sideScroll(node: HTMLElement) {
		function handleScroll(event: WheelEvent) {
			if (event.deltaY == 0) return;
			event.preventDefault();
			node.scrollBy({ left: event.deltaY });
		}

		node.addEventListener('wheel', handleScroll);

		return {
			destroy() {
				node.removeEventListener('wheel', handleScroll);
			}
		};
	}

	let sizesOpened = $state(false);
	let historyOpened = $state(false);
	let availabilityOpened = $state(false);

	$effect(() => {
		setSEO({
			description: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
			og: {
				title: generateTitle(`${product[AllColumns.Name]}`),
				description: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
				url: `https://alkometriikka.fi/tuotteet/${product[AllColumns.Number]}/`
			},
			image: {
				alt: product[AllColumns.Name],
				url: generateImageUrl(product[AllColumns.Number], product[AllColumns.Name], 'medium'),
				width: '160',
				height: '192'
			},
			twitter: {
				card: 'summary_large_image',
				title: generateTitle(`${product[AllColumns.Name]}`),
				description: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
				image: generateImageUrl(product[AllColumns.Number], product[AllColumns.Name], 'medium')
			},
			keywords: `${product[AllColumns.Name]}, ${product[AllColumns.Manufacturer]}, ${product[AllColumns.Type]}, ${product[AllColumns.SubType]}, ${[...(product[AllColumns.Description] || [])].join(', ').toLocaleLowerCase()}`
		});
	});

	const differentSizesOfProduct = $derived(findDifferentSizeOfProduct(product, kaljakori));

</script>

<svelte:head>
	<title>{generateTitle(`${product[AllColumns.Name]}`)}</title>
</svelte:head>

<div
	bind:this={productElement}
	class={twMerge('mx-auto flex w-full max-w-[120ch] flex-col flex-nowrap gap-6 p-6')}
>
	<div class="flex w-full items-center gap-4">
		<a href="/" class={twMerge(components.button({ size: 'md' }))}>
			<Icon name={'home'} class="inline-block" />
			<span>Etusivulle</span>
		</a>
	</div>
	<header class="grid w-full grid-cols-1 gap-6 md:grid-cols-[auto_1fr]">
		<div class="flex aspect-square h-96 w-full max-w-full rounded bg-white p-6 md:w-fit">
			<ProductImage
				number={product[AllColumns.Number]}
				name={product[AllColumns.Name]}
				transform="medium"
				alt={product[AllColumns.Name]}
			/>
		</div>
		<div class="flex w-full flex-col justify-between gap-3">
			<div class="flex flex-col gap-2">
				<h1 class="text-2xl font-bold md:text-3xl" data-product={product[AllColumns.Name]}>
					{product[AllColumns.Name]}
				</h1>
				<span>
					{valueToString(product[AllColumns.Manufacturer], AllColumns.Manufacturer)} | {valueToString(
						product[AllColumns.BottleSize],
						AllColumns.BottleSize
					)} | {valueToString(product[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage)}
					{product[AllColumns.Vintage] !== ''
						? `| ${valueToString(product[AllColumns.Vintage], AllColumns.Vintage)}`
						: ''}
				</span>
				<p class="w-fit rounded bg-gray-100 px-1 dark:bg-zinc-700 dark:text-white">
					{product[AllColumns.RemovedFromSelection]
						? 'Poistunut valikoimasta'
						: product[AllColumns.Availability]}
				</p>
				<div class="flex w-full flex-row gap-2 md:flex-row">
					<BadgeList item={product} />
				</div>
			</div>
			<div class="flex flex-col items-end gap-1">
				<p class="text-4xl font-bold" data-price={`${formatValue(product[AllColumns.Price], AllColumns.Price)}`}>
					{formatValue(product[AllColumns.Price], AllColumns.Price)}
				</p>
				<span class="text-sm text-secondary">
					({formatValue(product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)})
				</span>
			</div>
		</div>
	</header>
	<div class="grid w-full grid-cols-1 gap-4 md:grid-cols-[2fr_1fr] md:justify-end">
		<Popup class="gap-4 p-4">
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<button
					class={twMerge(
						components.button({ type: 'positive', size: 'lg' }),
						'w-full justify-between px-5 py-3 text-xl'
					)}
					onclick={() => dialogElement.showModal()}
				>
					<span>Lisää listaan ja vertaa!</span>
					<Icon name="plus" />
				</button>
			{/snippet}
			{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<h2 class="text-xl">Valitse lista</h2>
				<AllLists
					action={(list: ListObj) => {
						addToList(list, product[AllColumns.Number]);
						dialogElement.close();
					}}
				/>
			{/snippet}
		</Popup>
		<a
			href={`https://www.alko.fi/tuotteet/${product[AllColumns.Number]}`}
			target="_blank"
			rel="noopener noreferrer"
			referrerpolicy="no-referrer"
			class={twMerge(components.button({ size: 'md' }), 'w-full px-5 py-3 text-xl', product[AllColumns.RemovedFromSelection] ? 'pointer-events-none opacity-50' : '')}
		>
			<span>{product[AllColumns.RemovedFromSelection] ? 'Poistunut valikoimasta' : 'Alkon tuotesivu'}</span>
			{#if !product[AllColumns.RemovedFromSelection]}
			 <Icon name="link_external" class="inline-block" />
			{/if}
		</a>
	</div>
	{#if preferredStore}
		<section class="flex w-full items-center justify-start gap-3 rounded border border-primary bg-secondary px-4 py-3 text-2xl">
				<div class="flex flex-col w-full items-center justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
					<div class="flex w-full items-center gap-3">
						<Icon
							name={availableInPreferredStore ? 'check_circle' : 'x_circle'}
							class={availableInPreferredStore
								? 'text-green-700 dark:text-green-400'
								: 'text-red-700 dark:text-red-400'}
						/>
						<div class="flex flex-col gap-0.5">
							<span
								class={availableInPreferredStore
									? 'text-sm text-green-700 dark:text-green-400'
									: 'text-sm text-red-700 dark:text-red-400'}
							>
								{availableInPreferredStore
									? 'Saatavilla valitusta myymälästä'
									: 'Ei saatavilla valitusta myymälästä'}
							</span>
							<strong class="text-lg">{preferredStore.name}</strong>
							{#if !availableInPreferredStore && closestAvailableStore}
								<span class="text-sm text-secondary">
									Lähin saatavilla: {closestAvailableStore.name}{closestAvailableDistance
										? ` (${closestAvailableDistance})`
										: ''}
								</span>
							{/if}
						</div>
					</div>
					<button
						type="button"
						class={twMerge(components.button({ size: 'sm' }), 'w-full sm:w-fit shrink-0')}
						onclick={requestSettingsOpen}
					>
						Vaihda myymälää
					</button>
				</div>
		</section>
	{/if}
	<div class="flex w-full flex-col gap-4 rounded border border-primary bg-secondary p-4">
		<div class="flex flex-col items-start gap-0.5 md:flex-row md:gap-3">
			<div class="flex flex-col gap-0.5 md:gap-1">
				<h2 class="text-xl font-bold">Perustiedot</h2>
				{#each Object.entries(DatasetColumns) as [_, value]}
					{@const rawValue = product[value]}
					{@const hasValue =
						!isNullish(rawValue) &&
						(!(rawValue instanceof Set) || rawValue.size > 0) &&
						(!Array.isArray(rawValue) || rawValue.length > 0) &&
						(typeof rawValue !== 'string' || rawValue.trim().length > 0)
					}
					{#if hasValue && !hideFromProductPageStats.has(value as (typeof DatasetColumns)[keyof typeof DatasetColumns])}
						<p>
							{valueToString(
								rawValue as string | number | boolean | Set<string>,
								value as (typeof DatasetColumns)[keyof typeof DatasetColumns]
							)}
						</p>
					{/if}
				{/each}
			</div>
		</div>
		<div class="flex flex-col gap-0.5 md:gap-1">
			<h2 class="text-xl font-bold">Laskennalliset tiedot</h2>
			{#each Object.entries(DrunkColumns) as [_, value]}
				{#if product[value] !== null && product[value] !== undefined}
					<p class="flex flex-row items-center gap-2">
						{valueToString(
							product[value],
							value
						)}
					</p>
				{/if}
			{/each}
		</div>
	</div>
	<section class="w-full overflow-hidden rounded border border-primary bg-secondary">
		<details>
			<summary class="m-2 text-2xl font-bold" onclick={(e) => {
				if (!availabilityOpened) sendAnalyticsEvent('show_availability', { product_number: product[AllColumns.Number] });
				availabilityOpened = true;
			}}>
				Saatavuus myymälässä
			</summary>
			{#if !preferredStore}
				<div class="border-t border-primary px-4 py-3">
					<button
						type="button"
						class={twMerge(components.button({ type: 'positive', size: 'md' }), 'w-full')}
						onclick={requestSettingsOpen}
					>
						Valitse ensisijainen myymälä
					</button>
				</div>
			{/if}
			<div class="max-h-128 overflow-y-auto border-t border-primary">
				{#if rankedAvailabilityStores.length > 0}
					<ul>
						{#each rankedAvailabilityStores as store (store.id)}
							{@const distance = formatStoreDistance(getStoreDistance(preferredStore, store))}
							{@const openingHours = getTodaysOpeningHours(store)}
							<li class="flex gap-3 border-b border-primary px-4 py-3 last:border-b-0">
								<div class="flex min-w-0 flex-1 flex-col gap-0.5">
									<a href={`/myymalat/${store.id}/`} class="w-fit font-semibold hover:underline">
										{store.name}
									</a>
									{#if store.address || store.postalCode || store.postOffice}
										<span class="text-sm text-secondary">
											{[store.address, [store.postalCode, store.postOffice].filter(Boolean).join(' ')]
												.filter(Boolean)
												.join(', ')}
										</span>
									{/if}
									{#if openingHours}
										<span class="text-sm text-secondary">
											{openingHours.toLocaleLowerCase('fi-FI') === 'kiinni'
												? 'Suljettu'
												: `Avoinna tänään ${openingHours}`}
										</span>
									{/if}
								</div>
								{#if distance}
									<span class="shrink-0 text-sm text-secondary">{distance}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="px-4 py-3 text-secondary">Ei saatavilla myymälöissä.</p>
				{/if}
			</div>
		</details>
	</section>
	{#if dev || product[AllColumns.History]?.length > 1}
		<details class="w-full rounded border border-primary bg-secondary">
			<summary
				class="m-2 text-2xl font-bold"
				onclick={(e) => {
					if (!historyOpened)
						sendAnalyticsEvent('show_price_history', {
							product_number: product[AllColumns.Number]
						});
					historyOpened = true;
				}}
			>
				Hintahistoria
			</summary>
			<canvas bind:this={historyChartElem} class="max-w-full"></canvas>
		</details>
	{/if}
	{#if differentSizesOfProduct.length}
		<details>
			<summary
				class="mb-2 text-2xl font-bold"
				onclick={(e) => {
					if (!sizesOpened)
						sendAnalyticsEvent('view_sizes', { product_number: product[AllColumns.Number] });
					sizesOpened = true;
				}}
			>
				Muut koot
			</summary>
			<div class="flex max-w-full flex-col flex-nowrap gap-3">
				{#each differentSizesOfProduct.sort((a, b) => a[AllColumns.BottleSize] - b[AllColumns.BottleSize]) as differentSizeProduct}
					<a
						href={`/tuotteet/${differentSizeProduct[AllColumns.Number]}/`}
						class="flex shrink-0 flex-row gap-3 rounded-lg border border-primary p-4"
					>
						<div class="flex aspect-square h-36 w-fit shrink-0 rounded bg-white p-2 md:max-w-fit">
							<ProductImage
								number={differentSizeProduct[AllColumns.Number]}
								name={differentSizeProduct[AllColumns.Name]}
								alt={differentSizeProduct[AllColumns.Name]}
								class="block aspect-square h-full w-full object-contain"
							/>
						</div>
						<div class="flex flex-col gap-2">
							<h2 class="line-clamp-3 text-xl font-bold md:text-2xl">
								{`${differentSizeProduct[AllColumns.Name]} (${formatValue(differentSizeProduct[AllColumns.BottleSize], AllColumns.BottleSize)})`}
							</h2>
							<span>
								{formatValue(
									differentSizeProduct[AllColumns.AlcoholPercentage],
									AllColumns.AlcoholPercentage
								)}
							</span>
							<p class="text-3xl font-bold drop-shadow-lg">
								{formatValue(differentSizeProduct[AllColumns.Price], AllColumns.Price)}
							</p>
							<span class="text-sm text-secondary">
								{formatValue(differentSizeProduct[AllColumns.BottleSize], AllColumns.BottleSize)} ({formatValue(differentSizeProduct[AllColumns.PricePerLiter], AllColumns.PricePerLiter)})
							</span>
						</div>
					</a>
				{/each}
			</div>
		</details>
	{/if}
	{#if similarProducts.length}
		<div class="flex items-center justify-between">
			<h2 class="text-2xl font-bold">Samankaltaisia tuotteita</h2>
			<a
				class={twMerge(components.button({ size: 'md' }), 'flex flex-row items-center gap-2')}
				href={`/vastaavat/${product[AllColumns.Number]}`}
			>
				<span>Lisää samankaltaisia</span>
				<Icon name="arrow_right" />
			</a>
		</div>
		<div class="flex max-w-full flex-row flex-nowrap gap-3 overflow-x-auto" use:sideScroll>
			{#each similarProducts as similarProduct}
				<a
					href={`/tuotteet/${similarProduct[AllColumns.Number]}/`}
					class="flex w-48 shrink-0 flex-col gap-3 rounded-lg border border-primary p-4"
				>
					<div class="flex h-[calc(3_*_2.5rem)] flex-col gap-2 md:h-[calc(3_*_2.75rem)]">
						<h2 class="line-clamp-3 text-xl font-bold md:text-2xl">
							{similarProduct[AllColumns.Name]}
						</h2>
						<span>
							{formatValue(
								similarProduct[AllColumns.AlcoholPercentage],
								AllColumns.AlcoholPercentage
							)}
						</span>
					</div>
					<div class="flex aspect-square w-full shrink-0 rounded bg-white p-2 md:max-w-fit">
						<ProductImage
							number={similarProduct[AllColumns.Number]}
							name={similarProduct[AllColumns.Name]}
							alt={similarProduct[AllColumns.Name]}
							class="block aspect-square h-full w-full object-contain"
						/>
					</div>
					<div class="flex flex-col gap-2">
						<p class="text-3xl font-bold drop-shadow-lg">
							{formatValue(similarProduct[AllColumns.Price], AllColumns.Price)}
						</p>
						<span class="text-sm text-secondary">
							{formatValue(similarProduct[AllColumns.BottleSize], AllColumns.BottleSize)} ({formatValue(similarProduct[AllColumns.PricePerLiter], AllColumns.PricePerLiter)})
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
