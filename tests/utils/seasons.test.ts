import { describe, expect, it } from 'bun:test';
import { currentSeasons, findSeason, SEASONS, seasonPath } from '$lib/utils/catalog/seasons';

const season = (slug: string) => findSeason(slug)!;
const product = (name: string, type = 'Viinit', subType = '') => ({ name, type, subType });

describe('season rules', () => {
	it('finds glögi by name or category, alcohol-free ones too', () => {
		const glogit = season('glogit');
		expect(glogit.matches(product('Blossa Ekologisk Vinglögg Röd'))).toBe(true);
		expect(glogit.matches(product('Berg Glühwein Organic'))).toBe(true);
		expect(glogit.matches(product('Loimu 2026', 'Välituotteet', 'glögit'))).toBe(true);
		expect(glogit.matches(product('Ystävän Glögi Mustikka', 'Alkoholittomat'))).toBe(true);
		expect(glogit.matches(product('Koff Jouluolut'))).toBe(false);
	});

	it('finds Christmas drinks by whole words, leaving glögi to its own page', () => {
		const joulu = season('joulujuomat');
		for (const name of [
			'Koff Jouluolut 6-pack',
			'Amager Julebryg 2025 tölkki',
			'Ayinger Winterbock',
			'Shepherd Neame Christmas Ale',
			'Leffe D´hiver Winter',
			'Koskenkorva Cream Gingerbread'
		])
			expect(joulu.matches(product(name))).toBe(true);
		for (const name of [
			'Jules Gautret VS',
			'Santa Julia Organic Viognier 2023',
			'Domaine Les Hautes Noëlles Voulez-Vous Gamay Avec Moi? 2021',
			'Weingut Winter Riesling Trocken 2024',
			'Jouluglögi Vadelma'
		])
			expect(joulu.matches(product(name))).toBe(false);
	});

	it('finds sparkling wines by category and sima by name', () => {
		expect(
			season('kuohuviinit-uuteenvuoteen').matches(
				product('Cava Brut', 'Viinit', 'kuohuviinit ja samppanjat')
			)
		).toBe(true);
		expect(season('vappujuomat').matches(product('Plevna Panimosima', 'Panimotuotteet'))).toBe(
			true
		);
		expect(season('vappujuomat').matches(product('Simpsons Classic Cuvee'))).toBe(false);
	});
});

describe('season lookup', () => {
	it('has unique slugs and paths', () => {
		expect(new Set(SEASONS.map((s) => s.slug)).size).toBe(SEASONS.length);
		expect(seasonPath(season('glogit'))).toBe('/kausi/glogit/');
		expect(findSeason('nope')).toBeUndefined();
	});

	it('picks the seasons of a month', () => {
		expect(currentSeasons(12).map((s) => s.slug)).toEqual([
			'glogit',
			'joulujuomat',
			'kuohuviinit-uuteenvuoteen'
		]);
		expect(currentSeasons(3)).toEqual([]);
	});
});
