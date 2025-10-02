<script lang="ts">
	import { components } from '$lib/utils/styles';
	type ListItem = {
		value: string;
		selected: boolean;
	};
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import Popup from '../widgets/Popup.svelte';
	import { getRandom } from '$lib/utils/helpers';
	import { isSafari } from '$lib/global.svelte';

	let { value = $bindable(), options = [], label, ...rest } = $props();
	
	const name = "stringinput-" + getRandom();

	let list = $state<ListItem[]>(options.map((option) => ({ value: option, selected: value.includes(option) })));

	$effect(() => {
		if (!value) return;
		if (value.length === 0) list = options.map((option) => ({ value: option, selected: false }));
	});

	const text = $derived.by(() => {
		if (!value) return 'Ei valintoja';
		if (value.length > 1) return `${value.length} valittu`;
		else if (value.length == 1) return value.at(0);
		else return 'Ei valintoja';
	});

	let query = $state('');
</script>

<div class={twMerge("flex", options.length > 1 ? "flex-col" : "items-center")}>
	<label for={name}>{label}</label>
	{#if options.length === 1}
			<input
				class="ms-2 rounded p-2"
				{name}
				type="checkbox"
				checked={value && value.includes(options[0])}
				onchange={(e) => {
					if ((e.target as HTMLInputElement).checked) value = [options[0]];
					else value = [];
				}}
			/>
	{:else}
		<Popup class={twMerge("p-4 gap-4", $isSafari && "h-auto")}>
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<button
					{name}
					class={twMerge(components.button(), 'w-full justify-start')}
					onclick={() => dialogElement.showModal()}
					title={value && `${value.slice(0, 3).join(', ')}${value.length > 3 ? ` + ${value.length - 3} muuta` : ''}`}
				>
					{text}
				</button>
			{/snippet}
			{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<div class="flex h-full max-h-full flex-col gap-4">
					<div class="order-1 flex flex-row flex-wrap gap-4">
						<button
							onclick={() => {
								list = options.map((option) => ({ value: option, selected: false }));
								value = list.filter((option) => option.selected).map((option) => option.value);
							}}
							class={twMerge(components.button({ type: 'negative' }))}
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
						class="order-2 flex shrink-0 rounded border border-gray-300 px-1.5 py-0.5"
					/>
					<div
						class="order-4 col-span-full flex h-[var(--height)] max-h-full flex-col overflow-auto rounded border border-gray-300 lg:order-3 lg:col-span-1"
						style:--height={`${28 * 20}px;`}
					>
						<SvelteVirtualList
							items={query
								? list.filter((item) => item.value.toLowerCase().includes(query.toLowerCase()))
								: list}
							bufferSize={50}
							
						>
							{#snippet renderItem(item: ListItem, index: number)}
								<button
									onclick={() => {
										item.selected = !item.selected;
										value = list.filter((option) => option.selected).map((option) => option.value);
									}}
									class={twMerge(components.button(), 'w-full rounded-none border-none', index % 2 === 0 ? 'bg-gray-200' : 'bg-white', item.selected ? 'font-bold' : '')}
								>
									<span
										class="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap"
										title={item.value}
									>
										{item.value}
									</span>
									<input type="checkbox" bind:checked={item.selected} class="ml-auto" readonly />
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
						class={twMerge(components.button({ type: 'negative' }))}
					>
						Sulje
					</button>
				</div>
			{/snippet}
		</Popup>
	{/if}
</div>
