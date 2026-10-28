/* Third-party layout runs in an opaque frame. Only sanitized SVG returns to the strict parent. */
let config={},serial=0;
export function attachStyles(container,css){if(!css||/@import|expression\s*\(|url\s*\(\s*[^#]/i.test(css))return;const style=document.createElement('style');style.setAttribute('nonce',document.querySelector('meta[name=qf-style-nonce]').content);style.textContent=css;container.append(style);}
export function prepareMarkup(raw){return withFrame('qingfeng-styles','qf-markup-'+(++serial),raw,{});}
export const diagramEngine={
 initialize(value){config=value;},
 render(id,raw){return withFrame('qingfeng-diagram',id,raw,config);}
};
function withFrame(type,id,raw,settings){return new Promise((resolve,reject)=>{
  const frame=document.createElement('iframe');frame.className='diagram-engine';frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.title='图示排版';
  const finish=(value,error)=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();error?reject(error):resolve(value);};
  const receive=event=>{if(event.source!==frame.contentWindow||event.data?.type!=='qingfeng-diagram-result'||event.data.id!==id)return;if(typeof event.data.markup==='string'&&event.data.markup.length<=2000000&&typeof event.data.css==='string'&&event.data.css.length<=1000000)finish({markup:event.data.markup,svg:event.data.markup,css:event.data.css});else finish(null,Error(event.data.error||'图示内容为空'));};
  const timer=setTimeout(()=>finish(null,Error('图示排版超时')),16000);window.addEventListener('message',receive);frame.addEventListener('load',()=>frame.contentWindow.postMessage({type,id,raw,config:settings},'*'),{once:true});frame.src=new URL('./diagram-frame.html',import.meta.url).href;document.body.append(frame);
 });}
