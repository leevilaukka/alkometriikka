import { dev } from '$app/environment';
import type { AnalyticsEventMap, AnalyticsEventName } from '$lib/types';

export function sendAnalyticsEvent<T extends AnalyticsEventName>(
	eventName: T,
	...args: AnalyticsEventMap[T] extends undefined
		? [params?: undefined]
		: [params: AnalyticsEventMap[T]]
) {
	const [eventParams] = args;
	if (dev) return console.warn(`Analytics event skipped in dev mode: ${eventName}`, eventParams);

	if (typeof window.sa_event === 'function') {
		window.sa_event(eventName, eventParams);
	}
	if (typeof window.umami === 'object' && typeof window.umami.track === 'function') {
		window.umami.track(eventName, eventParams);
	}
}
