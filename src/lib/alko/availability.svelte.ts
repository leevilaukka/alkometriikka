import type { AvailabilityData } from '$lib/types';

const EMPTY_AVAILABILITY: AvailabilityData = { stores: {}, product: {} };

/**
 * availability.json, loaded after the price list so it never delays the first
 * render. Reading `current` in a template or `$derived` re-runs it once loaded;
 * code that can't do without it awaits `ready`.
 */
export class LazyAvailability {
	current = $state.raw<AvailabilityData>(EMPTY_AVAILABILITY);
	loaded = $state(false);
	readonly ready: Promise<AvailabilityData>;

	constructor(load: () => Promise<AvailabilityData>) {
		this.ready = load().then((data) => {
			this.current = data;
			this.loaded = true;
			return data;
		});
	}
}
