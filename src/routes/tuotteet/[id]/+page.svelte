<script lang="ts">
  	import type { DatasetRow } from '$lib/types';
	import type { FullProperties } from 'xlsx';
	import type { Kaljakori } from '$lib/alko';
	import Product from '$lib/components/views/Product.svelte';
	import { page } from '$app/state';
	import { redirect } from '@sveltejs/kit';

	let  { data }: { data: Promise<{ dataset: { table: DatasetRow[]; metadata: FullProperties }, kaljakori: Kaljakori }> } = $props(); 
	const id = page.params.id

	if (!id) redirect(418, "/");
</script>

{#await data then data}
	{@const product = data.kaljakori.findById(id)}
	<Product product={product} />
{/await}