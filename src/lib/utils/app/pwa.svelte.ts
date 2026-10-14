import type { BeforeNavigate } from '@sveltejs/kit';
import { updated } from '$app/state';
import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
import { LocalStorageKeys } from '$lib/utils/constants/app';
import { LocalStorageManager } from '$lib/utils/app/storage';

/** Chrome's install prompt event, which TypeScript's DOM types don't include */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** iPadOS reports itself as a Mac, told apart by touch */
const isIOS =
	/iP(hone|ad|od)/.test(navigator.platform) ||
	(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Browsers built into other apps (Instagram, Facebook, TikTok…) have no Add to Home Screen, so
 * iOS steps would lead nowhere there. They name themselves in the user agent
 */
const inAppBrowser =
	/FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|TikTok|musical_ly|BytedanceWebview|Snapchat|Pinterest|Line\/|GSA\//i.test(
		navigator.userAgent
	);

/** Caught by app.html until this module loads, then here */
let installPrompt = $state<BeforeInstallPromptEvent | null>(
	(window as Window & { installPrompt?: BeforeInstallPromptEvent }).installPrompt ?? null
);
let installed = $state(
	matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
);

// Not preventDefault()ed, so Chrome still shows its own install banner as well
addEventListener('beforeinstallprompt', (event) => {
	installPrompt = event as BeforeInstallPromptEvent;
});

addEventListener('appinstalled', () => {
	installed = true;
	installPrompt = null;
	sendAnalyticsEvent('app_installed');
});

const LAUNCH_SENT_KEY = 'pwa_launch_sent';

// iOS never tells the page about installs, so count use of the installed app instead, once per
// launch. After `load`, since the analytics scripts load async and aren't there before it
if (installed) {
	const sendLaunch = () => {
		try {
			if (sessionStorage.getItem(LAUNCH_SENT_KEY)) return;
			sessionStorage.setItem(LAUNCH_SENT_KEY, '1');
		} catch {
			// Storage blocked; count every page load rather than none
		}
		sendAnalyticsEvent('pwa_launch');
	};
	if (document.readyState === 'complete') sendLaunch();
	else addEventListener('load', sendLaunch, { once: true });
}

/** Days the site has to be used on before the banner suggests installing */
const BANNER_AFTER_DAYS = 2;

// Counts days rather than visits, so it waits until someone comes back on another day
const usage = LocalStorageManager.getItem(LocalStorageKeys.InstallBanner) ?? { days: [] };
const today = new Date().toLocaleDateString('sv-SE');
if (!usage.days.includes(today)) {
	usage.days = [...usage.days, today].slice(-BANNER_AFTER_DAYS);
	LocalStorageManager.setItem(LocalStorageKeys.InstallBanner, usage);
}
let bannerDismissed = $state(usage.dismissed === true);

export const install = {
	/** The browser offers its own install prompt (Chrome and Edge on Android and desktop) */
	get canPrompt() {
		return !installed && installPrompt !== null;
	},
	/** iOS has no prompt, so visitors add the app from the share menu themselves */
	get needsManualSteps() {
		return !installed && isIOS && !inAppBrowser;
	},
	/** Suggest installing to visitors who keep coming back, until they close the banner */
	get showBanner() {
		return (
			!bannerDismissed &&
			usage.days.length >= BANNER_AFTER_DAYS &&
			(this.canPrompt || this.needsManualSteps)
		);
	},
	dismissBanner() {
		bannerDismissed = true;
		LocalStorageManager.setItem(LocalStorageKeys.InstallBanner, { ...usage, dismissed: true });
	},
	async prompt(source: 'settings' | 'banner') {
		const event = installPrompt;
		if (!event) return;
		// Each prompt event can be shown only once
		installPrompt = null;
		await event.prompt();
		const { outcome } = await event.userChoice;
		sendAnalyticsEvent('install_app', { outcome, source });
		// Turning down the browser's own dialog counts as a no to the banner too
		if (outcome === 'dismissed') this.dismissBanner();
	}
};

/** How often returning to the app may check for a new deploy */
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

let lastUpdateCheck = Date.now();
let controlled = !!navigator.serviceWorker?.controller;
/** A new deploy's service worker took over while this page was open, and this page is older than it */
let updateReady = false;

// An installed app can stay open in the background for days, and the browser only checks for a
// new service worker when a page loads, so check again whenever the app comes back into view
document.addEventListener('visibilitychange', () => {
	if (document.visibilityState !== 'visible') return;
	if (Date.now() - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
	lastUpdateCheck = Date.now();
	navigator.serviceWorker
		?.getRegistration()
		.then((registration) => registration?.update())
		.catch(() => {});
});

// The first worker taking over an uncontrolled page is just the first install, not an update
navigator.serviceWorker?.addEventListener('controllerchange', () => {
	// The page itself may already be from the new deploy (a new worker often takes over right
	// after loading it), and then a full reload would be wasted, so compare versions first
	if (controlled)
		updated.check().then(
			(outdated) => (updateReady = outdated),
			() => {}
		);
	controlled = true;
});

/**
 * Turns the next in-app navigation into a full page load once a new deploy has taken over, so the
 * page runs the new code instead of asking for old code files the deploy removed. Back/forward is
 * left alone, since cancelling it would rewrite history.
 */
export function loadUpdateOnNavigate({ to, type, willUnload, cancel }: BeforeNavigate) {
	if (!updateReady || !to || willUnload || type === 'popstate') return;
	if (to.url.origin !== location.origin) return;
	cancel();
	location.href = to.url.href;
}
