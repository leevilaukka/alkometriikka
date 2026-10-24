<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ListObj } from '$lib/types';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { showToast } from '$lib/utils/app/toast.svelte';
	import { addToList } from '$lib/utils/user/lists';
	import { addProductToPunch, punchCount } from '$lib/utils/user/punch';
	import AllLists from './AllLists.svelte';
	import Icon from './Icon.svelte';

	/** The "Lisää" popup's content: the user's lists, and the punch calculator's recipe */
	const { productNumber, onadded }: { productNumber: string; onadded: () => void } = $props();

	const inPunch = $derived(punchCount(productNumber));

	function addToPunch() {
		addProductToPunch(productNumber);
		sendAnalyticsEvent('punch_add_product', { product_number: productNumber });
		onadded();
		showToast({
			text: 'Lisätty booliin',
			href: resolve('/boolilaskuri/'),
			linkText: 'Avaa boolilaskuri'
		});
	}
</script>

<h2 class="text-xl">Lisää tuote</h2>
<AllLists
	action={(list: ListObj) => {
		addToList(list, productNumber);
		onadded();
	}}
/>
<div class="w-[min(80ch,_100%)] border-t border-primary pt-4">
	<button
		type="button"
		class="flex w-full items-center gap-3 rounded border border-primary p-2 text-start hover:cursor-pointer hover:bg-secondary"
		onclick={addToPunch}
	>
		<Icon name="cocktail" class="text-xl" />
		<span class="flex flex-col">
			<span class="text-lg">Lisää booliin</span>
			<span class="text-sm text-secondary">
				{inPunch ? `Boolissa jo ${inPunch} kpl` : 'Ainesosaksi boolilaskuriin'}
			</span>
		</span>
	</button>
</div>
