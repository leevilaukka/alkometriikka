import type { AvailabilityData } from '$lib/types';

export const EMPTY_AVAILABILITY: AvailabilityData = { stores: {}, product: {} };

/**
 * availability.json, loaded after the price list so it never delays the first
 * render. Reading `current` in a template or `$derived` re-runs it once loaded;
 * code that can't do without it awaits `ready`. If the file can't be loaded,
 * `current` stays empty and `failed` tells that apart from a product in no store.
 */
export class LazyAvailability {
	current = $state.raw<AvailabilityData>(EMPTY_AVAILABILITY);
	loaded = $state(false);
	failed = $state(false);
	readonly ready: Promise<AvailabilityData>;

	/** `load` resolves to null when the file couldn't be loaded */
	constructor(load: () => Promise<AvailabilityData | null>) {
		this.ready = load().then((data) => {
			if (data) this.current = data;
			else this.failed = true;
			this.loaded = true;
			return this.current;
		});
	}
}
