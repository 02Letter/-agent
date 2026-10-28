/* Opaque, sandboxed layout worker. Receives diagram syntax only; no API credentials. */
'use strict';
function styles(markup,id){
 const root=new DOMParser().parseFromString(markup,'text/html').body;let css='',index=0;
 const safe=value=>!/@import|expression\s*\(|url\s*\(\s*[^#]/i.test(value);
 for(const node of root.querySelectorAll('[style]')){const value=node.getAttribute('style');node.removeAttribute('style');if(!safe(value))continue;const cls=id+'-style-'+(++index);node.classList.add(cls);css+='.'+cls+'{'+value+'}\n';}
 for(const node of root.querySelectorAll('style')){if(safe(node.textContent))css+=node.textContent+'\n';node.remove();}
 return {markup:root.innerHTML,css};
}
window.addEventListener('message',async event=>{
 if(event.source!==parent||!['qingfeng-diagram','qingfeng-styles'].includes(event.data?.type))return;
 const {id,raw,config}=event.data;if(typeof id!=='string'||!/^[a-z0-9-]+$/i.test(id)||typeof raw!=='string'||raw.length>2000000)return;
 try{
  if(event.data.type==='qingfeng-styles'){parent.postMessage({type:'qingfeng-diagram-result',id,...styles(raw,id)},'*');return;}
  if(raw.length>12000)throw Error('图示超出范围');
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/mermaid-12.2.0/dist/mermaid.min.js';script.onload=resolve;script.onerror=()=>reject(Error('图示排版组件暂未加载'));document.head.append(script);});
  mermaid.initialize(config);const result=await mermaid.render(id,raw);parent.postMessage({type:'qingfeng-diagram-result',id,...styles(result.svg,id)},'*');}
 catch(error){parent.postMessage({type:'qingfeng-diagram-result',id,error:String(error.message||'排版失败').slice(0,300)},'*');}
});
