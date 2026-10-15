<script lang="ts">
	import { AllColumns } from '$lib/utils/constants/columns';
	import type { PriceListItem } from '$lib/types';
	import type { Kaljakori } from '$lib/alko';
	import { findProductCategoryTrail } from '$lib/utils/catalog/categories';
	import Breadcrumb from '../widgets/Breadcrumb.svelte';
	import type { BreadcrumbItem } from '$lib/types';
	import { productName, translateValue } from '$lib/i18n/values';

	const {
		product,
		kaljakori,
		class: _class = ''
	}: { product: PriceListItem; kaljakori: Kaljakori; class?: string } = $props();

	const items = $derived.by(() => {
		const type = product[AllColumns.Type];
		const subType = product[AllColumns.SubType];
		const { trail, legacy } = findProductCategoryTrail(kaljakori.getCategoryTree(), type, subType);
		const items: BreadcrumbItem[] = trail.map((node, depth) => ({
			label: translateValue(node.name, depth === 0 ? AllColumns.Type : AllColumns.SubType),
			href: node.path
		}));
		// Categories too small for a page of their own are still shown, just not linked
		if (!trail.length && type) items.push({ label: translateValue(type, AllColumns.Type) });
		if (!legacy && items.length < 2 && subType)
			items.push({ label: translateValue(subType, AllColumns.SubType) });
		return items;
	});
</script>

<Breadcrumb {items} current={productName(product)} class={_class} />
