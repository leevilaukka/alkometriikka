<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	import { compareProductIds } from '$lib/global.svelte';
	import { components } from '$lib/utils/ui/styles';
	import { toggleCompareAction } from '$lib/utils/user/productActions';
	import Icon from './Icon.svelte';

	/** Adds the product to the comparison or takes it out; the one compare button every product surface uses */
	const {
		productNumber,
		name,
		reference,
		size = 'sm',
		iconPosition = 'start',
		compact = false,
		class: _class = ''
	}: {
		productNumber: string;
		/** Product name, so a screen reader can tell the buttons of a list apart */
		name?: string;
		/** Compared against this product: adding the candidate adds it first (similar products) */
		reference?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		iconPosition?: 'start' | 'end';
		/** Icon only below the `sm` breakpoint, for the phone's bottom bar */
		compact?: boolean;
		class?: string;
	} = $props();

	const inCompare = $derived(compareProductIds.includes(productNumber));
</script>

<button
	type="button"
	aria-pressed={inCompare}
	aria-label={name ? `Vertaile: ${name}` : compact ? 'Vertaile' : undefined}
	title={compact ? (inCompare ? 'Vertailussa' : 'Vertaile') : undefined}
	onclick={() => toggleCompareAction(productNumber, { reference })}
	class={twMerge(components.button({ size, type: inCompare ? 'positive' : 'primary' }), _class)}
>
	{#if iconPosition === 'start'}<Icon name="compare" />{/if}
	<span class={compact ? 'hidden sm:inline' : undefined}>
		{inCompare ? 'Vertailussa' : 'Vertaile'}
	</span>
	{#if iconPosition === 'end'}<Icon name="compare" />{/if}
</button>
