import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ExtractedDocument, ExtractedPage, TextItem } from './types.ts';

/** Minimum non-whitespace characters expected per page before we trust the PDF's embedded text layer. */
const MIN_CHARS_PER_PAGE = 20;

/**
 * Extracts text from a PDF while preserving each text run's page and position (x/y/width/height
 * in top-left-origin point coordinates). Positions are kept so a table-shaped layout can later be
 * reconstructed from reading order alone, without relying on the PDF having explicit table markup.
 *
 * Prefers the embedded text layer used by "normal" (non-scanned) PDFs. `hasTextLayer` reports
 * whether that layer looks usable; callers should treat `false` as a signal to fall back to OCR.
 */
export async function extractText(pdfBytes: Uint8Array): Promise<ExtractedDocument> {
	const loadingTask = getDocument({ data: pdfBytes, useSystemFonts: true });
	const doc = await loadingTask.promise;
	const pages: ExtractedPage[] = [];

	try {
		for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
			const page = await doc.getPage(pageNumber);
			const content = await page.getTextContent();
			const pageHeight = page.view[3] - page.view[1];
			const items: TextItem[] = [];

			for (const raw of content.items as Array<Record<string, unknown>>) {
				const text = typeof raw.str === 'string' ? raw.str.trim() : '';
				if (!text) continue;

				const transform = raw.transform as number[];
				const [, , , scaleY, x, yFromBottom] = transform;
				const width = typeof raw.width === 'number' ? raw.width : 0;
				const height = Math.abs(scaleY) || (typeof raw.height === 'number' ? raw.height : 0);

				items.push({
					text,
					x,
					y: pageHeight - yFromBottom,
					width,
					height,
					page: pageNumber
				});
			}

			pages.push({ page: pageNumber, items });
		}
	} finally {
		await loadingTask.destroy();
	}

	const totalChars = pages.reduce(
		(sum, page) => sum + page.items.reduce((s, item) => s + item.text.length, 0),
		0
	);
	const hasTextLayer = pages.length > 0 && totalChars >= MIN_CHARS_PER_PAGE * pages.length;

	return { pages, hasTextLayer };
}

/**
 * Extension point for a future OCR fallback: if the embedded text layer is unusable, an
 * OCR-based extractor returning the same `ExtractedDocument` shape can be swapped in here without
 * requiring any changes to parse.ts or validate.ts. Not implemented yet - fails loudly instead of
 * silently producing garbage data.
 */
export async function extractTextWithOcrFallback(pdfBytes: Uint8Array): Promise<ExtractedDocument> {
	const extracted = await extractText(pdfBytes);
	if (!extracted.hasTextLayer) {
		throw new Error(
			'PDF has no usable embedded text layer (looks scanned/rasterized) and OCR fallback is ' +
				'not implemented yet. Add an OCR-based extractor that returns an ExtractedDocument.'
		);
	}
	return extracted;
}
