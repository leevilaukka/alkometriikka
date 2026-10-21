<script lang="ts">
	import { untrack } from 'svelte';
	import { watchlist } from '$lib/global.svelte';
	import type { AvailabilityData, PriceListItem } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { components } from '$lib/utils/ui/styles';
	import {
		markWatchSeen,
		unwatchProduct,
		watchChanges,
		watchProduct,
		watchSnapshot,
		type WatchChange
	} from '$lib/utils/user/watchlist';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';

	let {
		product,
		availability,
		preferredStoreId,
		changes = $bindable([]),
		class: _class = ''
	}: {
		product: PriceListItem;
		availability: AvailabilityData;
		preferredStoreId?: string;
		/** What changed since the user last saw the product, if they watch it */
		changes?: WatchChange[];
		class?: string;
	} = $props();

	const id = $derived(product[AllColumns.Number]);
	const watched = $derived(watchlist.some((item) => item.id === id));

	// Opening a watched product shows what changed and then counts as seeing it
	$effect(() => {
		const productId = id;
		untrack(() => {
			const item = watchlist.find((entry) => entry.id === productId);
			if (!item) {
				changes = [];
				return;
			}
			const now = watchSnapshot(product, availability, preferredStoreId);
			changes = watchChanges(item.seen, now);
			markWatchSeen(productId, now);
		});
	});

	function toggle() {
		if (watched) {
			unwatchProduct(id);
			changes = [];
		} else watchProduct(id, watchSnapshot(product, availability, preferredStoreId));
	}
</script>

<button
	type="button"
	aria-pressed={watched}
	title={watched
		? 'Lopeta seuraaminen'
		: 'Seuraa hinnan ja saatavuuden muutoksia. Näet ne etusivulla ja Seuratut-sivulla.'}
	class={twMerge(
		components.button({ size: 'sm', type: watched ? 'positive' : 'primary' }),
		'flex shrink-0 items-center gap-2',
		_class
	)}
	onclick={toggle}
>
	<Icon name={watched ? 'bell_check' : 'bell_plus'} />
	<span class="hidden sm:inline">{watched ? 'Seurataan' : 'Seuraa'}</span>
</button>
