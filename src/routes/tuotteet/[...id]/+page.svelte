<script lang="ts">
  	import type { DatasetRow } from '$lib/types';
	import type { FullProperties } from 'xlsx';
	import type { Kaljakori } from '$lib/alko';
	import Product from '$lib/components/views/Product.svelte';
	import { page } from '$app/state';
	import { redirect } from '@sveltejs/kit';

	let  { data } = $props(); 
	const id = page.params.id?.split('/')[0]; // Handle both /tuotteet/123 and /tuotteet/123/extra paths

	console.log('id', id);

	if (!id) redirect(300, "/");
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
	{@const product = alko.kaljakori.findById(id)}
	<Product product={product} />
{/await}