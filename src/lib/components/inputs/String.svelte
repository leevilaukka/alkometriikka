<script lang="ts">
	import { components } from '$lib/utils/style';
	type ListItem = {
		value: string;
		selected: boolean;
	};
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';

	let { value = $bindable(), options = [], ...rest } = $props();

	let list = $state<ListItem[]>(options.map((option) => ({ value: option, selected: false })));

	$effect(() => {
		if(value.length === 0) list = options.map((option) => ({ value: option, selected: false }));
	})

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
		class={twMerge(components.input(), "w-full")}
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
		class={twMerge(components.button(), "w-full")}
		title={`${value.slice(0, 3).join(', ')}${value.length > 3 ? ` + ${value.length - 3} muuta` : ''}`}
	>
		<span class="whitespace-nowrap overflow-hidden max-w-full overflow-ellipsis">
			{text}
		</span>
	</button>
	<dialog
		open={false}
		bind:this={dialogElement}
		class="string-selector m-auto flex-col gap-4 p-4 open:flex rounded-lg border border-gray-300 backdrop:backdrop-blur-sm w-[min(80ch,_100%)]"
		closedby="any"
	>
		<div class="flex flex-col h-full max-h-full gap-4 overflow-hidden">
			<div class="flex flex-row flex-wrap gap-4 order-1">
				<button
					onclick={() => {
						list = options.map((option) => ({ value: option, selected: false }));
						value = list.filter((option) => option.selected).map((option) => option.value);
					}}
								class={twMerge(components.button({ type: "negative" }))}
				>
					Tyhjennä valinnat
				</button>
				<button 
					onclick={() => {
						list = options.map((option) => ({ value: option, selected: true }));
						value = list.filter((option) => option.selected).map((option) => option.value);
					}}
								class={twMerge(components.button())}
				>
					Valitse kaikki
				</button>
			</div>
			<input
				type="text"
				bind:value={query}
				placeholder="Hae..."
				class="flex shrink-0 rounded border border-gray-300 px-1.5 py-0.5 order-2"
			/>
			<div class="flex max-h-full flex-col overflow-auto rounded border border-gray-300 h-[var(--height)] col-span-full lg:col-span-1 order-4 lg:order-3" style:--height={`${28*20}px;`}>
				<SvelteVirtualList
					items={query ? list.filter((item) => item.value.toLowerCase().includes(query.toLowerCase())) : list}
					bufferSize={50}
					itemsClass={"even"}
				>
					{#snippet renderItem(item: ListItem, idx: number)}
						<button
							onclick={() => {
								item.selected = !item.selected
								value = list.filter((option) => option.selected).map((option) => option.value);
							}}
							class={twMerge(components.button(), "w-full rounded-none border-none")}
						>
							<span class="whitespace-nowrap overflow-hidden max-w-full overflow-ellipsis" title={item.value}>
								{item.value}
							</span>
							<input
								type="checkbox"
								bind:checked={item.selected}
								class="ml-auto"
								readonly
							/>
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
				class={twMerge(components.button({ type: "negative" }))}
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
