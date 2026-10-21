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
	import {
		buildOptionRows,
		type OptionGrouper,
		type OptionNode,
		type OptionRow
	} from '$lib/utils/ui/optionGroups';

	let {
		defaultValue = [],
		value = $bindable(defaultValue),
		modified = $bindable(false),
		options = [],
		label,
		name,
		groupOptions,
		...rest
	}: {
		defaultValue?: FilterValue;
		value?: FilterValue;
		modified?: boolean;
		options?: FilterValue;
		label?: string;
		name?: string;
		/** Groups the options shown in the picker, e.g. stores by city and district */
		groupOptions?: OptionGrouper;
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

	type Row = OptionRow<ListItem>;

	const groups = $derived(groupOptions ? groupOptions(strOptions) : null);
	let expandedGroups = $state<Set<string>>(new Set());

	const rows = $derived(
		buildOptionRows(
			groups ?? strOptions.map((value) => ({ type: 'option' as const, value, label: value })),
			list,
			matchesQuery,
			// Searching opens every group with matches so they can be seen right away
			(key) => !!query || expandedGroups.has(key)
		)
	);

	// Groups where something was selected while searching stay open once the search is
	// cleared, so the selection can still be seen
	function keepOpen(keys: string[]) {
		if (!query || keys.every((key) => expandedGroups.has(key))) return;
		expandedGroups = new Set([...expandedGroups, ...keys]);
	}

	function updateValue() {
		value = list.filter((option) => option.selected).map((option) => option.value);
	}

	const groupKeys = $derived.by(() => {
		const keys: string[] = [];
		const collect = (nodes: OptionNode[]) =>
			nodes.forEach((node) => {
				if (node.type !== 'group') return;
				keys.push(node.key);
				collect(node.children);
			});
		if (groups) collect(groups);
		return keys;
	});
	const allExpanded = $derived(groupKeys.every((key) => expandedGroups.has(key)));

	function toggleGroup(key: string) {
		const next = new Set(expandedGroups);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expandedGroups = next;
	}
</script>

<!-- Ends an open group, in the color of the other stripe -->
{#snippet divider(striped: boolean)}
	<span
		class={twMerge(
			'pointer-events-none absolute inset-x-0 bottom-0 h-px',
			striped ? 'bg-white dark:bg-zinc-800' : 'bg-gray-200 dark:bg-zinc-900'
		)}
	></span>
{/snippet}

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
								keepOpen(rows.flatMap((row) => row.parents));
								value = list.filter((option) => option.selected).map((option) => option.value);
							}}
							class={twMerge(components.button())}
						>
							Valitse kaikki
						</button>
						{#if groupKeys.length}
							<!-- Searching opens the groups with matches by itself -->
							<button
								onclick={() => (expandedGroups = allExpanded ? new Set() : new Set(groupKeys))}
								disabled={!!query}
								class={twMerge(components.button(), 'disabled:cursor-default disabled:opacity-50')}
							>
								<Icon name={allExpanded ? 'chevrons_down_up' : 'chevrons_up_down'} />
								{allExpanded ? 'Sulje ryhmät' : 'Avaa ryhmät'}
							</button>
						{/if}
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
										{@const selectedCount = row.items.filter((item) => item.selected).length}
										{@const allSelected = selectedCount === row.items.length}
										{@const someSelected = selectedCount > 0 && !allSelected}
										<div
											class={twMerge(
												components.button(),
												'relative h-7 w-full rounded-none border-none py-0 pl-[calc(var(--depth)*(1em+0.5rem)+0.5rem)]',
												row.striped && 'bg-gray-200 dark:bg-zinc-900',
												selectedCount > 0 && 'font-bold'
											)}
											style:--depth={row.depth}
										>
											<button
												onclick={() => toggleGroup(row.key)}
												aria-expanded={row.expanded}
												class="flex h-full min-w-0 cursor-pointer items-center gap-2 text-left"
											>
												<Icon
													name="chevron_right"
													class={twMerge(
														'w-[1em] shrink-0 transition-transform',
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
													{selectedCount ? `${selectedCount} / ` : ''}{row.items.length}
												</span>
											</button>
											<!-- The rest of the row after the name selects the group, like the
											     whole row of an option, so the checkbox is easy to hit -->
											<label
												class="-mr-2 -ml-2 flex h-full flex-1 cursor-pointer items-center justify-end px-2"
											>
												<input
													type="checkbox"
													checked={allSelected}
													{@attach (input: HTMLInputElement) => {
														input.indeterminate = someSelected;
													}}
													onclick={() => {
														// Read once: allSelected changes as soon as the first item does
														const select = !allSelected;
														row.items.forEach((item) => (item.selected = select));
														keepOpen(row.parents);
														updateValue();
													}}
													aria-label={`${allSelected ? 'Poista valinnat' : 'Valitse kaikki'}: ${row.key}`}
													class="cursor-pointer"
												/>
											</label>
											{#if row.divider}{@render divider(row.striped)}{/if}
										</div>
									{:else}
										{@const item = row.item}
										<button
											onclick={() => {
												item.selected = !item.selected;
												keepOpen(row.parents);
												updateValue();
											}}
											class={twMerge(
												components.button(),
												'relative h-7 w-full rounded-none border-none py-0',
												groups && 'pl-[calc(var(--depth)*(1em+0.5rem)+0.5rem)]',
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
											{#if row.divider}{@render divider(row.striped)}{/if}
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
