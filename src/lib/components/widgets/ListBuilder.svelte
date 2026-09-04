<script lang="ts">
	import type { Kaljakori } from '$lib/alko';
	import { customTemplates, preferredStoreId } from '$lib/global.svelte';
	import type { AvailabilityData, ColumnNames } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { getRandom, headerToDisplayName, sendAnalyticsEvent } from '$lib/utils/helpers';
	import { listToURI } from '$lib/utils/lists';
	import { components } from '$lib/utils/styles';
	import {
		createCustomTemplateId,
		createListFromTemplate,
		customTemplateToListTemplate,
		resolveTemplate,
		type CustomTemplate,
		type CustomTemplateSlot,
		type SerializedTemplateFilterSpec,
		type SlotPickStrategy
	} from '$lib/utils/templates';
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';

	const {
		kaljakori,
		availability,
		onCreated,
		onCancel
	}: {
		kaljakori: Kaljakori;
		availability: AvailabilityData;
		onCreated: (listURI: string) => void;
		onCancel: () => void;
	} = $props();

	// Columns the builder lets you filter on. Union of the app's shown filters and
	// their sub-category columns, restricted to those with string/number data.
	const FILTERABLE_COLUMNS = (
		[
			AllColumns.Type,
			AllColumns.SubType,
			AllColumns.BeerType,
			AllColumns.Price,
			AllColumns.PricePerLiter,
			AllColumns.BottleSize,
			AllColumns.AlcoholPercentage,
			AllColumns.Sugar,
			AllColumns.Country,
			AllColumns.Region,
			AllColumns.PackagingType,
			AllColumns.Availability,
			AllColumns.Vintage,
			AllColumns.New,
			AllColumns.GrapeVarieties,
			AllColumns.Description
		] as ColumnNames[]
	).filter((column) => {
		const type = kaljakori.getFilterType(column);
		return type === 'string' || type === 'number';
	});

	const PICK_STRATEGIES: { value: SlotPickStrategy; label: string }[] = [
		{ value: 'random', label: 'Satunnainen' },
		{ value: 'cheapest', label: 'Halvin' },
		{ value: 'best-value', label: 'Paras hinta-laatu' }
	];

	const ICONS = ['star', 'heart', 'wine', 'beer', 'water', 'euro', 'gift', 'bolt', 'leaf', 'coffee'] as const;

	type SlotFilter = { column: ColumnNames; value: string };
	// UI-facing slot: filters is an editable list of { column, value } rows that
	// gets compiled into a single serialized spec on save/preview.
	type EditableSlot = {
		key: string;
		label: string;
		quantity: number;
		pick: SlotPickStrategy;
		filters: SlotFilter[];
	};

	let name = $state('Oma lista');
	let description = $state('');
	let icon = $state<(typeof ICONS)[number]>('star');
	let useBudget = $state(false);
	let budget = $state(50);
	let slots = $state<EditableSlot[]>([newSlot()]);

	function newSlot(): EditableSlot {
		return {
			key: getRandom(),
			label: 'Uusi osio',
			quantity: 1,
			pick: 'random',
			filters: []
		};
	}

	function addSlot() {
		slots.push(newSlot());
	}
	function removeSlot(index: number) {
		slots.splice(index, 1);
	}
	function addFilter(slot: EditableSlot) {
		slot.filters.push({ column: AllColumns.Type, value: '' });
	}
	function removeFilter(slot: EditableSlot, index: number) {
		slot.filters.splice(index, 1);
	}

	function isNumberColumn(column: ColumnNames) {
		return kaljakori.getFilterType(column) === 'number';
	}
	function filterValuesFor(column: ColumnNames): string[] {
		return kaljakori.getFilterValues(column).map(String);
	}
	function numberBounds(column: ColumnNames): [number, number] {
		return kaljakori.getMinAndMaxValues(column);
	}

	// Compile the editable slots into a serializable CustomTemplate.
	function buildCustomTemplate(): CustomTemplate {
		return {
			id: createCustomTemplateId(),
			name: name.trim() || 'Oma lista',
			description: description.trim(),
			icon,
			budget: useBudget ? budget : undefined,
			createdAt: Date.now(),
			slots: slots.map(compileSlot)
		};
	}

	function compileSlot(slot: EditableSlot): CustomTemplateSlot {
		const spec: SerializedTemplateFilterSpec = {};
		for (const { column, value } of slot.filters) {
			if (!value.trim()) continue;
			if (isNumberColumn(column)) {
				const [lo, hi] = value.split('-').map((v) => Number(v.trim()));
				if (Number.isFinite(lo) && Number.isFinite(hi)) spec[column] = [lo, hi];
			} else {
				const existing = spec[column];
				const arr = Array.isArray(existing) && typeof existing[0] === 'string' ? (existing as string[]) : [];
				arr.push(value.trim());
				spec[column] = arr;
			}
		}
		return {
			label: slot.label.trim() || 'Osio',
			quantity: Math.max(1, Math.floor(slot.quantity) || 1),
			pick: slot.pick,
			specs: [spec]
		};
	}

	// Live preview resolution (recomputed whenever any editable field changes).
	let listTemplate = $derived(customTemplateToListTemplate(buildCustomTemplate()));
	let resolution = $derived.by(() => {
		const storeName = $preferredStoreId ? availability.stores[$preferredStoreId]?.name : undefined;
		return resolveTemplate(listTemplate, kaljakori, { storeName });
	});

	function saveTemplate() {
		customTemplates.push(buildCustomTemplate());
		sendAnalyticsEvent('save_list_template', { name });
	}

	function createList() {
		const template = buildCustomTemplate();
		const { list } = createListFromTemplate(customTemplateToListTemplate(template), kaljakori, {
			storeName: $preferredStoreId ? availability.stores[$preferredStoreId]?.name : undefined
		});
		sendAnalyticsEvent('create_list_from_template', { template: template.id });
		onCreated(listToURI(list));
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between gap-2">
		<h2 class="flex items-center gap-2 text-xl font-semibold">
			<Icon name="pencil_sparkles" /> Luo oma lista
		</h2>
		<button
			class={twMerge(components.button({ type: 'noborder', size: 'sm' }), 'shrink-0')}
			onclick={onCancel}
			aria-label="Takaisin"
		>
			<Icon name="x" />
		</button>
	</div>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<label class="flex flex-col gap-1 text-sm">
			<span>Listan nimi</span>
			<input class={twMerge(components.input())} bind:value={name} />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span>Kuvaus (valinnainen)</span>
			<input class={twMerge(components.input())} bind:value={description} />
		</label>
	</div>

	<div class="flex flex-wrap items-end gap-3">
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={useBudget} class="h-4 w-4" />
			<span>Budjetti</span>
		</label>
		{#if useBudget}
			<label class="flex items-center gap-2 text-sm">
				<input
					type="number"
					min="0"
					step="1"
					class={twMerge(components.input(), 'w-24')}
					bind:value={budget}
				/>
				<span>€</span>
			</label>
		{/if}
		<div class="flex items-center gap-2 text-sm">
			<span>Kuvake:</span>
			<div class="flex gap-1">
				{#each ICONS as ic (ic)}
					<button
						class={twMerge(
							components.button({ type: icon === ic ? 'positive' : 'primary', size: 'sm' }),
							'aspect-square'
						)}
						onclick={() => (icon = ic)}
						aria-label={`Kuvake ${ic}`}
					>
						<Icon name={ic} />
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Slots -->
	<div class="flex flex-col gap-3">
		{#each slots as slot, si (slot.key)}
			<div class="flex flex-col gap-2 rounded border border-primary p-3">
				<div class="flex items-center justify-between gap-2">
					<input
						class={twMerge(components.input(), 'flex-1 font-semibold')}
						bind:value={slot.label}
						placeholder="Osion nimi"
					/>
					<button
						class={twMerge(components.button({ type: 'negative', size: 'sm' }), 'aspect-square shrink-0')}
						onclick={() => removeSlot(si)}
						aria-label="Poista osio"
						disabled={slots.length <= 1}
					>
						<Icon name="trash" />
					</button>
				</div>

				<div class="flex flex-wrap items-center gap-3 text-sm">
					<label class="flex items-center gap-2">
						<span>Määrä</span>
						<input
							type="number"
							min="1"
							step="1"
							class={twMerge(components.input(), 'w-16')}
							bind:value={slot.quantity}
						/>
					</label>
					<label class="flex items-center gap-2">
						<span>Valinta</span>
						<select class={twMerge(components.input())} bind:value={slot.pick}>
							{#each PICK_STRATEGIES as strategy (strategy.value)}
								<option value={strategy.value}>{strategy.label}</option>
							{/each}
						</select>
					</label>
				</div>

				<!-- Filters -->
				<div class="flex flex-col gap-1.5">
					{#each slot.filters as filter, fi (fi)}
						<div class="flex items-center gap-1.5">
							<select class={twMerge(components.input(), 'text-xs')} bind:value={filter.column}>
								{#each FILTERABLE_COLUMNS as column (column)}
									<option value={column}>{headerToDisplayName(column)}</option>
								{/each}
							</select>
							{#if isNumberColumn(filter.column)}
								{@const [min, max] = numberBounds(filter.column)}
								<input
									class={twMerge(components.input(), 'w-full text-xs')}
									placeholder={`${min} - ${max}`}
									bind:value={filter.value}
								/>
							{:else}
								<select class={twMerge(components.input(), 'flex-1 text-xs')} bind:value={filter.value}>
									<option value="">Valitse…</option>
									{#each filterValuesFor(filter.column) as option (option)}
										<option value={option}>{option}</option>
									{/each}
								</select>
							{/if}
							<button
								class={twMerge(components.button({ type: 'noborder', size: 'sm' }), 'aspect-square shrink-0')}
								onclick={() => removeFilter(slot, fi)}
								aria-label="Poista suodatin"
							>
								<Icon name="x" />
							</button>
						</div>
					{/each}
					<button
						class={twMerge(components.button({ type: 'primary', size: 'xs' }), 'gap-1 self-start')}
						onclick={() => addFilter(slot)}
					>
						<Icon name="plus" /> Lisää suodatin
					</button>
				</div>
			</div>
		{/each}
		<button
			class={twMerge(components.button({ type: 'primary', size: 'sm' }), 'gap-1 self-start')}
			onclick={addSlot}
		>
			<Icon name="plus" /> Lisää osio
		</button>
	</div>

	<!-- Live preview -->
	<div class="flex flex-col gap-1 rounded border border-primary bg-secondary/40 p-3">
		<p class="flex items-center justify-between text-sm font-semibold">
			<span>Esikatselu ({resolution.itemCount} tuotetta)</span>
			<span>{formatValue(resolution.totalPrice, AllColumns.Price)}</span>
		</p>
		{#each resolution.slots as slotResolution (slotResolution.slot.label)}
			<p class="text-xs text-secondary">
				{slotResolution.slot.label}: {slotResolution.picked.length}/{slotResolution.slot.quantity}
				{#if slotResolution.picked.length > 0}
					— {slotResolution.picked.map((p) => p[AllColumns.Name]).join(', ')}
				{:else if slotResolution.reason}
					({slotResolution.reason === 'budget' ? 'budjetti' : 'ei osumia'})
				{/if}
			</p>
		{/each}
	</div>

	<div class="flex flex-wrap gap-2">
		<button
			class={twMerge(components.button({ type: 'primary', size: 'md' }), 'gap-1')}
			onclick={saveTemplate}
		>
			<Icon name="save" /> Tallenna malli
		</button>
		<button
			class={twMerge(components.button({ type: 'positive', size: 'md' }), 'flex-1 justify-center gap-1')}
			onclick={createList}
		>
			<Icon name="plus" /> Luo lista
		</button>
	</div>
</div>
