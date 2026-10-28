export function stableBoundary(text){
 let fence=null,math=false,offset=0,boundary=0;
 for(const line of text.split(/(?<=\n)/)){
  const found=/^\s{0,3}(`{3,}|~{3,})/.exec(line);
  if(found){if(!fence)fence=found[1];else if(found[1][0]===fence[0]&&found[1].length>=fence.length){fence=null;boundary=offset+line.length;}}
  if(!fence){const count=(line.match(/\$\$/g)||[]).length;if(count%2)math=!math;if(!math&&!line.trim())boundary=offset+line.length;}
  offset+=line.length;
 }
 return boundary;
}
export class DraftView{
 constructor(host,onProgress=()=>{},onFirstVisible=()=>{}){this.host=host;this.onProgress=onProgress;this.onFirstVisible=onFirstVisible;this.firstVisible=false;this.received='';this.visible='';this.committed=0;this.frame=0;this.closed=false;this.last=performance.now();this.tail=document.createElement('div');this.tail.className='draft-tail';host.replaceChildren(this.tail);}
 add(text){if(this.closed||typeof text!=='string')return;this.received=(this.received+text).slice(0,24000);if(!this.frame)this.frame=requestAnimationFrame(t=>this.tick(t));}
 tick(now){
  this.frame=0;if(this.closed)return;const remaining=this.received.length-this.visible.length,dt=Math.min(80,Math.max(16,now-this.last));this.last=now;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,count=reduced?remaining:Math.max(1,Math.ceil(dt/1000*Math.min(1100,80+remaining*2)));
  this.visible=this.received.slice(0,Math.min(this.received.length,this.visible.length+count));const boundary=stableBoundary(this.visible);
  if(boundary>this.committed){const block=document.createElement('section');block.className='draft-block';this.tail.before(block);const raw=this.visible.slice(this.committed,boundary);globalThis.QFAnswer.render(block,raw);this.committed=boundary;}
  this.tail.textContent=this.visible.slice(this.committed);if(this.visible.length&&!this.firstVisible){this.firstVisible=true;requestAnimationFrame(()=>{if(!document.hidden&&this.host.isConnected)this.onFirstVisible();});}this.onProgress();if(this.visible.length<this.received.length)this.frame=requestAnimationFrame(t=>this.tick(t));
 }
 finish(){if(this.closed)return;this.closed=true;cancelAnimationFrame(this.frame);}
}
