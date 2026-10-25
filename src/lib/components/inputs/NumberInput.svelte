<script>
	import { headerToDisplayName, headerToUnitMarker } from '$lib/utils/format/labels';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import { untrack } from 'svelte';
	import Icon from '../widgets/Icon.svelte';
	import { locale, m } from '$lib/i18n';

	let {
		defaultValue = [0, 100],
		value = $bindable([defaultValue[0], defaultValue[1]]),
		modified = $bindable(false),
		label,
		min = 0,
		max = 100,
		step = 1
	} = $props();

	$effect(() => {
		const defaults = new Set(defaultValue);
		modified = [...new Set(value)].some((v) => !defaults.has(v));
	});

	const unitMarker = untrack(() =>
		headerToUnitMarker(label) !== '' ? `(${headerToUnitMarker(label)})` : ''
	);
	const displayName = $derived(headerToDisplayName(label));

	// Stable across SSR and hydration, unlike a random id
	const id = $props.id();
</script>

<!-- The range is one group named by the label; each input says which end it sets -->
<div class="flex flex-col" role="group" aria-labelledby="{id}-label">
	<label id="{id}-label" for="{id}-min" class="text-sm">
		{`${displayName} ${unitMarker}`}
	</label>
	<div class="flex w-full gap-2">
		<input
			lang={locale}
			type="number"
			id="{id}-min"
			aria-label={m.filter_at_least()}
			bind:value={value[0]}
			{min}
			max={value[1]}
			{step}
			class={twMerge(components.input(), 'w-full')}
		/>
		<span class="my-auto" aria-hidden="true">-</span>
		<input
			lang={locale}
			type="number"
			id="{id}-max"
			aria-label={m.filter_at_most()}
			bind:value={value[1]}
			min={value[0]}
			{max}
			{step}
			class={twMerge(components.input(), 'w-full')}
		/>
		<button
			class={twMerge(components.button())}
			aria-label={m.common_reset_named({ name: displayName })}
			onclick={() => (value = [min, max])}><Icon name="refresh_ccw" /></button
		>
	</div>
</div>
