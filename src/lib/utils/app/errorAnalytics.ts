import { version } from '$app/environment';
import type { AnalyticsEventMap } from '$lib/types';
import { browserLabel } from '$lib/utils/device/browser';
import { sendAnalyticsEvent } from './analytics';

type ErrorKind = AnalyticsEventMap['app_error']['kind'];

// Umami cuts event data strings at 500 characters
const maxMessageLength = 200;
const maxStackLength = 500;
const maxUserAgentLength = 300;
// A render loop can throw the same error on every frame; a few reports per page load are enough
const maxReportsPerLoad = 5;

// Thrown by the browser or extensions, not by the site's own code
const ignoredMessages = [/^Script error\.?$/, /ResizeObserver loop/];
const extensionUrl = /(chrome|moz|safari(-web)?)-extension:\/\//;

const reported = new Set<string>();

function describe(error: unknown) {
	if (error instanceof Error) {
		return { message: `${error.name}: ${error.message}`, stack: error.stack };
	}
	if (typeof error === 'string') return { message: error };
	try {
		return { message: JSON.stringify(error) ?? String(error) };
	} catch {
		return { message: String(error) };
	}
}

/** Waits for the analytics scripts, so errors thrown during the first load aren't lost. */
function whenAnalyticsLoaded(send: () => void) {
	if (document.readyState === 'complete') send();
	else window.addEventListener('load', send, { once: true });
}

/**
 * Sends an `app_error` event. The same error is sent once per page load, and at most
 * `maxReportsPerLoad` errors are sent in total.
 */
export function reportError(
	kind: ErrorKind,
	error: unknown,
	extra?: Pick<AnalyticsEventMap['app_error'], 'status' | 'route'>
) {
	const { message, stack } = describe(error);
	if (ignoredMessages.some((pattern) => pattern.test(message))) return;
	if (stack && extensionUrl.test(stack)) return;

	const signature = `${kind}|${message}`;
	if (reported.has(signature) || reported.size >= maxReportsPerLoad) return;
	reported.add(signature);

	const params: AnalyticsEventMap['app_error'] = {
		kind,
		message: message.slice(0, maxMessageLength),
		stack: stack?.slice(0, maxStackLength),
		...extra,
		// The query string is left out, like in Umami's pageviews
		path: location.pathname,
		version,
		browser: browserLabel(navigator.userAgent),
		user_agent: navigator.userAgent.slice(0, maxUserAgentLength)
	};
	whenAnalyticsLoaded(() => sendAnalyticsEvent('app_error', params));
}

/**
 * Sends a `page_not_found` event when the error page shows a 4xx status: a route that doesn't
 * exist, or an `error()` from a load function, such as an unknown product number. Other
 * statuses are unexpected errors, which `reportError` already sent.
 */
export function reportPageNotFound(
	status: number,
	route: string | null,
	path: string,
	message?: string
) {
	if (status < 400 || status >= 500) return;
	const params: AnalyticsEventMap['page_not_found'] = {
		status,
		route,
		message: message?.slice(0, maxMessageLength),
		path,
		version
	};
	whenAnalyticsLoaded(() => sendAnalyticsEvent('page_not_found', params));
}

/** Reports errors that SvelteKit's `handleError` doesn't see: event handlers, timers, promises. */
export function trackUncaughtErrors() {
	window.addEventListener('error', (event) => {
		// Errors from third-party scripts (analytics, extensions) carry their own file
		if (event.filename && new URL(event.filename, location.href).origin !== location.origin) return;
		reportError('uncaught', event.error ?? event.message);
	});
	window.addEventListener('unhandledrejection', (event) => {
		reportError('unhandled_rejection', event.reason);
	});
}
