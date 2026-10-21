/** Parses a finite number from a number or a (possibly comma-decimal) string; `null` otherwise. */
export function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const normalized = Number(value.replace(',', '.').trim());
		if (Number.isFinite(normalized)) return normalized;
	}
	return null;
}
