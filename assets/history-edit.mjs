// Only confirmed server erasure changes the visible history.
export class HistoryEditor{
 constructor({request,canEdit,setBusy,onChanged,onNotice}){
  Object.assign(this,{request,canEdit,setBusy,onChanged,onNotice});this.buttons=[];this.candidate=null;
  this.dialog=document.getElementById('trim-dialog');this.scope=document.getElementById('trim-scope');this.confirm=document.getElementById('confirm-trim');this.error=document.getElementById('trim-error');
  document.getElementById('cancel-trim').addEventListener('click',()=>this.dialog.close());
  this.dialog.addEventListener('cancel',event=>{if(this.busy)event.preventDefault();});
  this.confirm.addEventListener('click',()=>this.submit());
 }
 bind(history,sid,root){
  root.querySelectorAll('.turn-controls').forEach(node=>node.remove());this.buttons=[];
  if(!history.history_revision||!Array.isArray(history.turns))return;
  const articles=[...root.querySelectorAll('article.turn.user')];
  history.turns.forEach((turn,index)=>{
   const article=articles[index];if(!article)return;
   const controls=document.createElement('div');controls.className='turn-controls';const button=document.createElement('button');button.type='button';button.className='turn-delete';button.dataset.trim='';button.textContent='删除这一轮';button.title='删除这一轮，或从这里删除后续内容';
   const preview=String(history.messages[turn.start]?.content||'这轮对话').slice(0,120);button.setAttribute('aria-label','删除这一轮：'+preview);
   button.addEventListener('click',()=>{if(!this.canEdit())return;this.candidate={sid,start:turn.start,revision:history.history_revision,operation:crypto.randomUUID().replaceAll('-',''),following:history.turns.length-index};
    document.getElementById('trim-preview').textContent=preview;this.scope.replaceChildren();for(const [value,text] of [['turn','仅删除这一轮提问和回答'],['following',`删除这一轮及之后的 ${this.candidate.following} 轮对话`]]){const option=document.createElement('option');option.value=value;option.textContent=text;this.scope.append(option);}this.scope.disabled=false;this.error.textContent='';this.dialog.showModal();
   });controls.append(button);article.append(controls);this.buttons.push(button);
  });this.refresh();
 }
 refresh(){for(const button of this.buttons)button.disabled=!this.canEdit();}
 async submit(){
  const target=this.candidate;if(!target||this.busy)return;
  target.payload??={session_id:target.sid,history_revision:target.revision,start:target.start,scope:this.scope.value,operation_id:target.operation,confirm:true};
  this.busy=true;this.setBusy(true);this.confirm.disabled=true;this.scope.disabled=true;document.getElementById('cancel-trim').disabled=true;let confirmed=false;
  try{
   const result=await this.request('/chat/trim',target.payload);
   if(result.status!=='trimmed'||!result.server_deleted)throw Error('服务器尚未确认删除完成。');
   confirmed=true;this.dialog.close();this.setBusy(false);await this.onChanged(target.sid);
   this.onNotice(`已从服务器删除 ${result.turns_deleted} 轮对话，其余消息已保留。`);
  }catch(error){if(confirmed)this.onNotice('服务器已删除完成，请重新打开对话更新显示。',true);else this.error.textContent='删除尚未确认：'+error.message+' 可再次确认同一操作；不会重新发送问题。';}
  finally{this.busy=false;this.setBusy(false);this.confirm.disabled=false;document.getElementById('cancel-trim').disabled=false;this.refresh();}
 }
}
