const escape=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
export function signatureHTML({content:c,publicUrl}){
 const address=new URL(publicUrl);if(!["https:","http:"].includes(address.protocol)||address.username||address.password)throw Error("Invalid public card address.");
 const e=escape,rows=[];
 rows.push(`<tr><td style="font-size:16px;font-weight:700;color:#1e1e1e;padding:0 0 3px">${e(c.name)}</td></tr>`);
 if(c.title||c.organization)rows.push(`<tr><td style="color:#52525b;padding:0 0 8px">${e([c.title,c.organization].filter(Boolean).join(" · "))}</td></tr>`);
 for(const [label,value,href]of [["Email",c.email,c.email?"mailto:"+encodeURIComponent(c.email):null],["Phone",c.phone,c.phone?"tel:"+c.phone.replace(/[^+\d]/g,""):null]])if(value)rows.push(`<tr><td style="padding:2px 0"><a href="${e(href)}" style="color:#1e1e1e;text-decoration:none">${e(value)}</a></td></tr>`);
 rows.push(`<tr><td style="padding:8px 0 0"><a href="${e(publicUrl)}" style="color:#b63b0c;text-decoration:underline">View contact card</a></td></tr>`);
 return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font:13px/1.5 Arial,Helvetica,sans-serif;border-left:3px solid #ff5e1f"><tbody><tr><td style="padding:2px 0 2px 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font:13px/1.5 Arial,Helvetica,sans-serif"><tbody>${rows.join("")}</tbody></table></td></tr></tbody></table>`;
}
export function signatureText({content:c,publicUrl}){return[c.name,[c.title,c.organization].filter(Boolean).join(" · "),c.email,c.phone,publicUrl].filter(Boolean).join("\n");}
export function signatureDocument(value){return'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>Contact signature</title></head><body>'+signatureHTML(value)+'</body></html>';}
