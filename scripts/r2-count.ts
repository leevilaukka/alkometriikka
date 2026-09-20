import { R2S3Client } from './r2';

const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
const accountId = process.env.CF_R2_ACCOUNT_ID;
const bucket = process.env.CF_R2_BUCKET ?? 'alkometriikka-og';
const region = process.env.CF_R2_REGION;

if (!accessKeyId || !secretAccessKey || !accountId) {
	throw new Error('Set CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY and CF_R2_ACCOUNT_ID in .env');
}

const client = new R2S3Client({ accessKeyId, secretAccessKey, accountId, bucket, region });

const prefix = process.argv[2] ?? '';
const start = Date.now();
const keys = await client.listKeys(prefix);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(
	`${bucket}${prefix ? ` (prefix "${prefix}")` : ''}: ${keys.length.toLocaleString('fi-FI')} object(s) in ${elapsed}s`
);
