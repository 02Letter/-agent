/* Recover attachment transfers only. No chat/send retries and no model calls. */
(function(root){'use strict';
async function transfer(file,request,{sessionId,onProgress=()=>{}}){
 const bytes=new Uint8Array(await file.arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const begin={session_id:sessionId,action:'start',name:file.name,size:bytes.length,sha256,resume:true};
 let meta;for(let n=0;n<2;n++){try{meta=await request('/chat/upload',begin);break;}catch(e){if(n||e.http_status&&![429,502,503,504].includes(e.http_status))throw e;}}
 if(meta.size!==bytes.length||meta.sha256!==sha256)throw Error('文件身份校验未通过。');
 const fid=meta.file_id;let offset=meta.received||0,recoveries=0;
 while(meta.status!=='ready'&&offset<bytes.length){
  const end=Math.min(offset+96000,bytes.length);let raw='';for(const b of bytes.subarray(offset,end))raw+=String.fromCharCode(b);
  try{const receipt=await request('/chat/upload',{session_id:sessionId,action:'chunk',file_id:fid,offset,data:btoa(raw)});if(!Number.isInteger(receipt.received)||receipt.received<end||receipt.received>bytes.length)throw Error('上传回执位置无效。');offset=receipt.received;onProgress(offset,bytes.length);}
  catch(e){if(++recoveries>2||e.http_status&&![429,502,503,504].includes(e.http_status))throw e;meta=await request('/chat/upload',{session_id:sessionId,action:'status',file_id:fid});if(!Number.isInteger(meta.received)||meta.received<offset||meta.received>bytes.length)throw Error('服务器上传进度无效。');offset=meta.received;onProgress(offset,bytes.length);}
 }
 if(meta.status==='ready')return meta;
 let done;try{done=await request('/chat/upload',{session_id:sessionId,action:'finish',file_id:fid});}
 catch(e){done=await request('/chat/upload',{session_id:sessionId,action:'status',file_id:fid});if(done.status!=='ready')throw e;}
 if(done.status!=='ready')throw Error(done.message||'文件上传完成，但暂未能解析。');return done;
}
root.QFUpload=Object.freeze({transfer});})(globalThis);
