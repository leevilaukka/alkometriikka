import type { ColumnNames } from '$lib/types';
import { replaceState } from '$app/navigation';
import { isNullish } from '../format/labels';

export class SearchParamsManager {
	params = new URLSearchParams();
	persistentParams = new URLSearchParams();
	mergedParams = new URLSearchParams();

	constructor(url: URL) {
		this.params = url.searchParams;
	}

	update() {
		this.mergedParams = new URLSearchParams([...this.params, ...this.persistentParams]);
		let url = window.location.pathname;
		if (this.mergedParams.size) url += `?${this.mergedParams.toString()}`;
		updateURL(url);
	}

	reset() {
		this.params = new URLSearchParams();
	}

	addParameter(key: string, value: string) {
		if (!isNullish(value)) this.params.append(key, value);
		else this.params.delete(key);
		return this;
	}

	setParameter(key: string, value: string) {
		if (!isNullish(value)) this.params.set(key, value);
		else this.params.delete(key);
		return this;
	}

	setParametersFromObject(object: Record<string, string | string[]>) {
		Object.entries(object).forEach(([key, value]) => {
			this.params.delete(key);
			if (Array.isArray(value)) value.forEach((v) => this.addParameter(key, v));
			else this.addParameter(key, value);
		});
		return this;
	}

	setParametersFromURL(url: URL) {
		this.params = url.searchParams;
	}

	addPersistentParameter(key: string, value?: string) {
		this.persistentParams.append(key, value ?? '');
		return this;
	}

	setPersistentParameter(key: string, newValue: string) {
		this.persistentParams.set(key, newValue);
		return this;
	}

	getParameter(key: string) {
		return this.params.get(key);
	}

	getAllParameters(key: string) {
		return this.params.getAll(key);
	}

	getAll() {
		return this.mergedParams;
	}

	getPersistentParameter(key: string) {
		return this.persistentParams.get(key);
	}

	getAllPersistentParameters(key: string) {
		return this.persistentParams.getAll(key);
	}
}

let routerReady = false;
let pendingUrl: string | null = null;

/**
 * Fired (via `afterNavigate`) once the SvelteKit router is initialized and URL
 * replacement is allowed. Any replacements requested before the router was
 * ready are flushed once it is.
 */
export function markRouterReady() {
	routerReady = true;
	if (pendingUrl !== null) {
		const url = pendingUrl;
		pendingUrl = null;
		// Defer to a microtask so the flush runs after the router has fully
		// initialized (it marks itself ready right after the initial navigation).
		queueMicrotask(() => replaceState(url, {}));
	}
}

/**
 * Replaces the current URL, or queues the replacement until the router is ready.
 * Before the router initializes the URL already reflects the loaded page, so a
 * queued write only matters for edits like stripping a `sid` parameter.
 */
export function updateURL(url: string) {
	if (!routerReady) {
		pendingUrl = url;
		return;
	}
	replaceState(url, {});
}

export function mergeFilterParameters(
	oldParameters: URLSearchParams,
	newParameters: URLSearchParams,
	filterValues: Record<ColumnNames, any[]>
) {
	oldParameters = new URLSearchParams(
		[...oldParameters.entries()].filter(([key]) => {
			return !Object.hasOwn(filterValues, key);
		})
	);
	const merged = oldParameters;
	for (const [key, value] of newParameters.entries()) {
		if (merged.has(key)) {
			const existingValues = merged.getAll(key);
			if (!existingValues.includes(value)) {
				merged.append(key, value);
			}
		} else {
			merged.append(key, value);
		}
	}
	return merged;
}
