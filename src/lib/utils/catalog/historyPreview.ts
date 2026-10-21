export type HistoryPreviewProduct = {
	id: string;
	name: string;
	volume: number | string;
	price: number | null;
	firstDate: string;
	lastDate: string;
	archivePoints: number;
	observations: number;
	removed: boolean;
};

export type HistoryPreviewSource = {
	id: string;
	date: string;
	url: string;
	format: string;
	scope: string;
	language: string;
	sha256: string;
};

export type HistoryPreviewReport = {
	version: string;
	baseLastSynced: string;
	statistics: Record<string, number>;
	rawSnapshotDates: number;
	firstDate: string;
	lastDate: string;
	acceptedDates: string[];
	collectedDatesByYear: Record<string, number>;
	sources: HistoryPreviewSource[];
	products: HistoryPreviewProduct[];
	review: {
		id: string;
		reason: string;
		historicalName: string;
		currentName: string;
		historicalVolume: string;
		currentVolume: number | string;
		sampleDate: string;
		sourceUrl: string;
	}[];
	conflicts: {
		id: string;
		date: string;
		recordedPrice: number;
		archivePrice: number;
		sourceUrl: string;
	}[];
	notes: string[];
};
