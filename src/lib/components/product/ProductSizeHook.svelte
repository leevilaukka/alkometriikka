<script lang="ts">
	import { resolve } from '$app/paths';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import type { SizeOption } from '$lib/utils/catalog/filters';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';
	import { m } from '$lib/i18n';

	const { size, class: _class = '' }: { size: SizeOption; class?: string } = $props();
</script>

<a
	href={resolve(`/tuotteet/${size.product[AllColumns.Number]}/`)}
	class={twMerge(
		'flex min-h-11 w-full items-center gap-3 rounded border border-primary bg-primary p-3 text-left hover:border-green-600',
		_class
	)}
>
	<Icon name="price_tag" class="shrink-0 text-xl text-green-700 dark:text-green-400" />
	<div class="flex min-w-0 flex-col gap-0.5">
		<span class="text-sm font-bold text-green-700 dark:text-green-400"
			>{m.sizes_cheaper_available()}</span
		>
		<strong class="text-sm leading-tight">
			{formatValue(size.product[AllColumns.BottleSize], AllColumns.BottleSize)} · {formatValue(
				size.product[AllColumns.Price],
				AllColumns.Price
			)} ({formatValue(size.product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)})
		</strong>
	</div>
	<Icon name="chevron_right" class="ml-auto shrink-0 text-xl" />
</a>
