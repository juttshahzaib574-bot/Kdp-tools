import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GetObjectCommand, S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "./logger";

// S3-compatible storage works unchanged against Cloudflare R2, Supabase
// Storage, or AWS S3 — swapping providers later is just an env var change,
// not a code change. Falls back to local disk when unconfigured so the
// worker still runs end-to-end in local dev without any storage account.
const bucket = process.env.STORAGE_BUCKET;
const endpoint = process.env.STORAGE_ENDPOINT;
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

const s3 =
  bucket && endpoint && accessKeyId && secretAccessKey
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      })
    : null;

export async function uploadPdf(
  bookId: string,
  pdf: Uint8Array,
  kind: "interior" | "cover",
): Promise<string> {
  const key = `books/${bookId}/${kind}-${Date.now()}.pdf`;

  if (s3 && bucket) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: pdf,
        ContentType: "application/pdf",
      }),
    );
    return key;
  }

  logger.warn("STORAGE_* env vars not set — writing PDF to local disk instead of object storage", {
    bookId,
  });
  const localPath = join(process.cwd(), ".local-storage", key);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, pdf);
  return localPath;
}

/**
 * Reads back an object's raw bytes — used to fetch a user-uploaded image
 * assigned to a book page. Returns null (rather than throwing) when object
 * storage isn't configured: unlike generated PDFs, assets are uploaded
 * through the *web* process, not this one, so there's no equivalent local-
 * disk fallback here to read from — a genuinely separate process's local
 * files aren't reachable. The caller treats null as "skip this image, fall
 * back to generated content" rather than failing the whole book.
 */
export async function downloadObject(key: string): Promise<Buffer | null> {
  if (!s3 || !bucket) return null;
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  return bytes ? Buffer.from(bytes) : null;
}
