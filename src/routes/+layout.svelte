<script lang="ts">
	import '../app.css';
	import { dev } from '$app/environment';
	import { ContextKeys, LocalStorageKeys } from '$lib/utils/constants';
	import {
		compareProductIds,
		isMobile,
		isLaptop,
		lists,
		onlyPreferredStore,
		pageBottomBar,
		personalInfo,
		preferredStoreId,
		searchQuery,
		theme,
		userLocation
	} from '$lib/global.svelte';
	import logo from '$lib/assets/images/Logo/0.5x/Logo_rounded@0.5x.png';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { SearchParamsManager } from '$lib/utils/url';
	import { markRouterReady, shareTypeFromRoute, trackSharedView } from '$lib/utils/helpers';
	import { setContext } from 'svelte';
	import Settings from '$lib/components/widgets/Settings/Index.svelte';
	import CompareBar from '$lib/components/widgets/CompareBar.svelte';
	import CommandPalette from '$lib/components/widgets/CommandPalette.svelte';
	import { LocalStorageManager } from '$lib/utils/storage';
	import type { IconName } from '$lib/icons';

	let { children, data } = $props();
	let searchParamsManager = new SearchParamsManager(page.url);
	setContext(ContextKeys.SearchParamsManager, searchParamsManager);

	$effect(() => {
		LocalStorageManager.setItem(LocalStorageKeys.PersonalInfo, personalInfo);
	});

	$effect(() => {
		LocalStorageManager.setItem(LocalStorageKeys.Lists, lists);
	});

	$effect(() => {
		LocalStorageManager.setItem(LocalStorageKeys.Theme, $theme);
	});

	$effect(() => {
		LocalStorageManager.setItem(LocalStorageKeys.PreferredStore, $preferredStoreId);
	});

	$effect(() => {
		LocalStorageManager.setItem(LocalStorageKeys.OnlyPreferredStore, $onlyPreferredStore);
	});

	$effect(() => {
		LocalStorageManager.setItem(LocalStorageKeys.CompareProducts, compareProductIds);
	});

	$effect(() => {
		if ($userLocation) LocalStorageManager.setItem(LocalStorageKeys.UserLocation, $userLocation);
	});

	$effect(() => {
		trackSharedView(shareTypeFromRoute(page.route.id));
	});

	const mql = window.matchMedia('(prefers-color-scheme: dark)');

	function handleDarkModeChange(event: MediaQueryListEvent) {
		if (event.matches) document.documentElement.classList.add('dark');
		else document.documentElement.classList.remove('dark');
	}

	theme.subscribe((value) => {
		mql.removeEventListener('change', handleDarkModeChange);
		if (value === 'dark') document.documentElement.classList.add('dark');
		else if (value === 'light') document.documentElement.classList.remove('dark');
		else {
			if (mql.matches) document.documentElement.classList.add('dark');
			else document.documentElement.classList.remove('dark');
			mql.addEventListener('change', handleDarkModeChange);
		}
	});

	window.addEventListener('resize', () => {
		$isMobile = window.matchMedia('(width < 48rem)').matches;
		$isLaptop = window.matchMedia('(width < 1280px)').matches;
	});

	beforeNavigate(({ to, type }) => {
		if (!to) return;
		if (to.url.origin !== window.location.origin) return;
		searchParamsManager.setParametersFromURL(to.url);
		// Back/forward restores the search from the URL before the page mounts, otherwise the
		// page would sync an empty search into the URL first
		if (type === 'popstate') $searchQuery = to.url.searchParams.get('q') ?? '';
		searchParamsManager.update();
	});

	afterNavigate(({ from, to, type }) => {
		markRouterReady();
		// Feed links baked into prerendered pages belong to the first page only; from here on
		// each page adds its own through <svelte:head>, so drop them to avoid stale duplicates
		document.head.querySelectorAll('link[data-prerendered]').forEach((link) => link.remove());
		// The search belongs to the page it was typed on, so any path change other than
		// back/forward drops it. Done after navigating so the page being left keeps its q.
		// The initial load ('enter') has no previous page (`from.url` is null) and keeps ?q= from the link.
		if (type !== 'enter' && type !== 'popstate' && from?.url?.pathname !== to?.url?.pathname)
			$searchQuery = '';
	});

	function shiftLoader() {
		document.getElementById('main-loader')?.classList.add('shift');
	}

	let extraMenu = $state<HTMLDetailsElement>();
	function closeExtraMenu() {
		if (extraMenu) extraMenu.open = false;
	}

	function handleExtraMenuKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !extraMenu?.open) return;
		extraMenu.open = false;
		extraMenu.querySelector('summary')?.focus();
	}

	function handleExtraMenuFocusout(event: FocusEvent) {
		if (extraMenu?.open && event.relatedTarget && !extraMenu.contains(event.relatedTarget as Node))
			extraMenu.open = false;
	}

	function skipToContent(event: MouseEvent) {
		event.preventDefault();
		document.getElementById('main-content')?.focus();
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
		if (
			(event.target as HTMLElement | null)?.closest(
				'input, textarea, select, dialog, [contenteditable]'
			)
		)
			return;
		const search = document.getElementById('searchQuery');
		if (!search) return;
		event.preventDefault();
		search.focus();
	}

	function handleDocumentClick(event: MouseEvent) {
		if (extraMenu?.open && !event.composedPath().includes(extraMenu)) extraMenu.open = false;
	}

	const extraItems: { href: string; icon: IconName; name: string }[] = [
		{
			href: '/kategoriat/',
			icon: 'wine',
			name: 'Kategoriat'
		},
		{
			href: '/hinnanmuutokset',
			icon: 'trending_down',
			name: 'Hinnanmuutokset'
		},
		{
			href: '/myymalat',
			icon: 'store',
			name: 'Myymälät'
		},
		{
			href: '/daily/arkisto',
			icon: 'archive',
			name: 'Daily-arkisto'
		},
		{
			href: '/laskin',
			icon: 'calculator',
			name: 'Laskin'
		},
		{
			href: '/tilastot',
			icon: 'stats',
			name: 'Tilastot'
		}
	];

	const inCategory = $derived(page.route.id === '/kategoriat/[type]/[[subtype]]');

	const noSearchPages: (typeof page.route.id)[] = [
		'/daily/arkisto',
		'/laskin',
		'/tilastot',
		'/listat',
		'/daily',
		'/daily/arkisto/[date]',
		'/tuotteet/[...id]',
		'/vertailu',
		'/kategoriat',
		'/myymalat',
		'/myymalat/[storeID]'
	];
	const hasSearch = $derived(page.route.id === null || !noSearchPages.includes(page.route.id));

	let commandPalette = $state<ReturnType<typeof CommandPalette>>();
	const paletteShortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';
</script>

<svelte:window onclick={handleDocumentClick} onkeydown={handleGlobalKeydown} />

{#await data.alko then alko}
	{shiftLoader()}
	<div class="flex h-full w-full flex-col">
		{#if dev}
			<span class="bg-brand-3 px-1.5 py-0.5 text-center text-sm text-white">DEV</span>
		{/if}
		<a
			href="#main-content"
			onclick={skipToContent}
			class="sr-only bg-primary px-4 py-2 font-bold focus:not-sr-only">Siirry sisältöön</a
		>
		<header
			class="relative flex h-fit items-center gap-2 border-b border-primary bg-primary px-4 py-2 md:gap-4"
		>
			<a href="/" class="flex shrink-0 flex-row items-center gap-3 bg-primary">
				<img
					src={logo}
					alt="Alkometriikka Logo"
					class="aspect-square h-10 rounded object-contain"
				/>
				<span class="hidden text-[1.75rem] text-brand-3 sm:block dark:text-white"
					>Alkometriikka</span
				>
			</a>
			{#if hasSearch}
				<div class={twMerge('flex w-full flex-row', 'rounded border border-primary')}>
					<button
						type="button"
						onclick={() => commandPalette?.openPalette()}
						aria-label="Hae kaikkialta"
						title={`Hae kaikkialta (${paletteShortcut})`}
						class={twMerge(
							components.button(),
							'aspect-square border-0 bg-white text-black',
							'p-2 text-xl',
							'rounded-e-none border-e-0'
						)}
					>
						<Icon name="search" />
					</button>
					<div class="relative flex w-full">
						<input
							id="searchQuery"
							type="text"
							aria-label={inCategory ? 'Hae nimellä tästä kategoriasta' : 'Hae nimellä'}
							aria-keyshortcuts="/"
							bind:value={$searchQuery}
							class={twMerge(
								components.input(),
								'peer text-md w-full gap-2 rounded-s-none border-0 border-s hover:border-primary lg:pe-9'
							)}
							placeholder={inCategory ? 'Hae tästä kategoriasta...' : 'Hae nimellä...'}
						/>
						<kbd
							class="pointer-events-none absolute end-2 top-1/2 hidden size-5 -translate-y-1/2 items-center justify-center rounded border border-current text-[11px] leading-none font-semibold text-secondary peer-focus:hidden lg:flex"
							>/</kbd
						>
					</div>
				</div>
			{/if}
			<div class="ms-auto flex items-center gap-2">
				<CommandPalette
					bind:this={commandPalette}
					kaljakori={alko.kaljakori}
					availability={alko.availability}
					showButton={!hasSearch}
				/>
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<details
					bind:this={extraMenu}
					class="relative"
					onkeydown={handleExtraMenuKeydown}
					onfocusout={handleExtraMenuFocusout}
				>
					<summary aria-label="Lisää" class={twMerge(components.button(), 'list-none p-2 text-xl')}>
						{#if !$isMobile}<span class="text-sm">Lisää</span>{/if}<Icon name="menu" />
					</summary>
					<div
						class="absolute end-0 top-full z-20 mt-2 flex min-w-40 flex-col gap-1 rounded border border-primary bg-primary p-1 shadow-lg"
					>
						{#each extraItems as item}
							<a
								href={item.href}
								onclick={closeExtraMenu}
								class={twMerge(components.button(), 'w-full justify-start')}
							>
								<Icon name={item.icon} />
								<span>{item.name}</span>
							</a>
						{/each}
					</div>
				</details>
				<a href="/daily" aria-label="Daily" class={twMerge(components.button(), 'p-2 text-xl')}
					>{#if !$isMobile}<span class="text-sm">Daily</span>{/if}<Icon name="flame" /></a
				>
				<a href="/listat" aria-label="Listat" class={twMerge(components.button(), 'p-2 text-xl')}
					>{#if !$isMobile}<span class="text-sm">Listat</span>{/if}<Icon name="list_ul" /></a
				>
				<Settings {alko} />
			</div>
		</header>
		<div
			id="main-content"
			tabindex="-1"
			class="flex max-h-full flex-auto flex-col overflow-x-hidden overflow-y-auto outline-none"
		>
			{@render children?.()}
		</div>
		{#if page.route.id !== '/vertailu'}
			<CompareBar kaljakori={alko.kaljakori} />
		{/if}
		<!-- Pages hand their mobile action bar here (see pageBottomBar) so it sits below the compare bar -->
		{@render pageBottomBar.snippet?.()}
	</div>
{:catch error}
	{shiftLoader()}
	<div class="grid h-full max-h-full w-full place-content-center overflow-hidden">
		<div class="flex flex-col items-center gap-3">
			<p>Virhe datan lataamisessa: {error.message}</p>
			<button class="rounded bg-brand-1 px-4 py-2 text-white" onclick={() => location.reload()}>
				Yritä uudelleen
			</button>
		</div>
	</div>
{/await}
