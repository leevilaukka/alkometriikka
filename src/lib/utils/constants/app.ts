import { m } from '$lib/i18n';
import type { setSEO } from '../app/meta';

/** Value of the preferred store setting that follows the store nearest to the user. */
export const AUTO_STORE_ID = 'auto';

/** Keys used for storing data in localStorage */
export const LocalStorageKeys = {
	PersonalInfo: 'personal_info',
	PreferredStore: 'preferred_store',
	OnlyPreferredStore: 'only_preferred_store',
	UserLocation: 'user_location',
	UserLocationUpdatedAt: 'user_location_updated_at',
	Lists: 'lists',
	ListsVersion: 'lists_version',
	AppVersion: 'app_version',
	CurrentFilters: 'current_filters',
	Theme: 'theme',
	ViewedShares: 'viewed_shares',
	CompareProducts: 'compare_products',
	CompareHighlightDifferences: 'compare_highlight_differences',
	DismissedNotices: 'dismissed_notices',
	FlagOverrides: 'flag_overrides',
	FlagVisitorId: 'flag_visitor_id',
	InstallBanner: 'install_banner',
	/** The chosen language. Read and written by Paraglide as a plain string, not JSON */
	Locale: 'locale',
	LanguageBannerDismissed: 'language_banner_dismissed',
	DailyGame: 'alkometriikka-daily-v1',
	DailyStreak: 'alkometriikka-daily-streak-v1',
	DailyUnlimitedRun: 'alkometriikka-daily-unlimited-v1',
	DailyUnlimitedEnabled: 'alkometriikka-daily-unlimited-enabled',
	DailyArchiveScores: 'alkometriikka-daily-archive-scores-v1',
	DailyArchiveRuns: 'alkometriikka-daily-archive-runs-v1'
} as const;

export const ShareTypes = {
	Default: 'page',
	List: 'list',
	Product: 'product',
	Filters: 'filters',
	Similar: 'similar',
	Compare: 'compare',
	DailyGame: 'daily_game'
} as const;

export const ContextKeys = {
	SearchParamsManager: 'search_params_manager'
} as const;

/** Options for gender selection */
export const GenderOptionsMap = {
	Male: 'Mies',
	Female: 'Nainen',
	Unspecified: 'Muu'
} as const satisfies { [key: string]: string };

export const defaultSEOData = {
	description: m.seo_home_description(),
	og: {
		title: 'Alkometriikka',
		description: m.seo_default_description(),
		url: 'https://alkometriikka.fi',
		type: 'website'
	},
	image: {
		url: '/images/og_image.png',
		alt: m.seo_logo_alt(),
		width: '1200',
		height: '630'
	},
	twitter: {
		title: 'Alkometriikka',
		card: 'summary_large_image',
		image: '/images/twitter_image.png',
		description: m.seo_default_description()
	},
	keywords: m.seo_home_keywords()
} as const satisfies Parameters<typeof setSEO>[0];
