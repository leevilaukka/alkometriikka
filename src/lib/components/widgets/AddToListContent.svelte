<script lang="ts">
	import type { ListObj } from '$lib/types';
	import { punchCount } from '$lib/utils/user/punch';
	import { addToListAction, addToPunchAction } from '$lib/utils/user/productActions';
	import AllLists from './AllLists.svelte';
	import Icon from './Icon.svelte';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/ui/styles';

	/** The "Lisää" popup's content: the user's lists, and the punch calculator's recipe */
	const {
		productNumber,
		onadded
	}: {
		productNumber: string;
		/** Closes the popup; runs before the confirmation is shown */
		onadded: () => void;
	} = $props();

	const inPunch = $derived(punchCount(productNumber));
</script>

<div class="flex flex-row gap-4">
	<h2 class="my-auto text-xl">Lisää tuote</h2>
	<button
		type="button"
		aria-label="Sulje"
		class={twMerge(components.button({ type: 'noborder' }), 'my-auto ml-auto p-2 text-center text-lg')}
		onclick={onadded}
	>
		<Icon name="x" />
	</button>
</div>
<AllLists
	action={(list: ListObj) => {
		onadded();
		addToListAction(list, productNumber);
	}}
/>
<div class="w-[min(80ch,_100%)] border-t border-primary pt-4">
	<button
		type="button"
		class="flex w-full items-center gap-3 rounded border border-primary p-2 text-start hover:cursor-pointer hover:bg-secondary"
		onclick={() => {
			onadded();
			addToPunchAction(productNumber);
		}}
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
