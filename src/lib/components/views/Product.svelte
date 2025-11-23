<script lang="ts">
	import {
		AllColumns,
		DatasetColumns,
		DrunkColumns,
		hideFromProductPageStats
	} from '$lib/utils/constants';
	import { formatValue, generateTitle, setSEO, valueToString } from '$lib/utils/helpers';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { type ListObj, type PriceListItem } from '$lib/types';
	import { addToList } from '$lib/utils/lists';
	import BadgeList from '../widgets/BadgeList.svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import type { Kaljakori } from '$lib/alko';
	import { findSimilarProducts } from '$lib/utils/filters';
	import ProductImage from '../widgets/ProductImage.svelte';
	import { generateImageUrl } from '$lib/utils/image';
	const { product, kaljakori }: { product: PriceListItem; kaljakori: Kaljakori } = $props();

	function handleBack() {
		if (window.history.length > 1) window.history.back();
		else goto('/');
	}

	let productElement: HTMLDivElement;

	let similarProducts = findSimilarProducts(
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
	);

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

	setSEO({
		description: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
		og: {
			title: generateTitle(`${product[AllColumns.Name]}`),
			description: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
			url: `https://alkometriikka.fi/tuotteet/${product[AllColumns.Number]}`
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
		}
	});
</script>

<svelte:head>
	<title>{generateTitle(`${product[AllColumns.Name]}`)}</title>
</svelte:head>

<div
	bind:this={productElement}
	class={twMerge('mx-auto flex w-full max-w-[120ch] flex-col flex-nowrap gap-6 p-6')}
>
	<div class="flex w-full items-center gap-4">
		<button onclick={() => handleBack()} class={twMerge(components.button({ size: 'md' }))}>
			<Icon name={window.history.length > 1 ? 'arrow_back' : 'home'} class="inline-block" />
			<span>{window.history.length > 1 ? 'Takaisin' : 'Etusivulle'}</span>
		</button>
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
					{product[AllColumns.Availability]}
				</p>
				<div class="flex w-full flex-row gap-2 md:flex-row">
					<BadgeList item={product} />
				</div>
			</div>
			<div class="flex flex-col items-end gap-1">
				<p class="text-4xl font-bold" data-price={`${product[AllColumns.Price].toFixed(2)} €`}>
					{product[AllColumns.Price].toFixed(2)} €
				</p>
				<span class="text-sm text-secondary">
					({product[AllColumns.PricePerLiter]} €/L)
				</span>
			</div>
		</div>
	</header>
	<div class="grid grid-cols-1 md:grid-cols-[2fr_1fr] w-full gap-4 md:justify-end">
		<Popup class="gap-4 p-4">
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<button
					class={twMerge(components.button({ type: 'positive', size: 'lg' }), "py-3 px-5 text-xl justify-between w-full")}
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
			class={twMerge(components.button({ size: 'md' }), "py-3 px-5 text-xl w-full")}
		>
			<span>Alkon tuotesivu</span>
			<Icon name="link_external" class="inline-block" />
		</a>
	</div>
	<div class="flex w-full flex-col gap-4 rounded border border-primary bg-secondary p-4">
		<div class="flex flex-col items-start gap-0.5 md:flex-row md:gap-3">
			<div class="flex flex-col gap-0.5 md:gap-1">
				<h2 class="text-xl font-bold">Perustiedot</h2>
				{#each Object.entries(DatasetColumns) as [_, value]}
					{@const hasValue = valueToString(product[value]).length > 0}
					{#if hasValue && !hideFromProductPageStats.has(value as (typeof DatasetColumns)[keyof typeof DatasetColumns])}
						<p>
							{valueToString(
								product[value],
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
					<p>
						{valueToString(
							product[value],
							value as (typeof DrunkColumns)[keyof typeof DrunkColumns]
						)}
					</p>
				{/if}
			{/each}
		</div>
	</div>
	{#if similarProducts.length}
		<div class="flex items-center justify-between">
			<h2 class="text-2xl font-bold">Samankaltaisia tuotteita</h2>
			<a
				class={twMerge(components.button({ size: 'md' }))}
				href={`/vastaavat/${product[AllColumns.Number]}`}
			>
				<span>Lisää samankaltaisia</span>
				<Icon name="arrow_right" />
			</a>
		</div>
		<div class="flex max-w-full flex-row flex-nowrap gap-3 overflow-x-auto" use:sideScroll>
			{#each similarProducts as similarProduct}
				<a
					href={`/tuotteet/${similarProduct[AllColumns.Number]}`}
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
							{similarProduct[AllColumns.Price].toFixed(2)} €
						</p>
						<span class="text-sm text-secondary">
							{formatValue(similarProduct[AllColumns.BottleSize], AllColumns.BottleSize)} ({similarProduct[
								AllColumns.PricePerLiter
							]} €/L)
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
