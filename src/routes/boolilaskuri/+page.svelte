<script lang="ts">
	import { locale, m } from '$lib/i18n';
	import Punch from '$lib/components/views/Punch.svelte';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { staticPage } from '$lib/utils/app/seo';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	$effect(() => {
		const { description, keywords } = staticPage('/boolilaskuri/', locale);
		setSEO({ description, keywords });
	});
</script>

<svelte:head>
	<title>{generateTitle(m.nav_punch())}</title>
</svelte:head>

{#await data.alko then alko}
	<Punch {alko} />
{:catch}
	<p class="p-4 text-secondary">{m.punch_load_failed()}</p>
{/await}
