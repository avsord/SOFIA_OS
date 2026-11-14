// 14/11/2026 (Pedro: "as paginas tem se mexido ao digitar em varias paginas"): medir a altura do texto encolhendo o
// campo a 0 por um instante faz o navegador puxar a rolagem (da janela ou de quem rola) a cada tecla. Aqui a medida
// e feita numa copia invisivel do campo; o campo de verdade so muda de altura quando ela muda de fato, nunca encolhe a 0.
const COPY=['boxSizing','fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','textTransform','wordSpacing','textIndent','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopStyle','borderBottomStyle','borderLeftStyle','borderRightStyle','whiteSpace','wordBreak','overflowWrap','tabSize','direction'] as const;
let mirror:HTMLTextAreaElement|null=null;
function getMirror(doc:Document){
 if(mirror&&mirror.ownerDocument===doc&&mirror.isConnected)return mirror;
 const m=doc.createElement('textarea');m.setAttribute('aria-hidden','true');m.tabIndex=-1;m.readOnly=true;
 Object.assign(m.style,{position:'absolute',top:'0',left:'-10000px',visibility:'hidden',pointerEvents:'none',overflow:'hidden',height:'0px',minHeight:'0',maxHeight:'none',resize:'none',zIndex:'-1'});
 doc.body.appendChild(m);mirror=m;return m;
}
/** Altura que o texto do campo precisa (o mesmo que scrollHeight com o campo a 0), medida sem tocar no campo. */
export function measureTextarea(n:HTMLTextAreaElement):number{
 const doc=n.ownerDocument;if(!doc?.body)return n.scrollHeight;
 const cs=getComputedStyle(n),m=getMirror(doc);
 for(const k of COPY)(m.style as any)[k]=(cs as any)[k];
 m.style.width=cs.width;m.value=n.value||'';m.style.height='0px';
 return m.scrollHeight;
}
/** Ajusta a altura do campo ao texto sem mexer na rolagem. Devolve true se a altura mudou. */
export function fitTextarea(n:any,max=Infinity):boolean{
 if(!n?.style||n.tagName!=='TEXTAREA')return false;
 n.style.overflow='hidden';
 if(!n.clientWidth)return false; // escondido: mede quando aparecer
 const want=Math.min(measureTextarea(n),max)+'px';
 if(n.style.height===want)return false;
 n.style.height=want;return true;
}
