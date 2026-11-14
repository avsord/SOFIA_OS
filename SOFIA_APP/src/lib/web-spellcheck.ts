/** 13/11/2026 (Pedro: "o sublinhado vermelho fica no título depois que saio da edição"): a correção do navegador só
 * fica ligada no campo em que o cursor está. Ao sair do campo o sublinhado some (títulos de notas, pastas, páginas,
 * cartões, renomear na barra lateral e o texto das páginas). Um ouvinte só para o site inteiro. */
const editableOf=(t:any):any=>{
 if(!t||typeof t!=='object')return null;
 if(/^(INPUT|TEXTAREA)$/.test(String(t.tagName||'')))return /^(text|search|)$/i.test(String(t.type||'text'))||t.tagName==='TEXTAREA'?t:null;
 if(t.isContentEditable){let el=t;while(el.parentElement&&el.parentElement.isContentEditable)el=el.parentElement;return el;}
 return null;
};
export function spellWhileEditing(t:any,on:boolean){const el=editableOf(t);if(!el)return;
 try{
  // campo que a tela criou SEM correção (código, endereço, senha...) continua sem
  if(el.__sofiaSpell===undefined)el.__sofiaSpell=!(typeof el.getAttribute==='function'&&el.getAttribute('spellcheck')==='false');
  if(on&&!el.__sofiaSpell)return;
  if(el.spellcheck!==on)el.spellcheck=on;
 }catch{/* campo saiu da tela */}}
export function installSpellcheckFocus(doc:any=typeof document!=='undefined'?document:undefined):()=>void{
 if(!doc||typeof doc.addEventListener!=='function')return()=>{};
 const inn=(e:any)=>spellWhileEditing(e.target,true),out=(e:any)=>spellWhileEditing(e.target,false);
 doc.addEventListener('focusin',inn,true);doc.addEventListener('focusout',out,true);
 // campos que já nasceram com a correção ligada e ainda não ganharam foco
 const SEL='textarea,input[type="text"],input:not([type]),[contenteditable="true"]';
 const quiet=(root:any)=>{try{if(root?.matches?.(SEL)&&root!==doc.activeElement)spellWhileEditing(root,false);for(const el of Array.from(root?.querySelectorAll?.(SEL)||[]) as any[])if(el!==doc.activeElement)spellWhileEditing(el,false);}catch{/* sem DOM */}};
 quiet(doc);
 // 13/11/2026 (Mimic Kaizen: corretor ligado em 2 titulos fora da edicao): campos que aparecem DEPOIS (abrir uma pagina,
 // uma nota, um cartao) nasciam com a correcao ligada ate ganhar e perder o foco. Agora ja nascem sem.
 let mo:any=null;const MO=(globalThis as any).MutationObserver;
 if(MO&&doc.body){mo=new MO((list:any[])=>{for(const m of list)for(const n of Array.from(m.addedNodes||[]) as any[])if(n&&n.nodeType===1)quiet(n);});try{mo.observe(doc.body,{childList:true,subtree:true});}catch{mo=null;}}
 return()=>{doc.removeEventListener('focusin',inn,true);doc.removeEventListener('focusout',out,true);try{mo?.disconnect();}catch{/* ja saiu */}};
}
