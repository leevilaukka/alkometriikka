<script lang="ts">
	import { appPath } from '$lib/utils/app/paths';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { staticPage } from '$lib/utils/app/seo';
	import { currentSeasons, SEASONS, seasonPath } from '$lib/utils/catalog/seasons';
	import { twMerge } from 'tailwind-merge';

	let { data } = $props();

	const seo = staticPage('/kausi/');
	setSEO({
		description: seo.description,
		og: {
			title: generateTitle(seo.title),
			description: seo.description,
			url: `https://alkometriikka.fi${seo.path}`
		},
		keywords: seo.keywords
	});

	const current = new Set(currentSeasons());
	// Current seasons first, the rest in calendar order
	const seasons = [...SEASONS].sort((a, b) => Number(current.has(b)) - Number(current.has(a)));
</script>

<svelte:head>
	<title>{generateTitle(seo.title)}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-bold md:text-3xl">Kausijuomat</h1>
		<p class="text-secondary">{seo.description}</p>
	</header>
	{#await data.alko then alko}
		{@const active = alko.kaljakori.data.filter((item) => !item[AllColumns.RemovedFromSelection])}
		<ul class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each seasons as season (season.slug)}
				{@const count = active.filter((item) =>
					season.matches({
						name: String(item[AllColumns.Name]),
						type: String(item[AllColumns.Type] ?? ''),
						subType: String(item[AllColumns.SubType] ?? '')
					})
				).length}
				<li>
					<a
						href={appPath(seasonPath(season))}
						class={twMerge(
							'flex h-full flex-col gap-1 rounded border bg-secondary p-4 hover:bg-primary',
							current.has(season) ? 'border-green-600' : 'border-primary'
						)}
					>
						<span class="flex items-center gap-2">
							<strong class="text-lg">{season.title}</strong>
							{#if current.has(season)}
								<span class="rounded bg-green-600 px-1.5 py-0.5 text-xs text-white">Nyt</span>
							{/if}
						</span>
						<span class="text-sm text-secondary">{season.intro}</span>
						<span class="text-sm">{count.toLocaleString('fi-FI')} tuotetta</span>
					</a>
				</li>
			{/each}
		</ul>
	{/await}
</div>
