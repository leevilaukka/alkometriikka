import { createHash, createHmac } from 'node:crypto';

/**
 * Minimal AWS Signature Version 4 client for Cloudflare R2's S3-compatible
 * endpoint (`https://<account-id>.<region>.r2.cloudflarestorage.com`, region
 * defaulting to `eu` via `R2Options.region`).
 *
 * The REST API (`api.cloudflare.com`) used previously is throttled to roughly
 * 4 requests/second per account, which makes a ~13.5k-object bulk upload take
 * about an hour. The S3 endpoint has its own, much higher limits, so bulk
 * uploads run in minutes.
 */

const SERVICE = 's3';
const REGION = 'auto';
const DEFAULT_JURISDICTION = 'eu';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function sha256hex(data: string | Buffer): string {
	return createHash('sha256').update(data).digest('hex');
}

/** RFC 3986 percent-encoding as required by SigV4 (encode ! ' ( ) * too). */
function percentEncode(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

function canonicalUri(key: string): string {
	return key === '' ? '/' : `/${key.split('/').map(percentEncode).join('/')}`;
}

function canonicalQueryString(params: [string, string][]): string {
	return [...params]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([name, value]) => `${percentEncode(name)}=${percentEncode(value)}`)
		.join('&');
}

function hmac(key: Buffer | string, data: string): Buffer {
	return createHmac('sha256', key).update(data).digest();
}

function signingKey(secret: string, date: string): Buffer {
	const kDate = hmac(`AWS4${secret}`, date);
	const kRegion = hmac(kDate, REGION);
	const kService = hmac(kRegion, SERVICE);
	return hmac(kService, 'aws4_request');
}

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
	private readonly endpoint: string;

	constructor(private readonly options: R2Options) {
		const region = options.region || DEFAULT_JURISDICTION;
		this.endpoint = region
			? `https://${options.accountId}.${region}.r2.cloudflarestorage.com`
			: `https://${options.accountId}.r2.cloudflarestorage.com`;
	}

	static region = REGION;
	static service = SERVICE;

	private async request(
		method: 'PUT' | 'DELETE' | 'GET',
		objectKey: string | null,
		query: [string, string][] = [],
		body?: Buffer
	): Promise<Response> {
		const keyPath = objectKey === null ? '/' : canonicalUri(objectKey);
		// Path-style addressing: the bucket is part of the request path, and the
		// SigV4 canonical URI must be the full path (including the bucket) or the
		// signature won't match.
		const path = `/${this.options.bucket}${keyPath}`;
		const queryString = canonicalQueryString(query);
		const url = `${this.endpoint}${path}${queryString ? `?${queryString}` : ''}`;
		const host = new URL(url).host;

		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
		const date = amzDate.slice(0, 8);
		const payloadHash = body === undefined ? EMPTY_SHA256 : sha256hex(body);
		const headers: Record<string, string> = {
			host,
			'x-amz-content-sha256': payloadHash,
			'x-amz-date': amzDate,
			...(body === undefined ? {} : { 'content-length': String(body.length) })
		};

		const headerEntries = Object.entries(headers)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([name, value]) => [name, value.replace(/[ \t\r\n]+/g, ' ').trim()] as [string, string]);
		const canonicalHeaders = headerEntries.map(([name, value]) => `${name}:${value}\n`).join('');
		const signedHeaders = headerEntries.map(([name]) => name).join(';');

		const canonicalRequest = [
			method,
			path,
			queryString,
			canonicalHeaders,
			signedHeaders,
			payloadHash
		].join('\n');

		const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
		const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join(
			'\n'
		);
		const signature = hmac(signingKey(this.options.secretAccessKey, date), stringToSign).toString(
			'hex'
		);

		const response = await fetch(url, {
			method,
			body:
				body === undefined
					? undefined
					: (body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer),
			headers: {
				...Object.fromEntries(headerEntries),
				'Content-Type': 'image/png',
				// Content-addressed keys never change, so cache hard at every layer:
				// browsers for a year (immutable), and Cloudflare edges for a year
				// too so an object is fetched from R2 at most once.
				'Cache-Control': 'public, max-age=31536000, immutable',
				'CDN-Cache-Control': 'public, max-age=31536000, immutable',
				Authorization: `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
			}
		});

		if (!response.ok) {
			const detail = (await response.text()).slice(0, 300);
			throw new Error(
				`S3 ${method} ${objectKey ?? `bucket ${this.options.bucket}`} failed: ${response.status} ${detail}`
			);
		}
		return response;
	}

	async putObject(key: string, body: Buffer): Promise<void> {
		await this.request('PUT', key, [], body);
	}

	async deleteObject(key: string): Promise<void> {
		await this.request('DELETE', key);
	}

	/** Lists object keys under a prefix (ListObjectsV2), following pagination. */
	async listKeys(prefix: string, maxKeys = 1000): Promise<string[]> {
		const keys: string[] = [];
		let token: string | undefined;
		for (;;) {
			const query: [string, string][] = [
				['list-type', '2'],
				['prefix', prefix],
				['max-keys', String(maxKeys)]
			];
			if (token) query.push(['continuation-token', token]);
			const response = await this.request('GET', null, query);
			const xml = await response.text();
			const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
			for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
				keys.push(match[1]);
			}
			const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
			if (!truncated || !next) break;
			token = next[1];
		}
		return keys;
	}
}
