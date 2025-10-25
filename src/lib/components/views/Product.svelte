<script lang="ts">
	import {
		AllColumns,
		DatasetColumns,
		DrunkColumns,
		hideFromProductPageStats
	} from '$lib/utils/constants';
	import { formatValue, generateTitle, valueToString } from '$lib/utils/helpers';
	import { generateImageUrl } from '$lib/utils/image';
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
	import { generateSimilarProductsFilter } from '$lib/utils/filters';
	const { product, kaljakori }: { product: PriceListItem; kaljakori: Kaljakori } = $props();

	function handleBack() {
		if (window.history.length > 1) window.history.back();
		else goto('/');
	}

	let productElement: HTMLDivElement;

	let similarProducts = kaljakori
		.filter(
			generateSimilarProductsFilter(product, {
				[AllColumns.Type]: [product[AllColumns.Type]],
				[AllColumns.AlcoholPercentage]: 0.15,
				[AllColumns.Price]: 0.2
			})
		).filter(p => p[AllColumns.Number] !== product[AllColumns.Number])
		.splice(0, 20);

	afterNavigate((nav) => {
		productElement?.scrollIntoView({ behavior: 'smooth' });
	});
</script>

<svelte:head>
	<title>{generateTitle(`${product[AllColumns.Name]}`)}</title>
</svelte:head>



<div
	bind:this={productElement}
	class={twMerge('mx-auto flex w-full max-w-[120ch] flex-col flex-nowrap items-center gap-6 p-6')}
>
	<div class="flex w-full items-center gap-4">
		<button onclick={() => handleBack()} class={twMerge(components.button({ size: 'md' }))}>
			<Icon name={window.history.length > 1 ? 'arrow_back' : 'home'} class="inline-block" />
			<span>{window.history.length > 1 ? 'Takaisin' : 'Etusivulle'}</span>
		</button>
	</div>
	<div class="grid w-full grid-cols-1 md:grid-cols-[auto_1fr]">
		<div class="flex aspect-square h-96 w-full max-w-full p-6 md:w-fit">
			<img
				src={generateImageUrl(product[AllColumns.Number], product[AllColumns.Name], 'medium')}
				alt={product[AllColumns.Name]}
				class="block w-full object-contain"
			/>
		</div>
		<div class="flex w-full flex-col justify-between gap-3">
			<div class="flex flex-col gap-2">
				<h2 class="text-2xl font-bold md:text-3xl">
					{product[AllColumns.Name]}
				</h2>
				<span>
					{valueToString(product[AllColumns.Manufacturer], AllColumns.Manufacturer)} | {valueToString(
						product[AllColumns.BottleSize],
						AllColumns.BottleSize
					)} | {valueToString(product[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage)}
					{product[AllColumns.Vintage] !== ''
						? `| ${valueToString(product[AllColumns.Vintage], AllColumns.Vintage)}`
						: ''}</span
				>
				<p class="w-fit rounded bg-gray-200 px-1">{product[AllColumns.Availability]}</p>
				<div class="flex w-full flex-row gap-2 md:flex-row">
					<BadgeList item={product} />
				</div>
			</div>
			<div class="flex flex-col items-end gap-1">
				<p class="text-4xl font-bold">
					{Number.parseFloat(product[AllColumns.Price] as string).toFixed(2)} €
				</p>
				<span class="text-sm text-gray-500">
					({product[AllColumns.PricePerLiter]} €/L)
				</span>
			</div>
		</div>
	</div>
	<div class="flex w-full items-center gap-4 md:justify-end">
		<Popup class="gap-4 p-4">
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<button
					class={twMerge(components.button({ type: 'positive', size: 'md' }))}
					onclick={() => dialogElement.showModal()}
				>
					<span>Lisää listaan</span>
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
			class={twMerge(components.button({ size: 'md' }))}
		>
			<span>Alkon tuotesivu</span>
			<Icon name="link_external" class="inline-block" />
		</a>
	</div>
	<div class="flex w-full flex-col gap-2 rounded border border-gray-300 bg-gray-200 p-4">
		<div class="flex flex-col items-start gap-0.5 md:flex-row md:gap-3">
			<div class="flex flex-col gap-0.5 md:gap-1">
				<h2 class="text-lg font-bold">Perustiedot</h2>
				{#each Object.entries(DatasetColumns) as [_, value]}
					{@const valueEmpty =
						product[value] !== null && product[value] !== undefined && product[value] !== ''}
					{#if valueEmpty && !hideFromProductPageStats.has(value as (typeof DatasetColumns)[keyof typeof DatasetColumns])}
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
			<h2 class="text-lg font-bold">Laskennalliset tiedot</h2>
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
		<h2 class="text-2xl font-bold">Samantyyppisiä tuotteita</h2>
		<div class="flex max-w-full flex-row flex-nowrap gap-3 overflow-x-auto">
			{#each similarProducts as similarProduct}
				<a
					href={`/tuotteet/${similarProduct[AllColumns.Number]}`}
					class="flex flex-col gap-3 shrink-0 rounded-lg border border-gray-300 w-48 p-4"
				>	
					<h2 class="text-xl font-bold md:text-2xl h-[calc(3_*_1.75rem)] md:h-[calc(3_*_2rem)] line-clamp-3">
						{similarProduct[AllColumns.Name]}
					</h2>
					<div
						class="flex aspect-square w-full shrink-0 p-2 md:max-w-fit"
					>
						<img
							src={generateImageUrl(
								similarProduct[AllColumns.Number],
								similarProduct[AllColumns.Name],
								"products"
							)}
							alt={similarProduct[AllColumns.Name]}
							class="block aspect-square h-full w-full object-contain"
						/>
					</div>
					<div class="flex flex-col items-left gap-2">
						
						<p class="text-3xl font-bold drop-shadow-lg">
							{Number.parseFloat(similarProduct[AllColumns.Price] as string).toFixed(2)} €
						</p>
						<span class="text-sm text-gray-500">
							{formatValue(similarProduct[AllColumns.BottleSize], AllColumns.BottleSize)} ({similarProduct[AllColumns.PricePerLiter]} €/L)
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
