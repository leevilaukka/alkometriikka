<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';

	let { value = $bindable([]), options = [] } = $props();

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
	>
		{text}
	</button>
	<dialog
		open={false}
		bind:this={dialogElement}
		class="m-auto h-full w-full flex-col gap-4 p-4 open:flex"
	>
		<div class="grid h-full max-h-full grid-cols-2 grid-rows-[auto_1fr] gap-4 overflow-hidden">
			<div class="flex flex-row flex-wrap gap-4">
				<button
					onclick={() => {
						value = [];
					}}
					class="flex flex-row flex-nowrap items-center gap-3 rounded border border-gray-300 px-3 py-2"
				>
					Tyhjennä valinnat
				</button>
			</div>
			<input
				type="text"
				bind:value={query}
				placeholder="Hae..."
				class="flex shrink-0 rounded border border-gray-300 px-3 py-2"
			/>
			<div class="flex max-h-full flex-col overflow-auto rounded border border-gray-300">
				<SvelteVirtualList items={value} bufferSize={50} itemsClass={"even"}>
					{#snippet renderItem(item: any, idx: number)}
						<button
							onclick={() => value.splice(idx, 1)}
							class="flex flex-row flex-nowrap px-2 py-1"
						>
							{item}
						</button>
					{/snippet}
				</SvelteVirtualList>
			</div>
			<div class="flex max-h-full flex-col overflow-auto rounded border border-gray-300">
				<SvelteVirtualList
					items={options
						.filter((option) => !value.includes(option))
						.filter((option) => option.toLowerCase().includes(query.toLowerCase()))}
					bufferSize={50}
                    itemsClass={"even"}
				>
					{#snippet renderItem(item: any, idx: number)}
						<button
							onclick={() => value.push(item)}
							class="flex w-full flex-row flex-nowrap px-2 py-1"
						>
							{item}
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
