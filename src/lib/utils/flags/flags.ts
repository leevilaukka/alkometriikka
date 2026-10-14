/**
 * Feature flags. The flag list comes from `flags.json`, so a feature can be switched on, off or
 * rolled out to a share of visitors without a rebuild. A visitor can override any flag for
 * themselves with `?flag=name` (on) or `?flag=-name` (off); `?flag=reset` forgets the overrides.
 * Overrides work for flags missing from the file too, so a feature can be built behind a flag
 * before the flag is published.
 */

export type FlagDefinition = {
	enabled: boolean;
	/** Percentage of visitors (0-100) who get the flag while it's enabled. Everyone when omitted. */
	rollout?: number;
};

export type Flags = Record<string, FlagDefinition>;

/** Per-visitor choices from the URL, kept in local storage. */
export type FlagOverrides = Record<string, boolean>;

/** Names stay safe in a query param and its comma separated list. */
const FLAG_NAME = /^[\w-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a parsed `flags.json`, dropping malformed entries instead of failing the whole file.
 * A dropped flag is off, so a typo never turns a feature on for everyone.
 */
export function parseFlags(raw: unknown): Flags {
	const list = isRecord(raw) ? raw.flags : undefined;
	if (!isRecord(list)) return {};
	const flags: Flags = {};
	for (const [name, value] of Object.entries(list)) {
		if (!FLAG_NAME.test(name)) continue;
		if (typeof value === 'boolean') {
			flags[name] = { enabled: value };
		} else if (isRecord(value)) {
			const { enabled, rollout } = value;
			if (enabled !== undefined && typeof enabled !== 'boolean') continue;
			if (
				rollout !== undefined &&
				(typeof rollout !== 'number' || !Number.isFinite(rollout) || rollout < 0 || rollout > 100)
			)
				continue;
			flags[name] = { enabled: enabled !== false, rollout };
		}
	}
	return flags;
}

/**
 * Applies the `flag` params of a URL to the stored overrides. Each param holds comma separated
 * names, `-` in front turns a flag off, and `reset` clears everything stored so far.
 */
export function applyOverrideParams(stored: FlagOverrides, params: URLSearchParams): FlagOverrides {
	const overrides = { ...stored };
	for (const param of params.getAll('flag')) {
		for (const entry of param.split(',')) {
			const item = entry.trim();
			if (item === 'reset') {
				for (const name of Object.keys(overrides)) delete overrides[name];
				continue;
			}
			const off = item.startsWith('-');
			const name = off ? item.slice(1) : item;
			if (FLAG_NAME.test(name)) overrides[name] = !off;
		}
	}
	return overrides;
}

/**
 * A stable 0-99 position for a visitor in a flag's rollout. It depends on the flag name too, so
 * the same visitors aren't always the first to get every new feature.
 */
export function rolloutBucket(visitorId: string, name: string): number {
	// FNV-1a
	let hash = 2166136261;
	for (const char of `${name}:${visitorId}`) {
		hash ^= char.codePointAt(0)!;
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 100;
}

export function isFlagOn(
	name: string,
	flags: Flags,
	overrides: FlagOverrides,
	visitorId: string
): boolean {
	if (name in overrides) return overrides[name];
	const flag = flags[name];
	if (!flag?.enabled) return false;
	return flag.rollout === undefined || rolloutBucket(visitorId, name) < flag.rollout;
}

/**
 * The flags that are on for this visitor, keyed for Umami's session properties (`flag_<name>`)
 * so reports can be filtered by flag. Flags that are available but off are left out.
 */
export function flagSessionData(
	flags: Flags,
	overrides: FlagOverrides,
	visitorId: string
): Record<string, boolean> {
	const data: Record<string, boolean> = {};
	for (const name of new Set([...Object.keys(flags), ...Object.keys(overrides)]))
		if (isFlagOn(name, flags, overrides, visitorId)) data[`flag_${name}`] = true;
	return data;
}
