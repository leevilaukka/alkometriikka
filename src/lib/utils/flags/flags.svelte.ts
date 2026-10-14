import { resolve } from '$app/paths';
import { dev } from '$app/environment';
import { LocalStorageKeys } from '../constants/app';
import { LocalStorageManager } from '../app/storage';
import {
	applyOverrideParams,
	flagSessionData,
	isFlagOn,
	parseFlags,
	type FlagOverrides,
	type Flags
} from './flags';

function getVisitorId() {
	let id = LocalStorageManager.getItem(LocalStorageKeys.FlagVisitorId);
	if (!id) {
		id = crypto.randomUUID();
		LocalStorageManager.setItem(LocalStorageKeys.FlagVisitorId, id);
	}
	return id;
}

function readOverrides(): FlagOverrides {
	const stored = LocalStorageManager.getItem(LocalStorageKeys.FlagOverrides) ?? {};
	const params = new URLSearchParams(location.search);
	if (!params.has('flag')) return stored;
	const overrides = applyOverrideParams(stored, params);
	LocalStorageManager.setItem(LocalStorageKeys.FlagOverrides, overrides);
	return overrides;
}

const state = $state<{ flags: Flags; loaded: boolean }>({ flags: {}, loaded: false });
const overrides = readOverrides();
const visitorId = getVisitorId();

/**
 * Use `flags.on('name')` in templates and deriveds. Flags are off until `flags.json` has loaded
 * (or when it can't be), unless the visitor overrode them, which counts from the first render.
 *
 *     {#if flags.on('new-compare')} … {/if}
 */
export const flags = {
	on(name: string): boolean {
		return isFlagOn(name, state.flags, overrides, visitorId);
	},
	/** True once `flags.json` has loaded, for UI that shouldn't flash from the old to the new variant. */
	get loaded() {
		return state.loaded;
	}
};

/**
 * Tags the visitor's Umami session with how each flag resolved (`flag_<name>`), so traffic and
 * events can be filtered or compared by flag. Nothing is sent while no flag exists.
 */
function reportFlags() {
	const data = flagSessionData(state.flags, overrides, visitorId);
	if (dev || !Object.keys(data).length) return;
	const identify = () => window.umami?.identify(data);
	// The analytics script is deferred, so it may not have run yet
	if (window.umami) identify();
	else window.addEventListener('load', identify, { once: true });
}

/** Fetches `flags.json` after the app has rendered; a missing or broken file just leaves every flag off. */
export function loadFlags() {
	fetch(resolve('/') + 'flags.json', { cache: 'no-cache' })
		.then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
		.then((raw) => {
			state.flags = parseFlags(raw);
			reportFlags();
		})
		.catch((error) => console.warn('Ominaisuuslippujen lataaminen epäonnistui:', error))
		.finally(() => {
			state.loaded = true;
		});
}
