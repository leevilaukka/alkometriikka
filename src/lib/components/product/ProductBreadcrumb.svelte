<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import type { PriceListItem } from '$lib/types';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const { product, class: _class = '' }: { product: PriceListItem; class?: string } = $props();
</script>

<nav class={twMerge('flex min-w-0 items-center gap-2 overflow-hidden text-sm text-secondary', _class)}>
	<a href="/" class="flex shrink-0 items-center gap-1 hover:text-black dark:hover:text-white">
		<Icon name="home" class="text-base" />
		<span class="hidden sm:inline">Etusivu</span>
	</a>
	{#if product[AllColumns.Type]}
		<Icon name="chevron_right" />
		<span class="shrink-0">{product[AllColumns.Type]}</span>
	{/if}
	{#if product[AllColumns.SubType]}
		<Icon name="chevron_right" />
		<span class="shrink-0">{product[AllColumns.SubType]}</span>
	{/if}
	<Icon name="chevron_right" class="hidden sm:block" />
	<span class="hidden truncate text-black sm:inline dark:text-white">{product[AllColumns.Name]}</span>
</nav>
