/** Runs `fn` over `items` with at most `limit` concurrent workers. A failure stops scheduling. */
export async function mapPool<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	let failed = false;
	async function worker() {
		while (!failed && next < items.length) {
			const index = next;
			next += 1;
			try {
				results[index] = await fn(items[index]);
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
	return results;
}
