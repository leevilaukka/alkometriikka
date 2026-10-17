import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

/** Query parameter that holds the other parameters compressed when the query string gets long. */
export const COMPRESSED_PARAM = 'z';

/** Query strings up to this length stay readable. */
export const COMPRESS_THRESHOLD = 200;

/**
 * Never compressed: `sid` is appended to and stripped from finished links, `flag` is read before
 * the app expands anything, and `list` is lz-string output already, which doesn't shrink again.
 */
const PLAIN_PARAMS = new Set(['sid', 'flag', 'list']);

// Separators that can't come from the UI. Grouping every value under its key once is what makes
// this pay off: lz-string alone barely shortens a query, most of which is repeated filter names.
const VALUE_SEPARATOR = '\u0001';
const ENTRY_SEPARATOR = '\u0002';
const SEPARATORS = /[\u0001\u0002]/;

function encode(params: URLSearchParams) {
	// Pasted text could carry a separator; such a query stays as it is
	if ([...params].some(([key, value]) => SEPARATORS.test(key) || SEPARATORS.test(value)))
		return null;
	return [...new Set(params.keys())]
		.map((key) => [key, ...params.getAll(key)].join(VALUE_SEPARATOR))
		.join(ENTRY_SEPARATOR);
}

function decode(encoded: string) {
	const params = new URLSearchParams();
	for (const entry of encoded.split(ENTRY_SEPARATOR)) {
		const [key, ...values] = entry.split(VALUE_SEPARATOR);
		for (const value of values) params.append(key, value);
	}
	return params;
}

/**
 * Serializes `params` for the URL. Once the query string is longer than {@link COMPRESS_THRESHOLD},
 * everything but the plain parameters goes into one lz-string compressed `z` parameter.
 */
export function compressSearchParams(params: URLSearchParams): string {
	const plain = new URLSearchParams();
	const rest = new URLSearchParams();
	for (const [key, value] of params) (PLAIN_PARAMS.has(key) ? plain : rest).append(key, value);

	const restString = rest.toString();
	if (restString.length <= COMPRESS_THRESHOLD) return params.toString();
	const encoded = encode(rest);
	// lz-string's URI alphabet is safe in a query string, so it's written without escaping
	const compressed = encoded && compressToEncodedURIComponent(encoded);
	if (!compressed || compressed.length >= restString.length) return params.toString();

	const plainString = plain.toString();
	return `${COMPRESSED_PARAM}=${compressed}${plainString ? `&${plainString}` : ''}`;
}

/**
 * The parameters a URL stands for, with a `z` parameter expanded. Returns `params` itself when
 * there's nothing to expand, and drops a `z` that can't be read.
 */
export function expandSearchParams(params: URLSearchParams): URLSearchParams {
	const compressed = params.get(COMPRESSED_PARAM);
	if (compressed === null) return params;

	let expanded = new URLSearchParams();
	try {
		const encoded = decompressFromEncodedURIComponent(compressed);
		if (encoded) expanded = decode(encoded);
	} catch {
		// Mangled link; keep whatever is readable
	}
	for (const [key, value] of params) if (key !== COMPRESSED_PARAM) expanded.append(key, value);
	return expanded;
}
