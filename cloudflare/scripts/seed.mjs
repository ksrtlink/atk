import { readFile, writeFile } from 'node:fs/promises';
const source=JSON.parse(await readFile(new URL('../../manage/links.json',import.meta.url),'utf8'));
if(source.length!==8)throw new Error('Review the original link inventory before regenerating the migration.');
const quote=value=>`'${value.replace(/'/g,"''")}'`;
const sql='-- Preserve original QR targets exactly; these records are shared and read-only.\n'+source.map(l=>`INSERT INTO links(slug,destination,title,short_url,legacy) VALUES(${quote(l.slug)},${quote(l.url)},${quote(l.title)},${quote(`https://ksrtlink.github.io/atk/${l.slug}/`)},1);`).join('\n')+'\n';
await writeFile(new URL('../migrations/0002_original_links.sql',import.meta.url),sql);
console.log('Prepared the eight original links with their unchanged GitHub Pages URLs.');
