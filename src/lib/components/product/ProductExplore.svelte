<script lang="ts">
	import { resolve } from '$app/paths';
	import { AllColumns } from '$lib/utils/constants/columns';
	import type { Kaljakori } from '$lib/alko';
	import type { PriceListItem, ProductExploreTarget } from '$lib/types';
	import type { IconName } from '$lib/icons';
	import { findProductCategoryTrail } from '$lib/utils/catalog/categories';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		kaljakori,
		class: _class = ''
	}: { product: PriceListItem; kaljakori: Kaljakori; class?: string } = $props();

	type Link = {
		target: ProductExploreTarget;
		href: string;
		icon: IconName;
		title: string;
		text: string;
	};

	// Most visitors arrive on a product page from search, so this points them to the rest of the site
	const links = $derived.by<Link[]>(() => {
		const { trail } = findProductCategoryTrail(
			kaljakori.getCategoryTree(),
			product[AllColumns.Type],
			product[AllColumns.SubType]
		);
		const type = trail[0];

		// The main list is ordered by alcohol per euro unless told otherwise
		const listParams = new URLSearchParams();
		if (type) listParams.set(AllColumns.Type, type.name);
		const changeParams = new URLSearchParams();
		if (type) changeParams.set('tyyppi', type.slug);

		return [
			{
				target: 'list',
				href: listParams.size ? resolve(`/?${listParams}`) : resolve('/'),
				icon: 'list_ul',
				title: type ? `Vertaa: ${type.name}` : 'Vertaa koko valikoimaa',
				text: 'Eniten alkoholia eurolla ensin. Rajaa hinnan, koon tai myymälän mukaan.'
			},
			{
				target: 'price_changes',
				href: changeParams.size
					? resolve(`/hinnanmuutokset/?${changeParams}`)
					: resolve('/hinnanmuutokset/'),
				icon: 'trending_down',
				title: 'Hinnanmuutokset',
				text: 'Mitkä tuotteet halpenivat ja mitkä kallistuivat viime aikoina.'
			},
			{
				target: 'daily',
				href: resolve('/daily/'),
				icon: 'flame',
				title: 'Daily',
				text: 'Seitsemän kysymyksen visa Alkon valikoimasta, joka päivä uusi.'
			}
		];
	});
</script>

<section class={twMerge('flex flex-col gap-3.5', _class)}>
	<h2 class="text-2xl font-bold">Tutustu lisää</h2>
	<ul class="grid grid-cols-1 gap-3 md:grid-cols-3">
		{#each links as link (link.target)}
			<li class="contents">
				<a
					href={link.href}
					onclick={() =>
						sendAnalyticsEvent('open_product_explore', {
							target: link.target,
							product_number: product[AllColumns.Number]
						})}
					class="group flex items-start gap-3 rounded border border-primary bg-primary p-3.5 transition hover:bg-secondary"
				>
					<Icon name={link.icon} class="mt-0.5 shrink-0 text-xl text-brand-1" />
					<span class="flex min-w-0 flex-col gap-1">
						<strong class="group-hover:underline">{link.title}</strong>
						<span class="text-wrap-pretty text-sm text-secondary">{link.text}</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
</section>
