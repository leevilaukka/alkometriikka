<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import type { PriceListItem } from '$lib/types';
	import type { Kaljakori } from '$lib/alko';
	import { findProductCategoryTrail } from '$lib/utils/categories';
	import Breadcrumb from '../widgets/Breadcrumb.svelte';
	import type { BreadcrumbItem } from '$lib/types';
	
	const {
		product,
		kaljakori,
		page,
		class: _class = ''
	}: {
		product: PriceListItem;
		kaljakori: Kaljakori;
		/** Subpage of the product (e.g. "Vastaavat"), which links the product itself as a crumb. */
		page?: string;
		class?: string;
	} = $props();

	const items = $derived.by(() => {
		const type = product[AllColumns.Type];
		const subType = product[AllColumns.SubType];
		const { trail, legacy } = findProductCategoryTrail(kaljakori.getCategoryTree(), type, subType);
		const items: BreadcrumbItem[] = trail.map((node) => ({ label: node.name, href: node.path }));
		// Categories too small for a page of their own are still shown, just not linked
		if (!trail.length && type) items.push({ label: type });
		if (!legacy && items.length < 2 && subType) items.push({ label: subType });
		if (page) items.push({ label: product[AllColumns.Name], href: `/tuotteet/${product[AllColumns.Number]}/` });
		return items;
	});
</script>

<Breadcrumb {items} current={page ?? product[AllColumns.Name]} class={_class} />
