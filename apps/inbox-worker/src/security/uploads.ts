export const MAX_FILE = 10 * 1024 * 1024,
  MAX_REQUEST = 25 * 1024 * 1024,
  MAX_PAYLOAD = 256 * 1024;
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: unknown,
    public ruleIds?: string[],
  ) {
    super(code);
  }
}
export function checkFile(bytes: Uint8Array, contentType: string) {
  if (bytes.length > MAX_FILE) throw new HttpError(413, "file_too_large");
  const detected =
    bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
      ? "application/pdf"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
          ? "image/png"
          : null;
  if (!detected || detected !== contentType) throw new HttpError(415, "unsupported_file_type");
}
export async function boundedBody(request: Request, limit = MAX_REQUEST): Promise<Uint8Array> {
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > limit) throw new HttpError(413, "request_too_large");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > limit) {
      await reader.cancel();
      throw new HttpError(413, "request_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(n);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}
export async function multipart(request: Request): Promise<FormData> {
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data"))
    throw new HttpError(415, "multipart_required");
  const bytes = await boundedBody(request);
  try {
    return await new Response(Uint8Array.from(bytes), {
      headers: { "Content-Type": request.headers.get("Content-Type")! },
    }).formData();
  } catch {
    throw new HttpError(422, "invalid_multipart");
  }
}
