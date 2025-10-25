<script>
	import { getRandom, headerToDisplayName, headerToUnitMarker } from '$lib/utils/helpers';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';

	let { defaultValue = [0, 100], value = $bindable([defaultValue[0], defaultValue[1]]), modified = $bindable(false), label, min = 0, max = 100, step = 1 } = $props();

	$effect(() => {
		const set = new Set(value).difference(new Set(defaultValue))
		modified = !!set.size
	})

	const unitMarker = headerToUnitMarker(label) !== '' ? `(${headerToUnitMarker(label)})` : '';

	const name = "numberinput-" + getRandom();
</script>

<div class="flex flex-col">
	<label for={name} class="text-sm">
		{`${headerToDisplayName(label)} ${unitMarker}`}
	</label>
	<div class="flex w-full gap-2">
		<input
			type="number"
			{name}
			bind:value={value[0]}
			{min}
			max={value[1]}
			{step}
			class={twMerge(components.input(), 'w-full')}
		/>
		<span class="my-auto">-</span>
		<input
			type="number"
			bind:value={value[1]}
			min={value[0]}
			{max}
			{step}
			class={twMerge(components.input(), 'w-full')}
		/>
		<button class={twMerge(components.button())} onclick={() => (value = [min, max])}><Icon name="refresh_ccw" /></button>
	</div>
</div>
