<script lang="ts">
	import type { Kaljakori } from '$lib/alko';
	import type { PriceListItem } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import {
		normalizeSearchText,
		rankEntries,
		type SearchEntry
	} from '$lib/utils/app/commandPalette';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';
	import ProductImage from '../widgets/ProductImage.svelte';

	const {
		kaljakori,
		inStore,
		onadd
	}: {
		kaljakori: Kaljakori;
		/** Whether the preferred store has the product, once store data has loaded */
		inStore?: (product: PriceListItem) => boolean;
		onadd: (product: PriceListItem) => void;
	} = $props();

	const RESULT_LIMIT = 8;

	let query = $state('');
	let activeIndex = $state(0);
	let open = $state(false);
	let inputElement = $state<HTMLInputElement>();

	// Removed products can't be bought, so only the selection is searched
	let entries: SearchEntry<PriceListItem>[] | undefined;
	function getEntries() {
		entries ??= kaljakori.data
			.filter((product) => product[AllColumns.RemovedFromSelection] !== true)
			.map((product) => ({
				value: product,
				keys: [
					normalizeSearchText(String(product[AllColumns.Name] ?? '')),
					normalizeSearchText(String(product[AllColumns.Manufacturer] ?? ''))
				],
				ids: [String(product[AllColumns.Number]), String(product[AllColumns.EAN] ?? '')].filter(
					Boolean
				)
			}));
		return entries;
	}

	const results = $derived.by(() => {
		const normalized = normalizeSearchText(query);
		if (!normalized || !open) return [];
		return rankEntries(normalized, getEntries(), RESULT_LIMIT).map((entry) => entry.value);
	});

	$effect(() => {
		// A new result list starts from its first row
		void results;
		activeIndex = 0;
	});

	function add(product: PriceListItem) {
		onadd(product);
		query = '';
		open = true;
		inputElement?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!results.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = (activeIndex + 1) % results.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = (activeIndex - 1 + results.length) % results.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			add(results[activeIndex]);
		} else if (event.key === 'Escape') {
			open = false;
		}
	}
</script>

<div class="relative flex flex-col gap-1">
	<label for="punch-product-search" class="text-sm">Lisää Alkon tuote</label>
	<div class="relative">
		<Icon
			name="search"
			class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-secondary"
		/>
		<input
			id="punch-product-search"
			bind:this={inputElement}
			bind:value={query}
			onkeydown={handleKeydown}
			oninput={() => (open = true)}
			onfocus={() => (open = true)}
			onblur={() => (open = false)}
			class={twMerge(components.input(), 'w-full ps-7')}
			type="search"
			autocomplete="off"
			placeholder="Hae nimellä, valmistajalla tai numerolla..."
			role="combobox"
			aria-expanded={results.length > 0}
			aria-controls="punch-product-results"
			aria-activedescendant={results.length ? `punch-result-${activeIndex}` : undefined}
		/>
	</div>
	{#if results.length}
		<ul
			id="punch-product-results"
			role="listbox"
			aria-label="Hakutulokset"
			onpointerdown={(event) => event.preventDefault()}
			class="absolute top-full z-20 mt-1 max-h-[min(60vh,28rem)] w-full overflow-y-auto rounded border border-primary bg-primary p-1 shadow-lg"
		>
			{#each results as product, index (product[AllColumns.Number])}
				<li
					id={`punch-result-${index}`}
					role="option"
					aria-selected={index === activeIndex}
					class={twMerge(
						'flex cursor-pointer items-center gap-3 rounded px-2 py-1.5',
						index === activeIndex ? 'bg-secondary' : ''
					)}
					onpointerenter={() => (activeIndex = index)}
					onclick={() => add(product)}
					onkeydown={() => {}}
				>
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white p-0.5">
						<ProductImage
							number={product[AllColumns.Number]}
							name={product[AllColumns.Name]}
							alt=""
							class="h-full w-full object-contain"
						/>
					</div>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-semibold">{product[AllColumns.Name]}</span>
						<span class="truncate text-xs text-secondary">
							{formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)} · {formatValue(
								product[AllColumns.AlcoholPercentage],
								AllColumns.AlcoholPercentage
							)}{product[AllColumns.EuroPerServing] > 0
								? ` · ${formatValue(product[AllColumns.EuroPerServing], AllColumns.EuroPerServing)}/annos`
								: ''}{inStore?.(product) ? ' · myymälässäsi' : ''}
						</span>
					</div>
					<span class="shrink-0 font-semibold">
						{formatValue(product[AllColumns.Price], AllColumns.Price)}
					</span>
					<Icon name="plus" class="shrink-0 text-secondary" />
				</li>
			{/each}
		</ul>
	{/if}
</div>
