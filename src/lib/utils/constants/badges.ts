import type { ColumnBadgeMap, ColumnNames, PriceListItem } from '$lib/types';
import { formatCampaignWindow, getSaleInfo } from '../catalog/sales';
import { STALE_ARRIVAL_STATUS } from '../catalog/status';
import { DatasetColumns, MissingValues } from './columns';

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
		Luomu: { text: 'Luomu', color: 'green', icon: 'plant_pot' }
	},
	[DatasetColumns.Availability]: {
		kausituote: { text: 'Kausituote', color: 'orange', icon: 'tree' },
		erikoiserä: { text: 'Erikoiserä', color: 'yellow', icon: 'star' },
		tilausvalikoima: { text: 'Tilausvalikoima', color: 'cyan', icon: 'truck' }
	},
	[DatasetColumns.Status]: {
		Tulee: {
			text: 'Tulossa',
			color: 'blue',
			icon: 'calendar_plus',
			tooltip: 'Tuote on tulossa Alkon valikoimaan, mutta ei ole vielä myynnissä'
		},
		Poistuva: {
			text: 'Poistuva',
			color: 'orange',
			icon: 'calendar_minus',
			tooltip: 'Tuote on poistumassa Alkon valikoimasta'
		},
		[STALE_ARRIVAL_STATUS]: {
			text: 'Ei myynnissä',
			color: 'gray',
			icon: 'calendar_x',
			tooltip:
				'Alko listaa tuotteen yhä tulevaksi, vaikka sen julkaisupäivä on mennyt jo kauan sitten. Tuotetta ei myydä missään, eikä Alkon sivuilla ole sille tuotesivua'
		}
	},
	[DatasetColumns.Note]: {
		'Vegaaneille soveltuva tuote': {
			text: 'Vegaani',
			color: 'emerald',
			icon: 'leaf',
			tooltip: 'Vegaaneille soveltuva tuote'
		},
		Biodynaaminen: {
			text: 'Biodynaaminen',
			color: 'emerald',
			icon: 'yin_yang',
			hideWhenCompact: true
		},
		Alkuviini: { text: 'Alkuviini', color: 'violet', icon: 'wine' },
		'Ei lisättyä sulfiittia': {
			text: 'Ei lisättyä sulfiittia',
			color: 'green',
			icon: 'check_circle',
			productPageOnly: true
		},
		'Myydään lahjapakkauksessa': {
			text: 'Lahjapakkaus',
			color: 'pink',
			icon: 'gift',
			tooltip: 'Myydään lahjapakkauksessa'
		},
		Laktoositon: { text: 'Laktoositon', color: 'cyan', icon: 'milk_bottle' },
		Gluteeniton: { text: 'Gluteeniton', color: 'amber', icon: 'baguette' },
		'Matala-alkoholinen': {
			text: 'Matala-alkoholinen',
			color: 'blue',
			icon: 'balloon',
			hideWhenCompact: true
		},
		Jälkiruokaviini: { text: 'Jälkiruokaviini', color: 'pink', icon: 'cake_slice' },
		Oranssiviini: { text: 'Oranssiviini', color: 'orange', icon: 'wine_alt' },
		'Rajallinen säilyvyys': { text: 'Rajallinen säilyvyys', color: 'yellow', icon: 'hourglass' },
		Kosher: { text: 'Kosher', color: 'indigo', icon: 'certification' },
		'Puinen kuljetuspakkaus': {
			text: 'Puulaatikko',
			color: 'gray',
			icon: 'box',
			tooltip: 'Puinen kuljetuspakkaus'
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
			text: 'Alkoholiton',
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
		const campaignWindow = formatCampaignWindow(sale);
		map[DatasetColumns.Price] = {
			text: `Alennus ${sale.discountPercent}%`,
			color: 'red',
			icon: 'price_tag',
			tooltip: `Normaalihinta ${sale.normalPrice.toLocaleString('fi-FI', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			})} €${campaignWindow ? ` · voimassa ${campaignWindow}` : ''}`
		};
	}
	const missing = (item as { [MissingValues]?: Set<ColumnNames> })[MissingValues];
	if (Number(item[DatasetColumns.Sugar]) === 0 && !missing?.has(DatasetColumns.Sugar)) {
		map[DatasetColumns.Sugar] = { text: 'Sokeriton', color: 'gray' };
	}
	const packCount = getPackCount(item);
	if (packCount > 1) {
		map[DatasetColumns.Name] = { text: `${packCount}-pack`, color: 'gray', icon: 'package' };
	}
	if (item[DatasetColumns.New].toLowerCase() === 'uutuus') {
		map[DatasetColumns.New] = { text: 'Uutuus', color: 'red', icon: 'pencil_sparkles' };
	}

	if (item[DatasetColumns.RemovedFromSelection] === true) {
		map[DatasetColumns.RemovedFromSelection] = {
			text: 'Poistettu valikoimasta',
			color: 'red',
			icon: 'x_circle',
			tooltip: 'Tuote on poistettu Alkon valikoimista',
			hideFromProductPage: true
		};
	}
	return map;
}
