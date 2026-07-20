import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export type ObjectStorageProvider = 'aws_s3';

export interface SaveObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}

export interface SaveObjectResult {
  url: string;
  key: string;
  provider: ObjectStorageProvider;
}

interface AssetStorage {
  save(input: SaveObjectInput): Promise<SaveObjectResult>;
  deleteByPublicUrl(url: string): Promise<void>;
  deleteByKey(key: string): Promise<void>;
  readByKey(key: string): Promise<Buffer | null>;
  readByPublicUrl(url: string): Promise<Buffer | null>;
}

interface AwsS3StorageConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  prefix: string;
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function joinUrl(base: string, key: string) {
  return `${base.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function objectKeyFromPublicUrl(url: string, publicUrl: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const parsedBase = new URL(publicUrl.replace(/\/+$/, ''));
    if (parsedUrl.origin !== parsedBase.origin) return null;

    const basePath = trimSlashes(parsedBase.pathname);
    const objectPath = trimSlashes(parsedUrl.pathname);
    const key = basePath
      ? objectPath.startsWith(`${basePath}/`)
        ? objectPath.slice(basePath.length + 1)
        : null
      : objectPath;
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
}

function objectKeyFromAwsS3Url(url: string, bucket: string, region: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') return null;

    const hostname = parsedUrl.hostname.toLowerCase();
    const bucketName = bucket.toLowerCase();
    const normalizedRegion = region.toLowerCase();
    const objectPath = trimSlashes(parsedUrl.pathname);
    if (!objectPath) return null;

    // Support old records saved with the raw S3 public URL even when
    // AWS_S3_PUBLIC_URL later changes to CloudFront or a custom CDN.
    const virtualHostedNames = new Set([
      `${bucketName}.s3.${normalizedRegion}.amazonaws.com`,
      `${bucketName}.s3.amazonaws.com`,
    ]);
    if (virtualHostedNames.has(hostname)) return decodeURIComponent(objectPath);

    const pathStyleNames = new Set([
      `s3.${normalizedRegion}.amazonaws.com`,
      's3.amazonaws.com',
    ]);
    if (!pathStyleNames.has(hostname)) return null;

    const bucketPrefix = `${bucket}/`;
    return objectPath.startsWith(bucketPrefix)
      ? decodeURIComponent(objectPath.slice(bucketPrefix.length))
      : null;
  } catch {
    return null;
  }
}

function optionalEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function requiredEnv(name: string, providerLabel: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Configure ${providerLabel} before storing assets.`);
  return value;
}

function requiredOneOfEnv(names: string[], providerLabel: string): string {
  const value = optionalEnv(...names);
  if (!value) throw new Error(`Missing ${names.join(' or ')}. Configure ${providerLabel} before storing assets.`);
  return value;
}

export function getObjectStorageProvider(): ObjectStorageProvider {
  return 'aws_s3';
}

function getAwsS3Config(): AwsS3StorageConfig {
  const providerLabel = 'AWS S3 object storage';
  return {
    region: requiredOneOfEnv(['AWS_S3_REGION', 'AWS_REGION'], providerLabel),
    bucket: requiredEnv('AWS_S3_BUCKET', providerLabel),
    accessKeyId: requiredOneOfEnv(['AWS_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'], providerLabel),
    secretAccessKey: requiredOneOfEnv(['AWS_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'], providerLabel),
    publicUrl: requiredEnv('AWS_S3_PUBLIC_URL', providerLabel),
    prefix: trimSlashes(optionalEnv('AWS_S3_PREFIX', 'OBJECT_STORAGE_PREFIX') || 'development'),
  };
}

function withPrefix(key: string, prefix: string) {
  const normalizedKey = trimSlashes(key);
  return prefix ? `${prefix}/${normalizedKey}` : normalizedKey;
}

async function responseBodyToBuffer(responseBody: unknown): Promise<Buffer> {
  const body = responseBody as {
    transformToByteArray?: () => Promise<Uint8Array>;
    [Symbol.asyncIterator]?: () => AsyncIterableIterator<Buffer | Uint8Array | string>;
  };
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

class AwsS3ObjectStorage implements AssetStorage {
  private readonly client: S3Client;

  constructor(private readonly config: AwsS3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async save(input: SaveObjectInput): Promise<SaveObjectResult> {
    const key = withPrefix(input.key, this.config.prefix);
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable',
    }));

    return {
      key,
      provider: 'aws_s3',
      url: joinUrl(this.config.publicUrl, key),
    };
  }

  async deleteByPublicUrl(url: string): Promise<void> {
    const key = objectKeyFromPublicUrl(url, this.config.publicUrl)
      ?? objectKeyFromAwsS3Url(url, this.config.bucket, this.config.region);
    if (!key) return;

    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));
  }

  async deleteByKey(key: string): Promise<void> {
    const normalizedKey = trimSlashes(key);
    const prefixedKey = this.config.prefix && normalizedKey.startsWith(`${this.config.prefix}/`)
      ? normalizedKey
      : withPrefix(normalizedKey, this.config.prefix);
    if (!prefixedKey) return;

    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: prefixedKey,
    }));
  }

  async readByKey(key: string): Promise<Buffer | null> {
    const normalizedKey = trimSlashes(key);
    const prefixedKey = this.config.prefix && normalizedKey.startsWith(`${this.config.prefix}/`)
      ? normalizedKey
      : withPrefix(normalizedKey, this.config.prefix);
    if (!prefixedKey) return null;
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: prefixedKey,
    }));
    if (!response.Body) return null;
    return responseBodyToBuffer(response.Body);
  }

  async readByPublicUrl(url: string): Promise<Buffer | null> {
    const key = objectKeyFromPublicUrl(url, this.config.publicUrl)
      ?? objectKeyFromAwsS3Url(url, this.config.bucket, this.config.region);
    if (!key) return null;

    return this.readByKey(key);
  }
}

function createAssetStorage(): AssetStorage {
  return new AwsS3ObjectStorage(getAwsS3Config());
}

export async function saveObject(input: SaveObjectInput): Promise<SaveObjectResult> {
  return createAssetStorage().save(input);
}

export async function deleteObjectByPublicUrl(url: string): Promise<void> {
  return createAssetStorage().deleteByPublicUrl(url);
}

export async function deleteObjectByKey(key: string): Promise<void> {
  return createAssetStorage().deleteByKey(key);
}

export async function readObjectByKey(key: string): Promise<Buffer | null> {
  return createAssetStorage().readByKey(key);
}

export function objectStorageReference(key: string): string {
  return `s3://${trimSlashes(key)}`;
}

export function objectKeyFromStorageReference(reference?: string | null): string | null {
  if (!reference?.startsWith('s3://')) return null;
  return trimSlashes(reference.slice('s3://'.length));
}

export function isObjectStorageReference(reference?: string | null): boolean {
  return objectKeyFromStorageReference(reference) !== null;
}

export async function readObjectFromStorageReference(reference: string): Promise<Buffer | null> {
  const key = objectKeyFromStorageReference(reference);
  return key ? readObjectByKey(key) : null;
}

export async function deleteObjectByStorageReference(reference: string): Promise<void> {
  const key = objectKeyFromStorageReference(reference);
  if (key) await deleteObjectByKey(key);
}

export async function readObjectFromPublicUrl(url: string): Promise<Buffer | null> {
  if (/^https?:\/\//i.test(url)) {
    const storage = tryCreateAssetStorage();
    const directObject = storage ? await storage.readByPublicUrl(url).catch(() => null) : null;
    if (directObject) return directObject;

    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }

  // Backward compatibility: old local images saved before object storage can still be
  // opened and re-exported by IMG.LY.
  const normalized = trimSlashes(url);
  const localKey = normalized.startsWith('uploads/')
    ? `assets/${normalized.slice('uploads/'.length)}`
    : normalized;
  const candidates = [
    path.join(process.cwd(), '..', '..', 'deploy', localKey),
    path.join(process.cwd(), 'deploy', localKey),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // Try next legacy local path.
    }
  }
  return null;
}

function configuredPublicUrls(): string[] {
  return [
    optionalEnv('AWS_S3_PUBLIC_URL'),
  ].filter((value): value is string => Boolean(value));
}

export function isObjectStoragePublicUrl(url: string): boolean {
  const configuredPublicUrlMatch = configuredPublicUrls()
    .some((publicUrl) => objectKeyFromPublicUrl(url, publicUrl) !== null);
  if (configuredPublicUrlMatch) return true;

  const bucket = optionalEnv('AWS_S3_BUCKET');
  const region = optionalEnv('AWS_S3_REGION', 'AWS_REGION');
  return Boolean(bucket && region && objectKeyFromAwsS3Url(url, bucket, region));
}

function tryCreateAssetStorage(): AssetStorage | null {
  try {
    return createAssetStorage();
  } catch {
    return null;
  }
}
