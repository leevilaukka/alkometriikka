<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import type { Kaljakori } from '$lib/alko';
	import type { AvailabilityData, ListObj, PriceListItem } from '$lib/types';
	import type { IconName } from '$lib/icons';
	import { compareProductIds, isMobile, lists, preferredStoreId, searchQuery, theme, userLocation } from '$lib/global.svelte';
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { addToList, createList, getItemQuantity, listToURI } from '$lib/utils/lists';
	import { clearCompare, compareURL, isInCompare, MAX_COMPARE_PRODUCTS, toggleCompare } from '$lib/utils/compare';
	import { resolvePreferredStore } from '$lib/utils/availability';
	import { requestSettingsOpen } from '$lib/utils/settings';
	import { handleShare, sendAnalyticsEvent, shareTypeFromRoute } from '$lib/utils/helpers';
	import {
		normalizeSearchText,
		parseScopePrefix,
		rankEntries,
		SCOPE_PREFIXES,
		type SearchEntry,
		type SearchScope
	} from '$lib/utils/commandPalette';
	import { components } from '$lib/utils/styles';
	import Icon from './Icon.svelte';
	import ProductImage from './ProductImage.svelte';
	import SiteFeedback from './Settings/SiteFeedback.svelte';

	let {
		kaljakori,
		availability,
		showButton = true
	}: {
		kaljakori: Kaljakori;
		availability: AvailabilityData;
		/** Hidden where the header search bar's icon opens the palette instead */
		showButton?: boolean;
	} = $props();

	type Kind = SearchScope;

	type PaletteItem = {
		id: string;
		kind: Kind;
		label: string;
		detail?: string;
		badge?: string;
		icon?: IconName;
		/** Product number, shows the product's image instead of an icon */
		productNumber?: string;
		href?: string;
		/** Opens `href` in a new tab */
		external?: boolean;
		/** Runs with the palette closed, unless `stay` is set */
		run?: () => void | string | Promise<void | string>;
		/** Keep the palette open while `run` runs; a returned string is flashed as a notice before closing */
		stay?: boolean;
		keywords?: string;
	};

	type Group = { title: string; items: PaletteItem[]; topScore: number };

	const GROUP_TITLES: Record<Kind, string> = {
		page: 'Sivut',
		action: 'Toiminnot',
		product: 'Tuotteet',
		category: 'Kategoriat',
		store: 'Myymälät',
		list: 'Listat'
	};

	const GROUP_LIMITS: Record<Kind, number> = {
		page: 4,
		action: 5,
		product: 8,
		category: 4,
		store: 4,
		list: 5
	};

	/** Results per group when narrowed to one scope */
	const SCOPED_LIMIT = 50;

	const SCOPES: { scope: Kind; label: string; prefix: string }[] = (
		['product', 'category', 'store', 'list', 'page', 'action'] as const
	).map((scope) => ({
		scope,
		label: GROUP_TITLES[scope],
		prefix: SCOPE_PREFIXES.find((entry) => entry.scope === scope)!.prefix
	}));

	const SCOPE_PLACEHOLDERS: Record<Kind, string> = {
		product: 'Hae tuotteista nimellä, valmistajalla tai numerolla...',
		category: 'Hae kategorioista...',
		store: 'Hae myymälöistä nimellä tai osoitteella...',
		list: 'Hae listoista tai kirjoita uuden listan nimi...',
		page: 'Hae sivuista...',
		action: 'Hae toiminnoista...'
	};

	const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
	const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

	let dialogElement = $state<HTMLDialogElement>();
	let inputElement = $state<HTMLInputElement>();
	let listElement = $state<HTMLElement>();
	let siteFeedback = $state<ReturnType<typeof SiteFeedback>>();
	let open = $state(false);
	let query = $state('');
	let scope = $state<Kind | null>(null);
	let notice = $state('');
	let activeIndex = $state(0);

	/** Typing a prefix such as "t:" swaps it for the matching scope */
	function setQuery(value: string) {
		const parsed = parseScopePrefix(value);
		if (parsed) {
			scope = parsed.scope;
			query = parsed.rest;
		} else {
			query = value;
		}
	}

	function setScope(next: Kind | null) {
		scope = next;
		inputElement?.focus();
	}

	function cycleScope(delta: number) {
		const order: (Kind | null)[] = [null, ...SCOPES.map((entry) => entry.scope)];
		setScope(order[(order.indexOf(scope) + delta + order.length) % order.length]);
	}

	const pages: PaletteItem[] = [
		{ id: 'page:/', kind: 'page', label: 'Etusivu', icon: 'home', href: '/', keywords: 'tuotteet hinnasto haku' },
		{ id: 'page:/listat', kind: 'page', label: 'Listat', icon: 'list_ul', href: '/listat', keywords: 'ostoslista' },
		{ id: 'page:/daily', kind: 'page', label: 'Daily', icon: 'flame', href: '/daily', keywords: 'peli visa' },
		{ id: 'page:/kategoriat', kind: 'page', label: 'Kategoriat', icon: 'wine', href: '/kategoriat/', keywords: 'tyypit' },
		{ id: 'page:/hinnanmuutokset', kind: 'page', label: 'Hinnanmuutokset', icon: 'trending_down', href: '/hinnanmuutokset', keywords: 'alennukset halpenivat kallistuivat' },
		{ id: 'page:/myymalat', kind: 'page', label: 'Myymälät', icon: 'store', href: '/myymalat', keywords: 'alko kaupat aukioloajat' },
		{ id: 'page:/kompassi', kind: 'page', label: 'Kompassi', icon: 'compass', href: '/kompassi/', keywords: 'lähin myymälä' },
		{ id: 'page:/daily/arkisto', kind: 'page', label: 'Daily-arkisto', icon: 'archive', href: '/daily/arkisto', keywords: 'peli' },
		{ id: 'page:/laskin', kind: 'page', label: 'Laskin', icon: 'calculator', href: '/laskin', keywords: 'promille annokset' },
		{ id: 'page:/tilastot', kind: 'page', label: 'Tilastot', icon: 'stats', href: '/tilastot', keywords: 'kuvaajat' }
	];

	/** The product whose page is open, for the "Tämä tuote" actions */
	const currentProduct = $derived.by(() => {
		if (page.route.id !== '/tuotteet/[...id]' && page.route.id !== '/vastaavat/[...id]') return undefined;
		const id = page.params.id?.split('/')[0];
		return id ? kaljakori.findById(id) : undefined;
	});

	const productActions = $derived.by<PaletteItem[]>(() => {
		if (!currentProduct) return [];
		const number = String(currentProduct[AllColumns.Number]);
		const inCompare = isInCompare(number);
		return [
			{
				id: 'action:product-compare',
				kind: 'action',
				label: inCompare ? 'Poista vertailusta' : 'Lisää vertailuun',
				icon: 'git_compare',
				keywords: 'vertaa vertailu',
				stay: true,
				run: () => {
					if (!toggleCompare(number)) return `Voit vertailla korkeintaan ${MAX_COMPARE_PRODUCTS} tuotetta kerrallaan`;
					return inCompare ? 'Poistettu vertailusta' : 'Lisätty vertailuun';
				}
			},
			...lists.map<PaletteItem>((list) => {
				const quantity = getItemQuantity(list, number);
				return {
					id: `action:product-list:${list.id}`,
					kind: 'action',
					label: `Lisää listaan: ${list.name}`,
					detail: quantity ? `Listalla jo ${quantity} kpl` : undefined,
					icon: 'list_plus',
					keywords: 'lista ostoslista',
					stay: true,
					run: () => {
						addToList(list, number);
						return `Lisätty listaan ${list.name}`;
					}
				};
			}),
			page.route.id === '/vastaavat/[...id]'
				? { id: 'action:product-page', kind: 'action', label: 'Takaisin tuotesivulle', icon: 'wine', href: `/tuotteet/${number}/` }
				: { id: 'action:product-similar', kind: 'action', label: 'Näytä vastaavat tuotteet', icon: 'shuffle', href: `/vastaavat/${number}/`, keywords: 'samankaltaiset korvaava' },
			{ id: 'action:product-alko', kind: 'action', label: 'Avaa Alkon sivuilla', icon: 'arrow_up_right_square', href: `https://www.alko.fi/tuotteet/${number}`, external: true, keywords: 'alko.fi osta tilaa' }
		];
	});

	const preferredStore = $derived(resolvePreferredStore(availability.stores, $preferredStoreId, $userLocation));

	let activeProducts: PriceListItem[] | undefined;
	function randomProduct() {
		activeProducts ??= kaljakori.data.filter((product) => !product[AllColumns.RemovedFromSelection]);
		const product = activeProducts[Math.floor(Math.random() * activeProducts.length)];
		if (product) goto(`/tuotteet/${product[AllColumns.Number]}/`);
	}

	async function sharePage() {
		try {
			const shared = await handleShare({
				type: shareTypeFromRoute(page.route.id),
				title: document.title,
				text: '',
				url: location.href,
				includeSID: true
			});
			// The native share sheet gives its own feedback; the clipboard fallback needs a notice
			if (shared) closePalette();
			else return 'Linkki kopioitu leikepöydälle';
		} catch {
			return 'Jakaminen epäonnistui';
		}
	}

	function createNamedList(name: string) {
		createList(name);
		const list = lists[lists.length - 1];
		sendAnalyticsEvent('create_list');
		goto(`/listat?list=${listToURI(list)}`);
	}

	const actions = $derived<PaletteItem[]>([
		...productActions,
		preferredStore
			? { id: 'action:my-store', kind: 'action', label: 'Oma myymälä', detail: preferredStore.name, icon: 'store', href: `/myymalat/${preferredStore.id}/`, keywords: 'suosikki myymälä aukioloajat' }
			: { id: 'action:my-store', kind: 'action', label: 'Valitse oma myymälä', icon: 'store', href: '/myymalat', keywords: 'suosikki myymälä' },
		{ id: 'action:random', kind: 'action', label: 'Satunnainen tuote', icon: 'dice_5', run: randomProduct, keywords: 'yllätä arvo random' },
		{ id: 'action:new-list', kind: 'action', label: 'Luo uusi lista', icon: 'list_plus', keywords: 'lista ostoslista', stay: true, run: () => { scope = 'list'; query = ''; } },
		{ id: 'action:share', kind: 'action', label: 'Jaa sivu', icon: 'share', keywords: 'jaa linkki kopioi osoite url lähetä share', stay: true, run: sharePage },
		{ id: 'action:settings', kind: 'action', label: 'Avaa asetukset', icon: 'cog', run: requestSettingsOpen, keywords: 'henkilökohtaiset tiedot paino sukupuoli' },
		{ id: 'action:feedback', kind: 'action', label: 'Ilmoita ongelmasta', icon: 'bug', run: () => siteFeedback?.open(), keywords: 'palaute lähetä palautetta bugi vika virhe feedback' },
		...(compareProductIds.length > 0
			? [
					{ id: 'action:compare', kind: 'action' as const, label: 'Avaa vertailu', detail: `${compareProductIds.length} tuotetta`, icon: 'git_compare' as const, href: compareURL(compareProductIds), keywords: 'vertaa' },
					{ id: 'action:clear-compare', kind: 'action' as const, label: 'Tyhjennä vertailu', icon: 'trash' as const, keywords: 'vertaa poista', stay: true, run: () => { clearCompare(); return 'Vertailu tyhjennetty'; } }
				]
			: []),
		{ id: 'action:theme-dark', kind: 'action', label: 'Teema: tumma', icon: 'moon', run: () => ($theme = 'dark'), keywords: 'dark mode ulkoasu' },
		{ id: 'action:theme-light', kind: 'action', label: 'Teema: vaalea', icon: 'sun', run: () => ($theme = 'light'), keywords: 'light mode ulkoasu' },
		{ id: 'action:theme-system', kind: 'action', label: 'Teema: järjestelmän mukaan', icon: 'sun', run: () => ($theme = ''), keywords: 'system ulkoasu' }
	]);

	function staticEntries(items: PaletteItem[]): SearchEntry<PaletteItem>[] {
		return items.map((item) => ({
			value: item,
			keys: [normalizeSearchText(item.label), normalizeSearchText(item.keywords ?? '')]
		}));
	}

	function productItem(product: PriceListItem): PaletteItem {
		const number = String(product[AllColumns.Number]);
		const detail = [
			product[AllColumns.Manufacturer],
			formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize),
			formatValue(product[AllColumns.Price], AllColumns.Price)
		]
			.filter(Boolean)
			.join(' · ');
		return {
			id: `product:${number}`,
			kind: 'product',
			label: String(product[AllColumns.Name]),
			detail,
			badge: product[AllColumns.RemovedFromSelection] ? 'Poistunut' : undefined,
			productNumber: number,
			href: `/tuotteet/${number}/`
		};
	}

	// Built on first open; the dataset doesn't change while the app runs
	let productEntries: SearchEntry<PriceListItem>[] | undefined;
	function getProductEntries() {
		productEntries ??= kaljakori.data.map((product) => ({
			value: product,
			keys: [
				normalizeSearchText(String(product[AllColumns.Name] ?? '')),
				normalizeSearchText(String(product[AllColumns.Manufacturer] ?? ''))
			],
			ids: [String(product[AllColumns.Number] ?? ''), String(product[AllColumns.EAN] ?? '')].filter(Boolean),
			boost: product[AllColumns.RemovedFromSelection] ? -25 : 0
		}));
		return productEntries;
	}

	const categoryEntries = $derived.by<SearchEntry<PaletteItem>[]>(() =>
		kaljakori.getCategoryTree().flatMap((type) => [
			{
				value: { id: `category:${type.path}`, kind: 'category', label: type.name, detail: `${type.count.toLocaleString('fi-FI')} tuotetta`, icon: 'wine', href: type.path },
				keys: [normalizeSearchText(type.name)]
			},
			...type.children.map<SearchEntry<PaletteItem>>((sub) => ({
				value: { id: `category:${sub.path}`, kind: 'category', label: sub.name, detail: `${type.name} · ${sub.count.toLocaleString('fi-FI')} tuotetta`, icon: 'wine', href: sub.path },
				keys: [normalizeSearchText(sub.name), normalizeSearchText(`${sub.name} ${type.name}`)]
			}))
		])
	);

	const storeEntries = $derived.by<SearchEntry<PaletteItem>[]>(() =>
		Object.values(availability.stores).map((store) => {
			const isPreferred = store.id === $preferredStoreId;
			return {
				value: {
					id: `store:${store.id}`,
					kind: 'store',
					label: store.name,
					detail: [store.address, store.postOffice].filter(Boolean).join(', '),
					badge: isPreferred ? 'Oma myymälä' : undefined,
					icon: 'store',
					href: `/myymalat/${store.id}/`
				},
				keys: [normalizeSearchText(store.name), normalizeSearchText(`${store.address ?? ''} ${store.postOffice ?? ''}`)],
				boost: isPreferred ? 5 : 0
			};
		})
	);

	function listItem(list: ListObj): PaletteItem {
		const count = list.items.reduce((sum, item) => sum + item.q, 0);
		return {
			id: `list:${list.id}`,
			kind: 'list',
			label: list.name,
			detail: `${count} ${count === 1 ? 'tuote' : 'tuotetta'}`,
			icon: 'list_ul',
			href: `/listat?list=${listToURI(list)}`
		};
	}

	const normalizedQuery = $derived(normalizeSearchText(query));

	function searchKind(kind: Kind, q: string, limit: number): Group | null {
		const run = <T,>(entries: SearchEntry<T>[], toItem: (value: T) => PaletteItem): Group | null => {
			const results = rankEntries(q, entries, limit);
			return results.length ? { title: GROUP_TITLES[kind], items: results.map((r) => toItem(r.value)), topScore: results[0].score } : null;
		};
		const self = (item: PaletteItem) => item;
		switch (kind) {
			case 'page': return run(staticEntries(pages), self);
			case 'action': return run(staticEntries(actions), self);
			case 'product': return run(getProductEntries(), productItem);
			case 'category': return run(categoryEntries, self);
			case 'store': return run(storeEntries, self);
			case 'list': return run(lists.map((list) => ({ value: list, keys: [normalizeSearchText(list.name)] })), listItem);
		}
	}

	/** Everything in a scope, shown when it's picked with nothing typed */
	function browseKind(kind: Kind): PaletteItem[] {
		switch (kind) {
			case 'page': return pages;
			case 'action': return actions;
			// Too many to list; the empty state asks for a search term instead
			case 'product': return [];
			case 'category': return categoryEntries.map((entry) => entry.value);
			case 'store':
				return storeEntries
					.map((entry) => entry.value)
					.sort((a, b) => Number(!!b.badge) - Number(!!a.badge) || a.label.localeCompare(b.label, 'fi'));
			case 'list': return lists.toReversed().map(listItem);
		}
	}

	function searchProductsItem(value: string): PaletteItem {
		return { id: 'action:search-products', kind: 'action', label: `Hae tuotteista "${value}"`, icon: 'search', run: () => searchProducts(value) };
	}

	const groups = $derived.by<Group[]>(() => {
		if (!open) return [];
		const q = normalizedQuery;

		if (scope) {
			const group = q
				? searchKind(scope, q, SCOPED_LIMIT)
				: { title: GROUP_TITLES[scope], items: browseKind(scope), topScore: 0 };
			const result = group && group.items.length ? [group] : [];
			if (q && scope === 'product') result.push({ title: 'Haku', topScore: 0, items: [searchProductsItem(query.trim())] });
			if (q && scope === 'list') {
				const name = query.trim();
				result.push({ title: 'Uusi lista', topScore: 0, items: [{ id: 'action:create-list', kind: 'action', label: `Luo lista "${name}"`, icon: 'plus', run: () => createNamedList(name) }] });
			}
			return result;
		}

		if (!q) {
			return [
				{ title: `Tämä tuote: ${currentProduct?.[AllColumns.Name] ?? ''}`, items: productActions, topScore: 0 },
				{ title: GROUP_TITLES.list, items: lists.slice(-GROUP_LIMITS.list).reverse().map(listItem), topScore: 0 },
				{ title: GROUP_TITLES.page, items: pages, topScore: 0 }
			].filter((group) => group.items.length > 0);
		}

		const ranked = (['page', 'action', 'product', 'category', 'store', 'list'] as const)
			.map((kind) => searchKind(kind, q, GROUP_LIMITS[kind]))
			.filter((group): group is Group => group !== null);
		// Stable sort keeps the order above for equal scores
		ranked.sort((a, b) => b.topScore - a.topScore);
		ranked.push({ title: 'Haku', topScore: 0, items: [searchProductsItem(query.trim())] });
		return ranked;
	});

	const flatItems = $derived(groups.flatMap((group) => group.items));

	$effect(() => {
		// Reset the highlight whenever the results change
		normalizedQuery;
		scope;
		activeIndex = 0;
		listElement?.scrollTo({ top: 0 });
	});

	async function searchProducts(value: string) {
		if (page.url.pathname !== '/') await goto('/');
		$searchQuery = value;
	}

	export async function openPalette() {
		if (!dialogElement || dialogElement.open) return;
		query = '';
		scope = null;
		notice = '';
		activeIndex = 0;
		open = true;
		dialogElement.showModal();
		sendAnalyticsEvent('command_palette_open');
		await tick();
		inputElement?.focus();
	}

	export function closePalette() {
		dialogElement?.close();
	}

	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	async function select(item: PaletteItem | undefined, newTab = false) {
		if (!item || notice) return;
		sendAnalyticsEvent('command_palette_select', { kind: item.kind, scope: scope ?? 'all', query_length: query.trim().length });
		if (item.href && (newTab || item.external)) {
			window.open(item.href, '_blank', 'noopener');
			if (item.external) closePalette();
			return;
		}
		if (item.href) {
			closePalette();
			goto(item.href);
			return;
		}
		if (!item.stay) {
			// Close first so the palette doesn't hand focus back over a dialog the action opens
			closePalette();
			item.run?.();
			return;
		}
		const message = await item.run?.();
		if (!message) {
			inputElement?.focus();
			return;
		}
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(closePalette, 1000);
	}

	function moveActive(delta: number) {
		const count = flatItems.length;
		if (!count) return;
		activeIndex = (activeIndex + delta + count) % count;
		tick().then(() => {
			listElement?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
		});
	}

	function handleInputKeydown(event: KeyboardEvent) {
		const ctrlNav = event.ctrlKey && !event.metaKey && !event.altKey;
		if (event.key === 'ArrowDown' || (ctrlNav && event.key === 'n')) {
			event.preventDefault();
			moveActive(1);
		} else if (event.key === 'ArrowUp' || (ctrlNav && event.key === 'p')) {
			event.preventDefault();
			moveActive(-1);
		} else if (event.key === 'Enter' && !event.isComposing) {
			event.preventDefault();
			select(flatItems[activeIndex], event.ctrlKey || event.metaKey);
		} else if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
			event.preventDefault();
			cycleScope(event.shiftKey ? -1 : 1);
		} else if (event.key === 'Backspace' && scope && query === '') {
			event.preventDefault();
			setScope(null);
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
		event.preventDefault();
		if (dialogElement?.open) closePalette();
		else openPalette();
	}

	function handleDialogClick(event: MouseEvent) {
		// Clicks on the backdrop land on the dialog element itself
		if (event.target === dialogElement) closePalette();
	}

	function handleItemClick(event: MouseEvent, item: PaletteItem) {
		// Let the browser handle modified clicks on links (new tab / window)
		if (item.href && (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0)) return;
		event.preventDefault();
		select(item);
	}

	const optionId = (index: number) => `command-palette-option-${index}`;
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if showButton}
<button
	type="button"
	onclick={openPalette}
	aria-label="Hae kaikkialta"
	aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
	title={`Hae kaikkialta (${shortcutLabel})`}
	class={twMerge(components.button(), 'p-2 text-xl')}
>
	{#if !$isMobile}<span class="text-sm">Haku</span>{/if}<Icon name="search" />
</button>
{/if}

<!-- Opened from the palette's "Ilmoita ongelmasta" action; records the page the palette was opened on -->
<SiteFeedback bind:this={siteFeedback} showTrigger={false} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogElement}
	onclose={() => {
		open = false;
		notice = '';
		clearTimeout(noticeTimer);
	}}
	onclick={handleDialogClick}
	aria-label="Haku"
	class="mx-auto mt-[10vh] mb-auto w-[min(40rem,calc(100%-2rem))] flex-col overflow-hidden rounded-lg border border-primary bg-primary p-0 text-inherit shadow-xl backdrop:bg-black/30 backdrop:backdrop-blur-sm open:flex"
>
	<div class="flex items-center gap-2 border-b border-primary px-3">
		<Icon name="search" class="text-lg text-secondary" />
		<input
			bind:this={inputElement}
			bind:value={() => query, setQuery}
			onkeydown={handleInputKeydown}
			type="text"
			role="combobox"
			aria-expanded="true"
			aria-controls="command-palette-results"
			aria-autocomplete="list"
			aria-activedescendant={flatItems.length ? optionId(activeIndex) : undefined}
			autocomplete="off"
			spellcheck="false"
			placeholder={scope ? SCOPE_PLACEHOLDERS[scope] : 'Hae tuotteita, listoja, myymälöitä, sivuja, toimintoja...'}
			class="w-full border-0 bg-transparent px-1 py-3 text-base outline-none focus:ring-0"
		/>
		<kbd class="hidden shrink-0 rounded font-sans border border-current px-1 text-[11px] font-semibold leading-4 text-secondary sm:block">Esc</kbd>
	</div>

	<!-- Focus stays in the input: Tab cycles these, mousedown is prevented so clicking doesn't blur -->
	<div role="toolbar" aria-label="Rajaa hakua" class="flex gap-1 overflow-x-auto border-b border-primary px-2 py-1.5">
		{#each [{ scope: null, label: 'Kaikki', prefix: '' }, ...SCOPES] as option (option.label)}
			<button
				type="button"
				tabindex="-1"
				aria-pressed={scope === option.scope}
				title={option.prefix ? `Rajaa: ${option.label} (kirjoita ${option.prefix})` : 'Hae kaikkialta'}
				onmousedown={(event) => event.preventDefault()}
				onclick={() => setScope(option.scope)}
				class={twMerge(
					'flex shrink-0 items-center gap-1.5 rounded-full border border-primary px-2.5 py-0.5 text-xs transition hover:bg-secondary',
					scope === option.scope && 'bg-secondary border-zinc-400 font-semibold dark:border-zinc-500'
				)}
			>
				{option.label}
				{#if option.prefix}<kbd class="hidden font-sans text-[10px] text-secondary sm:inline">{option.prefix}</kbd>{/if}
			</button>
		{/each}
	</div>
	<span class="sr-only" aria-live="polite">{scope ? `Rajaus: ${GROUP_TITLES[scope]}` : ''}</span>

	<div bind:this={listElement} id="command-palette-results" role="listbox" aria-label="Hakutulokset" class="max-h-[min(60vh,32rem)] overflow-y-auto p-1">
		{#each groups as group (group.title)}
			{@const offset = flatItems.indexOf(group.items[0])}
			<div role="group" aria-label={group.title} class="py-1">
				<div class="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-secondary" aria-hidden="true">{group.title}</div>
				{#each group.items as item, i (item.id)}
					{@const index = offset + i}
					<a
						id={optionId(index)}
						data-index={index}
						role="option"
						aria-selected={index === activeIndex}
						href={item.href ?? '#'}
						target={item.external ? '_blank' : undefined}
						rel={item.external ? 'noopener' : undefined}
						tabindex="-1"
						onclick={(event) => handleItemClick(event, item)}
						onmousemove={() => (activeIndex = index)}
						class={twMerge('flex items-center gap-3 rounded px-2 py-1.5 no-underline', index === activeIndex && 'bg-secondary')}
					>
						{#if item.productNumber}
							<div class="size-9 shrink-0 overflow-hidden rounded bg-white p-0.5">
								<ProductImage number={item.productNumber} name="" />
							</div>
						{:else}
							<div class="grid size-9 shrink-0 place-content-center text-lg text-secondary">
								<Icon name={item.icon ?? 'search'} />
							</div>
						{/if}
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate">{item.label}</span>
							{#if item.detail}<span class="truncate text-xs text-secondary">{item.detail}</span>{/if}
						</div>
						{#if item.badge}
							<span class={components.badge({ color: item.badge === 'Poistunut' ? 'gray' : 'green' })}>{item.badge}</span>
						{/if}
						{#if index === activeIndex}
							<span class="hidden shrink-0 text-xs text-secondary sm:block" aria-hidden="true">↵</span>
						{/if}
					</a>
				{/each}
			</div>
		{:else}
			<p class="px-3 py-6 text-center text-sm text-secondary">
				{scope === 'product' && !normalizedQuery ? 'Kirjoita tuotteen nimi, valmistaja tai numero' : 'Ei tuloksia'}
			</p>
		{/each}
	</div>

	<div role="status" class="contents">
		{#if notice}
			<div class="flex items-center gap-2 border-t border-primary bg-secondary px-3 py-2 text-sm font-semibold">
				<Icon name="check" />{notice}
			</div>
		{/if}
	</div>
	<div class={twMerge('hidden items-center gap-4 border-t border-primary px-3 py-2 text-xs text-secondary sm:flex', notice && 'sm:hidden')}>
		<span><kbd class="font-sans font-semibold">↑↓</kbd> liiku</span>
		<span><kbd class="font-sans font-semibold">↵</kbd> avaa</span>
		<span><kbd class="font-sans font-semibold">{isMac ? '⌘' : 'Ctrl'} ↵</kbd> uuteen välilehteen</span>
		<span><kbd class="font-sans font-semibold">Tab</kbd> rajaa</span>
		<span class="ms-auto"><kbd class="font-sans font-semibold">{shortcutLabel}</kbd> sulje</span>
	</div>
</dialog>
