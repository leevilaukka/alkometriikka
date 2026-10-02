<script lang="ts">
	import Stats from '$lib/components/views/Stats.svelte';
	import { generateTitle, setSEO } from '$lib/utils/helpers';

	const { data } = $props();

	$effect(() => {
		setSEO({
			description: 'Alkon valikoima numeroina ja kuvaajina.',
			og: {
				title: generateTitle('Tilastot'),
				description: 'Alkon valikoima numeroina ja kuvaajina.',
				url: window.location.href
			},
			keywords: 'tilastot, kuvaajat, hinnat, alkoholi'
		});
	});
</script>

<svelte:head>
	<title>{generateTitle('Tilastot')}</title>
</svelte:head>

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
	<Stats dataset={alko.dataset.table} availability={alko.availability} personalInfo={alko.kaljakori.personalInfo} />
{/await}