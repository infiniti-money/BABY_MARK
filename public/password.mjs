// Browser-only password stretching keeps the expensive KDF off the free Worker.
// A derived login key is password-equivalent in transit: use only the HTTPS app.
export const isLegacyCode=value=>typeof value==='string'&&/^[0-9a-f]{48}$/.test(value);
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const enc=new TextEncoder();
export async function derivePasswordKey(password,salt){
 if(typeof password!=='string'||password.length<8||password.length>128||isLegacyCode(password)||!/^([0-9a-f]{32})$/.test(salt))throw new Error('Mật khẩu cần 8–128 ký tự và không được là mã hex 48 ký tự.');
 if(!globalThis.crypto?.subtle)throw new Error('Cần trình duyệt hỗ trợ HTTPS và Web Crypto.');
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode('babymark-password-v1:'+salt),iterations:600000},key,256);
 return hex(new Uint8Array(bits));
}
export async function newPasswordCredential(password){
 const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
 return {password_salt:salt,password_key:await derivePasswordKey(password,salt)};
}
