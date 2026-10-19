import {Problem} from "./domain.mjs";
export const MAX_PHOTO_BYTES=120000;
const fail=()=>{throw new Problem(400,"Use a still PNG portrait up to 256 × 256 pixels and 120 KB. Choose the image again to prepare it.");};
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
export async function photoPNG(data){
 if(typeof data!=="string"||!data.startsWith("data:image/png;base64,")||data.length>160022)fail();
 let bytes;try{const raw=atob(data.slice(22));bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));}catch{fail();}
 if(bytes.length>MAX_PHOTO_BYTES||bytes.length<57||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))fail();
 const view=new DataView(bytes.buffer),kept=[bytes.slice(0,8)],compressed=[];let width=0,height=0,channels=0,offset=8,ended=false,idat=false;
 while(offset<bytes.length){
  if(offset+12>bytes.length)fail();const length=view.getUint32(offset),end=offset+12+length;
  if(length>MAX_PHOTO_BYTES||end>bytes.length)fail();const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));
  if(crc(bytes.subarray(offset+4,end-4))!==view.getUint32(end-4))fail();
  if(type==="IHDR"){
   if(offset!==8||length!==13)fail();width=view.getUint32(offset+8);height=view.getUint32(offset+12);const bits=bytes[offset+16],color=bytes[offset+17];channels=color===6?4:color===2?3:0;
   if(width<1||height<1||width>256||height>256||bits!==8||!channels||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]!==0)fail();kept.push(bytes.slice(offset,end));
  }else if(type==="IDAT"){
   if(!width||ended)fail();compressed.push(bytes.slice(offset+8,end-4));kept.push(bytes.slice(offset,end));idat=true;
  }else if(type==="IEND"){
   if(!idat||length!==0||end!==bytes.length)fail();kept.push(bytes.slice(offset,end));ended=true;
  }else{
   // Only bounded color/density hints before pixel data are accepted; drop them all.
   const lengths={sRGB:1,gAMA:4,cHRM:32,pHYs:9};if(!width||idat||lengths[type]!==length)fail();
  }
  offset=end;
 }
 if(!ended)fail();
 const expected=(width*channels+1)*height,stride=width*channels+1;
 let reader,total=0;
 try{
  reader=new Blob(compressed).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  while(true){const {done,value}=await reader.read();if(done)break;if(total+value.length>expected){await reader.cancel();fail();}for(let i=0;i<value.length;i++)if((total+i)%stride===0&&value[i]>4)fail();total+=value.length;}
 }catch{try{await reader?.cancel();}catch{}fail();}
 if(total!==expected)fail();
 const canonical=new Uint8Array(kept.reduce((n,b)=>n+b.length,0));let at=0;for(const b of kept){canonical.set(b,at);at+=b.length;}
 const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",canonical))].map(n=>n.toString(16).padStart(2,"0")).join("");
 return{bytes:canonical,width,height,hash};
}
export const photoDataURL=bytes=>"data:image/png;base64,"+btoa(Array.from(bytes,n=>String.fromCharCode(n)).join(""));
