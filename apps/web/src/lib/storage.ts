import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Same S3-compatible bucket the worker (apps/worker/src/storage.ts) uploads
// generated PDFs to. Unlike the worker, this client both reads and writes —
// asset uploads happen interactively from a signed-in user's browser
// request, not from a background job — so an equivalent local-disk fallback
// exists here too, for local dev without a storage account.
const bucket = process.env.STORAGE_BUCKET;
const endpoint = process.env.STORAGE_ENDPOINT;
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

const s3 =
  bucket && endpoint && accessKeyId && secretAccessKey
    ? new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } })
    : null;

export function isObjectStorageConfigured(): boolean {
  return s3 !== null && Boolean(bucket);
}

/**
 * Thrown when a caller tries to read/write assets but no object storage is
 * configured AND the process is running somewhere the local-disk fallback
 * can't be used (production, i.e. Vercel — whose serverless filesystem is
 * read-only except /tmp, and /tmp doesn't persist between invocations so
 * "just write to /tmp" isn't actually useful either). The API route catches
 * this and returns a 503 with an actionable message, rather than letting a
 * cryptic EROFS bubble up as an unhandled 500.
 */
export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Object storage isn't configured on this deployment. Set STORAGE_BUCKET, STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, and STORAGE_SECRET_ACCESS_KEY (e.g. from a Cloudflare R2 bucket) in your Vercel environment variables and redeploy.",
    );
    this.name = "StorageNotConfiguredError";
  }
}

const SIGNED_URL_TTL_SECONDS = 300;
const LOCAL_STORAGE_ROOT = join(process.cwd(), ".local-storage");
const isProduction = process.env.NODE_ENV === "production";

/**
 * Mints a short-lived presigned download URL for a file the worker
 * previously uploaded. Returns null when object storage isn't configured —
 * true in local dev, where the worker falls back to writing PDFs to its own
 * local disk, which this (separate) web process has no access to.
 */
export async function getSignedDownloadUrl(fileKey: string): Promise<string | null> {
  if (!s3 || !bucket) return null;
  const command = new GetObjectCommand({ Bucket: bucket, Key: fileKey });
  return getSignedUrl(s3, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

export async function uploadAsset(key: string, body: Buffer, contentType: string): Promise<void> {
  if (s3 && bucket) {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return;
  }
  // Fail loudly at the call site instead of silently attempting a write
  // that will throw EROFS on Vercel's read-only serverless filesystem — a
  // clear StorageNotConfiguredError bubbling to a JSON error is far more
  // debuggable than an unhandled 500.
  if (isProduction) throw new StorageNotConfiguredError();
  const localPath = join(LOCAL_STORAGE_ROOT, key);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, body);
}

/** Reads an asset's raw bytes back — used to embed a chosen image directly into a PDF being rendered. */
export async function readAsset(key: string): Promise<Buffer> {
  if (s3 && bucket) {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Asset ${key} has no body`);
    return Buffer.from(bytes);
  }
  if (isProduction) throw new StorageNotConfiguredError();
  return readFile(join(LOCAL_STORAGE_ROOT, key));
}

export async function deleteAsset(key: string): Promise<void> {
  if (s3 && bucket) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  if (isProduction) return; // there was nothing to delete — a production upload without storage would have failed at upload time
  await unlink(join(LOCAL_STORAGE_ROOT, key)).catch(() => {
    // Already gone (or never existed on this disk) — deleting is idempotent.
  });
}
