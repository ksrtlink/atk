// RFC 6350: UTF-8 text escaping, CRLF and 75-octet folds that preserve code points.
const escape=v=>String(v).replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");
export function fold(line) {
 let chunks=[],part="",bytes=0;
 for(const char of line){const length=new TextEncoder().encode(char).length;if(bytes+length>75){chunks.push(part);part=" ";bytes=1;}part+=char;bytes+=length;}
 chunks.push(part);return chunks.join("\r\n");
}
export function vcard(content,url,revision) {
 const lines=["BEGIN:VCARD","VERSION:4.0","KIND:individual","FN:"+escape(content.name)];
 if(content.familyName||content.givenName)lines.push("N:"+[content.familyName,content.givenName,"","",""].map(escape).join(";"));
 for(const [key,prop]of [["organization","ORG"],["title","TITLE"],["department","ROLE"],["intro","NOTE"],["email","EMAIL"],["phone","TEL;VALUE=text"],["office","ADR;TYPE=work"]]){
  if(content[key])lines.push(prop+":"+(key==="office"?";;"+escape(content[key])+";;;;":escape(content[key])));
 }
 if(content.photoId)lines.push("PHOTO;MEDIATYPE=image/png:"+url+"/photo");
 lines.push("UID:"+url,"URL:"+url,"REV:"+new Date(revision).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,""),"END:VCARD");
 return lines.map(fold).join("\r\n")+"\r\n";
}
