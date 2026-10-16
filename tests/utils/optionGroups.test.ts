import { describe, expect, it } from 'bun:test';
import { groupOptionsByWords, type OptionNode } from '$lib/utils/ui/optionGroups';

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
			{ Helsinki: ['Kallio', { keskusta: ['Arkadia', 'Kamppi'] }] },
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
	});

	it('stops at the given depth', () => {
		const groups = groupOptionsByWords(['A b c d', 'A b c e', 'A x'], 1);
		expect(shape(groups)).toEqual([{ A: ['b c d', 'b c e', 'x'] }]);
	});
});
