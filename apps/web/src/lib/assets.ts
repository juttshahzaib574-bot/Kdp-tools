import sharp from "sharp";
import { NORMALIZED_MAX_DIMENSION_PX } from "@kdp/shared";

export interface NormalizedImage {
  buffer: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
}

/**
 * Re-encodes any accepted upload (PNG/JPEG/WEBP) into a single predictable
 * format: JPEG, resized so its longest edge never exceeds
 * NORMALIZED_MAX_DIMENSION_PX. This is what actually gets stored, counted
 * against the user's quota, and later embedded in the exported PDF — never
 * the raw upload. A full-page book image doesn't need transparency, so
 * standardizing on JPEG (much smaller than PNG for photographic or
 * illustrated content) is a deliberate simplification, not a limitation
 * users are likely to hit.
 *
 * Throws if the input isn't decodable as an image — the caller should treat
 * that as a 400, not a 500.
 */
export async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  const pipeline = sharp(input, { failOn: "error" }).rotate(); // .rotate() applies EXIF orientation, then strips it
  const resized = pipeline.resize({
    width: NORMALIZED_MAX_DIMENSION_PX,
    height: NORMALIZED_MAX_DIMENSION_PX,
    fit: "inside",
    withoutEnlargement: true,
  });
  const { data, info } = await resized
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, mimeType: "image/jpeg", width: info.width, height: info.height };
}
