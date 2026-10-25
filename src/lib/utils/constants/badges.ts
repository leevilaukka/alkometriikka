import type { ColumnBadgeMap, ColumnNames, PriceListItem } from '$lib/types';
import { formatCampaignWindow, getSaleInfo } from '../catalog/sales';
import { DatasetColumns, MissingValues } from './columns';
import { intlLocale, m } from '$lib/i18n';

// Matches the "N-pack" convention Alko uses in product names for multi-packs,
// e.g. "Karhu 4,6% 6-pack tölkki" or "Sandels 4,7% 24-pack tölkki".
const PACK_COUNT_RE = /(\d+)\s*-?\s*pack\b/i;

/**
 * Number of individual bottles/cans in a product, parsed from its name.
 * Returns 1 when the product isn't a multi-pack (or the count can't be determined).
 */
export function getPackCount(product: PriceListItem): number {
	const match = product[DatasetColumns.Name].match(PACK_COUNT_RE);
	return match ? Number(match[1]) : 1;
}

/** Column to badge mapping
 * Maps static dataset columns and their values to their corresponding badge configurations.
 *
 * @see DynamicColumnToBadgeMap for generating dynamic badge mappings based on product properties.
 */
export const ColumnToBadgeMap: ColumnBadgeMap = {
	// The other certificates (vegan, biodynamic, ...) are also listed in Huomautus and badged from there
	[DatasetColumns.SpecialGroup]: {
		Luomu: { text: m.badge_organic(), color: 'green', icon: 'plant_pot' }
	},
	[DatasetColumns.Availability]: {
		kausituote: { text: m.badge_seasonal(), color: 'orange', icon: 'tree' },
		erikoiserä: { text: m.badge_special_edition(), color: 'yellow', icon: 'star' },
		tilausvalikoima: { text: m.badge_order_selection(), color: 'cyan', icon: 'truck' }
	},
	[DatasetColumns.Status]: {
		Tulee: {
			text: m.badge_coming(),
			color: 'blue',
			icon: 'calendar_plus',
			tooltip: m.badge_coming_tooltip()
		},
		Poistuva: {
			text: m.badge_phasing_out(),
			color: 'orange',
			icon: 'calendar_minus',
			tooltip: m.badge_phasing_out_tooltip()
		}
	},
	[DatasetColumns.Note]: {
		'Vegaaneille soveltuva tuote': {
			text: m.badge_vegan(),
			color: 'emerald',
			icon: 'leaf',
			tooltip: m.badge_vegan_tooltip()
		},
		Biodynaaminen: {
			text: m.badge_biodynamic(),
			color: 'emerald',
			icon: 'yin_yang',
			hideWhenCompact: true
		},
		Alkuviini: { text: m.badge_natural_wine(), color: 'violet', icon: 'wine' },
		'Ei lisättyä sulfiittia': {
			text: m.badge_no_added_sulfites(),
			color: 'green',
			icon: 'check_circle',
			productPageOnly: true
		},
		'Myydään lahjapakkauksessa': {
			text: m.badge_gift_box(),
			color: 'pink',
			icon: 'gift',
			tooltip: m.badge_gift_box_tooltip()
		},
		Laktoositon: { text: m.badge_lactose_free(), color: 'cyan', icon: 'milk_bottle' },
		Gluteeniton: { text: m.badge_gluten_free(), color: 'amber', icon: 'baguette' },
		'Matala-alkoholinen': {
			text: m.badge_low_alcohol(),
			color: 'blue',
			icon: 'balloon',
			hideWhenCompact: true
		},
		Jälkiruokaviini: { text: m.badge_dessert_wine(), color: 'pink', icon: 'cake_slice' },
		Oranssiviini: { text: m.badge_orange_wine(), color: 'orange', icon: 'wine_alt' },
		'Rajallinen säilyvyys': {
			text: m.badge_limited_shelf_life(),
			color: 'yellow',
			icon: 'hourglass'
		},
		Kosher: { text: m.badge_kosher(), color: 'indigo', icon: 'certification' },
		'Puinen kuljetuspakkaus': {
			text: m.badge_wooden_box(),
			color: 'gray',
			icon: 'box',
			tooltip: m.badge_wooden_box_tooltip()
		}
	}
};

/**
 * Generates a dynamic column-to-badge mapping based on the properties of a given product item.
 * This allows for badges to be assigned conditionally, such as "Alkoholiton" for alcohol-free products.
 *
 * Uses the entire static column to badge mapping as a base and adds dynamic badges based on the product's properties on top.
 *
 * @param item The product item for which to generate the badge mapping.
 * @returns The combined mapping of static and dynamic badges for the given product item.
 */
export function DynamicColumnToBadgeMap<T extends PriceListItem>(item: T): ColumnBadgeMap<T> {
	const map: ColumnBadgeMap = { ...ColumnToBadgeMap };
	if (item[DatasetColumns.AlcoholPercentage] === 0) {
		map[DatasetColumns.AlcoholPercentage] = {
			text: m.badge_alcohol_free(),
			color: 'blue',
			icon: 'percentage'
		};
	}
	const sale = getSaleInfo({
		price: item[DatasetColumns.Price],
		normalPrice: item[DatasetColumns.NormalPrice],
		campaignStart: item[DatasetColumns.CampaignStart],
		campaignEnd: item[DatasetColumns.CampaignEnd]
	});
	if (sale) {
		const campaignWindow = formatCampaignWindow(sale, intlLocale);
		const normalPrice = `${sale.normalPrice.toLocaleString(intlLocale, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		})} €`;
		map[DatasetColumns.Price] = {
			text: m.badge_discount({ percent: sale.discountPercent }),
			color: 'red',
			icon: 'price_tag',
			tooltip: campaignWindow
				? m.badge_discount_tooltip_window({ price: normalPrice, window: campaignWindow })
				: m.badge_discount_tooltip({ price: normalPrice })
		};
	}
	const missing = (item as { [MissingValues]?: Set<ColumnNames> })[MissingValues];
	if (Number(item[DatasetColumns.Sugar]) === 0 && !missing?.has(DatasetColumns.Sugar)) {
		map[DatasetColumns.Sugar] = { text: m.badge_sugar_free(), color: 'gray' };
	}
	const packCount = getPackCount(item);
	if (packCount > 1) {
		map[DatasetColumns.Name] = { text: `${packCount}-pack`, color: 'gray', icon: 'package' };
	}
	if (item[DatasetColumns.New].toLowerCase() === 'uutuus') {
		map[DatasetColumns.New] = { text: m.value_new(), color: 'red', icon: 'pencil_sparkles' };
	}

	if (item[DatasetColumns.RemovedFromSelection] === true) {
		map[DatasetColumns.RemovedFromSelection] = {
			text: m.badge_removed(),
			color: 'red',
			icon: 'x_circle',
			tooltip: m.badge_removed_tooltip(),
			hideFromProductPage: true
		};
	}
	return map;
}
