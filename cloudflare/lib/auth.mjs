// Only server-generated 192-bit random credentials are accepted. NOT a human password hash scheme.
import {jsonLimited} from './http.mjs';
const enc=new TextEncoder();
export const randomHex=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))),x=>x.toString(16).padStart(2,'0')).join('')}
export const usernameOf=s=>typeof s==='string'?s.trim().toLowerCase():'';
export const validUsername=s=>/^[a-z0-9._-]{3,64}$/.test(s);
export const validSecret=s=>typeof s==='string'&&/^[0-9a-f]{48}$/.test(s);
export const credentialHash=(salt,secret)=>digest('babymark-credential-v1:'+salt+':'+secret);
export async function generateCredential(){const secret=randomHex(24),salt=randomHex(16);return {secret,salt,hash:await credentialHash(salt,secret)}}
export function equalHash(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;let d=0;for(let i=0;i<64;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
export async function sessionUser(request,db){
 const token=request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
 if(!token)return null;
 const hash=await digest('babymark-session-v1:'+token);
 return db.prepare('SELECT p.id,p.employee_code,p.full_name,p.role,p.department FROM sessions s JOIN profiles p ON p.id=s.user_id AND p.active=1 JOIN credentials c ON c.user_id=p.id AND c.version=s.credential_version WHERE s.token_hash=? AND s.expires_at>?').bind(hash,Date.now()).first();
}
export function reply(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}
export async function bodyJSON(request){return jsonLimited(request)}
