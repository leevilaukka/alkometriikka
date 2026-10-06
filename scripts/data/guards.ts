import type { MigratedProduct } from './types.ts';

export function isMigratedProduct(entry: unknown): entry is MigratedProduct {
	return (
		!!entry &&
		typeof entry === 'object' &&
		typeof (entry as MigratedProduct).hash === 'string' &&
		Array.isArray((entry as MigratedProduct).values)
	);
}
