<script lang="ts">
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import { personalInfo, locationDenied, preferredStoreId, userLocation } from '$lib/global.svelte';
	import { AUTO_STORE_ID, GenderOptionsMap } from '$lib/utils/constants/app';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { getStoreCity, resolvePreferredStore } from '$lib/utils/catalog/availability';
	import { requestUserLocation } from '$lib/utils/device/location';
	import type { AvailabilityStore } from '$lib/types';
	import { genderLabel } from '$lib/utils/format/labels';
	import { locale, m } from '$lib/i18n';
	let { dialogElement, stores }: { dialogElement: HTMLDialogElement; stores: AvailabilityStore[] } =
		$props();

	const nearestStore = $derived(
		$preferredStoreId === AUTO_STORE_ID
			? resolvePreferredStore(
					Object.fromEntries(stores.map((store) => [store.id, store])),
					AUTO_STORE_ID,
					$userLocation
				)
			: undefined
	);
	const weightOK = $derived(personalInfo.weight == null || personalInfo.weight >= 1);
</script>

<div class="prose dark:prose-invert">
	<h2 class="text-lg font-bold">{m.settings_personal_title()}</h2>
	<p class="text-sm text-secondary">{m.personal_description()}</p>
</div>
<div class="flex w-full flex-row gap-2">
	<div class="flex w-full flex-col gap-2">
		<label for="weight" class="text-sm">{m.personal_weight()}</label>
		<input
			lang={locale}
			type="number"
			name="weight"
			bind:value={personalInfo.weight}
			placeholder={m.personal_weight()}
			class={twMerge(components.input(), 'w-full')}
			min="1"
			max="500"
			step="0.1"
		/>
		{#if !weightOK}
			<p class="text-xs text-red-600">{m.personal_weight_invalid()}</p>
		{/if}
	</div>
</div>
<div class="flex flex-col">
	<label for="gender" class="text-sm">{m.personal_gender()}</label>
	<select
		name="gender"
		bind:value={personalInfo.gender}
		class={twMerge(components.input(), 'w-full')}
	>
		<option value={null}>{m.personal_gender_choose()}</option>
		{#each Object.values(GenderOptionsMap) as option}
			<option value={option}>{genderLabel(option)}</option>
		{/each}
	</select>
</div>
<div class="flex flex-col gap-2 border-t border-primary pt-3">
	<label for="preferred-store" class="text-sm font-bold">{m.personal_preferred_store()}</label>
	<select
		id="preferred-store"
		name="preferred-store"
		bind:value={$preferredStoreId}
		class={twMerge(components.input(), 'w-full')}
		onchange={() => {
			if ($preferredStoreId === AUTO_STORE_ID) {
				requestUserLocation();
				sendAnalyticsEvent('preferred_store_changed', {
					storeId: AUTO_STORE_ID,
					storeName: 'Auto'
				});
				return;
			}
			const selectedStore = stores.find((store) => store.id === $preferredStoreId);
			if (selectedStore) {
				sendAnalyticsEvent('preferred_store_changed', {
					storeId: selectedStore.id,
					storeName: selectedStore.name,
					city: getStoreCity(selectedStore)
				});
			}
		}}
	>
		<option value="">{m.personal_no_store()}</option>
		<option value={AUTO_STORE_ID}>{m.personal_auto_store()}</option>
		{#each stores as store (store.id)}
			<option value={store.id}>{store.name}</option>
		{/each}
	</select>
	{#if $preferredStoreId === AUTO_STORE_ID}
		<p class="text-xs text-secondary">
			{#if $locationDenied}
				{nearestStore
					? m.personal_location_denied_with_store({ store: nearestStore.name })
					: m.personal_location_denied()}
			{:else if nearestStore}
				{m.personal_nearest_store()} <strong>{nearestStore.name}</strong>. {m.personal_location_local()}
			{:else}
				{m.personal_location_waiting()}
			{/if}
		</p>
	{/if}
	<p class="text-xs text-secondary">
		{m.personal_store_note()}
	</p>
</div>
<p class="self-end text-xs text-secondary">{m.personal_save_reloads()}</p>
<div class="grid grid-cols-2 gap-3">
	<button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
		>{m.common_close()}</button
	>
	<button
		class={twMerge(
			components.button({ type: 'positive' }),
			'w-full',
			!weightOK ? 'cursor-not-allowed opacity-50' : ''
		)}
		disabled={!weightOK}
		onclick={() => window.location.reload()}>{m.common_save()}</button
	>
</div>
