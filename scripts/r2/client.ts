import { S3Client } from 'bun';

/**
 * Thin wrapper over Bun's native S3 client, pointed at Cloudflare R2's
 * S3-compatible endpoint (`https://<account-id>.<region>.r2.cloudflarestorage.com`,
 * region defaulting to `eu` via `R2Options.region`).
 *
 * The Cloudflare REST API (`api.cloudflare.com`) is throttled to roughly
 * 4 requests/second per account, which makes a ~13.5k-object bulk upload take
 * about an hour. The S3 endpoint has its own, much higher limits, so bulk
 * uploads run in minutes.
 *
 * Note: per-object `Cache-Control`/`CDN-Cache-Control` headers are no longer
 * attached here — Bun's S3 API cannot set arbitrary headers on write. Caching
 * for the images is instead configured with a Cloudflare Cache Rule on the R2
 * custom domain, so the response headers apply to every object uniformly.
 * Existing objects keep the headers they were uploaded with.
 *
 * R2 aliases an empty/`us-east-1` signing region to `auto`, so Bun's default
 * region works without changes.
 */

export type R2Options = {
	accessKeyId: string;
	secretAccessKey: string;
	accountId: string;
	bucket: string;
	/** R2 jurisdiction subdomain (e.g. `eu`, `us`); the legacy global endpoint
	 * 403s for jurisdictional buckets. Defaults to `eu`. */
	region?: string;
};

export class R2S3Client {
	private readonly client: S3Client;

	constructor(options: R2Options) {
		const region = options.region || 'eu';
		this.client = new S3Client({
			accessKeyId: options.accessKeyId,
			secretAccessKey: options.secretAccessKey,
			bucket: options.bucket,
			endpoint: `https://${options.accountId}.${region}.r2.cloudflarestorage.com`
		});
	}

	async putObject(
		key: string,
		body: Buffer | Uint8Array | Blob | Response | string,
		options: { type?: string } = {}
	): Promise<void> {
		await this.client.write(key, body, { type: options.type ?? 'image/png' });
	}

	async deleteObject(key: string): Promise<void> {
		await this.client.delete(key);
	}

	async getObject(key: string): Promise<Response | null> {
		try {
			const file = this.client.file(key);
			if (!(await file.exists())) return null;
			return new Response(file);
		} catch {
			return null;
		}
	}

	/** Lists object keys under a prefix (ListObjectsV2), following pagination. */
	async listKeys(prefix: string, maxKeys = 1000): Promise<string[]> {
		const keys: string[] = [];
		let token: string | undefined;
		for (;;) {
			const page = await this.client.list({ prefix, maxKeys, continuationToken: token });
			for (const item of page.contents ?? []) keys.push(item.key);
			if (!page.isTruncated || page.nextContinuationToken === undefined) break;
			token = page.nextContinuationToken;
		}
		return keys;
	}
}
