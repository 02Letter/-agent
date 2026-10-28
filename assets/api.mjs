const encoder=new TextEncoder();
const clock=()=>performance.now(),round=value=>Math.round(Math.max(0,value)*1000)/1000;
const id=value=>typeof value==='string'&&/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(value)?value:null;
const phases=new Set(['submit','accepted','first_public_delta_received','first_visible_answer','answer_received','presentation_complete','render_complete','render_degraded','submit_unconfirmed','read_interrupted','view_resumed']);
const paths=new Set(['/chat/session','/chat/sessions','/chat/delete','/chat/send','/chat/poll','/chat/history','/chat/upload','/chat/files']);
const reports=new Map();
function remember(report){const key=report.trace_id||report.job_id;if(!key)return;for(const [prior,row] of reports)if(report.job_id&&row.job_id===report.job_id&&prior!==key)reports.delete(prior);reports.delete(key);reports.set(key,report);while(reports.size>32)reports.delete(reports.keys().next().value);}
export class ClientTrace{
 constructor(requestId=null,jobId=null,{now=clock,origin='submission',sessionId=null}={}){this.now=now;this.started=now();this.traceId=id(requestId);this.jobId=id(jobId);this.sessionId=id(sessionId);this.origin=origin==='view_resumed'?'view_resumed':'submission';this.marks={};this.transport=[];this.server=null;this.mark(this.origin==='submission'?'submit':'view_resumed');}
 mark(name){if(phases.has(name)&&this.marks[name]===undefined){this.marks[name]=round(this.now()-this.started);remember(this.snapshot());}}
 bind(jobId){this.jobId=id(jobId)||this.jobId;remember(this.snapshot());}
 addTransport(row){if(!row||!paths.has(row.path))return;const clean={path:row.path,outcome:row.outcome==='ok'?'ok':'error'};for(const name of ['elapsed_ms','queue_ms','challenge_ms','sign_ms','http_ms','gateway_upstream_ms'])if(Number.isFinite(row[name])&&row[name]>=0)clean[name]=round(row[name]);if(Number.isInteger(row.http_status))clean.http_status=row.http_status;this.transport.push(clean);if(this.transport.length>64)this.transport.shift();remember(this.snapshot());}
 serverTrace(value){if(!value||value.version!==1||value.clock!=='server_monotonic')return;const clean={version:1,trace_id:id(value.trace_id),job_id:id(value.job_id),clock:'server_monotonic',marks_ms:{},phase_totals_ms:{},content_recorded:false};
  for(const name of ['worker_started','context_ready','model_requested','first_public_delta','answer_ready','answer_committed','finished','failed'])if(Number.isFinite(value.marks_ms?.[name])&&value.marks_ms[name]>=0)clean.marks_ms[name]=round(value.marks_ms[name]);
  for(const name of ['context_prepare','model_queue','model_generation','tool_execution','commit'])if(Number.isFinite(value.phase_totals_ms?.[name])&&value.phase_totals_ms[name]>=0)clean.phase_totals_ms[name]=round(value.phase_totals_ms[name]);
  if(Number.isFinite(value.server_elapsed_ms)&&value.server_elapsed_ms>=0)clean.server_elapsed_ms=round(value.server_elapsed_ms);if(this.jobId&&clean.job_id&&this.jobId!==clean.job_id)return;if(this.traceId&&clean.trace_id&&this.traceId!==clean.trace_id)return;this.server=clean;if(!this.traceId)this.traceId=clean.trace_id;remember(this.snapshot());
 }
 snapshot(){return {version:1,trace_id:this.traceId,job_id:this.jobId,session_id:this.sessionId,clock:'browser_performance',origin:this.origin,marks_ms:{...this.marks},transport:this.transport.map(row=>({...row})),server:this.server?JSON.parse(JSON.stringify(this.server)):null,content_recorded:false};}
}
// Bounded in-memory diagnostics only: no text, access code, URL, localStorage,
// analytics upload, or extra model request. Reload starts a new clock domain.
globalThis.QFPerformance=Object.freeze({snapshot:()=>[...reports.values()].map(row=>JSON.parse(JSON.stringify(row))),forgetJob:jobId=>{for(const [key,row] of reports)if(row.job_id===jobId)reports.delete(key);},forgetSession:sessionId=>{for(const [key,row] of reports)if(row.session_id===sessionId)reports.delete(key);},clear:()=>reports.clear()});
export class APIError extends Error{constructor(message,status=0,code='transport'){super(message);this.name='APIError';this.status=status;this.http_status=status;this.code=code;}}
export function normalizeBase(value){
 const url=new URL(String(value).trim());const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new APIError('服务地址需要使用 HTTPS，GitHub 页面不能连接普通 HTTP 接口。');
 if(url.username||url.password||url.search||url.hash)throw new APIError('服务地址不能包含用户名、密码或临时访问参数。');
 return url.href.replace(/\/+$/,'').replace(/\/api$/,'');
}
export class AgentAPI{
 constructor(){this.base='';this.key=null;this.release='';this.nextPost=0;this.queue=Promise.resolve();this.health=null;this.onTransport=null;}
 disconnect(){this.key=null;this.release='';this.health=null;}
 async json(path,options={},timeout=15000,timing=null){
  const started=clock(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const response=await fetch(this.base+path,{...options,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});let data;
   if(timing){timing.http_status=response.status;const header=response.headers?.get('Server-Timing')||'',match=/\bqf_upstream;dur=([0-9.]+)/.exec(header);if(match&&Number.isFinite(Number(match[1])))timing.gateway_upstream_ms=Number(match[1]);}
   try{data=await response.json();}catch{throw new APIError('服务没有返回可读取的数据，请检查服务地址或稍后继续读取。',response.status,'invalid_response');}
   if(!response.ok)throw new APIError(data.message||'服务暂时无法完成请求。',response.status,data.status||'request_rejected');return data;
  }catch(error){if(error instanceof APIError)throw error;throw new APIError(error.name==='AbortError'?'连接等待超时；尚未确认的提交不会自动重发。':'未能连接服务。请检查 HTTPS 地址、网络和服务的跨域设置。');}finally{clearTimeout(timer);if(timing)timing.http_ms=round(clock()-started);}
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
  const started=clock(),timing={path:paths.has(path)?path:'other',trace_id:id(data?.request_id),job_id:id(data?.job_id),outcome:'error'};
  try{
  const base=this.base,key=this.key,release=this.release;
  const ready=this.queue.then(async()=>{const delay=Math.max(0,this.nextPost-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));this.nextPost=Date.now()+450;});this.queue=ready.catch(()=>{});await ready;
  timing.queue_ms=round(clock()-started);
  if(base!==this.base||key!==this.key)throw new APIError('连接已更改，本次操作没有发送。');
  const challengeStarted=clock();
  const challenge=await this.json('/api/chat/challenge');if(typeof challenge.nonce!=='string')throw new APIError('服务返回的访问证明格式无效。');
  timing.challenge_ms=round(clock()-challengeStarted);const signStarted=clock();
  const payload=JSON.stringify(data),signature=await crypto.subtle.sign('HMAC',key,encoder.encode(challenge.nonce+'\n'+path+'\n'+payload));
  const proof=Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
  timing.sign_ms=round(clock()-signStarted);
  const result=await this.json('/api'+path,{method:'POST',headers:{'Content-Type':'application/json',...(release?{'X-Qingfeng-Release':release}:{})},body:JSON.stringify({nonce:challenge.nonce,payload,proof})},path==='/chat/upload'?45000:25000,timing);timing.outcome='ok';return result;
  }finally{timing.elapsed_ms=round(clock()-started);try{this.onTransport?.(Object.freeze(timing));}catch{/* Diagnostics never changes the request outcome. */}}
 }
}
