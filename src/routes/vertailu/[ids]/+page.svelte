<script lang="ts">
	import Compare from '$lib/components/views/Compare.svelte';
	import { page } from '$app/state';
	import { compareIdsFromParam } from '$lib/utils/compare';
	import type { PriceListItem } from '$lib/types';

	let { data } = $props();

	let ids = $derived(compareIdsFromParam(page.params.ids));
</script>

{#await data.alko}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then alko}
	{@const products = ids
		.map((id) => alko.kaljakori.findById(id))
		.filter((product): product is PriceListItem => Boolean(product))}
	<Compare {products} />
{/await}
