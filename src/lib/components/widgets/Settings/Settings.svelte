<script lang="ts">
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import { isLaptop, isMobile, theme } from '$lib/global.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { handleClearAll, handleExport, handleImport } from '$lib/utils/app/backup';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { install } from '$lib/utils/app/pwa.svelte';
	import { LOCALE_NAMES, locale, locales, m, setLocale, type Locale } from '$lib/i18n';
	import { dismissLanguageBanner } from '$lib/utils/app/language';
	let { dialogElement } = $props();

	function changeLocale(next: Locale) {
		if (next === locale) return;
		sendAnalyticsEvent('change_language', { from: locale, to: next, location: 'settings' });
		dismissLanguageBanner();
		// Reloads the page in the new language
		setLocale(next);
	}
</script>

<div class="prose dark:prose-invert">
	<h2 class="text-lg font-bold">{m.settings_more_title()}</h2>
</div>
<div class="flex flex-col gap-2">
	<!-- In every language, so it can be found whichever one is on -->
	<p class="text-sm font-bold" lang="">Kieli · Language · Språk</p>
	<div class="flex flex-row gap-0">
		{#each locales as option, index (option)}
			<label
				class={twMerge(
					components.button(),
					index === 0
						? 'rounded-e-none'
						: index === locales.length - 1
							? 'rounded-s-none'
							: 'rounded-none border-x-0',
					'has-checked:bg-secondary'
				)}
				lang={option}
			>
				<input
					type="radio"
					name="locale"
					value={option}
					class="sr-only"
					checked={option === locale}
					onchange={() => changeLocale(option)}
				/>
				<span>{LOCALE_NAMES[option]}</span>
			</label>
		{/each}
	</div>
	{#if locale !== 'fi'}
		<p class="text-xs text-secondary">{m.settings_language_note()}</p>
	{/if}
</div>
{#if install.canPrompt || install.needsManualSteps}
	<div class="flex flex-col gap-2">
		<p class="text-sm font-bold">{m.settings_install_title()}</p>
		<p class="text-sm text-secondary">{m.settings_install_description()}</p>
		{#if install.canPrompt}
			<button class={twMerge(components.button())} onclick={() => install.prompt('settings')}>
				<Icon name="home_add" /> <span>{m.install_button()}</span>
			</button>
		{:else}
			<p class="text-sm">
				{m.install_ios_steps_before()}
				<b class="whitespace-nowrap">{m.install_ios_share_button()}</b>
				{m.install_ios_steps_middle()}
				<b class="whitespace-nowrap">{m.install_ios_add_to_home()}</b>{m.install_ios_steps_after()}
			</p>
		{/if}
	</div>
{/if}
<div class="flex flex-col gap-2">
	<p class="text-sm font-bold">{m.settings_theme()}</p>
	<div class="flex flex-row gap-0">
		<label
			for="system"
			class={twMerge(components.button(), 'rounded-e-none', 'has-checked:bg-secondary')}
		>
			<input type="radio" id="system" value={''} class="sr-only" bind:group={$theme} />
			<Icon name={$isMobile ? 'mobile' : $isLaptop ? 'laptop' : 'desktop'} />
			<span>{m.settings_theme_system()}</span>
		</label>
		<label
			for="light"
			class={twMerge(components.button(), 'rounded-none border-x-0', 'has-checked:bg-secondary')}
		>
			<input type="radio" id="light" value={'light'} class="sr-only" bind:group={$theme} />
			<Icon name="sun" /> <span>{m.settings_theme_light()}</span>
		</label>
		<label
			for="dark"
			class={twMerge(components.button(), 'rounded-s-none', 'has-checked:bg-secondary')}
		>
			<input type="radio" id="dark" value={'dark'} class="sr-only" bind:group={$theme} />
			<Icon name="moon" /> <span>{m.settings_theme_dark()}</span>
		</label>
	</div>
</div>
<div class="flex flex-col gap-2">
	<p class="text-sm font-bold">{m.settings_backup_title()}</p>
	<p class="text-sm text-secondary">{m.settings_backup_description()}</p>
	<div class="flex flex-row gap-2">
		<button
			class={twMerge(components.button())}
			onclick={() => {
				sendAnalyticsEvent('export_data');
				handleExport();
			}}
		>
			<Icon name="download" /> <span>{m.settings_export()}</span></button
		>

		<button
			class={twMerge(components.button())}
			onclick={() => {
				sendAnalyticsEvent('import_data');
				handleImport();
			}}
		>
			<Icon name="upload" /> <span>{m.settings_import()}</span></button
		>
	</div>
</div>
<div class="flex flex-col gap-2">
	<p class="text-sm font-bold">{m.settings_clear_title()}</p>
	<p class="text-sm text-secondary">{m.settings_clear_description()}</p>
	<button
		class={twMerge(components.button({ type: 'negative' }))}
		onclick={() => {
			handleClearAll();
			dialogElement.close();
		}}
	>
		<Icon name="trash" /> <span>{m.settings_clear_button()}</span></button
	>
</div>
<button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
	>{m.common_close()}</button
>
