<script lang="ts">
	import { appPath } from '$lib/utils/app/paths';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import Breadcrumb from '$lib/components/widgets/Breadcrumb.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { m } from '$lib/i18n';
	import { translateValue } from '$lib/i18n/values';

	let { data } = $props();

	const description = m.seo_category_index_description();
	setSEO({
		description,
		og: {
			title: generateTitle(m.nav_categories()),
			description,
			url: 'https://alkometriikka.fi/kategoriat/'
		}
	});
</script>

<svelte:head>
	<title>{generateTitle(m.nav_categories())}</title>
</svelte:head>

{#await data.alko then alko}
	<div class="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
		<Breadcrumb items={[]} current={m.nav_categories()} />
		<h1 class="text-2xl font-bold">{m.nav_categories()}</h1>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each alko.kaljakori.getCategoryTree() as type (type.slug)}
				<section class="flex flex-col gap-3 rounded-lg border border-primary bg-primary p-4">
					<a
						href={appPath(type.path)}
						class="-m-2 flex items-center justify-between gap-2 rounded p-2 hover:bg-secondary"
					>
						<h2 class="text-xl font-bold">{translateValue(type.name, AllColumns.Type)}</h2>
						<span class="flex items-center gap-1 text-sm text-secondary">
							{m.products_count({ count: type.count })}
							<Icon name="chevron_right" />
						</span>
					</a>
					<ul class="flex flex-wrap gap-2">
						{#each type.children as child (child.slug)}
							<li>
								<a
									href={appPath(child.path)}
									class="flex items-center gap-1.5 rounded border border-primary bg-primary px-3 py-2 text-sm hover:bg-secondary md:px-2.5 md:py-1"
								>
									<span>{translateValue(child.name, AllColumns.SubType)}</span>
									<span class="rounded bg-secondary px-1 text-xs text-secondary">{child.count}</span
									>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	</div>
{/await}
