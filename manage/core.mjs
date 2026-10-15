export const REPO = 'ksrtlink/atk';
export const BRANCH = 'main';
export const BASE = 'https://ksrtlink.github.io/atk/';
export const RESERVED = new Set(['manage', 'assets', 'api', 'admin', 'index', '404', 'readme', 'node_modules']);

export function validateSlug(value) {
  const slug = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64)
    throw new Error('Use up to 64 lowercase letters, numbers, and single hyphens.');
  if (RESERVED.has(slug)) throw new Error('That name is reserved. Please choose another.');
  return slug;
}
export function validateURL(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a full website URL, starting with https://.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP or HTTPS website URL without embedded credentials.');
  if (url.origin === 'https://ksrtlink.github.io' && /^\/atk(?:\/|$)/.test(url.pathname))
    throw new Error('Use the original destination website to avoid redirect loops.');
  if (url.href.length > 4096) throw new Error('That destination URL is too long.');
  return url.href;
}
export function escapeHTML(value) {
  return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function redirectHTML(destination) {
  const url = validateURL(destination);
  const safe = escapeHTML(url);
  // Escape script delimiters even though URL() already normalizes most characters.
  const scriptURL = JSON.stringify(url).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="referrer" content="no-referrer">\n<meta http-equiv="refresh" content="0; url=${safe}">\n<title>Redirecting…</title>\n<script>window.location.replace(${scriptURL});</script>\n</head>\n<body><p>Taking you to your destination. <a href="${safe}">Continue to website</a>.</p></body>\n</html>\n`;
}
export function titleFor(slug) { return slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '); }
export function encodeContent(text) {
  return btoa(Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join(''));
}
export function decodeContent(text) {
  return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
