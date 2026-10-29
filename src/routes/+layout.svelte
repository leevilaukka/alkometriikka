<script lang="ts">
	import { appPath } from '$lib/utils/app/paths';
	import { prefetchOnHover, prefetchOnPress } from '$lib/utils/app/imagePrefetch';
	import { resolve } from '$app/paths';
	import '../app.css';
	import { dev } from '$app/environment';
	import { ContextKeys, LocalStorageKeys } from '$lib/utils/constants/app';
	import {
		compareHighlightDifferences,
		compareProductIds,
		headerSlots,
		isMobile,
		isLaptop,
		lists,
		onlyPreferredStore,
		pageBottomBar,
		personalInfo,
		preferredStoreId,
		punchDraft,
		punchRecipes,
		searchQuery,
		theme,
		userLocation,
		watchlist
	} from '$lib/global.svelte';
	// Sized for the header's 40px at up to 3× pixel density; small enough to be inlined in the bundle
	import logo from '$lib/assets/images/Logo/120px/Logo_rounded.png';
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
	import CommandPalette from '$lib/components/widgets/CommandPalette.svelte';
	import NoticeBanner from '$lib/components/widgets/NoticeBanner.svelte';
	import ErrorBoundary from '$lib/components/widgets/ErrorBoundary.svelte';
	import Toast from '$lib/components/widgets/Toast.svelte';
	import InstallBanner from '$lib/components/widgets/InstallBanner.svelte';
	import { LocalStorageManager } from '$lib/utils/app/storage';
	import {
		currentNavHref,
		defaultHeaderSlots,
		navGroups,
		navItems,
		pinHeaderSlot,
		storedHeaderSlots,
		type NavItem
	} from '$lib/utils/app/nav';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { showToast } from '$lib/utils/app/toast.svelte';
	import { loadUpdateOnNavigate } from '$lib/utils/app/pwa.svelte';
	import { loadFlags } from '$lib/utils/flags/flags.svelte';
	import { resolvePreferredStore } from '$lib/utils/catalog/availability';
	import { watchStatuses } from '$lib/utils/user/watchlist';

	let { children, data } = $props();
	loadFlags();

	// The price list once loaded. Pages wait for it before rendering, except one whose load
	// returns a `preview` to show meanwhile (a product page opened from its prerendered stub)
	let alko = $state.raw<Awaited<typeof data.alko>>();
	let loadError = $state.raw<Error>();
	$effect(() => {
		data.alko.then(
			(value) => (alko = value),
			(error) => (loadError = error)
		);
	});
	// Once up, the app stays up: a page navigated to from a preview waits for the price list itself
	let showApp = $state(false);
	$effect(() => {
		if (alko || page.data.preview) showApp = true;
	});

	// Watched products that changed since the user last looked, for the menu's count
	const changedWatchCount = $derived(
		alko && watchlist.length
			? watchStatuses(
					watchlist,
					(id) => alko!.kaljakori.findById(id),
					alko.availabilityLoaded ? alko.availability : null,
					resolvePreferredStore(alko.availability.stores, $preferredStoreId, $userLocation)?.id
				).filter((status) => status.changes.length).length
			: 0
	);

	$effect(() => {
		if (showApp || loadError) shiftLoader();
	});
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
		if ($headerSlots) LocalStorageManager.setItem(LocalStorageKeys.HeaderSlots, $headerSlots);
		else LocalStorageManager.removeItem(LocalStorageKeys.HeaderSlots);
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
		LocalStorageManager.setItem(LocalStorageKeys.Watchlist, watchlist);
	});

	$effect(() => {
		LocalStorageManager.setItem(LocalStorageKeys.PunchDraft, punchDraft);
	});

	$effect(() => {
		LocalStorageManager.setItem(LocalStorageKeys.PunchRecipes, punchRecipes);
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
		if (type === 'popstate') $searchQuery = searchParamsManager.getParameter('q') ?? '';
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

	/** Whether a click or focus stays with the Lisää menu; the toast a pin in it brought up counts too */
	function staysInMenu(node: EventTarget | null) {
		return (
			node instanceof Element && (extraMenu?.contains(node) || !!node.closest('[role=status]'))
		);
	}

	function handleExtraMenuFocusout(event: FocusEvent) {
		if (extraMenu?.open && event.relatedTarget && !staysInMenu(event.relatedTarget))
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
		// The whole path, as what was clicked may have been re-rendered out of the page by now
		if (extraMenu?.open && !event.composedPath().some(staysInMenu)) extraMenu.open = false;
	}

	// The pages with their own header buttons; the Lisää menu keeps them too, so it stays the same everywhere
	const slots = $derived($headerSlots ?? defaultHeaderSlots);
	const slotItems = $derived(slots.map((href) => navItems.find((item) => item.href === href)!));
	const currentHref = $derived(currentNavHref(page.url.pathname));

	function togglePin(item: NavItem) {
		const pinned = slots.includes(item.href);
		const { slots: next, unpinned } = pinned
			? { slots: slots.filter((href) => href !== item.href), unpinned: undefined }
			: pinHeaderSlot(slots, item.href);
		$headerSlots = storedHeaderSlots(next);
		sendAnalyticsEvent('header_slots_changed', { slots: next.join(','), source: 'menu' });
		// The pin icons show the rest; only a page dropping off the header needs saying
		const replaced = navItems.find((navItem) => navItem.href === unpinned)?.name;
		if (replaced) showToast({ text: `${item.name} korvasi ${replaced}-painikkeen yläpalkissa` });
	}

	const inCategory = $derived(page.route.id === '/kategoriat/[type]/[[subtype]]');

	const noSearchPages: (typeof page.route.id)[] = [
		'/daily/arkisto',
		'/laskin',
		'/boolilaskuri',
		'/tilastot',
		'/listat',
		'/daily',
		'/daily/arkisto/[date]',
		'/tuotteet/[...id]',
		'/vertailu',
		'/kategoriat',
		'/myymalat',
		'/myymalat/[storeID]',
		'/seuratut'
	];
	const hasSearch = $derived(page.route.id === null || !noSearchPages.includes(page.route.id));

	let commandPalette = $state<ReturnType<typeof CommandPalette>>();
	const paletteShortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';
</script>

<svelte:window
	onclick={handleDocumentClick}
	onkeydown={handleGlobalKeydown}
	onpointerover={prefetchOnHover}
	onpointerdown={prefetchOnPress}
/>

<!-- A page already showing its preview stays up, with a notice, when the price list fails -->
{#if loadError && !showApp}
	<div class="grid h-full max-h-full w-full place-content-center overflow-hidden">
		<div class="flex flex-col items-center gap-3">
			<p>Virhe datan lataamisessa: {loadError.message}</p>
			<button class="rounded bg-brand-1 px-4 py-2 text-white" onclick={() => location.reload()}>
				Yritä uudelleen
			</button>
		</div>
	</div>
{:else if showApp}
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
			<a href={resolve('/')} class="flex shrink-0 flex-row items-center gap-3 bg-primary">
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
				{#if alko}
					<ErrorBoundary name="command_palette">
						<CommandPalette
							bind:this={commandPalette}
							kaljakori={alko.kaljakori}
							availability={alko.availability}
							showButton={!hasSearch}
						/>
					</ErrorBoundary>
				{/if}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<details
					bind:this={extraMenu}
					class="relative"
					onkeydown={handleExtraMenuKeydown}
					onfocusout={handleExtraMenuFocusout}
				>
					<summary
						aria-label={changedWatchCount
							? `Lisää, ${changedWatchCount} seuratussa tuotteessa muutoksia`
							: 'Lisää'}
						class={twMerge(components.button(), 'relative list-none p-2 text-xl')}
					>
						{#if !$isMobile}<span class="text-sm">Lisää</span>{/if}<Icon name="menu" />
						{#if changedWatchCount}
							<span
								class="absolute -end-1 -top-1 size-2.5 rounded-full bg-green-600 ring-2 ring-white dark:ring-zinc-900"
							></span>
						{/if}
					</summary>
					<div
						class="absolute end-0 top-full z-20 mt-2 flex w-56 flex-col rounded border border-primary bg-primary p-1.5 shadow-lg"
					>
						{#each navGroups as group, index (group.label)}
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
									{@const pinned = slots.includes(item.href)}
									<li class="flex items-center gap-0.5">
										<a
											href={appPath(item.href)}
											onclick={closeExtraMenu}
											aria-current={item.href === currentHref ? 'page' : undefined}
											class="flex flex-1 items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-secondary aria-[current=page]:bg-secondary aria-[current=page]:font-semibold"
										>
											<Icon name={item.icon} class="text-base" />
											<span class="flex-1">{item.name}</span>
											{#if item.href === '/seuratut/' && changedWatchCount}
												<span
													class="rounded-full bg-green-700 px-1.5 text-xs font-semibold text-white"
													title="Muuttuneita seurattuja tuotteita">{changedWatchCount}</span
												>
											{/if}
										</a>
										<button
											type="button"
											aria-pressed={pinned}
											aria-label={`Kiinnitä ${item.name} yläpalkkiin`}
											title={pinned ? 'Irrota yläpalkista' : 'Kiinnitä yläpalkkiin'}
											onclick={() => togglePin(item)}
											class="rounded p-1.5 text-sm text-secondary opacity-60 hover:bg-secondary hover:opacity-100 aria-pressed:text-inherit aria-pressed:opacity-100"
										>
											<Icon name={pinned ? 'pin' : 'pin_alt'} />
										</button>
									</li>
								{/each}
							</ul>
						{/each}
					</div>
				</details>
				{#each slotItems as item (item.href)}
					{@const watchChanges = item.href === '/seuratut/' ? changedWatchCount : 0}
					<a
						href={appPath(item.href)}
						aria-current={item.href === currentHref ? 'page' : undefined}
						aria-label={watchChanges
							? `${item.name}, ${watchChanges} tuotteessa muutoksia`
							: item.name}
						class={twMerge(
							components.button(),
							'relative p-2 text-xl aria-[current=page]:bg-secondary'
						)}
						>{#if !$isMobile}<span class="text-sm"
								>{'shortName' in item ? item.shortName : item.name}</span
							>{/if}<Icon name={item.icon} />
						{#if watchChanges}
							<span
								class="absolute -end-1 -top-1 size-2.5 rounded-full bg-green-600 ring-2 ring-white dark:ring-zinc-900"
							></span>
						{/if}
					</a>
				{/each}
				<ErrorBoundary name="settings">
					<Settings {alko} />
				</ErrorBoundary>
			</div>
		</header>
		{#if alko}
			<ErrorBoundary name="notice_banner">
				<NoticeBanner lastSynced={alko.dataset.metadata.LastSynced} cached={alko.cached} />
			</ErrorBoundary>
		{:else if loadError}
			<div
				role="alert"
				class="flex items-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
			>
				<Icon name="alert_triangle" class="shrink-0" />
				<p class="flex-1">Hinnastoa ei saatu ladattua, joten osa tiedoista puuttuu.</p>
				<button
					type="button"
					class="shrink-0 font-semibold underline"
					onclick={() => location.reload()}>Yritä uudelleen</button
				>
			</div>
		{/if}
		<ErrorBoundary name="install_banner">
			<InstallBanner />
		</ErrorBoundary>
		<!-- The page's one main landmark; pages render plain containers inside it -->
		<main
			id="main-content"
			tabindex="-1"
			class="flex max-h-full flex-auto flex-col overflow-x-hidden overflow-y-auto outline-none"
		>
			<ErrorBoundary name={page.route.id ?? 'page'} fallback="page" resetKey={page.url.pathname}>
				{@render children?.()}
			</ErrorBoundary>
		</main>
		<!-- Toasts float above the bars below -->
		<div class="relative">
			<ErrorBoundary name="toast">
				<Toast />
			</ErrorBoundary>
		</div>
		{#if alko && page.route.id !== '/vertailu'}
			<ErrorBoundary name="compare_bar">
				<CompareBar kaljakori={alko.kaljakori} />
			</ErrorBoundary>
		{/if}
		<!-- Pages hand their mobile action bar here (see pageBottomBar) so it sits below the compare bar -->
		<ErrorBoundary name="page_bottom_bar">
			{@render pageBottomBar.snippet?.()}
		</ErrorBoundary>
	</div>
{/if}
