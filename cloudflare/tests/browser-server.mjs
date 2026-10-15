// Loopback-only integration harness. It uses test RSA identities and in-memory SQLite.
// This file is never bundled into the production Worker or static assets.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyFirebaseToken } from '../src/auth.mjs';
import { createApp } from '../src/worker.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const assets=resolve(root,'public');
const sql=new DatabaseSync(':memory:');
sql.exec(await readFile(resolve(root,'migrations/0001_schema.sql'),'utf8'));
sql.exec(await readFile(resolve(root,'migrations/0002_original_links.sql'),'utf8'));
const DB={prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};},async all(){return {results:sql.prepare(query).all()};}};}};
const pair=await generateKeyPair('RS256'),jwk=await exportJWK(pair.publicKey);jwk.kid='browser-test';jwk.alg='RS256';
const resolver=createLocalJWKSet({keys:[jwk]});
const tokens={};
for(const [id,email,verified]of[['alice','alice@example.com',true],['bob','bob@example.com',true],['charlie','charlie@example.com',false],['charlieVerified','charlie@example.com',true]]){
 const uid=id==='charlieVerified'?'charlie':id;
 tokens[id]={idToken:await new SignJWT({email,email_verified:verified,auth_time:Math.floor(Date.now()/1000),name:uid})
   .setProtectedHeader({alg:'RS256',kid:'browser-test'}).setSubject(uid).setAudience('test-project').setIssuer('https://securetoken.google.com/test-project').setIssuedAt().setExpirationTime('1h').sign(pair.privateKey),refreshToken:`${uid}-refresh`,email,localId:uid,expiresIn:'3600'};
}
const env={DB,FIREBASE_PROJECT_ID:'test-project',FIREBASE_API_KEY:'public-test-key',PUBLIC_ORIGIN:'http://127.0.0.1:4174',
 ASSETS:{async fetch(request){let name=decodeURIComponent(new URL(request.url).pathname);if(name.endsWith('/'))name+='index.html';const path=resolve(assets,'.'+name);
 if(!path.startsWith(assets+sep))return new Response('Not found',{status:404});
 try{const body=await readFile(path);return new Response(body,{headers:{'Content-Type':{'.html':'text/html;charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream','Cache-Control':'no-store'}});}catch{return new Response('Not found',{status:404});}
 }}};
const app=createApp((token,settings)=>verifyFirebaseToken(token,settings,resolver));
createServer(async(req,res)=>{
 try{
  if(req.url==='/qa/tokens'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(tokens));return;}
  if(req.url==='/qa/reset'&&req.method==='POST'){sql.exec('DELETE FROM qr_designs; DELETE FROM links WHERE legacy=0; DELETE FROM users;');res.writeHead(200);res.end('Reset test data');return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request(`http://127.0.0.1:4174${req.url}`,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await app.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Test harness error');}
}).listen(4174,'127.0.0.1',()=>console.log('Account integration test server: http://127.0.0.1:4174/manage/ (simulated email provider, real JWT verification and SQLite)'));
