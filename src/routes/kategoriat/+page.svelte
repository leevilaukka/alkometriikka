<script lang="ts">
	import { generateTitle, setSEO } from '$lib/utils/helpers';
	import { CATEGORY_INDEX_DESCRIPTION } from '$lib/utils/categories';
	import Breadcrumb from '$lib/components/widgets/Breadcrumb.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';

	let { data } = $props();

	setSEO({
		description: CATEGORY_INDEX_DESCRIPTION,
		og: {
			title: generateTitle('Kategoriat'),
			description: CATEGORY_INDEX_DESCRIPTION,
			url: 'https://alkometriikka.fi/kategoriat/'
		}
	});
</script>

<svelte:head>
	<title>{generateTitle('Kategoriat')}</title>
</svelte:head>

{#await data.alko then alko}
	<main class="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
		<Breadcrumb items={[]} current="Kategoriat" />
		<h1 class="text-2xl font-bold">Kategoriat</h1>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each alko.kaljakori.getCategoryTree() as type (type.slug)}
				<section class="flex flex-col gap-3 rounded-lg border border-primary bg-primary p-4">
					<a
						href={type.path}
						class="-m-2 flex items-center justify-between gap-2 rounded p-2 hover:bg-secondary"
					>
						<h2 class="text-xl font-bold">{type.name}</h2>
						<span class="flex items-center gap-1 text-sm text-secondary">
							{type.count} tuotetta
							<Icon name="chevron_right" />
						</span>
					</a>
					<ul class="flex flex-wrap gap-2">
						{#each type.children as child (child.slug)}
							<li>
								<a
									href={child.path}
									class="flex items-center gap-1.5 rounded border border-primary bg-primary px-3 py-2 text-sm hover:bg-secondary md:px-2.5 md:py-1"
								>
									<span>{child.name}</span>
									<span class="rounded bg-secondary px-1 text-xs text-secondary">{child.count}</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	</main>
{/await}
