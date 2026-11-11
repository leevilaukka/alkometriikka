import { describe, expect, it } from 'bun:test';
import {
	buildOptionRows,
	groupOptionsByWords,
	type OptionNode,
	type OptionRow
} from '$lib/utils/ui/optionGroups';

const shape = (nodes: OptionNode[]): unknown[] =>
	nodes.map((node) =>
		node.type === 'option' ? node.label : { [node.label]: shape(node.children) }
	);

describe('groupOptionsByWords', () => {
	it('groups by city and a shared district, keeping single stores ungrouped', () => {
		const groups = groupOptionsByWords([
			'Alajärvi',
			'Helsinki Kallio',
			'Helsinki keskusta Arkadia',
			'Helsinki keskusta Kamppi',
			'Kaarina',
			'Kaarina Piikkiö'
		]);
		expect(shape(groups)).toEqual([
			'Alajärvi',
			{ Helsinki: ['Kallio', { Keskusta: ['Arkadia', 'Kamppi'] }] },
			{ Kaarina: ['Kaarina', 'Piikkiö'] }
		]);
		const helsinki = groups[1];
		expect(helsinki.type === 'group' && helsinki.values).toEqual([
			'Helsinki Kallio',
			'Helsinki keskusta Arkadia',
			'Helsinki keskusta Kamppi'
		]);
	});

	it('merges a group that only holds one sub group', () => {
		const groups = groupOptionsByWords(['Hyvinkää Willa Citymarket', 'Hyvinkää Willa Prisma']);
		expect(shape(groups)).toEqual([{ 'Hyvinkää Willa': ['Citymarket', 'Prisma'] }]);
		expect(groups[0].type === 'group' && groups[0].key).toBe('Hyvinkää Willa');
		const lower = groupOptionsByWords(['Kemi keskusta A', 'Kemi keskusta B']);
		expect(shape(lower)).toEqual([{ 'Kemi keskusta': ['A', 'B'] }]);
	});

	it('capitalizes the labels but keeps the values and keys as they are', () => {
		const groups = groupOptionsByWords([
			'Joensuu keskusta Sokos',
			'Joensuu Pilkko Citymarket',
			'Kajaani keskusta Citymarket',
			'Kajaani Prisma'
		]);
		expect(shape(groups)).toEqual([
			{ Joensuu: ['Keskusta Sokos', 'Pilkko Citymarket'] },
			{ Kajaani: ['Keskusta Citymarket', 'Prisma'] }
		]);
		const kajaani = groups[1];
		expect(kajaani.type === 'group' && kajaani.children[0]).toEqual({
			type: 'option',
			value: 'Kajaani keskusta Citymarket',
			label: 'Keskusta Citymarket'
		});
	});

	it('stops at the given depth', () => {
		const groups = groupOptionsByWords(['A b c d', 'A b c e', 'A x'], 1);
		expect(shape(groups)).toEqual([{ A: ['B c d', 'B c e', 'X'] }]);
	});
});

describe('buildOptionRows', () => {
	const values = ['A x', 'A y', 'A z', 'B', 'C d e', 'C d f', 'C g'];
	const items = values.map((value) => ({ value }));
	const groups = groupOptionsByWords(values);
	const all = () => true;
	// Indented by depth, "*" marks a striped row and "_" a divider
	const view = (rows: OptionRow<{ value: string }>[]) =>
		rows.map(
			(row) =>
				`${'  '.repeat(row.depth)}${row.label}${row.striped ? ' *' : ''}${row.divider ? ' _' : ''}`
		);

	it('keeps the stripes of the rows after a group when opening it', () => {
		expect(view(buildOptionRows(groups, items, all, () => false))).toEqual(['A *', 'B', 'C *']);
		expect(view(buildOptionRows(groups, items, all, (key) => key === 'A'))).toEqual([
			'A *',
			'  X',
			'  Y *',
			'  Z _',
			'B',
			'C *'
		]);
	});

	it('marks a group end only when the next row has the same stripe', () => {
		const rows = buildOptionRows(groups, items, all, (key) => key.startsWith('C'));
		expect(view(rows)).toEqual(['A *', 'B', 'C *', '  D', '    E *', '    F', '  G *']);
	});

	it('hides the options that do not match and the groups left empty', () => {
		const rows = buildOptionRows(
			groups,
			items,
			(value) => value !== 'A y' && value !== 'B',
			() => true
		);
		expect(view(rows)).toEqual(['A *', '  X', '  Z *', 'C', '  D *', '    E', '    F *', '  G']);
		const a = rows[0];
		expect(a.type === 'group' && a.items.map((item) => item.value)).toEqual(['A x', 'A z']);
		expect(
			buildOptionRows(
				groups,
				items,
				(value) => value.startsWith('C'),
				() => false
			).length
		).toBe(1);
	});

	it('lists the groups each row is in', () => {
		const rows = buildOptionRows(groups, items, all, () => true);
		expect(rows.map((row) => row.parents.join('/'))).toEqual([
			'',
			'A',
			'A',
			'A',
			'',
			'',
			'C',
			'C/C d',
			'C/C d',
			'C'
		]);
	});
});
