// Only public KDF parameters belong in site-config.json. No password/verifier.
const encoder=new TextEncoder();
export async function signingKey(credential,authentication=null){
 let secret;
 if(authentication){
  const {type,salt,iterations}=authentication;
  if(type!=='password-pbkdf2-sha256'||typeof salt!=='string'||!/^[a-f0-9]{32,128}$/.test(salt)||salt.length%2||!Number.isInteger(iterations)||iterations<600000||iterations>1000000)throw new Error('密码验证配置无效，请联系维护者。');
  if(typeof credential!=='string'||!credential.length||credential.length>256)throw new Error('请输入登录密码。');
  const bytes=Uint8Array.from(salt.match(/../g),value=>parseInt(value,16));
  const material=await crypto.subtle.importKey('raw',encoder.encode(credential),'PBKDF2',false,['deriveBits']);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes,iterations},material,256));
  // The existing backend uses the hexadecimal text as its HMAC key.
  secret=encoder.encode(Array.from(derived,b=>b.toString(16).padStart(2,'0')).join(''));
  derived.fill(0);
 }else{
  if(typeof credential!=='string'||!/^[a-f0-9]{64}$/i.test(credential.trim()))throw new Error('请输入完整的64位私有访问码。');
  secret=encoder.encode(credential.trim().toLowerCase());
 }
 try{return await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);}
 finally{secret.fill(0);}
}
