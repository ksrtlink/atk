import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSlug, validateURL, redirectHTML, encodeContent, decodeContent } from '../manage/core.mjs';

test('rejects traversal, reserved paths, and ambiguous slugs', () => {
  for (const slug of ['../index','a/b','A-name','a--b','-a','a-', 'manage', 'a'.repeat(65), ''])
    assert.throws(() => validateSlug(slug));
  assert.equal(validateSlug('military-innovation'), 'military-innovation');
});
test('allows website destinations, rejects executable URLs and short-link loops', () => {
  for (const url of ['javascript:alert(1)','data:text/html,hello','ftp://example.com','https://user:pass@example.com','https://ksrtlink.github.io/atk/insights/'])
    assert.throws(() => validateURL(url));
  assert.equal(validateURL('https://example.com/path?a=1&b=2#part'), 'https://example.com/path?a=1&b=2#part');
});
test('redirect output safely encodes markup and preserves query parameters', () => {
  const destination = 'https://example.com/?a=1&b="quoted"&x=</script><script>alert(1)</script>';
  const html = redirectHTML(destination);
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.ok(html.includes('&amp;b='));
  assert.ok(html.includes('window.location.replace('));
  const script = html.match(/window.location.replace\((.*)\);/)[1];
  assert.equal(JSON.parse(script), validateURL(destination));
  assert.ok(!script.includes('</script>'));
});
test('GitHub content encoding preserves non-ASCII URLs and text', () => {
  const text = 'Destinations → العربية 日本語';
  assert.equal(decodeContent(encodeContent(text)), text);
});
test('all eight snapshot destinations match the existing redirect HTML', async () => {
  const links = JSON.parse(await readFile(new URL('../manage/links.json', import.meta.url), 'utf8'));
  assert.equal(links.length, 8);
  assert.equal(new Set(links.map(l=>l.slug)).size, 8);
  for (const link of links) {
    const html = await readFile(new URL(`../${link.slug}/index.html`, import.meta.url), 'utf8');
    assert.ok(html.includes(`href="${link.url}"`), link.slug);
    assert.equal(validateSlug(link.slug), link.slug);
    assert.equal(validateURL(link.url), link.url);
  }
});
