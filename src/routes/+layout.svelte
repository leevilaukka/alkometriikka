<script lang="ts">
	import { appPath } from '$lib/utils/app/paths';
	import { resolve } from '$app/paths';
	import '../app.css';
	import { dev } from '$app/environment';
	import { ContextKeys, LocalStorageKeys } from '$lib/utils/constants/app';
	import {
		compareHighlightDifferences,
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
	import { components } from '$lib/utils/ui/styles';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { SearchParamsManager } from '$lib/utils/app/url';
	import { markRouterReady } from '$lib/utils/app/url';
	import { shareTypeFromRoute, trackSharedView } from '$lib/utils/app/share';
	import { setContext } from 'svelte';
	import Settings from '$lib/components/widgets/Settings/Index.svelte';
	import CompareBar from '$lib/components/widgets/CompareBar.svelte';
	import NoticeBanner from '$lib/components/widgets/NoticeBanner.svelte';
	import InstallBanner from '$lib/components/widgets/InstallBanner.svelte';
	import { LocalStorageManager } from '$lib/utils/app/storage';
	import type { IconName } from '$lib/icons';
	import { loadUpdateOnNavigate } from '$lib/utils/app/pwa.svelte';
	import { loadFlags } from '$lib/utils/flags/flags.svelte';
	import LanguageBanner from '$lib/components/widgets/LanguageBanner.svelte';
	import { intlLocale, locale, m } from '$lib/i18n';

	let { children, data } = $props();
	loadFlags();
	document.documentElement.lang = locale;
	document
		.querySelector('meta[property="og:locale"]')
		?.setAttribute('content', intlLocale.replace('-', '_'));
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
		LocalStorageManager.setItem(
			LocalStorageKeys.CompareHighlightDifferences,
			$compareHighlightDifferences
		);
	});

	$effect(() => {
		if ($userLocation) LocalStorageManager.setItem(LocalStorageKeys.UserLocation, $userLocation);
	});

	$effect(() => {
		trackSharedView(shareTypeFromRoute(page.route.id));
	});

	const mql = window.matchMedia('(prefers-color-scheme: dark)');

	/**
	 * Colours the browser and system bars like the header under them. Until the loader is gone,
	 * app.html's own theme-color tags match the loader instead, which follows the OS scheme
	 */
	function syncThemeColor() {
		if (!document.getElementById('main-loader')?.classList.contains('shift')) return;
		const color = document.documentElement.classList.contains('dark') ? '#18181b' : '#ffffff';
		for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
			meta.content = color;
	}

	function handleDarkModeChange(event: MediaQueryListEvent) {
		if (event.matches) document.documentElement.classList.add('dark');
		else document.documentElement.classList.remove('dark');
		syncThemeColor();
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
		syncThemeColor();
	});

	window.addEventListener('resize', () => {
		$isMobile = window.matchMedia('(width < 48rem)').matches;
		$isLaptop = window.matchMedia('(width < 1280px)').matches;
	});

	beforeNavigate((navigation) => {
		loadUpdateOnNavigate(navigation);
		const { to, type } = navigation;
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
		syncThemeColor();
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

	type MenuItem = { href: string; icon: IconName; name: string };
	const menuGroups: { label: string; items: MenuItem[] }[] = [
		{
			label: m.nav_group_browse(),
			items: [
				{ href: '/kategoriat/', icon: 'wine', name: m.nav_categories() },
				{ href: '/hinnanmuutokset/', icon: 'trending_down', name: m.nav_price_changes() },
				{ href: '/tilastot/', icon: 'stats', name: m.nav_stats() }
			]
		},
		{
			label: m.nav_group_personal(),
			items: [{ href: '/listat/', icon: 'list_ul', name: m.nav_lists() }]
		},
		{
			label: m.nav_group_stores(),
			items: [
				{ href: '/myymalat/', icon: 'store', name: m.nav_stores() },
				{ href: '/kompassi/', icon: 'compass', name: m.nav_compass() }
			]
		},
		{
			label: m.nav_group_tools(),
			items: [
				{ href: '/laskin/', icon: 'calculator', name: m.nav_calculator() },
				{ href: '/daily/arkisto/', icon: 'archive', name: m.nav_daily_archive() }
			]
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
			class="sr-only bg-primary px-4 py-2 font-bold focus:not-sr-only"
			>{m.layout_skip_to_content()}</a
		>
		<header
			class="relative flex h-fit items-center gap-2 border-b border-primary bg-primary px-4 py-2 md:gap-4"
		>
			<a href={resolve('/')} class="flex shrink-0 flex-row items-center gap-3 bg-primary">
				<img
					src={logo}
					alt={m.layout_logo_alt()}
					class="aspect-square h-10 rounded object-contain"
				/>
				<span class="hidden text-[1.75rem] text-brand-3 sm:block dark:text-white"
					>Alkometriikka</span
				>
			</a>
			{#if page.route.id === null || !noSearchPages.includes(page.route.id)}
				<div class={twMerge('flex w-full flex-row', 'rounded border border-primary')}>
					<div
						class={twMerge(
							components.button(),
							'aspect-square border-0 bg-white text-black',
							'p-2 text-xl',
							'rounded-e-none border-e-0'
						)}
					>
						<Icon name="search" />
					</div>
					<div class="relative flex w-full">
						<input
							id="searchQuery"
							type="text"
							aria-label={inCategory ? m.search_in_category_label() : m.search_by_name_label()}
							aria-keyshortcuts="/"
							bind:value={$searchQuery}
							class={twMerge(
								components.input(),
								'peer text-md w-full gap-2 rounded-s-none border-0 border-s hover:border-primary lg:pe-9'
							)}
							placeholder={inCategory
								? m.search_in_category_placeholder()
								: m.search_by_name_placeholder()}
						/>
						<kbd
							class="pointer-events-none absolute end-2 top-1/2 hidden size-5 -translate-y-1/2 items-center justify-center rounded border border-current text-[11px] leading-none font-semibold text-secondary peer-focus:hidden lg:flex"
							>/</kbd
						>
					</div>
				</div>
			{/if}
			<div class="ms-auto flex items-center gap-2">
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<details
					bind:this={extraMenu}
					class="relative"
					onkeydown={handleExtraMenuKeydown}
					onfocusout={handleExtraMenuFocusout}
				>
					<summary
						aria-label={m.nav_more()}
						class={twMerge(components.button(), 'list-none p-2 text-xl')}
					>
						{#if !$isMobile}<span class="text-sm">{m.nav_more()}</span>{/if}<Icon name="menu" />
					</summary>
					<div
						class="absolute end-0 top-full z-20 mt-2 flex w-56 flex-col rounded border border-primary bg-primary p-1.5 shadow-lg"
					>
						{#each menuGroups as group, index (group.label)}
							<p
								id={`menu-${index}`}
								class={twMerge(
									'px-2 pb-1 text-xs font-semibold tracking-wide text-secondary uppercase',
									index > 0 ? 'mt-1.5 border-t border-primary pt-2.5' : 'pt-1'
								)}
							>
								{group.label}
							</p>
							<ul aria-labelledby={`menu-${index}`}>
								{#each group.items as item (item.href)}
									<li>
										<a
											href={appPath(item.href)}
											onclick={closeExtraMenu}
											aria-current={page.url.pathname.startsWith(appPath(item.href))
												? 'page'
												: undefined}
											class="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-secondary aria-[current=page]:bg-secondary aria-[current=page]:font-semibold"
										>
											<Icon name={item.icon} class="text-base" />
											<span class="flex-1">{item.name}</span>
										</a>
									</li>
								{/each}
							</ul>
						{/each}
					</div>
				</details>
				<a
					href={resolve('/daily/')}
					aria-label={m.nav_daily()}
					class={twMerge(components.button(), 'p-2 text-xl')}
					>{#if !$isMobile}<span class="text-sm">{m.nav_daily()}</span>{/if}<Icon name="flame" /></a
				>
				<a
					href={resolve('/listat/')}
					aria-label={m.nav_lists()}
					class={twMerge(components.button(), 'p-2 text-xl')}
					>{#if !$isMobile}<span class="text-sm">{m.nav_lists()}</span>{/if}<Icon
						name="list_ul"
					/></a
				>
				<Settings {alko} />
			</div>
		</header>
		<NoticeBanner lastSynced={alko.dataset.metadata.LastSynced} cached={alko.cached} />
		<InstallBanner />
		<LanguageBanner />
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
			<p>{m.layout_load_error({ message: error.message })}</p>
			<button class="rounded bg-brand-1 px-4 py-2 text-white" onclick={() => location.reload()}>
				{m.common_retry()}
			</button>
		</div>
	</div>
{/await}
