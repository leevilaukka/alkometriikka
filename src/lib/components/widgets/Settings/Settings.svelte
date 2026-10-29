<script lang="ts">
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import { headerSlots, isLaptop, isMobile, theme } from '$lib/global.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { handleClearAll, handleExport, handleImport } from '$lib/utils/app/backup';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { install } from '$lib/utils/app/pwa.svelte';
	import {
		defaultHeaderSlots,
		HEADER_SLOT_COUNT,
		navGroups,
		storedHeaderSlots,
		type NavHref
	} from '$lib/utils/app/nav';
	import { tick } from 'svelte';
	let { dialogElement } = $props();

	// One entry per header button, '' for an empty one
	const slots = $derived(
		Array.from(
			{ length: HEADER_SLOT_COUNT },
			(_, index): NavHref | '' => ($headerSlots ?? defaultHeaderSlots)[index] ?? ''
		)
	);

	let slotSelects = $state<HTMLSelectElement[]>([]);

	/** Picking the page another button already has swaps the two */
	async function pickSlot(index: number, href: NavHref | '') {
		const next = [...slots];
		const taken = href ? next.indexOf(href) : -1;
		if (taken !== -1) next[taken] = next[index];
		next[index] = href;
		const picked = next.filter((slot) => slot !== '');
		$headerSlots = storedHeaderSlots(picked);
		sendAnalyticsEvent('header_slots_changed', { slots: picked.join(','), source: 'settings' });
		// Empty buttons close up, so a select can end up showing a page that moved to the other one
		// while its own value stayed '' and so never re-rendered
		await tick();
		slotSelects.forEach((select, i) => (select.value = slots[i]));
	}
</script>

<div class="prose dark:prose-invert">
	<h2 class="text-lg font-bold">Lisäasetukset</h2>
</div>
{#if install.canPrompt || install.needsManualSteps}
	<div class="flex flex-col gap-2">
		<p class="text-sm font-bold">Asenna sovellus</p>
		<p class="text-sm text-secondary">
			Asennettuna Alkometriikka aukeaa kotinäytöltä omaan ikkunaansa ja toimii myös ilman
			verkkoyhteyttä.
		</p>
		{#if install.canPrompt}
			<button class={twMerge(components.button())} onclick={() => install.prompt('settings')}>
				<Icon name="home_add" /> <span>Asenna</span>
			</button>
		{:else}
			<p class="text-sm">
				Napauta selaimen <span class="whitespace-nowrap"><b>Jaa</b>-painiketta</span> ja valitse
				<b class="whitespace-nowrap">Lisää Koti-valikkoon</b>.
			</p>
		{/if}
	</div>
{/if}
<div class="flex flex-col gap-2">
	<p class="text-sm font-bold">Teema</p>
	<div class="flex flex-row gap-0">
		<label
			for="system"
			class={twMerge(components.button(), 'rounded-e-none', 'has-checked:bg-secondary')}
		>
			<input type="radio" id="system" value={''} class="sr-only" bind:group={$theme} />
			<Icon name={$isMobile ? 'mobile' : $isLaptop ? 'laptop' : 'desktop'} />
			<span>Järjestelmä</span>
		</label>
		<label
			for="light"
			class={twMerge(components.button(), 'rounded-none border-x-0', 'has-checked:bg-secondary')}
		>
			<input type="radio" id="light" value={'light'} class="sr-only" bind:group={$theme} />
			<Icon name="sun" /> <span>Vaalea</span>
		</label>
		<label
			for="dark"
			class={twMerge(components.button(), 'rounded-s-none', 'has-checked:bg-secondary')}
		>
			<input type="radio" id="dark" value={'dark'} class="sr-only" bind:group={$theme} />
			<Icon name="moon" /> <span>Tumma</span>
		</label>
	</div>
</div>
<div class="flex flex-col gap-2">
	<p class="text-sm font-bold">Yläpalkin pikavalinnat</p>
	<p class="text-sm text-secondary">
		Valitse enintään kaksi sivua omiksi painikkeikseen yläpalkkiin. Voit myös kiinnittää sivuja
		Lisää-valikon nastasta.
	</p>
	<div class="flex flex-row gap-2">
		{#each slots as slot, index (index)}
			<select
				aria-label={`${index + 1}. pikavalinta`}
				bind:this={slotSelects[index]}
				value={slot}
				onchange={(event) => pickSlot(index, event.currentTarget.value as NavHref | '')}
				class={twMerge(components.input(), 'w-full')}
			>
				<option value="">Ei painiketta</option>
				{#each navGroups as group (group.label)}
					<optgroup label={group.label}>
						{#each group.items as item (item.href)}
							<option value={item.href}>{item.name}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		{/each}
	</div>
	{#if $headerSlots}
		<button class={twMerge(components.button())} onclick={() => ($headerSlots = null)}>
			<Icon name="reset" /> <span>Palauta oletukset</span>
		</button>
	{/if}
</div>
<div class="flex flex-col gap-2">
	<p class="text-sm font-bold">Vie / tuo tiedot</p>
	<p class="text-sm text-secondary">
		Tällä voit viedä tai tuoda paikallisesti tallennetut tiedot, kuten henkilökohtaiset tiedot ja
		mukautetut listat. Tiedot tallennetaan JSON-muodossa.
	</p>
	<div class="flex flex-row gap-2">
		<button
			class={twMerge(components.button())}
			onclick={() => {
				sendAnalyticsEvent('export_data');
				handleExport();
			}}
		>
			<Icon name="download" /> <span>Vie tiedot</span></button
		>

		<button
			class={twMerge(components.button())}
			onclick={() => {
				sendAnalyticsEvent('import_data');
				handleImport();
			}}
		>
			<Icon name="upload" /> <span>Tuo tiedot</span></button
		>
	</div>
</div>
<div class="flex flex-col gap-2">
	<p class="text-sm font-bold">Tyhjennä tiedot</p>
	<p class="text-sm text-secondary">
		Tämä poistaa kaikki paikallisesti tallennetut tiedot, kuten henkilökohtaiset tiedot ja
		mukautetut listat. Toiminto myös nollaa nykyisen Daily-putkesi. Tätä toimintoa ei voi perua.
	</p>
	<button
		class={twMerge(components.button({ type: 'negative' }))}
		onclick={() => {
			handleClearAll();
			dialogElement.close();
		}}
	>
		<Icon name="trash" /> <span>Tyhjennä</span></button
	>
</div>
<button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
	>Sulje</button
>
