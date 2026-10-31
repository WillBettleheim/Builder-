// Compact, URL-safe encoding for anything that travels inside a link:
// shared projects, class invites and progress reports.
const b64url = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/** JSON → deflate → base64url. */
export async function pack(data: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function unpack(s: string): Promise<any> {
  const stream = new Blob([unb64url(s)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}
