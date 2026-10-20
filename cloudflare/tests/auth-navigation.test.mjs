import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAuthNext,signInURL} from '../ui/auth-navigation.mjs';
test('auth returns preserve dashboard drafts and invitation fragments only on the local dashboard',()=>{
 for(const value of ['/manage/','/manage/?create=1','/manage/#invite=opaque-token'])assert.equal(safeAuthNext(value),value);
 for(const value of ['https://evil.example/','//evil.example/','/\\evil.example/','/manage/../evil','/manage/%2e%2e/evil','javascript:alert(1)','/signin/','/people/someone',null,'/manage/\n'])assert.equal(safeAuthNext(value),'/');
 const q=new URL(signInURL('/manage/#invite=opaque-token',true),'https://tinytrail.link');assert.equal(q.pathname,'/signin/');assert.equal(q.searchParams.get('next'),'/manage/#invite=opaque-token');assert.equal(q.searchParams.get('mode'),'signup');assert.equal(signInURL('https://evil.example'),'/signin/');
});
