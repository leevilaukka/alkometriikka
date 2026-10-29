import type { IconName } from '$lib/icons';
import { appPath } from './paths';

/** Pages in the header's Lisää menu, by group. Up to two of them also get their own header buttons */
export const navGroups = [
	{
		label: 'Selaa',
		items: [
			{ href: '/kategoriat/', icon: 'wine', name: 'Kategoriat' },
			{ href: '/hinnanmuutokset/', icon: 'trending_down', name: 'Hinnanmuutokset' },
			{ href: '/tilastot/', icon: 'stats', name: 'Tilastot' }
		]
	},
	{
		label: 'Omat',
		items: [
			{ href: '/seuratut/', icon: 'bell', name: 'Seuratut' },
			{ href: '/listat/', icon: 'list_ul', name: 'Listat' }
		]
	},
	{
		label: 'Myymälät',
		items: [
			{ href: '/myymalat/', icon: 'store', name: 'Myymälät' },
			{ href: '/kompassi/', icon: 'compass', name: 'Kompassi' }
		]
	},
	{
		label: 'Työkalut & Pelit',
		items: [
			{ href: '/laskin/', icon: 'calculator', name: 'Laskin' },
			{ href: '/boolilaskuri/', icon: 'cocktail', name: 'Boolilaskuri', shortName: 'Booli' },
			{ href: '/daily/', icon: 'flame', name: 'Daily' },
			{ href: '/daily/arkisto/', icon: 'archive', name: 'Daily-arkisto' }
		]
	}
] as const satisfies readonly {
	label: string;
	/** shortName stands in for name on a header button, where space is tight */
	items: readonly { href: string; icon: IconName; name: string; shortName?: string }[];
}[];

export type NavItem = (typeof navGroups)[number]['items'][number];
export type NavHref = NavItem['href'];

export const navItems = navGroups.flatMap((group): readonly NavItem[] => group.items);

/** How many pages fit on the header as their own buttons */
export const HEADER_SLOT_COUNT = 2;

/** The header buttons for anyone who hasn't picked their own */
export const defaultHeaderSlots: NavHref[] = ['/daily/', '/listat/'];

/** A stored pick of header buttons, or null when it is missing or no longer fits the menu */
export function sanitizeHeaderSlots(value: unknown): NavHref[] | null {
	if (!Array.isArray(value) || value.length > HEADER_SLOT_COUNT) return null;
	if (new Set(value).size !== value.length) return null;
	const known = (href: unknown) => navItems.some((item) => item.href === href);
	return value.every(known) ? (value as NavHref[]) : null;
}

/** What to keep of a pick: null when it matches the defaults, so it keeps following them */
export function storedHeaderSlots(slots: NavHref[]): NavHref[] | null {
	const isDefault =
		slots.length === defaultHeaderSlots.length &&
		slots.every((slot, index) => slot === defaultHeaderSlots[index]);
	return isDefault ? null : slots;
}

/** Pins a page to the end of the header, unpinning the earliest pin when the header is full */
export function pinHeaderSlot(
	slots: NavHref[],
	href: NavHref
): { slots: NavHref[]; unpinned?: NavHref } {
	if (slots.length < HEADER_SLOT_COUNT) return { slots: [...slots, href] };
	const [unpinned, ...rest] = slots;
	return { slots: [...rest, href], unpinned };
}

/** The menu page the path is on, the most specific one when several match (Daily-arkisto over Daily) */
export function currentNavHref(pathname: string): NavHref | undefined {
	return navItems
		.filter((item) => pathname.startsWith(appPath(item.href)))
		.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
