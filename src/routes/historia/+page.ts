import { resolve } from '$app/paths';
import type { HistoryPreviewReport } from '$lib/utils/catalog/historyPreview';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const response = await fetch(resolve('/') + 'history-preview.json');
		if (!response.ok) return { preview: null };
		return { preview: (await response.json()) as HistoryPreviewReport };
	} catch {
		return { preview: null };
	}
};
