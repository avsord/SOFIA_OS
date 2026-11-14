// 14/11/2026: palavra em volta do cursor para a correção no menu da Sofia (web-spell-menu.ts)
export const TRAIL=/[.,;:!?…"“”'()\[\]]+$/;
export const TEXT_INPUT=/^(text|search|email|url|)$/;
export const cleanWord=(raw:string)=>raw.trim().replace(TRAIL,'');
export const isWord=(w:string)=>!!w&&!/\s/.test(w)&&/\p{L}/u.test(w)&&w.length<=60;
/** Limites da palavra em volta da posição p do texto. */
export function wordAt(text:string,p:number):[number,number]{
 const ch=(i:number)=>/[\p{L}\p{N}'-]/u.test(text[i]||'');let a=p,z=p;
 if(!ch(a)&&ch(a-1))a--;while(a>0&&ch(a-1))a--;while(z<text.length&&ch(z))z++;
 return [a,Math.max(a,z)];
}
