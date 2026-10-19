import {checkHealthConfig} from "./health-config.mjs";
import { readFile } from 'node:fs/promises';
const config=await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8').catch(()=>{throw new Error('Copy wrangler.example.jsonc to wrangler.jsonc and configure your D1 database and Firebase project first.');});
if(config.includes('REPLACE_WITH_D1_DATABASE_ID'))throw new Error('Set the real D1 database_id before deploying.');
for(const key of ['FIREBASE_PROJECT_ID','FIREBASE_API_KEY','ADMIN_EMAILS']){
  const match=config.match(new RegExp(`"${key}"\\s*:\\s*"([^\"]+)"`));if(!match?.[1])throw new Error(`Set ${key} in wrangler.jsonc before deploying.`);
}



for(const match of config.matchAll(/"(ANALYTICS_ENABLED|TRACKED_QR_ENABLED)"\s*:\s*"([^"]*)"/g)){if(!['true','false'].includes(match[2]))throw Error('Set '+match[1]+' to true or false.');}
const retention=config.match(/"ANALYTICS_RETENTION_DAYS"\s*:\s*"([^"]*)"/)?.[1];if(retention&&!['30','90'].includes(retention))throw Error('Choose 30 or 90 retention days.');
checkHealthConfig(JSON.parse(config));
console.log('Required deployment settings are present.');
