/**
 * A fixed-window request limiter per client key, in memory. The server is single-threaded and a
 * few tools take tens of milliseconds of CPU, so without a limit one client could keep every
 * other one waiting.
 */
export class RateLimiter {
	private readonly windows = new Map<string, { start: number; count: number }>();

	constructor(
		private readonly limit: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now
	) {}

	/** Records a request; returns 0 if allowed, otherwise the seconds until the window resets. */
	hit(key: string): number {
		const now = this.now();
		if (this.windows.size > 10_000) this.prune(now);
		let entry = this.windows.get(key);
		if (!entry || now - entry.start >= this.windowMs) {
			entry = { start: now, count: 0 };
			this.windows.set(key, entry);
		}
		entry.count += 1;
		return entry.count > this.limit ? Math.ceil((entry.start + this.windowMs - now) / 1000) : 0;
	}

	private prune(now: number) {
		for (const [key, entry] of this.windows) {
			if (now - entry.start >= this.windowMs) this.windows.delete(key);
		}
	}
}
