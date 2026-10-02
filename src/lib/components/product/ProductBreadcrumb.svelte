<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import type { PriceListItem } from '$lib/types';
	import type { Kaljakori } from '$lib/alko';
	import { findProductCategoryTrail } from '$lib/utils/categories';
	import Breadcrumb, { type BreadcrumbItem } from '../widgets/Breadcrumb.svelte';

	const {
		product,
		kaljakori,
		class: _class = ''
	}: { product: PriceListItem; kaljakori: Kaljakori; class?: string } = $props();

	const items = $derived.by(() => {
		const type = product[AllColumns.Type];
		const subType = product[AllColumns.SubType];
		const { trail, legacy } = findProductCategoryTrail(kaljakori.getCategoryTree(), type, subType);
		const items: BreadcrumbItem[] = trail.map((node) => ({ label: node.name, href: node.path }));
		// Categories too small for a page of their own are still shown, just not linked
		if (!trail.length && type) items.push({ label: type });
		if (!legacy && items.length < 2 && subType) items.push({ label: subType });
		return items;
	});
</script>

<Breadcrumb {items} current={product[AllColumns.Name]} class={_class} />
