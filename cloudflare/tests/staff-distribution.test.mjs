import test from 'node:test';import assert from 'node:assert/strict';import {signatureHTML,signatureText,signatureDocument} from '../shared/staff-distribution.mjs';
test('email signature escapes untrusted text, has no scripts/images or remote styling and preserves Unicode in plain text',()=>{
 const asset={publicUrl:'https://tinytrail.link/people/nadia',content:{name:'محمد <script>alert(1)</script>',title:'Senior & advisor',organization:'Example',email:'nadia@example.com',phone:'+971 50 123 4567'}};
 const html=signatureHTML(asset),doc=signatureDocument(asset);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!/<script|<img|<link|<iframe|onerror=/i.test(html));assert.ok(html.includes('mailto:nadia%40example.com'));assert.ok(html.includes('tel:+971501234567'));assert.ok(!/javascript:/i.test(doc));assert.ok(doc.includes("default-src 'none'"));assert.ok(signatureText(asset).startsWith('محمد <script>'));
 assert.throws(()=>signatureHTML({...asset,publicUrl:'javascript:alert(1)'}));
});
