/** Reads a command-line option value (e.g. `--out build` -> `build`). */
export function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

/** Reads a positive integer option, falling back when missing or invalid. */
export function readNumberOption(name: string, fallback: number): number {
	const value = Number(readOption(name));
	return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function hasFlag(name: string): boolean {
	return process.argv.includes(name);
}
