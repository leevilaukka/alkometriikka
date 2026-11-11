import { dev } from '$app/environment';
import type { OGImage, OgProperties, TwitterProperties } from '$lib/types';
import { defaultSEOData } from '../constants/app';

const baseTitle = 'Alkometriikka' as const;

export function generateTitle(text?: string): string {
	if (dev) {
		return text ? `${text} - ${baseTitle} [dev]` : `${baseTitle} [dev]`;
	} else {
		return text ? `${text} - ${baseTitle}` : baseTitle;
	}
}

export function setSEO({
	description,
	og,
	image,
	twitter,
	keywords
}: {
	description?: string;
	og?: OgProperties;
	image?: OGImage;
	twitter?: TwitterProperties;
	keywords?: string;
}) {
	const metaDescription = document.querySelector('meta[name="description"]');
	const metaKeywords = document.querySelector('meta[name="keywords"]');

	if (metaDescription && description) {
		metaDescription.setAttribute('content', description);
	} else if (metaDescription) {
		metaDescription.setAttribute('content', defaultSEOData.description);
	}

	if (metaKeywords && keywords) {
		metaKeywords.setAttribute('content', `${keywords}, ${defaultSEOData.keywords}`);
	} else if (metaKeywords) {
		metaKeywords.setAttribute('content', defaultSEOData.keywords);
	}
	if (og) {
		for (const [key, value] of Object.entries(og)) {
			const metaTag = document.querySelector(`meta[property="og:${key}"]`);
			if (metaTag && value) {
				metaTag.setAttribute('content', String(value));
			} else if (metaTag && !value) {
				metaTag.setAttribute(
					'content',
					defaultSEOData.og[key as keyof typeof defaultSEOData.og] as string
				);
			}
		}
	}
	if (image) {
		const ogImageTag = document.querySelector('meta[property="og:image"]');
		if (ogImageTag && image.url) {
			ogImageTag.setAttribute('content', String(image.url));
		}
		for (const [key, value] of Object.entries(image)) {
			const metaTag = document.querySelector(`meta[property="og:image:${key}"]`);
			if (metaTag && value) {
				metaTag.setAttribute('content', String(value));
			} else if (metaTag && !value) {
				metaTag.setAttribute(
					'content',
					defaultSEOData.image[key as keyof typeof defaultSEOData.image] as string
				);
			}
		}
	}
	if (twitter) {
		for (const [key, value] of Object.entries(twitter)) {
			const metaTag = document.querySelector(`meta[name="twitter:${key}"]`);
			if (metaTag && value) {
				metaTag.setAttribute('content', String(value));
			} else if (metaTag && !value) {
				metaTag.setAttribute(
					'content',
					defaultSEOData.twitter[key as keyof typeof defaultSEOData.twitter] as string
				);
			}
		}
	}
}

export function resetSEO() {
	setSEO(defaultSEOData);
}
