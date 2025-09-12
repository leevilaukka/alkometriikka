<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';

	let { value = $bindable([]), options = [] } = $props();

	let list = $state(options.map((option) => ({ value: option, selected: false })));

	const longestOption = Math.min(options.reduce((length, option) => {
		if(option.length > length) return option.length
		return length
	}, 0), 50)

	const text = $derived.by(() => {
		if (value.length > 1) return `${value.length} valittu`;
		else if (value.length == 1) return value.at(0);
		else return 'Ei valintoja';
	});

	let dialogElement: HTMLDialogElement | undefined = $state();

	let query = $state('');
</script>

{#if options.length <= 5}
	<select
		name="sortingColumn"
		id="sortingColumn"
		bind:value
		class="rounded border border-gray-300 px-1.5 py-0.5"
	>
		<option value=""></option>
		{#each options as option}
			<option value={option}>{option}</option>
		{/each}
	</select>
{:else}
	<button
		onclick={() => {
			dialogElement?.showModal();
		}}
		class="flex flex-row flex-nowrap gap-3 rounded border border-gray-300 px-1.5 py-0.5"
		title={`${value.slice(0, 3).join(', ')}${value.length > 3 ? ` + ${value.length - 3} muuta` : ''}`}
	>
		{text}
	</button>
	<dialog
		open={false}
		bind:this={dialogElement}
		class="string-selector m-auto flex-col gap-4 p-4 open:flex rounded-lg border border-gray-300 backdrop:backdrop-blur-sm"
		closedby="any"
	>
		<div class="flex flex-col lg:grid h-full max-h-full lg:grid-cols-2 lg:grid-rows-[auto_1fr] gap-4 overflow-hidden">
			<div class="flex flex-row flex-wrap gap-4 order-1">
				<button
					onclick={() => {
						list = options.map((option) => ({ value: option, selected: false }));
						value = list.filter((option) => option.selected).map((option) => option.value);
					}}
					class="flex flex-row flex-nowrap items-center gap-3 rounded border border-gray-300 px-3 py-2"
				>
					Tyhjennä valinnat
				</button>
				<button 
					onclick={() => {
						list = options.map((option) => ({ value: option, selected: true }));
						value = list.filter((option) => option.selected).map((option) => option.value);
					}}
					class="flex flex-row flex-nowrap items-center gap-3 rounded border border-gray-300 px-3 py-2"
				>
					Valitse kaikki
				</button>
			</div>
			<input
				type="text"
				bind:value={query}
				placeholder="Hae..."
				class="flex shrink-0 rounded border border-gray-300 px-3 py-2 order-2"
			/>
			<div class="flex max-h-full flex-col overflow-auto rounded border border-gray-300 h-[var(--height)] w-[var(--width)] max-w-[80vw] col-span-full lg:col-span-1 order-4 lg:order-3" style:--width={longestOption + 5 + "ch"} style:--height={`${28*20}px;`}>
				<SvelteVirtualList
					items={list.filter((option) => option.selected)}
					bufferSize={50}
					itemsClass={'even'}
				>
					{#snippet renderItem(item: any)}
						<button
							onclick={() => {
								list.find((option) => option.value == item.value)!.selected = false
								value = list.filter((option) => option.selected).map((option) => option.value);
							}}
							class="flex w-full flex-row flex-nowrap px-2 py-1 whitespace-nowrap"
						>
							{item.value}
						</button>
					{/snippet}
				</SvelteVirtualList>
			</div>
			<div class="flex max-h-full flex-col overflow-auto rounded border border-gray-300 h-[var(--height)] w-[var(--width)] max-w-[80vw] col-span-full lg:col-span-1 order-3 lg:order-4" style:--width={longestOption + 5 + "ch"} style:--height={`${28*20}px;`}>
				<SvelteVirtualList
					items={(() => { 
						let temp = list.filter((option) => !option.selected)
						if(query) temp = temp.filter((option) => option.value.toLowerCase().includes(query.toLowerCase()))
						return temp
					})()}
					bufferSize={50}
					itemsClass={'even'}
				>
					{#snippet renderItem(item: any)}
						<button
							onclick={() => {
								list.find((option) => option.value == item.value)!.selected = true
								value = list.filter((option) => option.selected).map((option) => option.value);
							}}
							class="flex w-full flex-row flex-nowrap px-2 py-1 whitespace-nowrap"
						>
							{item.value}
						</button>
					{/snippet}
				</SvelteVirtualList>
			</div>
		</div>
		<div class="flex flex-row flex-wrap justify-end gap-4">
			<button
				onclick={() => {
					dialogElement?.close();
				}}
				class="flex flex-row flex-nowrap gap-3 rounded bg-red-700 px-3 py-2 text-white"
			>
				Sulje
			</button>
		</div>
	</dialog>
{/if}

<style>
	:global(.string-selector .virtual-list-viewport) {
		overflow-x: hidden;
	}
</style>
