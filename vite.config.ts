import { defineConfig, type Plugin } from 'vite';

/**
 * The published site's Content-Security-Policy. Builder runs everything in the page,
 * so the only outside hosts are Google Fonts. Even if some HTML slipped past the
 * escaping, the browser would refuse to run any script that isn't one of our files.
 * (Dev mode skips it: Vite's hot reload injects inline scripts.)
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // style="" attributes for layout and colours
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const securityMeta = (): Plugin => ({
  name: 'builder-security-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  // relative asset paths, so the built site works from any folder (e.g. GitHub Pages /Builder-/)
  base: './',
  plugins: [securityMeta()],
});
