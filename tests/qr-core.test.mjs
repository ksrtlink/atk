import test from 'node:test';
import assert from 'node:assert/strict';
import { qrURL, qrOptions, colorQuality, qrFilename } from '../manage/qr-core.mjs';
test('QR URLs accept short links but reject executable protocols and credentials',()=>{
  assert.equal(qrURL('https://ksrtlink.github.io/atk/insights/'),'https://ksrtlink.github.io/atk/insights/');
  for(const value of ['javascript:alert(1)','data:text/html,hi','https://user:pass@example.com','no url'])assert.throws(()=>qrURL(value));
  assert.throws(()=>qrURL('https://example.com/?q='+'a'.repeat(1200)));
});
test('contrast rejects light brand foregrounds and inverted colors',()=>{
  assert.ok(colorQuality('#7823DC','#FFFFFF').contrast>=4.5);
  assert.ok(colorQuality('#1E1E1E','#FFFFFF').darkOnLight);
  assert.ok(colorQuality('#5AD1DD','#FFFFFF').contrast<4.5);
  assert.ok(colorQuality('#FF99E2','#FFFFFF').contrast<4.5);
  assert.equal(colorQuality('#FFFFFF','#1E1E1E').darkOnLight,false);
});
test('export options preserve URL and quiet zone at every supported size',()=>{
  for(const size of [320,512,1024,2048]){
    const options=qrOptions({url:'https://example.com/?a=1&b=2#part',dots:'dots',border:'extra-rounded',center:'dot',foreground:'#7823DC',background:'#FFFFFF',size});
    assert.equal(options.data,'https://example.com/?a=1&b=2#part');
    assert.equal(options.qrOptions.errorCorrectionLevel,'H');
    assert.ok(options.margin/(size-2*options.margin)*21>=4);
  }
});
test('download filenames use safe slug names',()=>{
  assert.equal(qrFilename('https://ksrtlink.github.io/atk/women-in-intelligence/'),'women-in-intelligence-qr');
  assert.equal(qrFilename('https://example.com/'),'example-com-qr');
});
