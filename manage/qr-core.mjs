export const DOT_STYLES = ['square', 'dots', 'rounded', 'extra-rounded', 'classy', 'classy-rounded'];
export const BORDER_STYLES = ['square', 'extra-rounded'];
export const CENTER_STYLES = ['square', 'dot'];
export const FORMATS = { svg: 'image/svg+xml', png: 'image/png', jpeg: 'image/jpeg' };
export const SIZES = [512, 1024, 2048];
export function qrURL(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete website URL, starting with https://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  if (new TextEncoder().encode(url.href).length > 1200)
    throw new Error('This URL is too long for this builder. Create a short link first.');
  return url.href;
}
export function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Choose a valid six-digit color.');
  const c = hex.slice(1).match(/../g).map(v => parseInt(v,16) / 255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
export function colorQuality(foreground, background) {
  const fg = luminance(foreground), bg = luminance(background);
  return { contrast: (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05), darkOnLight: fg < bg };
}
export function qrOptions({url, dots, border, center, foreground, background, size}) {
  const data = qrURL(url);
  if (!DOT_STYLES.includes(dots) || !BORDER_STYLES.includes(border) || !CENTER_STYLES.includes(center)) throw new Error('Choose one of the available shapes.');
  if (!SIZES.includes(size) && size !== 320) throw new Error('Choose a supported export size.');
  colorQuality(foreground,background);
  return {
    type: 'svg', width: size, height: size, data,
    // A 15% margin guarantees at least four clear modules, including version 1.
    margin: Math.ceil(size*.15), qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: { type: dots, color: foreground, roundSize: true },
    cornersSquareOptions: { type: border, color: foreground },
    cornersDotOptions: { type: center, color: foreground },
    backgroundOptions: { color: background }
  };
}
export function qrFilename(url) {
  const parsed = new URL(qrURL(url));
  const name = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
  return (name.replace(/[^a-z0-9-]/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,64) || 'kearney') + '-qr';
}
