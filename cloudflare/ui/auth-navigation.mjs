// Only Tinytrail's dashboard can be a post-authentication destination.
export function safeAuthNext(value,fallback='/') {
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/u.test(value))return fallback;
 try {const u=new URL(value,'https://tinytrail.invalid');return u.origin==='https://tinytrail.invalid'&&u.pathname==='/manage/'?u.pathname+u.search+u.hash:fallback;}catch{return fallback;}
}
export function signInURL(next='/',signup=false){const p=new URLSearchParams();const safe=safeAuthNext(next);if(safe!=='/')p.set('next',safe);if(signup)p.set('mode','signup');return '/signin/'+(p.size?'?'+p:'');}
