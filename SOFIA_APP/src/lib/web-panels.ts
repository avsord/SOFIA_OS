import {useEffect,useRef} from 'react';
/** 0.3.268 (site): o "voltar" do navegador fecha o painel/janela aberto (Price Tracker, e-mail, editores...) com a
 * mesma animacao da abertura, em vez de trocar de tela por baixo dele. Cada painel aberto ganha um passo no
 * historico (mesmo endereco); fechar pelo X, Esc ou clicando fora devolve esse passo. No celular nao faz nada. */
type Entry={id:number;close:()=>void};
const stack:Entry[]=[];let seq=0,ignore=0;
const web=()=>typeof window!=='undefined'&&typeof document!=='undefined'&&!!window.history&&typeof window.addEventListener==='function';
if(web()){
 window.addEventListener('popstate',e=>{
  if(ignore>0){ignore--;e.stopImmediatePropagation();return;}
  const top=stack[stack.length-1];
  if(!top)return;
  // o passo do painel saiu do historico: fecha so o painel, a tela por baixo continua igual
  stack.pop();e.stopImmediatePropagation();
  try{top.close();}catch{/* painel ja desmontado */}
 });
}
export function useWebBackClose(visible:boolean,onClose:(()=>void)|undefined){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!visible||!web()||!close.current)return;
  const entry:Entry={id:++seq,close:()=>close.current?.()};
  try{window.history.pushState({...(window.history.state||{}),sofiaPanel:entry.id},'',window.location.pathname+window.location.search);}catch{return;}
  stack.push(entry);
  return()=>{
   const i=stack.indexOf(entry);
   if(i<0)return; // ja saiu pelo voltar do navegador
   stack.splice(i,1);
   // fechou pelo X/Esc/clique fora: devolve o passo do historico sem mexer na tela
   if(window.history.state?.sofiaPanel===entry.id){ignore++;window.history.back();}
  };
 },[visible]);
}

/** 13/11/2026 (Pedro: "quando apertar voltar, nas anotacoes vai voltando; hoje volta atualizando a pagina"): um passo no
 * historico por NIVEL aberto (pasta, subpasta...). O voltar do navegador sobe um nivel (onBack); subir pela tela devolve
 * os passos sem trocar de pagina. depth 0 = nada aberto. */
export function useWebBackDepth(depth:number,onBack:()=>void){
 const back=useRef(onBack);back.current=onBack;const own=useRef<Entry[]>([]);
 useEffect(()=>{
  if(!web())return;const mine=own.current;
  while(mine.length<depth){
   const entry:Entry={id:++seq,close:()=>{const i=mine.indexOf(entry);if(i>=0)mine.splice(i,1);back.current();}};
   try{window.history.pushState({...(window.history.state||{}),sofiaPanel:entry.id},'',window.location.pathname+window.location.search);}catch{return;}
   mine.push(entry);stack.push(entry);
  }
  drop(depth);
 },[depth]);
 // devolve os passos so se o historico ainda esta no ultimo deles (trocou de pagina pela barra lateral: nao volta)
 function drop(keep:number){const mine=own.current,top=mine[mine.length-1]?.id;let n=0;while(mine.length>keep){const entry=mine.pop()!;const i=stack.indexOf(entry);if(i>=0){stack.splice(i,1);n++;}}
  if(n&&top&&window.history.state?.sofiaPanel===top){ignore++;window.history.go(-n);}}
 // saindo da tela (trocou de pagina): so tira os passos da pilha, sem mexer no historico (a troca de pagina acabou de
 // empilhar o passo dela; voltar agora desfaria a troca)
 useEffect(()=>()=>{const mine=own.current;while(mine.length){const entry=mine.pop()!;const i=stack.indexOf(entry);if(i>=0)stack.splice(i,1);}},[]);
}
