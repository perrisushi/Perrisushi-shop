import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value,'utf8').digest('hex');
export const sessionKey=token=>'v2:'+digest(token);
export const newToken=()=>randomBytes(32).toString('base64url');
export function matchesPassword(password,stored){
 if(typeof stored==='string')stored=stored.trim();
 const actual=Buffer.from(digest(password),'hex');
 const valid=typeof stored==='string'&&/^[a-f0-9]{64}$/i.test(stored);
 return timingSafeEqual(actual,valid?Buffer.from(stored,'hex'):Buffer.alloc(32))&&valid;
}
export function equalText(a,b){const aa=Buffer.from(String(a??'')),bb=Buffer.from(String(b??''));return aa.length===bb.length&&timingSafeEqual(aa,bb)}
export const csrfFor=(token,secret)=>createHmac('sha256',secret).update(token).digest('base64url');
export function cookieToken(cookie=''){
 const values=cookie.split(';').map(s=>s.trim()).filter(s=>s.startsWith('pw2_session='));
 if(values.length!==1)return null;
 const token=values[0].slice(12);return /^[\w-]{43}$/.test(token)?token:null;
}
export class RateLimiter{
 constructor({max=10,windowMs=15*60_000,now=Date.now,maxEntries=10000}={}){Object.assign(this,{max,windowMs,now,maxEntries});this.entries=new Map()}
 take(key){const time=this.now();let record=this.entries.get(key);
  if(!record||record.until<=time){
   if(this.entries.size>=this.maxEntries){for(const [k,v]of this.entries)if(v.until<=time)this.entries.delete(k);if(this.entries.size>=this.maxEntries)return false}
   record={count:0,until:time+this.windowMs};this.entries.set(key,record);
  }
  return ++record.count<=this.max;
 }
}
