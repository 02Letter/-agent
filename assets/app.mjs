import './renderer.js';
import './typing.js';
import './upload.js';
import {AgentAPI,APIError,ClientTrace} from './api.mjs';
import {DraftView} from './stream.mjs';

const $=id=>document.getElementById(id),api=new AgentAPI(),state={connected:false,sid:'',sessions:[],files:[],selected:[],mode:localStorage.getItem('qingfeng.mode')||'fast',uploading:false,pending:new Map(),generation:0,following:true,drafts:new Map()};
if(!['fast','deep'].includes(state.mode))state.mode='fast';
const validModes=['auto','ordinary','strict'];$('validation').value=validModes.includes(localStorage.getItem('qingfeng.validation'))?localStorage.getItem('qingfeng.validation'):'auto';
let configuration={apiBase:''};
const request=(path,data)=>api.request(path,data),area=$('reading-area');
api.onTransport=row=>{for(const job of state.pending.values())if(job.trace&&((row.trace_id&&row.trace_id===job.request_id)||(row.job_id&&row.job_id===job.id))){job.trace.addTransport(row);break;}};
const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
function notice(text='',error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function follow(force=false){if(force)state.following=true;if(state.following)area.scrollTop=area.scrollHeight;$('jump-latest').hidden=state.following;}
area.addEventListener('scroll',()=>{state.following=area.scrollHeight-area.scrollTop-area.clientHeight<110;$('jump-latest').hidden=state.following;},{passive:true});
$('jump-latest').addEventListener('click',()=>follow(true));
new ResizeObserver(()=>follow()).observe($('conversation'));
function setRail(open){if(innerWidth<=720){document.body.classList.toggle('rail-open',open);$('rail-shade').hidden=!open;}else document.body.classList.toggle('rail-collapsed',!open);$('rail-toggle').setAttribute('aria-expanded',String(open));}
$('rail-toggle').addEventListener('click',()=>setRail(innerWidth<=720?!document.body.classList.contains('rail-open'):document.body.classList.contains('rail-collapsed')));
$('rail-shade').addEventListener('click',()=>setRail(false));window.addEventListener('resize',()=>{if(innerWidth>720){document.body.classList.remove('rail-open');$('rail-shade').hidden=true;}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')setRail(false);if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();newSession();}});
function currentJob(){return state.pending.get(state.sid);}
function refreshControls(){
 const running=!!currentJob(),locked=running||state.uploading||state.loading||state.deleting;
 $('send').disabled=!state.connected||!state.sid||locked||(!$('question').value.trim()&&!state.selected.length);
 $('attach').disabled=!state.connected||!state.sid||locked;$('new-thread').disabled=state.uploading;
 $('validation').disabled=locked;document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode));b.disabled=locked;});
 $('connection').classList.toggle('connected',state.connected);$('connection-label').textContent=state.connected?'已连接青风':'连接青风';
}
function resizeInput(){const input=$('question');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,190)+'px';refreshControls();}
$('question').addEventListener('input',resizeInput);
$('validation').addEventListener('change',()=>localStorage.setItem('qingfeng.validation',$('validation').value));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;localStorage.setItem('qingfeng.mode',state.mode);refreshControls();}));
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{$('question').value=b.dataset.prompt;resizeInput();$('question').focus();}));
$('question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(!$('send').disabled)$('composer').requestSubmit();}});

function renderSessions(){
 const list=$('history');list.replaceChildren();const query=$('history-query').value.toLowerCase();let last='';
 for(const item of state.sessions.filter(r=>(r.title||'新对话').toLowerCase().includes(query))){const date=new Date((item.updated_at||item.created_at||0)*1000),now=new Date(),days=Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate())-new Date(date.getFullYear(),date.getMonth(),date.getDate()))/86400000),group=days===0?'今天':days===1?'昨天':days<7?'最近七天':'更早';if(group!==last){list.append(make('h3',group,'history-group'));last=group;}
  const b=make('button',item.title||'新对话','history-item'+(item.session_id===state.sid?' active':''));b.type='button';b.title=item.title||'新对话';b.disabled=state.uploading;b.addEventListener('click',()=>openSession(item.session_id).catch(e=>notice(e.message,true)));const row=make('div',undefined,'history-row'),remove=make('button','×','history-delete');remove.type='button';remove.title='删除对话';remove.setAttribute('aria-label','删除对话：'+(item.title||'新对话'));remove.disabled=state.deleting||state.uploading||state.loading||item.busy||state.pending.has(item.session_id)||!api.health?.release?.contracts?.history_deletion;remove.addEventListener('click',()=>confirmDelete(item));row.append(b,remove);list.append(row);
 }
 if(!list.children.length)list.append(make('p',state.connected?'还没有对话，从一个问题开始。':'连接后，在这里继续之前的对话。','history-empty'));
}

let deleteCandidate=null;
function confirmDelete(item){$('delete-error').textContent='';deleteCandidate=item;$('delete-title').textContent=item.title||'新对话';$('delete-dialog').showModal();}
$('cancel-delete').addEventListener('click',()=>$('delete-dialog').close());
$('confirm-delete').addEventListener('click',async()=>{
 const item=deleteCandidate;if(!item||state.deleting)return;state.deleting=true;$('confirm-delete').disabled=true;refreshControls();renderSessions();
 try{const result=await request('/chat/delete',{session_id:item.session_id,confirm:true});if(result.status!=='deleted'||!result.server_deleted)throw Error('服务器尚未确认删除完成。');
 globalThis.QFPerformance?.forgetSession(item.session_id);state.drafts.delete(item.session_id);const stored=JSON.parse(sessionStorage.getItem('qingfeng.pending.'+api.base)||'null');if(stored?.sid===item.session_id)sessionStorage.removeItem('qingfeng.pending.'+api.base);
 if(state.sid===item.session_id){state.generation++;state.sid='';state.files=[];state.selected=[];$('question').value='';$('conversation').replaceChildren();$('welcome').hidden=false;localStorage.removeItem('qingfeng.session.'+api.base);renderFiles();}
 const listing=await sessionList();if(!state.sid){const next=listing.sessions[0]?.session_id;if(next)await openSession(next);else await newSession();}
 $('delete-dialog').close();notice('对话已从服务器删除。');
 }catch(error){$('delete-error').textContent='删除尚未确认：'+error.message+' 可以再次确认；不会重新发送模型请求。';}
 finally{state.deleting=false;$('confirm-delete').disabled=false;refreshControls();renderSessions();}
});

$('history-query').addEventListener('input',renderSessions);
async function sessionList(){const result=await request('/chat/sessions',{});state.sessions=result.sessions||[];renderSessions();return result;}
async function newSession(){
 if(!state.connected){showConnection();return;}if(state.uploading)return;
 try{const result=await request('/chat/session',{});await sessionList();await openSession(result.session_id);}catch(error){notice(error.message,true);}
}
$('new-thread').addEventListener('click',newSession);
function addUser(text,attachments=[]){
 $('welcome').hidden=true;const article=make('article',undefined,'turn user');article.append(make('div',text,'user-message'));if(attachments.length)attachCards(article,attachments);$('conversation').append(article);return article;
}
function addAssistant(mode){
 $('welcome').hidden=true;const article=make('article',undefined,'turn assistant'),header=make('div',undefined,'answer-header'),avatar=make('span','青','answer-avatar'),label=make('strong','青风'),badge=make('span',mode==='deep'?'深入':'快速','answer-mode');header.append(avatar,label,badge);
 const body=make('div',undefined,'answer-body'),text=make('div',undefined,'chat-text');body.append(text);article.append(header,body);$('conversation').append(article);return article;
}
function attachCards(article,attachments){const list=make('div',undefined,'attachment-list');for(const file of attachments){const card=make('div',file.name||'文件','message-file'),again=make('button','再次使用');again.type='button';again.addEventListener('click',()=>{if(currentJob()||state.uploading)return;if(!state.selected.includes(file.file_id)&&state.selected.length<4){if(!state.files.some(f=>f.file_id===file.file_id))state.files.push(file);state.selected.push(file.file_id);renderFiles();refreshControls();}});card.append(again);list.append(card);}article.append(list);}
function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function details(parent,title){const d=make('details'),s=make('summary',title);d.append(s);parent.append(d);return d;}
function extras(article,result,sid){
 article.querySelector('.answer-extras')?.remove();const box=make('div',undefined,'answer-extras'),citations=[...(result.knowledge_citations||[]),...(result.file_citations||[])];
 if(citations.length){const list=details(box,'来源与文件'),seen=new Set();for(const source of citations){const url=safeURL(source.url),key=url||source.file_id;if(!key||seen.has(key))continue;seen.add(key);const row=make('div',undefined,'source-reference');row.append(make('span',String(seen.size).padStart(2,'0')));if(url){const link=make('a',source.title||url);link.href=url;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}else row.append(make('p',(source.name||'已读文件')+(source.page?' · 第'+source.page+'页':'')));list.append(row);}}
 if(result.limitations?.length){const d=details(box,'适用范围'),list=make('ul');for(const item of result.limitations.slice(0,15))list.append(make('li',String(item)));d.append(list);}
 for(const chart of (result.file_plots||[]).slice(0,8)){const figure=make('figure',undefined,'evidence-figure'),caption=make('figcaption',chart.title||'文件计算图'),image=make('img');image.alt=chart.title||'文件计算图';figure.append(caption,image);box.append(figure);request('/chat/files',{session_id:sid,file_id:chart.file_id,plot_id:chart.plot_id}).then(p=>{if(p.mime==='image/png'&&typeof p.content_base64==='string')image.src='data:image/png;base64,'+p.content_base64;}).catch(e=>{image.remove();caption.textContent+=' · '+e.message;});}
 article.append(box);return box;
}
function answerFooter(article,result,job){
 article.querySelector('.answer-footer')?.remove();const footer=make('div',undefined,'answer-footer');

 const time=make('span',result.elapsed_seconds!=null?'本轮 '+Number(result.elapsed_seconds).toFixed(1)+' 秒':'','answer-time');footer.append(time);article.append(footer);
}
function presentationProgress(article,job){follow();if(!job?.trace||document.hidden||!article.isConnected||job.trace.marks.first_visible_answer!==undefined)return;const box=article.querySelector('.chat-text');if(box?.innerText?.trim())requestAnimationFrame(()=>{if(article.isConnected&&!document.hidden)job.trace.mark('first_visible_answer');});}
async function showAnswer(article,result,job,animate=true){
 article._draft?.finish();article._clock&&clearInterval(article._clock);article.querySelector('.answer-state')?.remove();article.removeAttribute('aria-busy');
 const answer=String(result.interpretation_unverified||result.answer||result.message||result.reason||'本轮没有形成完整回答。'),box=article.querySelector('.chat-text');
 let presentation;
 if(animate&&globalThis.QFAnswer){const received=article._draft?.visible||'',skipRatio=received&&answer.startsWith(received)?Math.min(1,received.length/Math.max(1,answer.length)):0;presentation=await QFAnswer.present(article,answer,{document:result.answer_document,skipRatio,onProgress:()=>presentationProgress(article,job)});}
 else if(result.answer_document?.version===2&&result.answer_document.raw_answer===answer){await QFAnswer.renderDocument(box,result.answer_document);QFAnswer.tools(article,answer);}else{await QFAnswer.render(box,answer);QFAnswer.tools(article,answer);}
 extras(article,result,job?.sid||state.sid);answerFooter(article,result,job);presentationProgress(article,job);if(job?.trace){job.trace.mark('presentation_complete');const degraded=presentation?.render_state==='degraded'||article.querySelector('[data-diagram-state=failed],.math-fallback,[data-render-degraded=true]');job.trace.mark(degraded?'render_degraded':'render_complete');}
}
function runState(article,job){
 article.setAttribute('aria-busy','true');const status=make('div',undefined,'answer-state'),dot=make('i',undefined,'status-dot'),text=make('span','已收到问题，正在处理');status.append(dot,text);article.querySelector('.answer-header').after(status);article._draft=new DraftView(article.querySelector('.chat-text'),()=>follow(),()=>job.trace?.mark('first_visible_answer'));
 const more=make('details',undefined,'answer-extras'),summary=make('summary','查看执行过程'),list=make('ol',undefined,'run-items');more.append(summary,list);article.append(more);article._runList=list;
 article._clock=setInterval(()=>{if(!article.isConnected){clearInterval(article._clock);return;}text.textContent=(job.stage||'正在处理')+' · '+Math.floor((Date.now()-job.started)/1000)+'秒';},1000);
}
function applyEvents(job,events){
 for(const event of events){if(typeof event.seq==='number'&&event.seq<=job.after)continue;if(typeof event.seq==='number')job.after=event.seq;
  if(event.type==='answer_delta'){if(typeof event.text==='string'&&job.article?.isConnected){job.stage='正在接收回答，内容尚未完成';if(event.text)job.trace?.mark('first_public_delta_received');job.article._draft?.add(event.text);}continue;}
  job.stage=event.title||job.stage;if(job.article?.isConnected){const row=make('li',event.title||'已更新处理状态');job.article._runList?.querySelector('.current')?.classList.remove('current');row.className='current';job.article._runList?.append(row);}
 }
 follow();
}
function savePending(job){sessionStorage.setItem('qingfeng.pending.'+api.base,JSON.stringify({sid:job.sid,id:job.id,started:job.started}));}
async function poll(job){
 if(job.polling||job.done||!state.connected)return;job.polling=true;
 const viewRevision=job.viewRevision||0;
 try{const reply=await request('/chat/poll',{session_id:job.sid,job_id:job.id,after:job.after});if(job.done)return;if(!reply.done&&viewRevision!==(job.viewRevision||0)){job.timer=setTimeout(()=>poll(job),0);return;}applyEvents(job,reply.events||[]);job.failures=0;
  if(reply.done){job.trace?.mark('answer_received');job.trace?.serverTrace(reply.result?.performance_trace||reply.performance_trace);job.done=true;state.pending.delete(job.sid);const stored=JSON.parse(sessionStorage.getItem('qingfeng.pending.'+api.base)||'null');if(stored?.id===job.id)sessionStorage.removeItem('qingfeng.pending.'+api.base);if(job.article?.isConnected)await showAnswer(job.article,reply.result||{},job);if(state.sid===job.sid){$('pending-status').hidden=true;refreshControls();notice();}sessionList().catch(()=>{});}
  else job.timer=setTimeout(()=>poll(job),document.hidden?2500:800);
 }catch(error){job.trace?.mark('read_interrupted');job.failures=(job.failures||0)+1;job.stage='读取连接中断，后台请求未重发';if(state.sid===job.sid){$('pending-status').hidden=false;$('pending-label').textContent='读取中断；原任务和已收到的回答保留。';notice(error.message,true);}if(job.failures<=3)job.timer=setTimeout(()=>poll(job),Math.min(15000,1500*2**job.failures));}
 finally{job.polling=false;}
}
$('resume-read').addEventListener('click',()=>{const job=currentJob();if(job){clearTimeout(job.timer);job.failures=0;poll(job);}});
async function openSession(sid){
 if(state.uploading){notice('文件正在上传，请上传完成后切换对话。');return;}
 const generation=++state.generation;state.loading=true;refreshControls();try{state.drafts.set(state.sid,$('question').value);const history=await request('/chat/history',{session_id:sid});if(generation!==state.generation)return;
 state.sid=sid;localStorage.setItem('qingfeng.session.'+api.base,sid);$('question').value=state.drafts.get(sid)||'';resizeInput();$('conversation').replaceChildren();$('welcome').hidden=!!history.messages?.length;state.selected=[];state.files=[];renderFiles();$('pending-status').hidden=true;
 $('thread-title').textContent=state.sessions.find(s=>s.session_id===sid)?.title||'新的对话';renderSessions();if(innerWidth<=720)setRail(false);
 for(const message of history.messages||[]){if(generation!==state.generation)return;if(message.role==='user'){addUser(message.content,message.attachments||[]);continue;}const article=addAssistant(message.response_mode);await showAnswer(article,{answer:message.content,response_mode:message.response_mode},null,false);
  if(message.job_id){let loaded=false;const load=async()=>{if(loaded||!article.isConnected)return;loaded=true;try{const saved=await request('/chat/poll',{session_id:sid,job_id:message.job_id,after:0});if(saved.result){await showAnswer(article,saved.result,{sid,id:message.job_id},false);}}catch{loaded=false;}};
   const observer=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){observer.disconnect();load();}},{root:area,rootMargin:'150px'});observer.observe(article);}
 }
 if(generation!==state.generation)return;
 try{const result=await request('/chat/files',{session_id:sid});if(generation===state.generation){state.files=result.files||[];renderFiles();}}catch(error){notice(error.message,true);}
 let job=state.pending.get(sid);if(!job){const saved=JSON.parse(sessionStorage.getItem('qingfeng.pending.'+api.base)||'null');const id=history.active_job_id||(saved?.sid===sid?saved.id:null);if(id){job={id,sid,after:0,started:saved?.started||Date.now(),done:false,trace:new ClientTrace(null,id,{origin:'view_resumed',sessionId:sid})};state.pending.set(sid,job);}}
 if(job&&!job.done){if(!job.article?.isConnected){job.article=addAssistant(state.mode);job.after=0;job.viewRevision=(job.viewRevision||0)+1;runState(job.article,job);}clearTimeout(job.timer);poll(job);}
 refreshControls();follow(true);
 }finally{if(generation===state.generation){state.loading=false;refreshControls();renderSessions();}}
}
function renderFiles(){const list=$('file-chips');list.replaceChildren();for(const id of state.selected){const file=state.files.find(f=>f.file_id===id);if(!file)continue;const chip=make('div',undefined,'file-chip'),name=make('span',file.name),remove=make('button','×');remove.type='button';remove.setAttribute('aria-label','移除 '+file.name);remove.disabled=state.uploading||!!currentJob();remove.addEventListener('click',()=>{state.selected=state.selected.filter(f=>f!==id);renderFiles();refreshControls();});chip.append(name,remove);list.append(chip);}for(const file of state.files.filter(f=>f.status==='uploading').slice(-4)){const b=make('button',file.name+' · 未传完 '+Math.round((file.received||0)/file.size*100)+'% · 重选文件续传','file-chip pending');b.type='button';b.addEventListener('click',()=>$('file-input').click());list.append(b);}}
async function upload(files){
 if(!state.connected){showConnection();return;}if(!state.sid){await newSession();if(!state.sid)return;}if(state.uploading||currentJob())return;state.uploading=true;refreshControls();
 try{for(const file of files){if(state.selected.length>=4)throw new APIError('每轮最多添加4个文件。');if(!file.size||file.size>5000000)throw new APIError('每个文件须为1字节至5MB。');const result=await QFUpload.transfer(file,request,{sessionId:state.sid,onProgress:(received,total)=>notice('上传 '+file.name+' · '+Math.round(received/total*100)+'%')});state.files=state.files.filter(f=>f.file_id!==result.file_id);state.files.push(result);if(!state.selected.includes(result.file_id))state.selected.push(result.file_id);renderFiles();}notice();}
 catch(error){notice(error.message+' 上传中断后，可重新选择同一个文件继续。',true);try{state.files=(await request('/chat/files',{session_id:state.sid})).files||[];}catch{}}
 finally{state.uploading=false;$('file-input').value='';renderFiles();refreshControls();}
}
$('attach').addEventListener('click',()=>$('file-input').click());$('file-input').addEventListener('change',event=>upload([...event.target.files]));
$('question').addEventListener('paste',event=>{const files=[...event.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);if(files.length){event.preventDefault();upload(files);}});
$('composer').addEventListener('dragover',event=>{event.preventDefault();document.body.classList.add('drop-active');});$('composer').addEventListener('dragleave',()=>document.body.classList.remove('drop-active'));$('composer').addEventListener('drop',event=>{event.preventDefault();document.body.classList.remove('drop-active');upload([...event.dataTransfer.files]);});
$('composer').addEventListener('submit',async event=>{
 event.preventDefault();if(!state.connected){showConnection();return;}if(!state.sid||currentJob()||state.uploading)return;const question=$('question').value.trim()||(state.selected.length?'请分析上传的文件。':'');if(!question)return;
 const sid=state.sid,selected=[...state.selected],files=selected.map(id=>state.files.find(f=>f.file_id===id)).filter(Boolean),article=addAssistant(state.mode);article.remove();addUser(question,files);$('conversation').append(article);follow(true);const request_id=crypto.randomUUID();const job={sid,id:null,request_id,after:0,started:Date.now(),done:false,article,trace:new ClientTrace(request_id,null,{sessionId:sid})};state.pending.set(sid,job);runState(article,job);refreshControls();notice();
 try{const validation=$('validation').value,supportsValidation=(api.health?.release?.contracts?.presentation||0)>=3;if(!supportsValidation&&validation!=='auto')throw new APIError('当前服务尚未支持核验偏好，请选择“按题意核验”或升级服务。');const accepted=await request('/chat/send',{session_id:sid,message:question,model:'gpt-6-astra',resolution_m:30,request_id,attachment_ids:selected,response_mode:state.mode,...(supportsValidation?{validation_mode:validation}:{})});if(typeof accepted.job_id!=='string')throw new APIError('提交结果尚未确认；请查看历史或服务状态，本问题没有自动重发。');job.id=accepted.job_id;job.trace.bind(job.id);job.trace.mark('accepted');savePending(job);state.drafts.delete(sid);if(state.sid===sid){state.selected=[];$('question').value='';resizeInput();renderFiles();}poll(job);}
 catch(error){job.trace?.mark('submit_unconfirmed');job.done=true;state.pending.delete(sid);article._draft?.finish();clearInterval(article._clock);article.querySelector('.answer-state')?.remove();const box=article.querySelector('.chat-text');box.replaceChildren(make('div','提交尚未确认：'+error.message+' 当前问题保留在输入框中，不会自动重发。','answer-error'));notice(error.message,true);refreshControls();}
});
function certificateHelp(){const base=$('api-address').value.replace(/\/+$/,'');const enabled=configuration.connectionGuide==='self-signed-ip'&&base===configuration.apiBase;$('certificate-help').hidden=!enabled;if(enabled)$('certificate-link').href=base+'/';}
$('api-address').addEventListener('input',certificateHelp);
function showConnection(){
 $('connection-error').textContent='';$('api-address').value=api.base||localStorage.getItem('qingfeng.apiBase')||configuration.apiBase||'';$('access-code').value='';certificateHelp();$('connection-dialog').showModal();setTimeout(()=>$('api-address').value?$('access-code').focus():$('api-address').focus(),0);
}
$('settings').addEventListener('click',showConnection);$('connection').addEventListener('click',showConnection);$('close-connection').addEventListener('click',()=>$('connection-dialog').close());
$('disconnect').addEventListener('click',()=>{for(const job of state.pending.values()){clearTimeout(job.timer);job.article?._draft?.finish();clearInterval(job.article?._clock);}state.pending.clear();globalThis.QFPerformance?.clear();api.disconnect();state.connected=false;state.sid='';state.sessions=[];state.files=[];state.selected=[];state.generation++;$('conversation').replaceChildren();$('welcome').hidden=false;$('pending-status').hidden=true;$('access-code').value='';$('connection-dialog').close();renderSessions();renderFiles();refreshControls();notice('连接已断开，后台任务不会因此重发。');});
$('connection-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('connect-submit');button.disabled=true;button.textContent='正在连接';$('connection-error').textContent='';
 try{const code=$('access-code').value;const result=await api.connect($('api-address').value,code);$('access-code').value='';state.connected=true;localStorage.setItem('qingfeng.apiBase',api.base);state.sessions=result.sessions||[];$('connection-dialog').close();renderSessions();notice();const saved=localStorage.getItem('qingfeng.session.'+api.base),sid=state.sessions.find(s=>s.session_id===saved)?.session_id||result.current_session_id||state.sessions[0]?.session_id;if(sid)await openSession(sid);else await newSession();refreshControls();}
 catch(error){state.connected=false;api.disconnect();$('connection-error').textContent=error.message;refreshControls();}
 finally{button.disabled=false;button.textContent='连接服务';}
});
try{const response=await fetch(new URL('../site-config.json',import.meta.url),{cache:'no-store'});if(response.ok)configuration=await response.json();}catch{}
refreshControls();renderSessions();setRail(innerWidth>720);
