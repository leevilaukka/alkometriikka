<script lang="ts">
	import { components } from '$lib/utils/styles';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import Popup from '../widgets/Popup.svelte';
	import { getRandom } from '$lib/utils/helpers';
	import { isSafari } from '$lib/global.svelte';
	import { filterAnnotationsToFilter, filterRenameMap } from '$lib/utils/constants';
	import Icon from '../widgets/Icon.svelte';

	let { defaultValue = [], value = $bindable(defaultValue), modified = $bindable(false), options = [], label, ...rest } = $props();
	
	const name = "stringinput-" + getRandom();

	type ListItem = {
		value: string;
		selected: boolean;
	};

	let list = $state<ListItem[]>(options.map((option) => ({ value: option, selected: value.includes(option) })));

	$effect(() => {
		const set = new Set(value).difference(new Set(defaultValue))
		modified = !!set.size
	})

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
	let isOpen = $state(false);

	const originalFilter = $derived.by(() => {
		const original = (Object.keys(filterRenameMap) as (keyof typeof filterRenameMap)[]).find((key) => filterRenameMap[key] === label);
		return filterAnnotationsToFilter[(original ?? label) as keyof typeof filterAnnotationsToFilter];
	});

	const filteredList = $derived.by(() =>
		query
			? list.filter((item) => item.value.toLowerCase().includes(query.toLowerCase()))
			: list
	);
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
		<Popup
			class={twMerge("p-4 gap-4", $isSafari && "h-auto")}
			onOpen={() => (isOpen = true)}
			onClose={() => (isOpen = false)}
		>
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
				<div class="flex h-full max-h-full overflow-hidden flex-col gap-4">
					<div class="flex flex-row items-center align-middle justify-between gap-4">
						<h2 class="font-semibold">{label}</h2>
						<button
							onclick={() => {
								dialogElement?.close();
							}}
							class={twMerge(components.button({ type: 'noborder' }))}
						>
							<Icon name="x" />
						</button>
					</div>
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
								filteredList.forEach((option) => (option.selected = true));
								value = list.filter((option) => option.selected).map((option) => option.value);
							}}
							class={twMerge(components.button())}
						>
							Valitse kaikki
						</button>
						<span class="flex flex-row gap-2 ml-auto my-auto text-sm text-gray-500 dark:text-gray-400">
							{list.filter((option) => option.selected).length} / {list.length} valittu
						</span>
					</div>
					<input
						type="text"
						bind:value={query}
						placeholder="Hae..."
						class={twMerge(components.input(), "w-full")}
					/>
					<div
						class="order-4 col-span-full flex h-[var(--height)] max-h-full flex-col overflow-auto rounded border border-primary lg:order-3 lg:col-span-1"
						style:--height={`${28 * 20}px;`}
					>
						<!-- Only mount the virtual list once the dialog is visible. Mounting it
						     while the dialog is display:none makes the list measure a 0px viewport
						     and render only a tiny window, hiding later options until scrolled. -->
						{#if isOpen}
							<SvelteVirtualList
								items={filteredList}
								bufferSize={30}
							>
								{#snippet renderItem(item: ListItem, index: number)}
									<button
										onclick={() => {
											item.selected = !item.selected;
											value = list.filter((option) => option.selected).map((option) => option.value);
										}}
										class={twMerge(components.button(), 'w-full rounded-none border-none', index % 2 === 0 && 'bg-gray-200 dark:bg-zinc-900', item.selected ? 'font-bold' : '')}
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
						{/if}
					</div>
				</div>
				<div class="flex flex-row flex-wrap justify-end gap-4">
					<span class="flex flex-row gap-2 mr-auto my-auto text-sm text-gray-500 dark:text-gray-400" title={originalFilter?.description || ''}>
						<Icon name={originalFilter?.icon || 'list'} /> {originalFilter?.title || ''}
					</span>
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
