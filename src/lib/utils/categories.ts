// Category (Tyyppi / Alatyyppi) pages. Kept free of `$lib` imports so the
// prerender and sitemap scripts can share the exact same slugs and tree.

export const CATEGORY_BASE_PATH = '/kategoriat';

/** Categories with fewer active products than this get no page of their own. */
export const MIN_CATEGORY_PRODUCTS = 5;

export type CategoryNode = {
	name: string;
	slug: string;
	path: string;
	/** Number of products still in Alko's selection. */
	count: number;
	children: CategoryNode[];
};

export type CategoryEntry = {
	type: unknown;
	subType: unknown;
	removed: boolean;
};

/** "Kuohuviinit ja samppanjat" → "kuohuviinit-ja-samppanjat", "Väkevät" → "vakevat" */
export function categorySlug(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function categoryPath(typeSlug: string, subTypeSlug?: string): string {
	return subTypeSlug
		? `${CATEGORY_BASE_PATH}/${typeSlug}/${subTypeSlug}/`
		: `${CATEGORY_BASE_PATH}/${typeSlug}/`;
}

function asName(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function capitalize(value: string): string {
	return value.charAt(0).toLocaleUpperCase('fi-FI') + value.slice(1);
}

/** Page title without the site suffix, e.g. "Glögit - Viinit" (the same Alatyyppi can exist under several Tyyppi). */
export function categoryTitle(trail: CategoryNode[]): string {
	return trail
		.map((node) => node.name)
		.reverse()
		.join(' - ');
}

/** Meta description shared by the prerendered page and the client-side route. */
export function categoryDescription(trail: CategoryNode[]): string {
	const node = trail[trail.length - 1];
	const parent = trail.length > 1 ? ` (${trail[0].name})` : '';
	return `${node.name}${parent}: ${node.count.toLocaleString('fi-FI')} tuotetta Alkon valikoimassa. Vertaa hintoja, litrahintoja ja alkoholia euroa kohden Alkometriikassa.`;
}

/**
 * Builds the Tyyppi → Alatyyppi tree from products still in the selection.
 * Values are matched by slug, so casing differences end up in the same node.
 * Nodes below {@link MIN_CATEGORY_PRODUCTS} are dropped.
 */
export function buildCategoryTree(entries: Iterable<CategoryEntry>): CategoryNode[] {
	const types = new Map<string, { name: string; count: number; children: Map<string, CategoryNode> }>();
	for (const entry of entries) {
		if (entry.removed) continue;
		const type = asName(entry.type);
		const typeSlug = type && categorySlug(type);
		if (!typeSlug) continue;
		let node = types.get(typeSlug);
		if (!node) {
			node = { name: capitalize(type), count: 0, children: new Map() };
			types.set(typeSlug, node);
		}
		node.count += 1;

		const subType = asName(entry.subType);
		const subTypeSlug = subType && categorySlug(subType);
		if (!subTypeSlug) continue;
		let child = node.children.get(subTypeSlug);
		if (!child) {
			child = {
				name: capitalize(subType),
				slug: subTypeSlug,
				path: categoryPath(typeSlug, subTypeSlug),
				count: 0,
				children: []
			};
			node.children.set(subTypeSlug, child);
		}
		child.count += 1;
	}

	return [...types.entries()]
		.filter(([, node]) => node.count >= MIN_CATEGORY_PRODUCTS)
		.map(([slug, node]) => ({
			name: node.name,
			slug,
			path: categoryPath(slug),
			count: node.count,
			// A subtype repeating its parent (e.g. Viinit › viinit) is a catch-all, not a category
			children: [...node.children.values()]
				.filter((child) => child.count >= MIN_CATEGORY_PRODUCTS && child.slug !== slug)
				.sort((a, b) => b.count - a.count)
		}))
		.sort((a, b) => b.count - a.count);
}

/** Resolves URL slugs to `[type]` or `[type, subType]`, or undefined when there's no such page. */
export function findCategoryBySlugs(
	tree: CategoryNode[],
	typeSlug: string,
	subTypeSlug?: string
): CategoryNode[] | undefined {
	const type = tree.find((node) => node.slug === typeSlug);
	if (!type) return undefined;
	if (!subTypeSlug) return [type];
	const subType = type.children.find((node) => node.slug === subTypeSlug);
	return subType ? [type, subType] : undefined;
}

/**
 * Category pages a product belongs to, from the top level down. Removed
 * products can carry an older taxonomy where e.g. "punaviinit" was a Tyyppi,
 * so a Tyyppi matching exactly one current Alatyyppi is mapped onto it.
 * `legacy` tells the product's own Alatyyppi isn't part of the trail.
 */
export function findProductCategoryTrail(
	tree: CategoryNode[],
	type: unknown,
	subType: unknown
): { trail: CategoryNode[]; legacy: boolean } {
	const typeSlug = categorySlug(asName(type));
	if (!typeSlug) return { trail: [], legacy: false };
	const typeNode = tree.find((node) => node.slug === typeSlug);
	if (typeNode) {
		const subTypeSlug = categorySlug(asName(subType));
		const subTypeNode = subTypeSlug
			? typeNode.children.find((node) => node.slug === subTypeSlug)
			: undefined;
		return { trail: subTypeNode ? [typeNode, subTypeNode] : [typeNode], legacy: false };
	}
	const matches = tree.flatMap((parent) =>
		parent.children.filter((child) => child.slug === typeSlug).map((child) => [parent, child])
	);
	return { trail: matches.length === 1 ? matches[0] : [], legacy: true };
}

export const CATEGORY_INDEX_DESCRIPTION =
	'Selaa Alkon valikoimaa kategorioittain: viinit, oluet, väkevät ja muut. Vertaa hintoja, litrahintoja ja alkoholia euroa kohden Alkometriikassa.';
