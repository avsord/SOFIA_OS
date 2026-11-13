/** 13/11/2026 (Pedro: "o ESC tem que voltar um nível sempre, em todo o site"): um único lugar decide o que o Esc faz.
 * Ordem: 1) quem já tratou o Esc (menu, janela, editor que chamou preventDefault) vence; 2) janela (Modal) aberta fecha
 * sozinha; 3) cursor num campo de texto: o primeiro Esc só sai do campo; 4) o nível mais alto registrado volta um passo
 * (nota aberta -> pasta -> raiz das notas -> página mãe -> tela anterior).
 *
 * Uso: `const off=pushEsc(()=>{fechar();},ESC_LEVEL.panel)` ao abrir e `off()` ao fechar/desmontar.
 * O handler devolve `false` quando não tem nada para voltar naquele momento (o Esc passa para o nível de baixo).
 * Nível maior responde primeiro; no mesmo nível, o registrado por último. */
export type EscHandler=()=>boolean|void;
export const ESC_LEVEL={route:0,page:10,section:20,item:30,panel:50,menu:80,modal:100} as const;

type Entry={fn:EscHandler;level:number;seq:number};
let entries:Entry[]=[],seq=0;

export function pushEsc(fn:EscHandler,level:number=ESC_LEVEL.panel):()=>void{
 const entry:Entry={fn,level,seq:++seq};entries.push(entry);
 return()=>{entries=entries.filter(e=>e!==entry);};
}

/** Roda os níveis do mais alto ao mais baixo até um tratar o Esc. Devolve true se algum tratou. */
export function runEsc():boolean{
 const order=[...entries].sort((a,b)=>b.level-a.level||b.seq-a.seq);
 for(const e of order){if(!entries.includes(e))continue;let r:boolean|void;try{r=e.fn();}catch{r=false;}if(r!==false)return true;}
 return false;
}

export function escDepth(){return entries.length;}
/** Só para testes. */
export function resetEsc(){entries=[];seq=0;}

const isTextField=(t:any)=>!!t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(String(t.tagName||''))||!!t.isContentEditable);

type Win={addEventListener:(t:string,f:(e:any)=>void,o?:any)=>void;removeEventListener:(t:string,f:(e:any)=>void,o?:any)=>void;setTimeout:(f:()=>void,ms:number)=>any;document?:any};

/** Instala o Esc central (só no navegador). A decisão sai depois de todos os outros ouvintes do mesmo Esc. */
export function installEscStack(win:Win|undefined=typeof window!=='undefined'?(window as any):undefined):()=>void{
 if(!win||typeof win.addEventListener!=='function')return()=>{};
 const doc=win.document;
 const onKey=(e:any)=>{
  if(e.key!=='Escape'||e.repeat||e.isComposing)return;
  const target=e.target;
  win.setTimeout(()=>{
   if(e.defaultPrevented)return; // um menu/editor/janela já tratou este Esc
   try{if(doc?.querySelector?.('[role="dialog"][aria-modal="true"]'))return;}catch{/* sem DOM */} // a janela fecha no keyup
   if(isTextField(target)){try{target.blur?.();}catch{/* já saiu */}return;} // o primeiro Esc só sai do campo
   runEsc();
  },0);
 };
 win.addEventListener('keydown',onKey);
 return()=>win.removeEventListener('keydown',onKey);
}
