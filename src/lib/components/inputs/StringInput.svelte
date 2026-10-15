<script lang="ts">
	import { components } from '$lib/utils/ui/styles';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import Popup from '../widgets/Popup.svelte';
	import { getRandom } from '$lib/utils/app/share';
	import { isSafari } from '$lib/global.svelte';
	import { filterAnnotationsToFilter } from '$lib/utils/constants/display';
	import Icon from '../widgets/Icon.svelte';
	import { untrack } from 'svelte';
	import type { ColumnNames, FilterValue } from '$lib/types';
	import { intlLocale, locale, m } from '$lib/i18n';
	import { isTranslatedColumn, translateValue } from '$lib/i18n/values';

	let {
		defaultValue = [],
		value = $bindable(defaultValue),
		modified = $bindable(false),
		options = [],
		label,
		name,
		...rest
	}: {
		defaultValue?: FilterValue;
		value?: FilterValue;
		modified?: boolean;
		options?: FilterValue;
		label?: string;
		name?: string;
		rest?: Record<string, any>;
	} = $props();

	/** The filter's column. The options are its Finnish values, which the filter keeps using. */
	const column = $derived(name as ColumnNames | undefined);
	const translated = $derived(locale !== 'fi' && isTranslatedColumn(column));
	const labelOf = (option: string) => (translated ? translateValue(option, column) : option);

	// Translated options are listed in the order of the names shown
	const strOptions = $derived.by(() => {
		const values = options.map(String);
		if (!translated) return values;
		return values.sort((a, b) => labelOf(a).localeCompare(labelOf(b), intlLocale));
	});

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
		if (!value) return m.filter_no_selection();
		if (value.length > 1) return m.filter_selected_count({ count: value.length });
		else if (value.length == 1) return labelOf(String(value.at(0)));
		else return m.filter_no_selection();
	});

	let query = $state('');
	let isOpen = $state(false);

	const originalFilter = $derived(
		filterAnnotationsToFilter[column as keyof typeof filterAnnotationsToFilter]
	);

	// Matches the name shown and the Finnish value, so either one finds the option
	const filteredList = $derived.by(() => {
		if (!query) return list;
		const lowerQuery = query.toLowerCase();
		return list.filter(
			(item) =>
				item.value.toLowerCase().includes(lowerQuery) ||
				labelOf(item.value).toLowerCase().includes(lowerQuery)
		);
	});
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
						`${value
							.slice(0, 3)
							.map((option) => labelOf(String(option)))
							.join(
								', '
							)}${value.length > 3 ? ` ${m.filter_more_selected({ count: value.length - 3 })}` : ''}`}
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
							aria-label={m.common_close()}
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
							{m.filter_clear_selection()}
						</button>
						<button
							onclick={() => {
								filteredList.forEach((option) => (option.selected = true));
								value = list.filter((option) => option.selected).map((option) => option.value);
							}}
							class={twMerge(components.button())}
						>
							{m.filter_select_all()}
						</button>
						<span
							class="my-auto ml-auto flex flex-row gap-2 text-sm text-gray-500 dark:text-gray-400"
						>
							{m.filter_selected_of({
								selected: list.filter((option) => option.selected).length,
								total: list.length
							})}
						</span>
					</div>
					<input
						type="text"
						bind:value={query}
						placeholder={m.common_search_placeholder()}
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
							<SvelteVirtualList items={filteredList} bufferSize={30}>
								{#snippet renderItem(item: ListItem, index: number)}
									<button
										onclick={() => {
											item.selected = !item.selected;
											value = list
												.filter((option) => option.selected)
												.map((option) => option.value);
										}}
										class={twMerge(
											components.button(),
											'w-full rounded-none border-none',
											index % 2 === 0 && 'bg-gray-200 dark:bg-zinc-900',
											item.selected ? 'font-bold' : ''
										)}
									>
										<span
											class="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap"
											title={labelOf(item.value)}
										>
											{labelOf(item.value)}
										</span>
										<input type="checkbox" bind:checked={item.selected} class="ml-auto" readonly />
									</button>
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
						{m.common_close()}
					</button>
				</div>
			{/snippet}
		</Popup>
	{/if}
</div>
