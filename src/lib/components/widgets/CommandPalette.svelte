<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import type { Kaljakori } from '$lib/alko';
	import type { AvailabilityData, ListObj, PriceListItem } from '$lib/types';
	import type { IconName } from '$lib/icons';
	import {
		compareProductIds,
		isMobile,
		lists,
		preferredStoreId,
		searchQuery,
		theme,
		userLocation
	} from '$lib/global.svelte';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import { addToList, createList, getItemQuantity, listToURI } from '$lib/utils/user/lists';
	import { addProductToPunch, punchCount } from '$lib/utils/user/punch';
	import {
		clearCompare,
		compareURL,
		isInCompare,
		MAX_COMPARE_PRODUCTS,
		toggleCompare
	} from '$lib/utils/user/compare';
	import {
		isWatched,
		unwatchProduct,
		watchProduct,
		watchSnapshot
	} from '$lib/utils/user/watchlist';
	import { requestSettingsOpen } from '$lib/utils/app/settings';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { handleShare, shareTypeFromRoute } from '$lib/utils/app/share';
	import { showToast } from '$lib/utils/app/toast.svelte';
	import {
		normalizeSearchText,
		parseScopePrefix,
		rankEntries,
		SCOPE_PREFIXES,
		SCOPE_SYMBOLS,
		type ScopePrefix,
		type SearchEntry,
		type SearchScope
	} from '$lib/utils/app/commandPalette';
	import { appPath } from '$lib/utils/app/paths';
	import { intlLocale, m } from '$lib/i18n';
	import { productName, translateValue } from '$lib/i18n/values';
	import { resolvePreferredStore, storeName, storeText } from '$lib/utils/catalog/availability';
	import { components } from '$lib/utils/ui/styles';
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
		page: m.palette_group_pages(),
		action: m.palette_group_actions(),
		product: m.palette_group_products(),
		category: m.nav_categories(),
		store: m.nav_stores(),
		list: m.nav_lists()
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
	const SCOPED_LIMIT = 50; /** Each language has its own initials, and only the active language's work */
	const PREFIXES: ScopePrefix[] = [
		{ prefix: m.palette_prefix_product(), scope: 'product' },
		{ prefix: m.palette_prefix_category(), scope: 'category' },
		{ prefix: m.palette_prefix_store(), scope: 'store' },
		{ prefix: m.palette_prefix_list(), scope: 'list' },
		{ prefix: m.palette_prefix_page(), scope: 'page' },
		{ prefix: SCOPE_PREFIXES.find((entry) => entry.scope === 'action')!.prefix, scope: 'action' }
	];

	const SCOPES: { scope: Kind; label: string; prefix: string; symbol?: string }[] = (
		['product', 'category', 'store', 'list', 'page', 'action'] as const
	).map((scope) => ({
		scope,
		label: GROUP_TITLES[scope],
		prefix: PREFIXES.find((entry) => entry.scope === scope)!.prefix,
		symbol: SCOPE_SYMBOLS.find((entry) => entry.scope === scope)?.prefix
	}));

	const SCOPE_PLACEHOLDERS: Record<Kind, string> = {
		product: m.palette_ph_product(),
		category: m.palette_ph_category(),
		store: m.palette_ph_store(),
		list: m.palette_ph_list(),
		page: m.palette_ph_page(),
		action: m.palette_ph_action()
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
		const parsed = parseScopePrefix(value, PREFIXES);
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
		{
			id: 'page:/',
			kind: 'page',
			label: m.breadcrumb_home(),
			icon: 'home',
			href: resolve('/'),
			keywords: 'tuotteet hinnasto haku'
		},
		{
			id: 'page:/listat',
			kind: 'page',
			label: m.nav_lists(),
			icon: 'list_ul',
			href: resolve('/listat'),
			keywords: 'ostoslista'
		},
		{
			id: 'page:/daily',
			kind: 'page',
			label: m.nav_daily(),
			icon: 'flame',
			href: resolve('/daily'),
			keywords: 'peli visa'
		},
		{
			id: 'page:/kategoriat',
			kind: 'page',
			label: m.nav_categories(),
			icon: 'wine',
			href: resolve('/kategoriat/'),
			keywords: 'tyypit'
		},
		{
			id: 'page:/hinnanmuutokset',
			kind: 'page',
			label: m.nav_price_changes(),
			icon: 'trending_down',
			href: resolve('/hinnanmuutokset'),
			keywords: 'alennukset halpenivat kallistuivat'
		},
		{
			id: 'page:/seuratut',
			kind: 'page',
			label: m.nav_watchlist(),
			icon: 'bell',
			href: resolve('/seuratut'),
			keywords: 'seuranta seurattavat muutokset hinta saatavuus'
		},
		{
			id: 'page:/myymalat',
			kind: 'page',
			label: m.nav_stores(),
			icon: 'store',
			href: resolve('/myymalat'),
			keywords: 'alko kaupat aukioloajat'
		},
		{
			id: 'page:/kompassi',
			kind: 'page',
			label: m.nav_compass(),
			icon: 'compass',
			href: resolve('/kompassi'),
			keywords: 'lähin myymälä'
		},
		{
			id: 'page:/daily/arkisto',
			kind: 'page',
			label: m.nav_daily_archive(),
			icon: 'archive',
			href: resolve('/daily/arkisto'),
			keywords: 'peli'
		},
		{
			id: 'page:/laskin',
			kind: 'page',
			label: m.nav_calculator(),
			icon: 'calculator',
			href: resolve('/laskin'),
			keywords: 'promille annokset'
		},
		{
			id: 'page:/boolilaskuri',
			kind: 'page',
			label: m.nav_punch(),
			icon: 'cocktail',
			href: resolve('/boolilaskuri'),
			keywords: 'booli resepti juhlat lasi hinta'
		},
		{
			id: 'page:/tilastot',
			kind: 'page',
			label: m.nav_stats(),
			icon: 'stats',
			href: resolve('/tilastot'),
			keywords: 'kuvaajat'
		}
	];

	/** The product whose page is open, for the "Tämä tuote" actions */
	const currentProduct = $derived.by(() => {
		if (page.route.id !== '/tuotteet/[...id]' && page.route.id !== '/vastaavat/[...id]')
			return undefined;
		const id = page.params.id?.split('/')[0];
		return id ? kaljakori.findById(id) : undefined;
	});

	const productActions = $derived.by<PaletteItem[]>(() => {
		if (!currentProduct) return [];
		const number = String(currentProduct[AllColumns.Number]);
		const inCompare = isInCompare(number);
		const watched = isWatched(number);
		const product = currentProduct;
		return [
			{
				id: 'action:product-watch',
				kind: 'action',
				label: watched ? m.watch_stop() : m.watch_follow(),
				icon: watched ? 'bell_minus' : 'bell_plus',
				keywords: 'seuratut seuranta hinta saatavuus muutokset',
				stay: true,
				run: () => {
					if (watched) {
						unwatchProduct(number);
						return m.palette_unwatched();
					}
					watchProduct(number, watchSnapshot(product, availability, preferredStore?.id));
					return m.palette_watched();
				}
			},
			{
				id: 'action:product-compare',
				kind: 'action',
				label: inCompare ? m.palette_remove_compare() : m.palette_add_compare(),
				icon: 'git_compare',
				keywords: 'vertaa vertailu',
				stay: true,
				run: () => {
					if (!toggleCompare(number)) return m.palette_compare_max({ max: MAX_COMPARE_PRODUCTS });
					return inCompare ? m.palette_removed_compare() : m.palette_added_compare();
				}
			},
			...lists.map<PaletteItem>((list) => {
				const quantity = getItemQuantity(list, number);
				return {
					id: `action:product-list:${list.id}`,
					kind: 'action',
					label: m.palette_add_to_list_named({ name: list.name }),
					detail: quantity ? m.palette_in_list({ count: quantity }) : undefined,
					icon: 'list_plus',
					keywords: 'lista ostoslista',
					stay: true,
					run: () => {
						addToList(list, number);
						return m.palette_added_to_list({ name: list.name });
					}
				};
			}),
			{
				id: 'action:product-punch',
				kind: 'action',
				label: m.palette_add_punch(),
				detail: punchCount(number) ? m.palette_in_punch({ count: punchCount(number) }) : undefined,
				icon: 'cocktail',
				keywords: 'booli boolilaskuri resepti juhlat',
				stay: true,
				run: () => {
					addProductToPunch(number);
					return m.palette_added_punch();
				}
			},
			page.route.id === '/vastaavat/[...id]'
				? {
						id: 'action:product-page',
						kind: 'action',
						label: m.palette_back_to_product(),
						icon: 'wine',
						href: resolve(`/tuotteet/${number}/`)
					}
				: {
						id: 'action:product-similar',
						kind: 'action',
						label: m.palette_show_similar(),
						icon: 'shuffle',
						href: resolve(`/vastaavat/${number}/`),
						keywords: 'samankaltaiset korvaava'
					},
			{
				id: 'action:product-alko',
				kind: 'action',
				label: m.palette_open_alko(),
				icon: 'arrow_up_right_square',
				href: `https://www.alko.fi/tuotteet/${number}`,
				external: true,
				keywords: 'alko.fi osta tilaa'
			}
		];
	});

	const preferredStore = $derived(
		resolvePreferredStore(availability.stores, $preferredStoreId, $userLocation)
	);

	let activeProducts: PriceListItem[] | undefined;
	function randomProduct() {
		activeProducts ??= kaljakori.data.filter(
			(product) => !product[AllColumns.RemovedFromSelection]
		);
		const product = activeProducts[Math.floor(Math.random() * activeProducts.length)];
		if (product) goto(resolve(`/tuotteet/${product[AllColumns.Number]}/`));
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
			// The native share sheet gives its own feedback; the clipboard fallback shows a toast
			if (shared) closePalette();
			else {
				// stay: true keeps the palette open, so close it once the toast takes over
				showToast({ text: m.share_link_copied(), position: 'top' });
				closePalette();
			}
		} catch {
			return m.palette_share_failed();
		}
	}

	function createNamedList(name: string) {
		createList(name);
		const list = lists[lists.length - 1];
		sendAnalyticsEvent('create_list');
		goto(resolve(`/listat?list=${listToURI(list)}`));
	}

	const actions = $derived<PaletteItem[]>([
		...productActions,
		preferredStore
			? {
					id: 'action:my-store',
					kind: 'action',
					label: m.palette_my_store(),
					detail: storeName(preferredStore),
					icon: 'store',
					href: resolve(`/myymalat/${preferredStore.id}/`),
					keywords: 'suosikki myymälä aukioloajat'
				}
			: {
					id: 'action:my-store',
					kind: 'action',
					label: m.palette_pick_store(),
					icon: 'store',
					href: resolve('/myymalat'),
					keywords: 'suosikki myymälä'
				},
		{
			id: 'action:random',
			kind: 'action',
			label: m.palette_random(),
			icon: 'dice_5',
			run: randomProduct,
			keywords: 'yllätä arvo random'
		},
		{
			id: 'action:new-list',
			kind: 'action',
			label: m.palette_new_list(),
			icon: 'list_plus',
			keywords: 'lista ostoslista',
			stay: true,
			run: () => {
				scope = 'list';
				query = '';
			}
		},
		{
			id: 'action:share',
			kind: 'action',
			label: m.palette_share_page(),
			icon: 'share',
			keywords: 'jaa linkki kopioi osoite url lähetä share',
			stay: true,
			run: sharePage
		},
		{
			id: 'action:settings',
			kind: 'action',
			label: m.palette_open_settings(),
			icon: 'cog',
			run: requestSettingsOpen,
			keywords: 'henkilökohtaiset tiedot paino sukupuoli'
		},
		{
			id: 'action:feedback',
			kind: 'action',
			label: m.palette_report_problem(),
			icon: 'bug',
			run: () => siteFeedback?.open(),
			keywords: 'palaute lähetä palautetta bugi vika virhe feedback'
		},
		...(compareProductIds.length > 0
			? [
					{
						id: 'action:compare',
						kind: 'action' as const,
						label: m.palette_open_compare(),
						detail: m.products_count({ count: compareProductIds.length }),
						icon: 'git_compare' as const,
						href: resolve(compareURL(compareProductIds)),
						keywords: 'vertaa'
					},
					{
						id: 'action:clear-compare',
						kind: 'action' as const,
						label: m.palette_clear_compare(),
						icon: 'trash' as const,
						keywords: 'vertaa poista',
						stay: true,
						run: () => {
							clearCompare();
							return m.palette_compare_cleared();
						}
					}
				]
			: []),
		{
			id: 'action:theme-dark',
			kind: 'action',
			label: m.palette_theme_dark(),
			icon: 'moon',
			run: () => ($theme = 'dark'),
			keywords: 'dark mode ulkoasu'
		},
		{
			id: 'action:theme-light',
			kind: 'action',
			label: m.palette_theme_light(),
			icon: 'sun',
			run: () => ($theme = 'light'),
			keywords: 'light mode ulkoasu'
		},
		{
			id: 'action:theme-system',
			kind: 'action',
			label: m.palette_theme_system(),
			icon: 'sun',
			run: () => ($theme = ''),
			keywords: 'system ulkoasu'
		}
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
			label: productName(product),
			detail,
			badge: product[AllColumns.RemovedFromSelection] ? m.palette_removed_badge() : undefined,
			productNumber: number,
			href: resolve(`/tuotteet/${number}/`)
		};
	}

	// Built on first open; the dataset doesn't change while the app runs
	let productEntries: SearchEntry<PriceListItem>[] | undefined;
	function getProductEntries() {
		productEntries ??= kaljakori.data.map((product) => ({
			value: product,
			keys: [
				normalizeSearchText(String(product[AllColumns.Name] ?? '')),
				normalizeSearchText(String(product[AllColumns.Manufacturer] ?? '')),
				// Names are also searched in the language they're shown in
				normalizeSearchText(productName(product))
			],
			ids: [String(product[AllColumns.Number] ?? ''), String(product[AllColumns.EAN] ?? '')].filter(
				Boolean
			),
			boost: product[AllColumns.RemovedFromSelection] ? -25 : 0
		}));
		return productEntries;
	}

	const categoryEntries = $derived.by<SearchEntry<PaletteItem>[]>(() =>
		kaljakori.getCategoryTree().flatMap((type) => [
			{
				value: {
					id: `category:${type.path}`,
					kind: 'category',
					label: translateValue(type.name, AllColumns.Type),
					detail: m.products_count({ count: type.count }),
					icon: 'wine',
					href: appPath(type.path)
				},
				keys: [
					normalizeSearchText(type.name),
					normalizeSearchText(translateValue(type.name, AllColumns.Type))
				]
			},
			...type.children.map<SearchEntry<PaletteItem>>((sub) => ({
				value: {
					id: `category:${sub.path}`,
					kind: 'category',
					label: translateValue(sub.name, AllColumns.SubType),
					detail: `${translateValue(type.name, AllColumns.Type)} · ${m.products_count({ count: sub.count })}`,
					icon: 'wine',
					href: appPath(sub.path)
				},
				keys: [
					normalizeSearchText(sub.name),
					normalizeSearchText(`${sub.name} ${type.name}`),
					normalizeSearchText(translateValue(sub.name, AllColumns.SubType))
				]
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
					label: storeName(store),
					detail: [storeText(store, 'address'), storeText(store, 'postOffice')]
						.filter(Boolean)
						.join(', '),
					badge: isPreferred ? m.palette_my_store() : undefined,
					icon: 'store',
					href: resolve(`/myymalat/${store.id}/`)
				},
				keys: [
					normalizeSearchText(store.name),
					normalizeSearchText(storeName(store)),
					normalizeSearchText(`${store.address ?? ''} ${store.postOffice ?? ''}`)
				],
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
			detail: m.products_count({ count }),
			icon: 'list_ul',
			href: resolve(`/listat?list=${listToURI(list)}`)
		};
	}

	const normalizedQuery = $derived(normalizeSearchText(query));

	function searchKind(kind: Kind, q: string, limit: number): Group | null {
		const run = <T,>(
			entries: SearchEntry<T>[],
			toItem: (value: T) => PaletteItem
		): Group | null => {
			const results = rankEntries(q, entries, limit);
			return results.length
				? {
						title: GROUP_TITLES[kind],
						items: results.map((r) => toItem(r.value)),
						topScore: results[0].score
					}
				: null;
		};
		const self = (item: PaletteItem) => item;
		switch (kind) {
			case 'page':
				return run(staticEntries(pages), self);
			case 'action':
				return run(staticEntries(actions), self);
			case 'product':
				return run(getProductEntries(), productItem);
			case 'category':
				return run(categoryEntries, self);
			case 'store':
				return run(storeEntries, self);
			case 'list':
				return run(
					lists.map((list) => ({ value: list, keys: [normalizeSearchText(list.name)] })),
					listItem
				);
		}
	}

	/** Everything in a scope, shown when it's picked with nothing typed */
	function browseKind(kind: Kind): PaletteItem[] {
		switch (kind) {
			case 'page':
				return pages;
			case 'action':
				return actions;
			// Too many to list; the empty state asks for a search term instead
			case 'product':
				return [];
			case 'category':
				return categoryEntries.map((entry) => entry.value);
			case 'store':
				return storeEntries
					.map((entry) => entry.value)
					.sort(
						(a, b) =>
							Number(!!b.badge) - Number(!!a.badge) || a.label.localeCompare(b.label, intlLocale)
					);
			case 'list':
				return lists.toReversed().map(listItem);
		}
	}

	function searchProductsItem(value: string): PaletteItem {
		return {
			id: 'action:search-products',
			kind: 'action',
			label: m.palette_search_products({ value }),
			icon: 'search',
			run: () => searchProducts(value)
		};
	}

	const groups = $derived.by<Group[]>(() => {
		if (!open) return [];
		const q = normalizedQuery;

		if (scope) {
			const group = q
				? searchKind(scope, q, SCOPED_LIMIT)
				: { title: GROUP_TITLES[scope], items: browseKind(scope), topScore: 0 };
			const result = group && group.items.length ? [group] : [];
			if (q && scope === 'product')
				result.push({
					title: m.palette_group_search(),
					topScore: 0,
					items: [searchProductsItem(query.trim())]
				});
			if (q && scope === 'list') {
				const name = query.trim();
				result.push({
					title: m.palette_group_new_list(),
					topScore: 0,
					items: [
						{
							id: 'action:create-list',
							kind: 'action',
							label: m.palette_create_list({ name }),
							icon: 'plus',
							run: () => createNamedList(name)
						}
					]
				});
			}
			return result;
		}

		if (!q) {
			return [
				{
					title: m.palette_this_product({ name: productName(currentProduct) ?? '' }),
					items: productActions,
					topScore: 0
				},
				{
					title: GROUP_TITLES.list,
					items: lists.slice(-GROUP_LIMITS.list).reverse().map(listItem),
					topScore: 0
				},
				{ title: GROUP_TITLES.page, items: pages, topScore: 0 }
			].filter((group) => group.items.length > 0);
		}

		const ranked = (['page', 'action', 'product', 'category', 'store', 'list'] as const)
			.map((kind) => searchKind(kind, q, GROUP_LIMITS[kind]))
			.filter((group): group is Group => group !== null);
		// Stable sort keeps the order above for equal scores
		ranked.sort((a, b) => b.topScore - a.topScore);
		ranked.push({
			title: m.palette_group_search(),
			topScore: 0,
			items: [searchProductsItem(query.trim())]
		});
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
		if (page.route.id !== '/') await goto(resolve('/'));
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
		sendAnalyticsEvent('command_palette_select', {
			kind: item.kind,
			scope: scope ?? 'all',
			query_length: query.trim().length
		});
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
			listElement
				?.querySelector(`[data-index="${activeIndex}"]`)
				?.scrollIntoView({ block: 'nearest' });
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
		if (
			event.key.toLowerCase() !== 'k' ||
			!(event.ctrlKey || event.metaKey) ||
			event.altKey ||
			event.shiftKey
		)
			return;
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
		if (item.href && (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0))
			return;
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
		aria-label={m.palette_search_everywhere()}
		aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
		title={m.palette_search_everywhere_shortcut({ shortcut: shortcutLabel })}
		class={twMerge(components.button(), 'p-2 text-xl')}
	>
		{#if !$isMobile}<span class="text-sm">{m.palette_group_search()}</span>{/if}<Icon
			name="search"
		/>
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
	aria-label={m.palette_group_search()}
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
			placeholder={scope ? SCOPE_PLACEHOLDERS[scope] : m.palette_ph_all()}
			class="w-full border-0 bg-transparent px-1 py-3 text-base outline-none focus:ring-0"
		/>
		<kbd
			class="hidden shrink-0 rounded border border-current px-1 font-sans text-[11px] leading-4 font-semibold text-secondary sm:block"
			>Esc</kbd
		>
	</div>

	<!-- Focus stays in the input: Tab cycles these, mousedown is prevented so clicking doesn't blur -->
	<div
		role="toolbar"
		aria-label={m.palette_narrow()}
		class="flex gap-1 overflow-x-auto border-b border-primary px-2 py-1.5"
	>
		{#each [{ scope: null, label: m.palette_all(), prefix: '', symbol: undefined }, ...SCOPES] as option (option.label)}
			<button
				type="button"
				tabindex="-1"
				aria-pressed={scope === option.scope}
				title={option.prefix
					? option.symbol
						? m.palette_narrow_title_symbol({
								label: option.label,
								prefix: option.prefix,
								symbol: option.symbol
							})
						: m.palette_narrow_title({ label: option.label, prefix: option.prefix })
					: m.palette_search_everywhere()}
				onmousedown={(event) => event.preventDefault()}
				onclick={() => setScope(option.scope)}
				class={twMerge(
					'flex shrink-0 items-center gap-1.5 rounded-full border border-primary px-2.5 py-0.5 text-xs transition hover:bg-secondary',
					scope === option.scope &&
						'border-zinc-400 bg-secondary font-semibold dark:border-zinc-500'
				)}
			>
				{option.label}
				{#if option.prefix}<kbd class="hidden font-sans text-[10px] text-secondary sm:inline"
						>{option.prefix}</kbd
					>{/if}
			</button>
		{/each}
	</div>
	<span class="sr-only" aria-live="polite"
		>{scope ? m.palette_scope_status({ label: GROUP_TITLES[scope] }) : ''}</span
	>

	<div
		bind:this={listElement}
		id="command-palette-results"
		role="listbox"
		aria-label={m.palette_results()}
		class="max-h-[min(60vh,32rem)] overflow-y-auto p-1"
	>
		{#each groups as group (group.title)}
			{@const offset = flatItems.indexOf(group.items[0])}
			<div role="group" aria-label={group.title} class="py-1">
				<div
					class="px-2 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-secondary uppercase"
					aria-hidden="true"
				>
					{group.title}
				</div>
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
						class={twMerge(
							'flex items-center gap-3 rounded px-2 py-1.5 no-underline',
							index === activeIndex && 'bg-secondary'
						)}
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
							{#if item.detail}<span class="truncate text-xs text-secondary">{item.detail}</span
								>{/if}
						</div>
						{#if item.badge}
							<span
								class={components.badge({
									color: item.badge === m.palette_removed_badge() ? 'gray' : 'green'
								})}>{item.badge}</span
							>
						{/if}
						{#if index === activeIndex}
							<span class="hidden shrink-0 text-xs text-secondary sm:block" aria-hidden="true"
								>↵</span
							>
						{/if}
					</a>
				{/each}
			</div>
		{:else}
			<p class="px-3 py-6 text-center text-sm text-secondary">
				{scope === 'product' && !normalizedQuery
					? m.palette_type_product()
					: m.palette_no_results()}
			</p>
		{/each}
	</div>

	<div role="status" class="contents">
		{#if notice}
			<div
				class="flex items-center gap-2 border-t border-primary bg-secondary px-3 py-2 text-sm font-semibold"
			>
				<Icon name="check" />{notice}
			</div>
		{/if}
	</div>
	<div
		class={twMerge(
			'hidden items-center gap-4 border-t border-primary px-3 py-2 text-xs text-secondary sm:flex',
			notice && 'sm:hidden'
		)}
	>
		<span><kbd class="font-sans font-semibold">↑↓</kbd> {m.palette_hint_move()}</span>
		<span><kbd class="font-sans font-semibold">↵</kbd> {m.palette_hint_open()}</span>
		<span
			><kbd class="font-sans font-semibold">{isMac ? '⌘' : 'Ctrl'} ↵</kbd>
			{m.palette_hint_new_tab()}</span
		>
		<span><kbd class="font-sans font-semibold">Tab</kbd> {m.palette_hint_scope()}</span>
		<span class="ms-auto"
			><kbd class="font-sans font-semibold">{shortcutLabel}</kbd> {m.palette_hint_close()}</span
		>
	</div>
</dialog>
