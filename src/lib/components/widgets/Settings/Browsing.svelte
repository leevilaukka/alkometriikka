<script lang="ts">
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import { browsePrefs, onlyPreferredStore, preferredStoreId } from '$lib/global.svelte';
	import { AllColumns } from '$lib/utils/constants/columns';
	import {
		defaultSortingColumn,
		shownColumnsToHighlight,
		shownFilters,
		shownSortingKeys
	} from '$lib/utils/constants/display';
	import { headerToDisplayName } from '$lib/utils/format/labels';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import type { ColumnNames } from '$lib/types';
	let { dialogElement, alko }: { dialogElement: HTMLDialogElement; alko?: any } = $props();

	// Undefined while a page renders before the price list has loaded. Subtypes only removed
	// products have are left out, since the list doesn't show those by default
	const subTypeOptions = $derived(
		((alko?.kaljakori?.getFilterValues(AllColumns.SubType, false) ?? []) as (string | number)[])
			.map(String)
			.sort((a, b) => a.localeCompare(b, 'fi', { sensitivity: 'base' }))
	);

	function toggle(list: ColumnNames[], filter: ColumnNames) {
		return list.includes(filter) ? list.filter((item) => item !== filter) : [...list, filter];
	}

	const hiddenCount = $derived(browsePrefs.hiddenSubTypes.length);
</script>

<div class="prose dark:prose-invert">
	<h2 class="text-lg font-bold">Selaus</h2>
	<p class="text-sm text-secondary">
		Näillä valinnoilla tuotelista avautuu haluamallasi tavalla. Ne tallennetaan vain laitteellesi.
	</p>
</div>
<div class="grid grid-cols-2 gap-2">
	<div class="flex flex-col">
		<label for="browse-sort" class="text-sm">Oletusjärjestys</label>
		<select
			id="browse-sort"
			bind:value={browsePrefs.sort}
			class={twMerge(components.input(), 'w-full pe-8')}
		>
			<option value="">Oletus ({headerToDisplayName(defaultSortingColumn)})</option>
			{#each shownSortingKeys as column (column)}
				<option value={column}>{headerToDisplayName(column)}</option>
			{/each}
		</select>
	</div>
	<div class="flex flex-col">
		<label for="browse-highlight" class="text-sm">Oletuskorostus</label>
		<select
			id="browse-highlight"
			bind:value={browsePrefs.highlight}
			class={twMerge(components.input(), 'w-full pe-8')}
		>
			<option value="">Oletus ({headerToDisplayName(defaultSortingColumn)})</option>
			{#each shownColumnsToHighlight as column (column)}
				<option value={column}>{headerToDisplayName(column)}</option>
			{/each}
		</select>
	</div>
</div>
<div class="flex flex-col gap-2 border-t border-primary pt-3">
	<label class="flex cursor-pointer items-center gap-2 text-sm">
		<input type="checkbox" bind:checked={$onlyPreferredStore} class="shrink-0 rounded" />
		<span>Näytä vain ensisijaisessa myymälässä myytävät tuotteet</span>
	</label>
	{#if !$preferredStoreId}
		<p class="text-xs text-secondary">
			Valitse ensisijainen myymälä Henkilökohtaiset tiedot -välilehdeltä, niin rajaus tulee
			käyttöön.
		</p>
	{/if}
	<label class="flex cursor-pointer items-center gap-2 text-sm">
		<input type="checkbox" bind:checked={browsePrefs.hideAlcoholFree} class="shrink-0 rounded" />
		<span>Piilota alkoholittomat tuotteet</span>
	</label>
</div>
<div class="flex flex-col gap-2 border-t border-primary pt-3">
	<details class="group">
		<summary class="flex cursor-pointer list-none items-center gap-2 text-sm font-bold">
			<Icon name="chevron_down" class="transition-transform group-open:rotate-180" />
			<span>Piilota alatyyppejä</span>
			<span class="ms-auto text-xs font-normal text-secondary">
				{hiddenCount === 0 ? 'Ei piilotettuja' : `${hiddenCount} piilotettu`}
			</span>
		</summary>
		<div class="flex flex-col gap-3 pt-2">
			{#if subTypeOptions.length}
				<fieldset class="flex flex-col gap-2">
					<legend class="sr-only">Alatyypit</legend>
					<div class="grid max-h-56 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto">
						{#each subTypeOptions as subType (subType)}
							<label class="flex cursor-pointer items-center gap-2 text-sm">
								<input
									type="checkbox"
									value={subType}
									bind:group={browsePrefs.hiddenSubTypes}
									class="shrink-0 rounded"
								/>
								<span class="min-w-0 truncate">{subType}</span>
							</label>
						{/each}
					</div>
				</fieldset>
			{/if}
			<p class="text-xs text-secondary">
				Rajaukset koskevat etusivun tuotelistaa. Kategoriasivut näyttävät aina koko kategorian.
			</p>
		</div>
	</details>
</div>
<div class="flex flex-col gap-2 border-t border-primary pt-3">
	<details class="group">
		<summary class="flex cursor-pointer list-none items-center gap-2 text-sm font-bold">
			<Icon name="chevron_down" class="transition-transform group-open:rotate-180" />
			<span>Suodattimet</span>
			<span class="ms-auto text-xs font-normal text-secondary">
				{browsePrefs.hiddenFilters.length || browsePrefs.pinnedFilters.length
					? `${browsePrefs.hiddenFilters.length} piilotettu, ${browsePrefs.pinnedFilters.length} kiinnitetty`
					: 'Oletusjärjestys'}
			</span>
		</summary>
		<div class="flex flex-col gap-2 pt-2">
			<p class="text-xs text-secondary">
				Piilota suodattimia, joita et käytä, ja kiinnitä tärkeimmät ylimmäksi. Piilotettu suodatin
				tulee näkyviin, jos sillä on valinta, esimerkiksi linkistä.
			</p>
			<div class="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1">
				<span class="text-xs text-secondary"></span>
				<span class="text-xs text-secondary">Näytä</span>
				<span class="text-xs text-secondary">Ylös</span>
				{#each shownFilters as filter (filter)}
					<span class="min-w-0 truncate text-sm">{headerToDisplayName(filter)}</span>
					<input
						type="checkbox"
						aria-label={`Näytä suodatin: ${headerToDisplayName(filter)}`}
						checked={!browsePrefs.hiddenFilters.includes(filter)}
						onchange={() => (browsePrefs.hiddenFilters = toggle(browsePrefs.hiddenFilters, filter))}
						class="justify-self-center rounded"
					/>
					<button
						type="button"
						aria-pressed={browsePrefs.pinnedFilters.includes(filter)}
						aria-label={`Kiinnitä suodatin ylös: ${headerToDisplayName(filter)}`}
						onclick={() => (browsePrefs.pinnedFilters = toggle(browsePrefs.pinnedFilters, filter))}
						class={twMerge(
							'justify-self-center rounded p-1 text-secondary',
							browsePrefs.pinnedFilters.includes(filter) && 'text-primary bg-secondary'
						)}
					>
						<Icon name="pin" />
					</button>
				{/each}
			</div>
		</div>
	</details>
</div>
<div class="flex flex-col gap-2">
	<button
		class={twMerge(components.button(), 'w-full')}
		onclick={() => {
			browsePrefs.sort = '';
			browsePrefs.highlight = '';
			browsePrefs.hideAlcoholFree = false;
			browsePrefs.hiddenSubTypes = [];
			browsePrefs.hiddenFilters = [];
			browsePrefs.pinnedFilters = [];
			$onlyPreferredStore = false;
		}}>Palauta oletukset</button
	>
</div>
<p class="self-end text-xs text-secondary">Tallentaminen lataa sivun uudelleen.</p>
<div class="grid grid-cols-2 gap-3">
	<button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
		>Sulje</button
	>
	<button
		class={twMerge(components.button({ type: 'positive' }), 'w-full')}
		onclick={() => window.location.reload()}>Tallenna</button
	>
</div>
