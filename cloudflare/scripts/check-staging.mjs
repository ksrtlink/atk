import {readFile} from 'node:fs/promises';
const production=JSON.parse(await readFile('wrangler.jsonc','utf8')),staging=JSON.parse(await readFile('wrangler.staging.jsonc','utf8'));
if(staging.name===production.name||staging.d1_databases.some(s=>production.d1_databases.some(p=>p.database_id===s.database_id))||staging.routes?.length||staging.vars.PUBLIC_ORIGIN===production.vars.PUBLIC_ORIGIN)throw Error('Staging must have a distinct Worker, database and origin, with no production routes.');
console.log('Staging isolation verified.');
