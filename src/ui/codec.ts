// Compact, URL-safe encoding for anything that travels inside a link:
// shared projects, class invites and progress reports.
const b64url = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/** JSON → deflate → base64url. */
export async function pack(data: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** Links longer than this aren't ours (a big project packs to ~20 KB). */
export const MAX_LINK = 200_000;
/** Stop inflating past this: a tiny link can otherwise expand to gigabytes. */
export const MAX_UNPACKED = 1_000_000;

export async function unpack(s: string): Promise<any> {
  if (s.length > MAX_LINK) throw new Error('link too long');
  const reader = new Blob([unb64url(s)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_UNPACKED) { await reader.cancel(); throw new Error('link too large'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return JSON.parse(new TextDecoder().decode(all));
}
