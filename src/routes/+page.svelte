<script lang="ts">
	import Main, { type ListPosition } from '$lib/components/views/Main.svelte';
	import WatchlistBanner from '$lib/components/widgets/WatchlistBanner.svelte';
	import GuidanceHint from '$lib/components/widgets/GuidanceHint.svelte';
	import { guidance } from '$lib/utils/app/guidance.svelte';
	import { GuidanceIds } from '$lib/utils/user/guidance';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { resolve } from '$app/paths';
	import { beforeNavigate } from '$app/navigation';
	import { generateTitle, resetSEO } from '$lib/utils/app/meta';
	import type { PageProps, Snapshot } from './$types';
	import { page } from '$app/state';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { watchlist } from '$lib/global.svelte';
	import { readSearchParams } from '$lib/utils/app/compressedParams';

	let { data }: PageProps = $props();
	resetSEO();

	// A store filter from the URL needs store availability, or the list would start out empty,
	// and showing removed products needs them loaded, or the ranges would leave some out
	const params = readSearchParams(page.url);
	const needsStores = params.has(AllColumns.StoreAvailability);
	const needsRemoved = params.get('removed') === 'true';
	const ready = $derived(
		Promise.all([
			needsStores ? data.alkoWithStores : data.alko,
			needsRemoved ? data.alkoWithRemoved : data.alko
		]).then(([alko]) => alko)
	);

	// Going back to the list returns to where it was scrolled. Cleared on every navigation so
	// only back/forward, which restores the snapshot, scrolls it.
	let main: Main | undefined = $state();
	let position: ListPosition | undefined = $state();
	beforeNavigate(() => (position = undefined));

	const showIntro = $derived(guidance.shows(GuidanceIds.Intro));
	export const snapshot: Snapshot<ListPosition | undefined> = {
		capture: () => main?.currentPosition(),
		restore: (value) => (position = value)
	};
</script>

<svelte:head>
	<title>{generateTitle()}</title>
</svelte:head>

{#await ready then alko}
	<!-- Main's own heading is replaced by a header, so this one brings it back -->
	{#snippet header()}
		<h1 class="sr-only">Alkon tuotteet</h1>
		<WatchlistBanner
			kaljakori={alko.kaljakori}
			availability={alko.availability}
			availabilityLoaded={alko.availabilityLoaded}
		/>
		{#if showIntro}
			<GuidanceHint id={GuidanceIds.Intro} icon="info_circle" closeLabel="Sulje esittely">
				<strong>Uusi täällä?</strong> Ylimpänä on eniten alkoholia eurolla. Vaihda järjestystä alta
				tai rajaa suodattimilla. Katso myös
				{@render introLink('/hinnanmuutokset/', 'hinnanmuutokset', 'price_changes')}
				ja päivän {@render introLink('/daily/', 'Daily-visa', 'daily')}.
			</GuidanceHint>
		{/if}
	{/snippet}
	{#snippet introLink(href: '/hinnanmuutokset/' | '/daily/', label: string, target: string)}
		<a
			href={resolve(href)}
			class="font-semibold whitespace-nowrap underline"
			onclick={() => sendAnalyticsEvent('open_intro_link', { target })}>{label}</a
		>
	{/snippet}
	<Main
		kaljakori={alko.kaljakori}
		header={watchlist.length || showIntro ? header : undefined}
		{position}
		bind:this={main}
	/>
{/await}
