<script lang="ts">
	import List from '$lib/components/views/List.svelte';
	import AllLists from '$lib/components/widgets/AllLists.svelte';
	import PageHeader from '$lib/components/widgets/PageHeader.svelte';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { staticPage } from '$lib/utils/app/seo';

	const { data } = $props();
	const { description: DESCRIPTION } = staticPage('/listat/');

	$effect(() => {
		setSEO({
			description: data.list ? `Katso lista "${data.list.name}" Alkometriikassa.` : DESCRIPTION,
			og: {
				title: data.list ? `Lista - ${data.list.name}` : 'Listat',
				url: window.location.href,
				description: data.list ? `Katso lista "${data.list.name}" Alkometriikassa.` : DESCRIPTION
			}
		});
	});
</script>

<svelte:head>
	<title>{data.list ? generateTitle(`Lista - ${data.list.name}`) : generateTitle('Listat')}</title>
</svelte:head>

{#await data.alkoWithRemoved}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then alko}
	{#if data.list}
		<!-- Saving gives the list a new id, so the page starts over as the saved list -->
		{#key data.list.id}
			<List kaljakori={alko.kaljakori} list={data.list} />
		{/key}
	{:else}
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
			<PageHeader title="Listat" description={DESCRIPTION} />
			<AllLists
				useSearch={true}
				show={{ delete: true, share: true }}
				class="h-auto w-full justify-start"
			/>
		</div>
	{/if}
{/await}
