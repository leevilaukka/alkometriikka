<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { components } from '$lib/utils/ui/styles';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { readWineReviewCollection, type WineReviewCollection } from '$lib/utils/wine-reviews';
	import WineReviewCard from '$lib/components/widgets/WineReviewCard.svelte';

	const PAGE_SIZE = 12;
	let collection = $state<WineReviewCollection>({ version: 1, skus: [], reviews: [] });
	let loading = $state(true);
	let loadError = $state(false);
	let query = $state('');
	let minimumStars = $state('0');
	let sort = $state('name');
	let currentPage = $state(1);
	let controller: AbortController | undefined;
	const searchable = $derived(collection.reviews.map((review) => ({
		review,
		text: `${review.title} ${review.sku} ${review.vintage ?? ''} ${review.text} ${review.food}`.toLocaleLowerCase('fi-FI')
	})));
	const filtered = $derived.by(() => {
		const words = query.trim().toLocaleLowerCase('fi-FI').split(/\s+/).filter(Boolean);
		const reviews = searchable.filter(({ review, text }) =>
			(minimumStars === '0' || (review.stars ?? 0) >= Number(minimumStars)) &&
			words.every((word) => text.includes(word))
		).map(({ review }) => review);
		return reviews.sort((a, b) => {
			if (sort === 'rating') {
				const ratingDifference = (b.stars ?? 0) - (a.stars ?? 0);
				if (ratingDifference) return ratingDifference;
			} else if (sort === 'newest') {
				const dateDifference = (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
				if (dateDifference) return dateDifference;
			}
			return a.title.localeCompare(b.title, 'fi-FI') || a.sku.localeCompare(b.sku) ||
				(b.vintage ?? '').localeCompare(a.vintage ?? '');
		});
	});
	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
	const activePage = $derived(Math.min(currentPage, totalPages));
	const visible = $derived(filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE));

	async function loadReviews() {
		controller?.abort();
		const request = new AbortController();
		controller = request;
		loading = true;
		loadError = false;
		try {
			const response = await fetch(`${resolve('/')}reviews/all.json`, { signal: request.signal });
			if (response.status === 404) {
				if (!request.signal.aborted) collection = { version: 1, skus: [], reviews: [] };
				return;
			}
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const parsed = readWineReviewCollection(await response.json());
			if (!parsed) throw new Error('Invalid review collection');
			if (!request.signal.aborted) {
				collection = parsed;
				currentPage = 1;
			}
		} catch {
			if (!request.signal.aborted) loadError = true;
		} finally {
			if (!request.signal.aborted) loading = false;
		}
	}

	onMount(() => {
		void loadReviews();
		return () => controller?.abort();
	});
	$effect(() => {
		setSEO({
			description: 'Selaa Viinilehden viiniarvioita ja löydä niitä vastaavat Alkon tuotteet.',
			og: {
				title: generateTitle('Arvostelut'),
				description: 'Selaa Viinilehden viiniarvioita ja löydä niitä vastaavat Alkon tuotteet.',
				url: window.location.href
			},
			keywords: 'arvostelut, viiniarviot, viinit, Viinilehti, Alko'
		});
	});
</script>

<svelte:head>
	<title>{generateTitle('Arvostelut')}</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-4 md:p-6">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-2">
			<h1 class="text-3xl font-bold">Arvostelut</h1>
			<p class="text-secondary">Viinilehden arviot Alkon tuotteista. Jokaisessa arviossa näkyy arvioitu vuosikerta.</p>
		</div>
		{#if !loading && !loadError && collection.skus.length > 0}
			<a href={`${resolve('/')}reviews/skus.json`} download="arvostelut-viinit-skus.json" class={components.button({ size: 'md' })}>Lataa SKU-lista (JSON)</a>
		{/if}
	</header>
	{#if loading}
		<p role="status" class="text-secondary">Ladataan arvioita...</p>
	{:else if loadError}
		<div class="flex flex-col items-start gap-3 rounded border border-primary bg-secondary p-4">
			<p role="alert">Arvioiden lataaminen epäonnistui.</p>
			<button type="button" onclick={() => void loadReviews()} class={components.button({ size: 'md' })}>Yritä uudelleen</button>
		</div>
	{:else if collection.reviews.length === 0}
		<p class="rounded border border-primary bg-secondary p-4">Viiniarvioita ei ole vielä saatavilla. Arviot ilmestyvät tänne, kun ne on kerätty.</p>
	{:else}
		<div class="grid gap-4 rounded border border-primary bg-secondary p-4 md:grid-cols-[2fr_1fr_1fr]">
			<label class="flex min-w-0 flex-col gap-1 text-sm font-semibold">
				Hae arvioista
				<input type="search" bind:value={query} oninput={() => currentPage = 1} placeholder="Viinin nimi, Alko-numero tai hakusana" class={`${components.input({ size: 'md' })} w-full font-normal`} />
			</label>
			<label class="flex flex-col gap-1 text-sm font-semibold">
				Tähtiarvio
				<select bind:value={minimumStars} onchange={() => currentPage = 1} class={`${components.input({ size: 'md' })} w-full font-normal`}>
					<option value="0">Kaikki arviot</option>
					{#each [1, 2, 3, 4, 5] as stars}<option value={String(stars)}>Vähintään {stars} / 5</option>{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-sm font-semibold">
				Järjestä
				<select bind:value={sort} onchange={() => currentPage = 1} class={`${components.input({ size: 'md' })} w-full font-normal`}>
					<option value="name">Nimen mukaan</option>
					<option value="rating">Parhaat arviot ensin</option>
					<option value="newest">Uusimmat arviot ensin</option>
				</select>
			</label>
		</div>
		<p role="status" class="text-sm text-secondary">
			{filtered.length} / {collection.reviews.length} arviota · {collection.skus.length} tuotetta
		</p>
		{#if filtered.length === 0}
			<p>Hakuehdoilla ei löytynyt arvioita.</p>
		{:else}
			<div class="flex flex-col gap-6">
				{#each visible as review (`${review.sku}:${review.id}`)}
					<WineReviewCard {review} heading={review.title} headingId={`review-${review.sku}-${review.id}`} showProductLink={true} />
				{/each}
			</div>
			{#if totalPages > 1}
				<nav aria-label="Arvioiden sivutus" class="flex flex-wrap items-center justify-center gap-3">
					<button type="button" disabled={activePage === 1} onclick={() => currentPage = activePage - 1} class={`${components.button({ size: 'md' })} disabled:opacity-50`}>Edellinen</button>
					<span>Sivu {activePage} / {totalPages}</span>
					<button type="button" disabled={activePage === totalPages} onclick={() => currentPage = activePage + 1} class={`${components.button({ size: 'md' })} disabled:opacity-50`}>Seuraava</button>
				</nav>
			{/if}
		{/if}
	{/if}
</main>
