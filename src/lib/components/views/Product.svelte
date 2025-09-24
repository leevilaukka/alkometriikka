<script lang="ts">
	import { AllColumns, DatasetColumns, DrunkColumns, hideFromProductPageStats } from '$lib/utils/constants';
	import { valueToString } from '$lib/utils/helpers';
	import { generateImageUrl } from '$lib/utils/image';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { type ListObj } from '$lib/types';
	import { addToList } from '$lib/utils/lists';
	const { product } = $props();

   document.title = `Alkometriikka | ${product[AllColumns.Name]}`;
</script>

<div
	class={twMerge(
		'mx-auto flex w-full max-w-[120ch] flex-col flex-nowrap items-center gap-6 p-6'
	)}
>
    <div class="flex w-full items-center gap-4">
        <button
            onclick={() => window.history.back()}
            class={twMerge(components.button({ size: "md" }))}
        >
           <Icon name="arrow_left" class="inline-block" />
           <span>Takaisin</span>
        </button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-[auto_1fr] w-full">
        <div class="flex aspect-square h-96 max-w-full p-6">
            <img
                src={generateImageUrl(product[AllColumns.Number], product[AllColumns.Name], 'medium')}
                alt={product[AllColumns.Name]}
                class="block w-full object-contain"
            />
        </div>
        <div class="flex w-full flex-col justify-between gap-3">
            <div class="flex flex-col gap-1">
                <h2 class="text-2xl font-bold md:text-3xl">
                    {product[AllColumns.Name]}
                </h2>
                <span> {valueToString(product[AllColumns.Manufacturer], AllColumns.Manufacturer)} | {valueToString(product[AllColumns.BottleSize], AllColumns.BottleSize)} | {valueToString(product[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage)} {product[AllColumns.Vintage] !== "" ? `| ${valueToString(product[AllColumns.Vintage], AllColumns.Vintage)}` : ''}</span>
                <div class="flex flex-col w-full gap-4 md:flex-row">
                    {#if !!product[AllColumns.New]}
                        <p class="rounded bg-red-200 px-1.5 py-0.5 text-sm text-red-800">Uutuus</p>
                    {/if}
                    {#if product[AllColumns.SpecialGroup] === 'Luomu'}
                        <p class="rounded bg-green-300 px-1.5 py-0.5 text-sm text-green-800">Luomu</p>
                    {/if}
                    {#if product[AllColumns.SpecialGroup] === 'Vegaaneille soveltuva tuote'}
                        <p class="rounded bg-emerald-300 px-1.5 py-0.5 text-sm text-emerald-800">Vegaani</p>
                    {/if}
                    {#if product[AllColumns.AlcoholPercentage] === 0}
                        <p class="rounded bg-blue-300 px-1.5 py-0.5 text-sm text-blue-800">Alkoholiton</p>
                    {/if}
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
            <Popup class="p-4 gap-4">
				{#snippet renderButton(dialogElement: HTMLDialogElement)}
					<button 
						class={twMerge(components.button({ type: "positive", size: "md" }))}
						onclick={() => dialogElement.showModal()}
					>
                        <span>Lisää listaan</span>
						<Icon name="plus" />
					</button>
				{/snippet}
				{#snippet renderContent(dialogElement: HTMLDialogElement)}
					<h2 class="text-xl">Valitse lista</h2>
                    <AllLists action={(list: ListObj) => { 
                        addToList(list, product[AllColumns.Number])
                        dialogElement.close();
                     }} />
				{/snippet}
			</Popup>
        <a
            href={`https://www.alko.fi/tuotteet/${product[AllColumns.Number]}`}
            target="_blank"
            rel="noopener noreferrer"
            class={twMerge(components.button({ size: "md" }))}
        >
            <span>Alkon tuotesivu</span> <Icon name="external_link" class="inline-block" />
        </a>
    </div>
	<div class="flex w-full flex-col gap-2 bg-gray-200 p-4 rounded border border-gray-300">
		<div class="flex flex-col items-start gap-0.5 md:flex-row md:gap-3">
			<div class="flex flex-col gap-0.5 md:gap-1">
				<h2 class="text-lg font-bold">Perustiedot</h2>
				{#each Object.entries(DatasetColumns) as [_, value]}
                    {@const valueEmpty = product[value] !== null && product[value] !== undefined && product[value] !== ''}
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
</div>
