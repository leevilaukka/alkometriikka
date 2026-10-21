import { resolve } from '$app/paths';

// resolve() only accepts paths it can match against the routes at compile time
const resolvePath = resolve as (path: string) => string;

/**
 * Prefixes an app-internal path (`/listat`, `/?q=…`, a category node's `path`)
 * with the base path, so links keep working when the site is built under a
 * sub-path (`BASE_PATH=/feat-x` for branch previews).
 *
 * Use `resolve()` from `$app/paths` directly for literal paths, which also
 * type-checks them against the routes; this is for paths only known as a
 * plain `string`.
 */
export function appPath(path: string): string {
	return resolvePath(path);
}
