import type {Entity} from './types';
import {comparePageOrder} from './page-order';

/** 13/11/2026 (Pedro: "Ctrl+Z na barra das Páginas tem que desfazer"): passos da barra lateral (excluir página,
 * mover/arrastar, reordenar, mover nota para outra página) com vários passos para trás e Ctrl+Shift+Z / Ctrl+Y para refazer.
 * O editor da página tem a sua própria pilha (título, ícone, texto); o Ctrl+Z vai para quem mudou por último. */
export type UndoStep={label:string;undo:()=>unknown;redo:()=>unknown;undoText?:string;redoText?:string};

export class UndoStack{
 past:UndoStep[]=[];future:UndoStep[]=[];at=0;editorAt=0;busy=false;
 constructor(private now:()=>number=Date.now,private max=50){}
 push(step:UndoStep){this.past.push(step);if(this.past.length>this.max)this.past.shift();this.future=[];this.at=this.now();}
 /** O editor da página mudou algo: o próximo Ctrl+Z é dele, até a barra fazer outra coisa. */
 markEditor(){this.editorAt=this.now();}
 /** O Ctrl+Z / refazer é da barra lateral? */
 wants(redo:boolean){return !this.busy&&(redo?this.future:this.past).length>0&&this.at>=this.editorAt;}
 async undo():Promise<UndoStep|null>{return this.run(false);}
 async redo():Promise<UndoStep|null>{return this.run(true);}
 private async run(redo:boolean):Promise<UndoStep|null>{
  if(this.busy)return null;const from=redo?this.future:this.past,to=redo?this.past:this.future;const step=from.pop();if(!step)return null;
  this.busy=true;
  try{await (redo?step.redo():step.undo());to.push(step);this.at=this.now();return step;}
  catch(e){from.push(step);throw e;}
  finally{this.busy=false;}
 }
}
export const pageUndo=new UndoStack();

/** Onde a página está hoje, para voltar exatamente para lá: depois da irmã de cima, antes da de baixo, ou dentro da mãe. */
export type PageSpot={parentId:string;kind:'before'|'after'|'inside';anchorId:string};
export function pageSpot(pages:readonly Entity[],id:string):PageSpot|null{
 const me=pages.find(p=>p.id===id);if(!me)return null;const parentId=String(me.data?.parent_id||'');
 const sibs=pages.filter(p=>String(p.data?.parent_id||'')===parentId).sort(comparePageOrder),i=sibs.findIndex(p=>p.id===id);
 if(i>0)return {parentId,kind:'after',anchorId:sibs[i-1].id};
 if(i>=0&&i+1<sibs.length)return {parentId,kind:'before',anchorId:sibs[i+1].id};
 if(parentId)return {parentId,kind:'inside',anchorId:parentId};
 return null;
}
