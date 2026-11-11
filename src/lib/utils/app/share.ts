import { isFirefox } from '$lib/global.svelte';
import { page } from '$app/state';
import { get } from 'svelte/store';
import type { ShareType } from '$lib/types';
import { LocalStorageKeys, ShareTypes } from '../constants/app';
import { sendAnalyticsEvent } from './analytics';
import { LocalStorageManager } from './storage';
import { updateURL } from './url';

export function generateOutLink<U extends string, I extends boolean = false>(
	url: U,
	includeReferrer: I = false as I
): `/linkki.html?to=${U}${I extends true ? '&referrer=1' : ''}` {
	const encodedUrl = encodeURIComponent(url);
	let outLink = `/linkki.html?to=${encodedUrl}`;
	if (includeReferrer) {
		outLink += '&referrer=1';
	}
	return outLink as `/linkki.html?to=${U}${I extends true ? '&referrer=1' : ''}`;
}

export function getRandom(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return Math.random().toString(36).substring(2, 10);
}

function generateSID() {
	return getRandom().replace(/-/g, '').substring(0, 8);
}

export async function handleShare({
	type = ShareTypes.Default,
	title,
	text,
	url,
	includeSID = false
}: {
	type?: ShareType;
	title: string;
	text: string;
	url: string;
	includeSID?: boolean;
}): Promise<boolean> {
	const sid = includeSID ? generateSID() : undefined;

	// The sid belongs in the query, ahead of a compressed `#z=` fragment
	const [base, hash] = url.split(/(?=#)/);
	const shareUrl = sid ? `${base}${base.includes('?') ? '&' : '?'}sid=${sid}${hash ?? ''}` : url;

	const completeShare = () => {
		if (sid) {
			// Mark this share as already viewed by the sharer so their own visit
			// doesn't count as a shared view.
			LocalStorageManager.appendToArrayItem(LocalStorageKeys.ViewedShares, sid);
		}

		sendAnalyticsEvent(`share_${type}`, {
			url,
			sid
		});
	};

	if (
		navigator.canShare &&
		navigator.canShare({ url: shareUrl }) &&
		!get(isFirefox) // Firefox has a poor implementation of the Web Share API
	) {
		try {
			await navigator.share({
				title,
				text,
				url: shareUrl
			});

			completeShare();
		} catch (err) {
			if ((err as Error).name === 'AbortError') {
				// The user cancelled the share sheet.
				return true;
			}

			throw err;
		}

		return true;
	}

	const clipboardText = text.trim() ? `${text}\n\n${shareUrl}` : shareUrl;
	await navigator.clipboard.writeText(clipboardText);

	completeShare();

	return false;
}

export function shareTypeFromRoute(routeId: typeof page.route.id): ShareType {
	switch (routeId) {
		case '/':
			return ShareTypes.Filters;
		case '/listat':
			return ShareTypes.List;
		case '/tuotteet/[...id]':
			return ShareTypes.Product;
		case '/vastaavat/[...id]':
			return ShareTypes.Similar;
		case '/vertailu':
			return ShareTypes.Compare;
		case '/boolilaskuri':
			return ShareTypes.Punch;
		case '/daily':
		case '/daily/arkisto':
		case '/daily/arkisto/[date]':
			return ShareTypes.DailyGame;
		default:
			return ShareTypes.Default;
	}
}

export function trackSharedView(type: ShareType = ShareTypes.Default) {
	const url = new URL(location.href);
	const sid = url.searchParams.get('sid');
	if (sid) {
		const viewedShares = LocalStorageManager.getItem(LocalStorageKeys.ViewedShares) || [];
		url.searchParams.delete('sid');

		if (!viewedShares.includes(sid)) {
			viewedShares.push(sid);
			LocalStorageManager.setItem(LocalStorageKeys.ViewedShares, viewedShares);

			sendAnalyticsEvent(`shared_${type}_viewed`, {
				url: url.href,
				sid
			});
		}

		updateURL(url.href);
	}
}
