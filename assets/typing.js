/* Reveal already rendered, sanitized DOM. Never reparse Markdown per letter. */
(function(root){
'use strict';
const segments=text=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)].map(s=>s.segment):Array.from(text);
function reveal(container,options={}){
 const revision=container._revision,items=[],originals=[],motion=matchMedia('(prefers-reduced-motion: reduce)');let total=0;
 const atomic='.answer-math,.answer-math-inline,.answer-table,.answer-code,.answer-figure,pre,svg,math';
 function visit(n){
  if(n.nodeType===3){const text=n.data;if(!text)return;const chars=segments(text);originals.push([n,text]);n.data='';items.push({kind:'text',node:n,chars,pos:0,cost:chars.length});total+=chars.length;return;}
  if(n.nodeType!==1||n.matches('style,script'))return;
  if(n.matches(atomic)){n.hidden=true;items.push({kind:'atomic',node:n,cost:22});total+=22;return;}
  n.hidden=true;items.push({kind:'open',node:n,cost:0});for(const child of [...n.childNodes])visit(child);
 }
 if(options.immediate||motion.matches||document.hidden)return {finished:Promise.resolve({animated:false}),finish(){},cancel(){}};
 for(const child of [...container.childNodes])visit(child);
 let resolve;const finished=new Promise(r=>resolve=r);let raf=0,index=0,budget=0,last=performance.now(),started=last,done=false,pauseUntil=0,skip=Math.max(0,Number(options.skipRatio)||0)*total;
 const duration=Math.min(4800,Math.max(450,total/150*1000)),rate=total/Math.max(.001,duration/1000),cursor=document.createElement('span');cursor.className='typing-cursor';cursor.setAttribute('aria-hidden','true');
 container.classList.add('is-typing');container.setAttribute('aria-live','off');container.setAttribute('aria-busy','true');
 function restore(){for(const [n,text] of originals)n.data=text;for(const item of items)if(item.kind!=='text')item.node.hidden=false;cursor.remove();}
 function finish(reason='finished'){
  if(done)return;done=true;cancelAnimationFrame(raf);restore();container.classList.remove('is-typing');container.removeAttribute('aria-live');container.setAttribute('aria-busy','false');document.removeEventListener('visibilitychange',visibility);motion.removeEventListener?.('change',reduce);
  options.onProgress?.();resolve({animated:true,reason,elapsed_ms:Math.round(performance.now()-started)});
 }
 function visibility(){if(document.hidden)finish('background');}function reduce(){if(motion.matches)finish('reduced_motion');}
 document.addEventListener('visibilitychange',visibility);motion.addEventListener?.('change',reduce);
 function step(now){
  if(done)return;if(!container.isConnected||container._revision!==revision){finish('detached_or_replaced');return;}
  if(now-started>5500){finish('duration_cap');return;}
  const dt=Math.min(now-last,80);last=now;
  if(now<pauseUntil){raf=requestAnimationFrame(step);return;}
  budget+=dt/1000*rate;
  while(index<items.length){const item=items[index];
   if(item.kind==='open'){item.node.hidden=false;index++;continue;}
   const credit=skip>0?skip:budget;
   if(item.kind==='atomic'){
    if(credit<item.cost)break;
    if(item.node.matches('.answer-math,.answer-math-inline')&&container._mathPending&&skip<=0)break;
    if(skip>0)skip=Math.max(0,skip-item.cost);else budget-=item.cost;
    item.node.hidden=false;item.node.classList.add('answer-block-enter');item.node.after(cursor);index++;continue;
   }
   if(credit<1)break;
   const count=Math.min(item.chars.length-item.pos,Math.max(1,Math.floor(credit))),part=item.chars.slice(item.pos,item.pos+count).join('');item.node.appendData(part);item.pos+=count;
   if(skip>0)skip=Math.max(0,skip-count);else budget-=count;
   item.node.after(cursor);
   if(item.pos>=item.chars.length)index++;
   if(skip<=0&&/[。！？；]$/.test(part)){pauseUntil=now+70;break;}
  }
  options.onProgress?.();if(index>=items.length){finish();return;}raf=requestAnimationFrame(step);
 }
 raf=requestAnimationFrame(step);return {finished,finish:()=>finish('skip'),cancel:()=>finish('cancel')};
}
root.QFTyping=Object.freeze({reveal});
})(globalThis);
