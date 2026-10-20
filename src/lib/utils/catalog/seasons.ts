// Seasonal pages (`/kausi/<slug>/`): glögit, joulujuomat… Alko has no season
// column (its "kausituote" selection mixes summer rosés with Christmas beers), so
// each season matches products by name and category. Shared by the app and the
// stub prerender, which gives each season a page search engines can find.

export type SeasonProduct = { name: string; type: string; subType: string };

export type Season = {
	slug: string;
	/** Short name for links and chips */
	title: string;
	description: string;
	/** Shown under the heading */
	intro: string;
	keywords: string;
	/** Months (1–12) the season is current, when the front page and the index point to it */
	months: number[];
	matches: (product: SeasonProduct) => boolean;
};

const GLOGI = /gl[öo]gg?i|gl[öo]gg|gl[üu]hwein/i;
// Whole words (or ones that only start compounds), so "Jules", "Julius" or "Noëlles" don't count
const CHRISTMAS =
	/(^|[\s(-])(joulu\S*|christmas|xmas|jule|julebryg|juleøl|julmust|winter\S*|talvi\S*|gingerbread|piparkaku\S*|nutcracker|hiver|noël|noel|navidad|natale|weihnacht\S*)(?=$|[\s,.!?)'´-])/i;
/** Names with a Christmas word that aren't Christmas drinks (a producer called Winter…) */
const NOT_CHRISTMAS = /weingut winter|winter wheat/i;
const SPARKLING = /kuohuviini|samppanja|champagne/i;
const SIMA = /(^|\s)(sima|panimosima)(\s|$)|mead/i;
const SUMMER = /(^|\s)(summer|kesä|sommar)/i;
const SUMMER_CATEGORY = /roseeviinit|siiderit|juomasekoitukset/i;

const categoryOf = (product: SeasonProduct) => `${product.type} ${product.subType}`;

export const SEASONS: Season[] = [
	{
		slug: 'glogit',
		title: 'Glögit',
		description:
			'Kaikki Alkon glögit yhdessä: punaviini-, valkoviini- ja väkevät glögit sekä alkoholittomat. Vertaa hintoja, alkoholia eurolla ja saatavuutta myymälässäsi.',
		intro:
			'Alkon glögit viiniglögeistä väkeviin ja alkoholittomiin. Järjestä hinnan tai alkoholin mukaan ja rajaa omaan myymälääsi.',
		keywords: 'glögi, glögit, viiniglögi, väkevä glögi, alkoholiton glögi, glühwein, Alko, hinnat',
		months: [10, 11, 12, 1],
		matches: (product) => GLOGI.test(product.name) || GLOGI.test(product.subType)
	},
	{
		slug: 'joulujuomat',
		title: 'Joulujuomat',
		description:
			'Jouluoluet, talven kausijuomat ja joululiköörit Alkon valikoimasta. Vertaa hintoja ja katso, mitä myymälässäsi on.',
		intro:
			'Jouluoluet, talviset liköörit ja muut joulun kausijuomat. Glögit löydät omalta sivultaan.',
		keywords: 'joulujuomat, jouluolut, jouluoluet, talvijuomat, joululikööri, Alko',
		months: [11, 12],
		matches: (product) =>
			CHRISTMAS.test(product.name) && !NOT_CHRISTMAS.test(product.name) && !GLOGI.test(product.name)
	},
	{
		slug: 'kuohuviinit-uuteenvuoteen',
		title: 'Kuohuviinit uuteenvuoteen',
		description:
			'Alkon kuohuviinit ja samppanjat uudenvuoden juhlaan. Vertaa hintoja, löydä edullisimmat ja katso saatavuus myymälässäsi.',
		intro:
			'Kuohuviinit, samppanjat ja alkoholittomat kuohuvat uudenvuoden maljaan. Järjestä hinnan mukaan löytääksesi edullisimmat.',
		keywords: 'kuohuviini, samppanja, uusivuosi, cava, prosecco, alkoholiton kuohuviini, Alko',
		months: [12, 1],
		matches: (product) => SPARKLING.test(categoryOf(product))
	},
	{
		slug: 'vappujuomat',
		title: 'Vappujuomat',
		description:
			'Simat ja kuohuviinit vappuun Alkon valikoimasta. Vertaa hintoja ja katso, mitä myymälässäsi on.',
		intro: 'Simat, simaoluet ja kuohuviinit vappuun.',
		keywords: 'vappu, sima, kuohuviini, vappujuomat, Alko',
		months: [4, 5],
		matches: (product) => SIMA.test(product.name) || SPARKLING.test(categoryOf(product))
	},
	{
		slug: 'kesajuomat',
		title: 'Kesäjuomat',
		description:
			'Roseeviinit, siiderit, lonkerot ja kesän kausijuomat Alkon valikoimasta. Vertaa hintoja ja alkoholia eurolla.',
		intro: 'Roseeviinit, siiderit, lonkerot ja muut kesän juomat terassille ja mökille.',
		keywords: 'kesäjuomat, roseeviini, siideri, lonkero, kesä, Alko',
		months: [5, 6, 7, 8],
		matches: (product) => SUMMER.test(product.name) || SUMMER_CATEGORY.test(categoryOf(product))
	}
];

export function findSeason(slug: string | undefined): Season | undefined {
	return SEASONS.find((season) => season.slug === slug);
}

export function seasonPath(season: Season): string {
	return `/kausi/${season.slug}/`;
}

/** Seasons current in the given month (1–12), in definition order. */
export function currentSeasons(month: number = new Date().getMonth() + 1): Season[] {
	return SEASONS.filter((season) => season.months.includes(month));
}

export function seasonTitle(season: Season): string {
	return `${season.title} – Alkon valikoima ja hinnat`;
}
