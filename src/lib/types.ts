import { AllColumns, DatasetColumns, DrunkColumns } from '$lib/utils/constants/columns';
import { GenderOptionsMap, ShareTypes } from '$lib/utils/constants/app';
import type { VariantProps } from 'class-variance-authority';
import type { components } from './utils/ui/styles';
import type { IconName } from './icons';
import type { GuidanceId } from './utils/user/guidance';

export type ColumnType =
	'string' | 'number' | 'object' | 'undefined' | 'function' | 'boolean' | 'symbol' | 'bigint';

export type DatasetRow = (string | number | undefined)[];

/**
 * A single dated price observation in a product's price history. Optional sale
 * fields are present when the observation was recorded during a sales campaign.
 */
export type PriceHistoryEntry = {
	date: string;
	price: number;
	normalPrice?: number;
	campaignStart?: string;
	campaignEnd?: string;
};

export type Filter = {
	type: ColumnType;
	// Set of all possible types
	possibleTypes: Set<ColumnType>;
};

export type GenderOptions = (typeof GenderOptionsMap)[keyof typeof GenderOptionsMap];

export type PersonalInfo = {
	weight: number | null;
	gender: GenderOptions | undefined | null;
};

export type BreadcrumbItem = { label: string; href?: string };

export type AvailabilityStore = {
	id: string;
	name: string;
	address?: string;
	postalCode?: string;
	postOffice?: string;
	outletType?: string;
	latitude?: number;
	longitude?: number;
	open?: boolean;
	openDays?: string[];
	/** Actual hours (exceptions applied), today through Sunday of next week */
	openHours?: { date: string; hours: string }[];
	/** Regular hours without exceptions, Monday of this week through Sunday of next week */
	openHoursNormal?: { date: string; hours: string }[];
	/** The days in `openHours` that differ from `openHoursNormal` */
	openHoursException?: { date: string; hours: string }[];
	unobstructured?: string;
	additional_info?: string;
	location_details?: string;
	exceptions?: string;
};

export type AvailabilityData = {
	lastUpdated?: string;
	stores: Record<string, AvailabilityStore>;
	product: Record<string, string[]>;
};

/** Whether a data file a page shows is still loading, has loaded or failed to load */
export type LoadState = 'loading' | 'loaded' | 'failed';

/** What a watched product looked like when the user last saw it. */
export type WatchSnapshot = {
	/** ISO timestamp */
	at: string;
	price: number;
	removed: boolean;
	/** Stores stocking it. Missing when store data hadn't loaded. */
	stores?: number;
	/** The preferred store then, and whether it stocked the product. */
	store?: { id: string; stocked: boolean };
};

export type WatchedProduct = {
	id: string;
	/** ISO timestamp */
	addedAt: string;
	seen: WatchSnapshot;
};

export interface PriceListItem extends Record<DrunkColumnNames, number> {
	Numero: string;
	Nimi: string;
	Valmistaja: string;
	Pullokoko: number;
	Hinta: number;
	Litrahinta: number;
	Uutuus: 'uutuus' | '';
	Alennuksessa: 'alennuksessa' | '';
	Hinnastojärjestyskoodi: string;
	Tyyppi: string;
	Alatyyppi: string;
	Erityisryhmä: Set<string>;
	Oluttyyppi: string;
	Valmistusmaa: string;
	Alue: string;
	Vuosikerta: string;
	Etikettimerkintöjä: string;
	Huomautus: Set<string>;
	Rypäleet: Set<string>;
	Luonnehdinta: Set<string>;
	Ruokasuositukset: Set<string>;
	Pakkaustyyppi: string;
	'Alkoholi-%': number;
	'Hapot g/l': number;
	'Sokeri g/l': number;
	'Kantavierrep-%': number;
	'Väri EBC': number;
	'Katkerot EBU': number;
	'Energia kcal/100ml': number;
	Valikoima: string;
	EAN: string;
	Normaalihinta: number;
	'Kampanja alkaa': string;
	'Kampanja päättyy': string;
	/**
	 * Alko's product status: Aktiivinen, Uutuus, Poistuva or Tulee, or our own "Ei myynnissä" for
	 * products stuck at Tulee (see STALE_ARRIVAL_STATUS). Empty for removed products.
	 */
	Tila: string;
	/** Deposit in euros, included in `Hinta`. Empty when the product has none or it isn't known. */
	Pantti: number | '';
	Hintahistoria: PriceHistoryEntry[];
	'Poistunut valikoimasta': boolean;
	Myymälät: Set<string>;
	[key: string]: string | number | boolean | Set<string> | PriceHistoryEntry[];
}

export type DatasetColumnNames = (typeof DatasetColumns)[keyof typeof DatasetColumns];
export type DrunkColumnNames = (typeof DrunkColumns)[keyof typeof DrunkColumns];
export type ColumnNames = (typeof AllColumns)[keyof typeof AllColumns];

export type ColNameObj<T> = { [key in ColumnNames]?: T };

export type ListObj = {
	id: string;
	name: string;
	items: {
		id: string;
		q: number;
	}[];
};

export type OgProperties = {
	title: string;
	type?: 'website';
	description: string;
	url: string;
};

export type TwitterProperties = Partial<{
	title: string;
	description: string;
	image?: string;
	card: 'summary_large_image';
	site?: string;
	creator?: string;
}>;

export type OGImage = {
	url: string;
	width: string | number;
	height: string | number;
	alt: string;
};

export type BadgeConfig = {
	text: string;
	color?: VariantProps<typeof components.badge>['color'];
	icon?: IconName;
	tooltip?: string;
	hideFromProductPage?: boolean;
	/** Only on the product page, for details too minor for lists and comparisons */
	productPageOnly?: boolean;
	/** Left out of lists' icon-only badges, for icons that don't say much on their own */
	hideWhenCompact?: boolean;
};
export type ColumnBadgeMap<T extends PriceListItem = PriceListItem> = Partial<
	Pick<Record<ColumnNames, BadgeConfig | Record<string, BadgeConfig>>, keyof T & ColumnNames>
>;

export type FilterValue = (string | number)[];
export type FilterValues = { [key in ColumnNames]: FilterValue };

/**
 * Sizes of Alko's product photos: `products` is a 160×192 box, `small` 500 px tall and `medium`
 * 600 px wide and `large` 900 px wide (see displayImageUrl)
 */
export type ImageTransform = 'products' | 'small' | 'medium' | 'large';

export type ShareType = (typeof ShareTypes)[keyof typeof ShareTypes];

export type ShareEvent = `share_${ShareType}`;
export type ShareViewEvent = `shared_${ShareType}_viewed`;

type ShareState = { url?: string; sid?: string; [key: string]: any };
type Shares = { [K in ShareEvent | ShareViewEvent]: ShareState };

export type GameTypes = 'daily' | 'unlimited' | 'archive';
type GameKeys = `${GameTypes}_game`;

type RSSFeed = 'site' | 'category' | 'product' | 'json';

type GameState =
	| {
			state: 'started';
			date: string;
	  }
	| {
			state: 'completed';
			date: string;
			score: number;
			questions_right: number;
	  };

type Games = { [K in GameKeys]: GameState };

/** Where the product page's "explore further" links lead */
export type ProductExploreTarget = 'list' | 'price_changes' | 'daily';

export type AnalyticsEventMap = {
	calculator_used: {
		using_saved_values: boolean;
		state: { percentage: number; volume: number; price: number };
		result: {
			perEuro: number;
			rawAlcohol: number;
		};
	};
	/** Once the recipe has stayed unchanged for a while, like calculator_used */
	punch_calculator_used: {
		ingredients: number;
		alko_products: number;
		volume: number;
		abv: number;
		price: number;
		people: number;
	};
	punch_template_used: { template: string };
	punch_swap: { from: string; to: string; saving: number };
	punch_to_list: { products: number };
	/** From the "Lisää" popup */
	punch_add_product: { product_number: string };
	open_settings: undefined;
	export_data: undefined;
	import_data: undefined;
	install_app: { outcome: 'accepted' | 'dismissed'; source: 'settings' | 'banner' };
	app_installed: undefined;
	pwa_launch: undefined;
	dismiss_install_banner: undefined;
	create_list: undefined;
	save_list: { url?: string };
	view_sizes: { product_number: string };
	show_price_history: { product_number?: string; [key: string]: any };
	show_product_details: { product_number: string };
	add_to_compare: { product_number: string };
	command_palette_open: undefined;
	command_palette_select: { kind: string; scope: string; query_length: number };
	view_compare: { product_numbers: string[]; url: string };
	scan_barcode: { ean: string; link?: string };
	scan_qr_code: { type: string; product_number: string; link?: string };
	preferred_store_changed: {
		storeId: string;
		storeName: string;
		city?: string;
		action?: 'set' | 'change';
	};
	store_compass_opened: { storeId: string; storeName: string };
	show_availability: { product_number?: string; [key: string]: any };
	daily_feedback: {
		date: string;
		run_mode: GameTypes;
		day_number?: number;
		question_index: number;
		game_hash: string;
		wrong_answer: boolean;
		wrong_price: boolean;
		wrong_image: boolean;
		unclear_question: boolean;
		ui_bug: boolean;
		other: boolean;
	};
	click_feed: { feed: RSSFeed; location: string };
	/** One per filtering session, with the selection of each active filter under its column name. */
	filters_used: {
		source: 'products' | 'list';
		exit: 'product' | 'navigate' | 'hidden';
		filters: string[];
		filter_count: number;
		changes: number;
		results?: number;
		[filter: string]: string | string[] | number | undefined;
	};
	site_feedback: {
		path: string;
		version: string;
		wrong_product_info: boolean;
		wrong_image: boolean;
		search_broken: boolean;
		filters_broken: boolean;
		page_crash: boolean;
		ui_bug: boolean;
		other: boolean;
	};
	/** An unexpected error, see `reportError` in `src/lib/utils/app/errorAnalytics.ts`. */
	app_error: {
		kind: 'load' | 'uncaught' | 'unhandled_rejection' | 'boundary';
		message: string;
		stack?: string;
		/** HTTP-style status SvelteKit gave a load error */
		status?: number;
		route?: string | null;
		path: string;
		version: string;
		/** Browser and version, such as "Chrome 121" or "Safari 16.6", see `browserLabel` */
		browser: string;
		user_agent: string;
	};
	watch_product: { product_number: string };
	unwatch_product: { product_number: string };
	/** The watchlist page was opened, with how many watched products had changed. */
	view_watchlist: { count: number; changed: number };
	open_zoomed_image: { product_number: string };
	/** The front page's "your watched products changed" banner was followed. */
	open_watchlist_banner: { changed: number };
	/** A link in the product page's "explore further" section was followed. */
	open_product_explore: { target: ProductExploreTarget; product_number: string };
	/** First-visit guidance was closed, see `src/lib/utils/user/guidance.ts`. */
	dismiss_guidance: { id: GuidanceId };
	/** A link in the front page intro was followed. */
	open_intro_link: { target: string };
	/** The error page showed a 4xx status, see `reportPageNotFound` in `errorAnalytics.ts`. */
	page_not_found: {
		status: number;
		/** `null` for a route that doesn't exist */
		route: string | null;
		message?: string;
		path: string;
		version: string;
	};
} & Shares &
	Games;

export type AnalyticsEventName = keyof AnalyticsEventMap;
