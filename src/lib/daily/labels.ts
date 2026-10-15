// Question texts and answer formatting shared by the daily game and its archive. The questions
// themselves are data (questions.ts), so the same baked game reads in every language.
import { AllColumns } from '$lib/utils/constants/columns';
import { formatNumber } from '$lib/utils/format/format';
import { intlLocale, locale, m } from '$lib/i18n';
import { translateValue } from '$lib/i18n/values';
import type { AttributeMetric, ChoiceField, Question } from './questions';

export function formatPrice(value: number): string {
	return new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'EUR' }).format(value);
}

function fixed(value: number, decimals: number): string {
	return formatNumber(value, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
		useGrouping: false
	});
}

export function formatEfficiency(value: number): string {
	return `${fixed(value, 2)} ml/€`;
}

export function attributeTitle(metric: AttributeMetric): string {
	return {
		alcohol: m.daily_question_more_alcohol,
		volume: m.daily_question_bigger_package,
		literPrice: m.daily_question_cheaper_per_liter,
		sugar: m.daily_question_more_sugar,
		energy: m.daily_question_more_energy
	}[metric]();
}

export function attributeValueLabel(metric: AttributeMetric, value: number): string {
	const decimals =
		metric === 'volume' || metric === 'literPrice' ? 2 : metric === 'alcohol' ? 1 : 0;
	const formatted = fixed(value, decimals);
	if (metric === 'alcohol') return `${formatted}${locale === 'en' ? '%' : ' %'}`;
	if (metric === 'volume') return `${formatted} l`;
	if (metric === 'literPrice') return `${formatted} €/l`;
	if (metric === 'sugar') return `${formatted} g/l`;
	return `${formatted} kcal/100 ml`;
}

export function choiceTitle(field: ChoiceField): string {
	if (field === 'country') return m.daily_question_country();
	if (field === 'manufacturer') return m.daily_question_manufacturer();
	return m.daily_question_category();
}

/** Choice answers are dataset values: countries and categories are shown translated. */
export function choiceLabel(field: ChoiceField, value: string): string {
	if (field === 'country') return translateValue(value, AllColumns.Country);
	if (field === 'category') return translateValue(value, AllColumns.Type);
	return value;
}

/** The heading of any question that isn't a choice. */
export function questionTitle(question: Question): string {
	if (question.type === 'efficiency') return m.daily_question_efficiency();
	if (question.type === 'attribute') return attributeTitle(question.metric);
	if (question.type === 'price') return m.daily_question_price();
	if (question.type === 'estimate') return m.daily_question_estimate();
	if (question.type === 'choice') return choiceTitle(question.field);
	return m.daily_question_cheaper();
}

/** "Valmistaja · Kategoria · Pakkaus" shown under the product in price estimate questions. */
export function estimateDetails(product: Record<string, unknown> | undefined): string {
	if (!product) return '';
	return [
		product[AllColumns.Manufacturer],
		typeof product[AllColumns.Type] === 'string'
			? translateValue(product[AllColumns.Type] as string, AllColumns.Type)
			: undefined,
		typeof product[AllColumns.PackagingType] === 'string'
			? translateValue(product[AllColumns.PackagingType] as string, AllColumns.PackagingType)
			: undefined
	]
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		.join(' · ');
}
