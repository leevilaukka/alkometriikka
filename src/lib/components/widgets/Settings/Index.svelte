<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import { isMobile } from '$lib/global.svelte';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { version } from '$app/environment';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import type { AvailabilityStore } from '$lib/types';
	import { onSettingsOpenRequested } from '$lib/utils/settings';
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { type IconName } from '$lib/icons';
	import Info from './Info.svelte';
	import Settings from './Settings.svelte';
	import PersonalInfo from './PersonalInfo.svelte';

	// Define the available tabs for the settings dialog
	// Each tab has an id, label, icon, and associated Svelte component
	const tabs = [
		{ id: 'personal', label: 'Henkilökohtaiset tiedot', icon: 'user', component: PersonalInfo },
		{ id: 'settings', label: 'Lisäasetukset', icon: 'cog', component: Settings },
		{ id: 'info', label: 'Tietoa', icon: 'info_circle', component: Info }
	] as const satisfies readonly {
		id: string;
		label: string;
		icon: IconName;
		component: Component<any>;
	}[];

	type tabId = typeof tabs[number]['id'];

	let tab = $state<tabId>('personal');
	let dialogElement: HTMLDialogElement | undefined = $state();

	const gitCommitHash = version.substring(0, 7);

	function openSettings() {
		tab = 'personal';
		sendAnalyticsEvent('open_settings');
		if (dialogElement && !dialogElement.open) dialogElement.showModal();
	}

	onMount(() => onSettingsOpenRequested(openSettings));

	const { alko }: { alko: any } = $props();
	const stores = $derived(
		(Object.values(alko.availability.stores) as AvailabilityStore[]).sort((a, b) =>
			a.name.localeCompare(b.name, 'fi', { sensitivity: 'base' })
		)
	);

	const githubRepoBase = 'https://github.com/leevilaukka/alkometriikka';
	const githubFileBase = 'https://raw.githubusercontent.com/leevilaukka/alkometriikka/refs/heads/gh-pages';
</script>

<Popup bind:dialogElement class="gap-4 p-4">
	{#snippet renderButton(dialogElement: HTMLDialogElement)}
		<button
			class={twMerge(components.button(), 'p-2 text-xl')}
			onclick={openSettings}
		>
			{#if !$isMobile}<span class="text-sm">Asetukset</span>{/if}<Icon name="cog" />
		</button>
	{/snippet}
	{#snippet renderContent(dialogElement: HTMLDialogElement)}
		<div class="flex flex-row gap-2">
			{#each tabs as tabOption}
				<label
					for={tabOption.id}
					class={twMerge(components.button(), 'w-full', 'has-checked:bg-secondary')}
				>
					<input
						type="radio"
						id={tabOption.id}
						name="tab"
						class="hidden"
						value={tabOption.id}
						bind:group={tab}
					/>
					<Icon name={tabOption.icon} />
					{#if !$isMobile}<span class="text-sm">{tabOption.label}</span>{/if}
				</label>
			{/each}
		</div>
		<!-- Render the active tab component, sourced from the tabs array -->
		{@const ActiveTab = tabs.find(tabOption => tabOption.id === tab)?.component}
		{#if ActiveTab}
			<ActiveTab
				dialogElement={dialogElement}
				stores={stores}
				alko={alko}
				githubRepoBase={githubRepoBase}
				githubFileBase={githubFileBase}
				gitCommitHash={gitCommitHash}
			></ActiveTab>
		{/if}
	{/snippet}
</Popup>
