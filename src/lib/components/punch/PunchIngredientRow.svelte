<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PunchIngredient, PunchLine, PunchSwap } from '$lib/utils/catalog/punch';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import { m } from '$lib/i18n';
	import { productName } from '$lib/i18n/values';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';
	import ProductImage from '../widgets/ProductImage.svelte';

	const {
		ingredient,
		line,
		color,
		swap,
		swapInStore = false,
		inStore,
		onremove,
		onswap
	}: {
		/** The recipe's own ingredient, edited in place */
		ingredient: PunchIngredient;
		line: PunchLine;
		/** Its colour in the composition bars, `[light, dark]` */
		color: readonly [string, string];
		swap?: PunchSwap | null;
		/** The swap was looked for in the preferred store only */
		swapInStore?: boolean;
		/** Whether the preferred store has the product; undefined without a store or store data */
		inStore?: boolean;
		onremove: () => void;
		onswap?: (swap: PunchSwap) => void;
	} = $props();

	const inputClass = twMerge(components.input(), 'w-full min-w-0');
	const id = $props.id();

	function step(delta: number) {
		// Whole packages from a fractional count, so 1.5 steps to 2 and 1
		// (an emptied field is null)
		const count = ingredient.count || 0;
		const next = delta > 0 ? Math.floor(count) + 1 : Math.ceil(count) - 1;
		ingredient.count = Math.max(0, next);
	}
</script>

{#snippet stepper(label: string)}
	<!-- Joined like the list view's quantity counter -->
	<div class="flex flex-row">
		<button
			type="button"
			class={twMerge(
				components.button(),
				'touch-manipulation rounded-e-none border-e-0',
				ingredient.count <= 0 && 'cursor-not-allowed opacity-50'
			)}
			onclick={() => step(-1)}
			disabled={ingredient.count <= 0}
			aria-label={m.punch_less({ name: label })}
		>
			<Icon name="minus" />
		</button>
		<input
			class={twMerge(components.input(), 'hide-number-input w-[6ch] rounded-none text-center')}
			type="number"
			inputmode="decimal"
			min="0"
			step="any"
			bind:value={ingredient.count}
			aria-label={m.punch_amount({ name: label })}
		/>
		<button
			type="button"
			class={twMerge(components.button(), 'touch-manipulation rounded-s-none border-s-0')}
			onclick={() => step(1)}
			aria-label={m.punch_more({ name: label })}
		>
			<Icon name="plus" />
		</button>
	</div>
{/snippet}

{#snippet total()}
	<span class="ms-auto min-w-20 text-end font-semibold tabular-nums">
		{formatValue(line.price * line.count, AllColumns.Price)}
	</span>
{/snippet}

{#snippet removeButton(label: string)}
	<button
		type="button"
		class={twMerge(components.button({ type: 'noborder' }), 'aspect-square shrink-0')}
		onclick={onremove}
		aria-label={m.punch_remove_named({ name: label })}
		title={m.punch_remove()}
	>
		<Icon name="trash" class="text-secondary" />
	</button>
{/snippet}

<li
	class="flex flex-col gap-3 border-t border-primary py-3 first:border-t-0"
	style:--swatch={color[0]}
	style:--swatch-dark={color[1]}
>
	{#if ingredient.kind === 'alko'}
		{@const product = line.product}
		<div class="flex items-center gap-3">
			<span
				class="h-8 w-1.5 shrink-0 rounded-full bg-(--swatch) dark:bg-(--swatch-dark)"
				aria-hidden="true"
			></span>
			<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white p-0.5">
				<ProductImage
					number={ingredient.id}
					name={line.name}
					alt=""
					class="h-full w-full object-contain"
				/>
			</div>
			<div class="flex min-w-0 flex-1 flex-col">
				{#if product}
					<a
						href={resolve(`/tuotteet/${ingredient.id}/`)}
						class="truncate font-semibold hover:underline"
						title={line.name}
					>
						{line.name}
					</a>
					<span class="text-xs text-secondary">
						{formatValue(line.volume, AllColumns.BottleSize)} · {formatValue(
							line.abv,
							AllColumns.AlcoholPercentage
						)} · {m.punch_per_piece({ price: formatValue(line.price, AllColumns.Price) })}
					</span>
					{#if inStore !== undefined}
						<span
							class={twMerge(
								'mt-0.5 inline-flex items-center gap-1 text-xs',
								inStore ? 'text-green-700 dark:text-green-400' : 'text-secondary'
							)}
						>
							<Icon name="store" />
							{inStore ? m.avail_in_your_store() : m.avail_not_in_your_store()}
						</span>
					{/if}
				{:else}
					<span class="font-semibold">{line.name}</span>
					<span class="text-xs text-secondary">{m.punch_product_not_in_list()}</span>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-2 ps-4.5">
			{@render stepper(line.name)}
			{@render total()}
			{@render removeButton(line.name)}
		</div>
		{#if swap && onswap}
			<div
				class="ms-4.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-green-700/30 bg-green-50 p-2.5 text-sm dark:border-green-400/30 dark:bg-green-950/40"
			>
				<Icon name="piggy_bank" class="shrink-0 text-green-700 dark:text-green-400" />
				<span class="min-w-0 flex-1">
					{swapInStore ? m.punch_cheaper_similar_store() : m.punch_cheaper_similar()}
					<a
						href={resolve(`/tuotteet/${swap.product[AllColumns.Number]}/`)}
						class="font-semibold hover:underline"
					>
						{productName(swap.product)}
					</a>
					({swap.count} × {formatValue(swap.product[AllColumns.BottleSize], AllColumns.BottleSize)},
					{formatValue(swap.product[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage)}).
					{m.punch_you_save({ amount: formatValue(swap.saving, AllColumns.Price) })}
				</span>
				<button
					type="button"
					class={twMerge(components.button({ type: 'positive' }), 'shrink-0')}
					onclick={() => onswap(swap)}
				>
					<Icon name="transfer" />
					{m.punch_swap()}
				</button>
			</div>
		{/if}
	{:else}
		<div class="flex items-center gap-3">
			<span
				class="h-8 w-1.5 shrink-0 rounded-full bg-(--swatch) dark:bg-(--swatch-dark)"
				aria-hidden="true"
			></span>
			<label class="relative flex min-w-0 flex-1 flex-col gap-1" for={`${id}-name`}>
				<span class="sr-only">{m.punch_ingredient_name()}</span>
				<input
					id={`${id}-name`}
					class={twMerge(inputClass, 'font-semibold')}
					bind:value={ingredient.name}
					maxlength="80"
					placeholder={m.punch_ingredient_name_placeholder()}
				/>
			</label>
			{@render removeButton(ingredient.name || m.punch_ingredient_fallback())}
		</div>
		<div class="grid grid-cols-3 gap-2 ps-4.5">
			<label class="flex min-w-0 flex-col gap-1" for={`${id}-volume`}>
				<span class="text-xs text-secondary">{m.punch_size_l()}</span>
				<input
					id={`${id}-volume`}
					class={inputClass}
					type="number"
					inputmode="decimal"
					min="0"
					step="any"
					bind:value={ingredient.volume}
				/>
			</label>
			<label class="flex min-w-0 flex-col gap-1" for={`${id}-abv`}>
				<span class="text-xs text-secondary">{m.punch_abv_percent()}</span>
				<input
					id={`${id}-abv`}
					class={inputClass}
					type="number"
					inputmode="decimal"
					min="0"
					max="100"
					step="any"
					bind:value={ingredient.abv}
				/>
			</label>
			<label class="flex min-w-0 flex-col gap-1" for={`${id}-price`}>
				<span class="text-xs text-secondary">{m.punch_price_per_piece()}</span>
				<input
					id={`${id}-price`}
					class={inputClass}
					type="number"
					inputmode="decimal"
					min="0"
					step="any"
					bind:value={ingredient.price}
				/>
			</label>
		</div>
		<div class="flex items-center gap-2 ps-4.5">
			{@render stepper(ingredient.name || m.punch_ingredient_fallback())}
			{@render total()}
		</div>
	{/if}
</li>
