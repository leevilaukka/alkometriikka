<script lang="ts">
	import { components } from '$lib/utils/ui/styles';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import Popup from '../widgets/Popup.svelte';
	import { getRandom } from '$lib/utils/app/share';
	import { isSafari } from '$lib/global.svelte';
	import { filterAnnotationsToFilter, filterRenameMap } from '$lib/utils/constants/display';
	import Icon from '../widgets/Icon.svelte';
	import { untrack } from 'svelte';
	import type { FilterValue } from '$lib/types';
	import { groupOptionsByWords, type OptionNode } from '$lib/utils/ui/optionGroups';

	let {
		defaultValue = [],
		value = $bindable(defaultValue),
		modified = $bindable(false),
		options = [],
		label,
		name,
		grouped = false,
		...rest
	}: {
		defaultValue?: FilterValue;
		value?: FilterValue;
		modified?: boolean;
		options?: FilterValue;
		label?: string;
		name?: string;
		/** Group the options by their leading words (e.g. stores by city and district) */
		grouped?: boolean;
		rest?: Record<string, any>;
	} = $props();

	const strOptions = $derived(options.map(String));

	const inputId = 'stringinput-' + getRandom();

	type ListItem = {
		value: string;
		selected: boolean;
	};

	let list = $state<ListItem[]>(
		untrack(() => strOptions.map((option) => ({ value: option, selected: value.includes(option) })))
	);

	$effect(() => {
		const set = new Set(value).difference(new Set(defaultValue));
		modified = !!set.size;
	});

	$effect(() => {
		if (!value) return;
		if (value.length === 0) list = strOptions.map((option) => ({ value: option, selected: false }));
	});

	$effect(() => {
		// Options can change (e.g. "show removed" or a parent filter narrowing them),
		// so rebuild the list while keeping the current selections
		const options = strOptions;
		untrack(() => {
			if (options.length === list.length && options.every((option, i) => list[i].value === option))
				return;
			const selected = new Set(value ?? []);
			list = options.map((option) => ({ value: option, selected: selected.has(option) }));
		});
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
		const original = (Object.keys(filterRenameMap) as (keyof typeof filterRenameMap)[]).find(
			(key) => filterRenameMap[key] === label
		);
		return filterAnnotationsToFilter[(original ?? label) as keyof typeof filterAnnotationsToFilter];
	});

	// Every word of the query has to be found, in any order, so e.g. "Helsinki Kamppi"
	// finds "Helsinki keskusta Kamppi"
	const queryWords = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
	const matchesQuery = (value: string) => {
		const lower = value.toLowerCase();
		return queryWords.every((word) => lower.includes(word));
	};

	const filteredList = $derived.by(() =>
		query ? list.filter((item) => matchesQuery(item.value)) : list
	);

	type Row =
		| {
				type: 'option';
				item: ListItem;
				label: string;
				depth: number;
				striped: boolean;
				divider?: boolean;
		  }
		| {
				type: 'group';
				key: string;
				label: string;
				depth: number;
				striped: boolean;
				divider?: boolean;
				items: ListItem[];
				selectedCount: number;
				expanded: boolean;
		  };

	const groups = $derived(grouped ? groupOptionsByWords(strOptions) : null);
	let expandedGroups = $state<Set<string>>(new Set());

	const rows = $derived.by((): Row[] => {
		if (!groups)
			return filteredList.map((item, i) => ({
				type: 'option',
				item,
				label: item.value,
				depth: 0,
				striped: i % 2 === 0
			}));
		const itemsByValue = new Map(list.map((item) => [item.value, item]));
		const rows: Row[] = [];
		// Stripes go by the position among the siblings, children continuing from their group,
		// so opening a group doesn't flip the stripes of the rows after it
		const walk = (nodes: OptionNode[], depth: number, firstStriped: boolean) => {
			let striped = !firstStriped;
			for (const node of nodes) {
				if (node.type === 'option') {
					const item = itemsByValue.get(node.value);
					if (item && (!query || matchesQuery(item.value))) {
						striped = !striped;
						rows.push({ type: 'option', item, label: node.label, depth, striped });
					}
					continue;
				}
				const items = node.values
					.filter((value) => !query || matchesQuery(value))
					.map((value) => itemsByValue.get(value))
					.filter((item) => item !== undefined);
				if (!items.length) continue;
				striped = !striped;
				// Searching opens every group with matches so they can be seen right away
				const expanded = !!query || expandedGroups.has(node.key);
				rows.push({
					type: 'group',
					key: node.key,
					label: node.label,
					depth,
					striped,
					items,
					selectedCount: items.filter((item) => item.selected).length,
					expanded
				});
				if (expanded) walk(node.children, depth + 1, !striped);
			}
		};
		walk(groups, 0, true);
		// Mark the end of an open group when the row after it has the same stripe color
		rows.forEach((row, i) => {
			const next = rows[i + 1];
			if (next && next.depth < row.depth && next.striped === row.striped) row.divider = true;
		});
		return rows;
	});

	function updateValue() {
		value = list.filter((option) => option.selected).map((option) => option.value);
	}

	function toggleGroup(key: string) {
		const next = new Set(expandedGroups);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expandedGroups = next;
	}
</script>

<div class={twMerge('flex', strOptions.length > 1 ? 'flex-col' : 'items-center')}>
	{#if strOptions.length === 1}
		{@const isChecked = value?.includes(strOptions[0]) ?? false}
		<label class={twMerge(components.button(), 'w-fit justify-start gap-2')}>
			<Icon
				name={isChecked ? 'checkbox_checked' : 'checkbox'}
				class={isChecked ? 'text-brand-1' : 'text-secondary'}
			/>
			<span>{label}</span>
			<input
				id={inputId}
				type="checkbox"
				class="sr-only"
				checked={isChecked}
				onchange={(e) => {
					if ((e.target as HTMLInputElement).checked) value = [strOptions[0]];
					else value = [];
				}}
			/>
		</label>
	{:else}
		<label for={inputId}>{label}</label>
		<Popup
			class={twMerge('gap-4 p-4', $isSafari && 'h-auto')}
			onOpen={() => (isOpen = true)}
			onClose={() => (isOpen = false)}
		>
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<button
					{name}
					class={twMerge(components.button(), 'w-full justify-start')}
					onclick={() => dialogElement.showModal()}
					title={value &&
						`${value.slice(0, 3).join(', ')}${value.length > 3 ? ` + ${value.length - 3} muuta` : ''}`}
				>
					{text}
				</button>
			{/snippet}
			{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<div class="flex h-full max-h-full flex-col gap-4 overflow-hidden">
					<div class="flex flex-row items-center justify-between gap-4 align-middle">
						<h2 class="font-semibold">{label}</h2>
						<button
							onclick={() => {
								dialogElement?.close();
							}}
							aria-label="Sulje"
							class={twMerge(components.button({ type: 'noborder' }))}
						>
							<Icon name="x" />
						</button>
					</div>
					<div class="order-1 flex flex-row flex-wrap gap-4">
						<button
							onclick={() => {
								list = strOptions.map((option) => ({ value: option, selected: false }));
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
						<span
							class="my-auto ml-auto flex flex-row gap-2 text-sm text-gray-500 dark:text-gray-400"
						>
							{list.filter((option) => option.selected).length} / {list.length} valittu
						</span>
					</div>
					<input
						type="text"
						bind:value={query}
						placeholder="Hae..."
						class={twMerge(components.input(), 'w-full')}
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
								items={rows}
								bufferSize={30}
								defaultEstimatedItemSize={28}
								itemKey={(row: Row) =>
									row.type === 'group' ? `group:${row.key}` : `option:${row.item.value}`}
							>
								{#snippet renderItem(row: Row)}
									{#if row.type === 'group'}
										{@const allSelected = row.selectedCount === row.items.length}
										{@const someSelected = row.selectedCount > 0 && !allSelected}
										<div
											class={twMerge(
												components.button(),
												'relative h-7 w-full rounded-none border-none py-0 pl-[calc(var(--depth)*1.25rem+0.5rem)]',
												row.striped && 'bg-gray-200 dark:bg-zinc-900',
												row.selectedCount > 0 && 'font-bold'
											)}
											style:--depth={row.depth}
										>
											<button
												onclick={() => toggleGroup(row.key)}
												aria-expanded={row.expanded}
												class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
											>
												<Icon
													name="chevron_right"
													class={twMerge(
														'shrink-0 transition-transform',
														row.expanded && 'rotate-90'
													)}
												/>
												<span
													class="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap"
													title={row.key}
												>
													{row.label}
												</span>
												<span class="shrink-0 text-xs font-normal text-gray-500 dark:text-gray-400">
													{row.selectedCount ? `${row.selectedCount} / ` : ''}{row.items.length}
												</span>
											</button>
											<input
												type="checkbox"
												checked={allSelected}
												{@attach (input: HTMLInputElement) => {
													input.indeterminate = someSelected;
												}}
												onclick={() => {
													row.items.forEach((item) => (item.selected = !allSelected));
													updateValue();
												}}
												aria-label={`${allSelected ? 'Poista valinnat' : 'Valitse kaikki'}: ${row.key}`}
												class="ml-auto cursor-pointer"
											/>
											{#if row.divider}
												<span
													class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gray-300 dark:bg-zinc-700"
												></span>
											{/if}
										</div>
									{:else}
										{@const item = row.item}
										<button
											onclick={() => {
												item.selected = !item.selected;
												updateValue();
											}}
											class={twMerge(
												components.button(),
												'relative h-7 w-full rounded-none border-none py-0',
												groups && 'pl-[calc(var(--depth)*1.25rem+0.5rem)]',
												row.striped && 'bg-gray-200 dark:bg-zinc-900',
												item.selected ? 'font-bold' : ''
											)}
											style:--depth={row.depth + (groups ? 1 : 0)}
										>
											<span
												class="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap"
												title={item.value}
											>
												{row.label}
											</span>
											<input
												type="checkbox"
												bind:checked={item.selected}
												class="ml-auto"
												readonly
											/>
											{#if row.divider}
												<span
													class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gray-300 dark:bg-zinc-700"
												></span>
											{/if}
										</button>
									{/if}
								{/snippet}
							</SvelteVirtualList>
						{/if}
					</div>
				</div>
				<div class="flex flex-row flex-wrap justify-end gap-4">
					<span
						class="my-auto mr-auto flex flex-row gap-2 text-sm text-gray-500 dark:text-gray-400"
						title={originalFilter?.description || ''}
					>
						<Icon name={originalFilter?.icon || 'list'} />
						{originalFilter?.title || ''}
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
