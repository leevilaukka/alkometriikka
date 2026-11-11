<script lang="ts">
	import Punch from '$lib/components/views/Punch.svelte';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { staticPage } from '$lib/utils/app/seo';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	$effect(() => {
		const { description, keywords } = staticPage('/boolilaskuri/');
		setSEO({ description, keywords });
	});
</script>

<svelte:head>
	<title>{generateTitle('Boolilaskuri')}</title>
</svelte:head>

{#await data.alko then alko}
	<Punch {alko} />
{:catch}
	<p class="p-4 text-secondary">Alkon hinnastoa ei voitu ladata.</p>
{/await}
