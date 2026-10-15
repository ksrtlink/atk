import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyFirebaseToken } from '../src/auth.mjs';

const pair=await generateKeyPair('RS256');
const publicJwk=await exportJWK(pair.publicKey);publicJwk.kid='test-key';publicJwk.alg='RS256';
const resolver=createLocalJWKSet({keys:[publicJwk]});
const env={FIREBASE_PROJECT_ID:'studio-test',FIREBASE_API_KEY:'public-key'};
const now=Math.floor(Date.now()/1000);
async function signed(overrides={},issuer='https://securetoken.google.com/studio-test',audience='studio-test'){
  return new SignJWT({email:'alice@example.com',email_verified:true,auth_time:now-10,...overrides})
    .setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('alice').setIssuer(issuer).setAudience(audience)
    .setIssuedAt(now).setExpirationTime(now+3600).sign(pair.privateKey);
}
test('verifies real RSA signatures and derives identity from the signed token',async()=>{
  const user=await verifyFirebaseToken(await signed(),env,resolver);assert.equal(user.uid,'alice');assert.equal(user.verified,true);
});
test('rejects a different project, issuer, future authentication time, or modified payload',async()=>{
  await assert.rejects(verifyFirebaseToken(await signed({},undefined,'another-project'),env,resolver));
  await assert.rejects(verifyFirebaseToken(await signed({},'https://evil.example'),env,resolver));
  await assert.rejects(verifyFirebaseToken(await signed({auth_time:now+600}),env,resolver));
  const parts=(await signed()).split('.');parts[1]=Buffer.from(JSON.stringify({sub:'admin'})).toString('base64url');
  await assert.rejects(verifyFirebaseToken(parts.join('.'),env,resolver));
});
test('unverified-email claim is preserved for backend access enforcement',async()=>{
  const user=await verifyFirebaseToken(await signed({email_verified:false}),env,resolver);assert.equal(user.verified,false);
});
