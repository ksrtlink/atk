import test from "node:test";
import assert from "node:assert/strict";
import {campaignURL} from "../ui/utm.mjs";

test("campaign builder preserves unrelated query bytes, duplicates and fragments",()=>{
  const out=campaignURL("https://example.com/report?a=one%20two&a=three%2ffour&sig=A%2BB#chapter-2",{source:"newsletter",medium:"email",campaign:"Annual Report"});
  assert.equal(out,"https://example.com/report?a=one%20two&a=three%2ffour&sig=A%2BB&utm_source=newsletter&utm_medium=email&utm_campaign=Annual+Report#chapter-2");
});
test("campaign builder keeps existing tags by default, including duplicate tags",()=>{
  assert.equal(campaignURL("https://example.com/?utm_source=old&utm_source=other&utm_medium=web#x",{source:"new",campaign:"launch"}),"https://example.com/?utm_source=old&utm_source=other&utm_medium=web&utm_campaign=launch#x");
});
test("replace affects only supplied fields and leaves empty and unknown tags unchanged",()=>{
  const out=campaignURL("https://example.com/?utm_source=one&utm_source=two&utm_medium=web&utm_id=42&x=1",{source:"new",medium:"   "},{replace:true});
  assert.equal(out,"https://example.com/?utm_medium=web&utm_id=42&x=1&utm_source=new");
});
test("campaign builder handles encoded and mixed-case existing keys without duplicating them",()=>{
  assert.equal(campaignURL("https://example.com/?%75tm_source=old&UTM_CONTENT=top",{source:"new",content:"bottom"}),"https://example.com/?%75tm_source=old&UTM_CONTENT=top");
  assert.equal(campaignURL("https://example.com/?%75tm_source=old&UTM_CONTENT=top",{source:"new"},{replace:true}),"https://example.com/?UTM_CONTENT=top&utm_source=new");
});
test("campaign values round-trip Unicode and reserved characters without adding query fields",()=>{
  const value="إطلاق & Europe/日本 + #?=",u=new URL(campaignURL("https://example.com/",{campaign:value}));
  assert.equal(u.searchParams.get("utm_campaign"),value);
  assert.equal([...u.searchParams].length,1);
});
test("campaign builder trims text, preserves case and leaves an untagged URL unchanged",()=>{
  assert.equal(campaignURL("https://example.com/?#top",{}),"https://example.com/?#top");
  assert.equal(campaignURL("https://example.com/?q=a%20b#top",{}),"https://example.com/?q=a%20b#top");
  assert.equal(new URL(campaignURL("https://example.com/",{source:"  EmailTeam  "})).searchParams.get("utm_source"),"EmailTeam");
});
test("campaign builder rejects unsafe URLs, credentials, control characters and oversized values",()=>{
  for(const url of ["javascript:alert(1)","data:text/html,test","https://user:pass@example.com","not a URL"]) assert.throws(()=>campaignURL(url,{source:"a"}));
  for(const value of ["a".repeat(201),"a\nb", 123]) assert.throws(()=>campaignURL("https://example.com/",{source:value}));
});
test("campaign builder enforces final URL length after percent encoding",()=>{
  assert.throws(()=>campaignURL("https://example.com/?long="+"a".repeat(4000),{campaign:"é".repeat(100)}),/4,096/);
});
test("campaign builder repeated application never accumulates duplicate generated tags",()=>{
  const first=campaignURL("https://example.com/",{source:"one",campaign:"launch"});
  assert.equal(campaignURL(first,{source:"one",campaign:"launch"}),first);
  const next=new URL(campaignURL(first,{source:"two"},{replace:true}));
  assert.deepEqual(next.searchParams.getAll("utm_source"),["two"]);
});
