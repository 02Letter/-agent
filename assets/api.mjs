const encoder=new TextEncoder();
export class APIError extends Error{constructor(message,status=0,code='transport'){super(message);this.name='APIError';this.status=status;this.http_status=status;this.code=code;}}
export function normalizeBase(value){
 const url=new URL(String(value).trim());const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new APIError('服务地址需要使用 HTTPS，GitHub 页面不能连接普通 HTTP 接口。');
 if(url.username||url.password||url.search||url.hash)throw new APIError('服务地址不能包含用户名、密码或临时访问参数。');
 return url.href.replace(/\/+$/,'').replace(/\/api$/,'');
}
export class AgentAPI{
 constructor(){this.base='';this.key=null;this.release='';this.nextPost=0;this.queue=Promise.resolve();this.health=null;}
 disconnect(){this.key=null;this.release='';this.health=null;}
 async json(path,options={},timeout=15000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const response=await fetch(this.base+path,{...options,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});let data;
   try{data=await response.json();}catch{throw new APIError('服务没有返回可读取的数据，请检查服务地址或稍后继续读取。',response.status,'invalid_response');}
   if(!response.ok)throw new APIError(data.message||'服务暂时无法完成请求。',response.status,data.status||'request_rejected');return data;
  }catch(error){if(error instanceof APIError)throw error;throw new APIError(error.name==='AbortError'?'连接等待超时；尚未确认的提交不会自动重发。':'未能连接服务。请检查 HTTPS 地址、网络和服务的跨域设置。');}finally{clearTimeout(timer);}
 }
 async connect(base,code){
  this.disconnect();this.base=normalizeBase(base);
  if(!/^[a-f0-9]{64}$/i.test(code.trim()))throw new APIError('请输入完整的64位私有访问码。');
  this.health=await this.json('/api/chat/status');if(this.health.status!=='ready')throw new APIError('服务尚未就绪，请稍后连接。');
  this.release=this.health.release?.id||'';
  this.key=await crypto.subtle.importKey('raw',encoder.encode(code.trim().toLowerCase()),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  try{return await this.request('/chat/sessions',{});}catch(error){this.disconnect();throw error;}
 }
 async request(path,data){
  if(!this.key)throw new APIError('请先连接服务。',401,'disconnected');
  const base=this.base,key=this.key,release=this.release;
  const ready=this.queue.then(async()=>{const delay=Math.max(0,this.nextPost-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));this.nextPost=Date.now()+450;});this.queue=ready.catch(()=>{});await ready;
  if(base!==this.base||key!==this.key)throw new APIError('连接已更改，本次操作没有发送。');
  const challenge=await this.json('/api/chat/challenge');if(typeof challenge.nonce!=='string')throw new APIError('服务返回的访问证明格式无效。');
  const payload=JSON.stringify(data),signature=await crypto.subtle.sign('HMAC',key,encoder.encode(challenge.nonce+'\n'+path+'\n'+payload));
  const proof=Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
  return this.json('/api'+path,{method:'POST',headers:{'Content-Type':'application/json',...(release?{'X-Qingfeng-Release':release}:{})},body:JSON.stringify({nonce:challenge.nonce,payload,proof})},path==='/chat/upload'?45000:25000);
 }
}
