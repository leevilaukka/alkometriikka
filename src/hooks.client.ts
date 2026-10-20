import type { ClientInit, HandleClientError } from '@sveltejs/kit';
import { reportError, trackUncaughtErrors } from '$lib/utils/app/errorAnalytics';

export const init: ClientInit = trackUncaughtErrors;

// Called for unexpected errors while loading or rendering a page, and for routes that don't
// exist. Errors thrown with `error()` in a load function are expected and don't come here.
// The error page reports those and missing routes as `page_not_found`
export const handleError: HandleClientError = ({ error, status, event }) => {
	console.error(error);
	if (status === 404) return;
	reportError('load', error, { status, route: event.route.id });
};
