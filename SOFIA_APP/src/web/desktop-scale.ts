// 0.3.253: escala de computador. O app foi escrito com tamanhos de celular (texto 15-16, titulos 24-38,
// controles de 50, espacos de 20-22, cantos de 22-24). No navegador com tela larga esses numeros viram a
// escala de um produto de computador (texto 13-14, controles 34-40, espacos 8-24, cantos 8-12).
// Funcoes puras: so a camada web (rn-desktop.tsx) usa; o celular nunca passa por aqui.

const r2=(v:number)=>Math.round(v*2)/2;

/** 0.3.278 (site responsivo): fator unico que acompanha o tamanho da tela. Ate 1440 px de largura vale 1 (o
 * desenho de notebook); acima disso tudo cresce na mesma proporcao - texto, espacos, cantos, controles, icones e a
 * largura da coluna - para o site ocupar uma TV/monitor grande como ocupa um notebook (antes ficava "pequeno no
 * meio"). Degraus de 0,05 para nao recalcular a cada pixel; limite em 1,8 (4K continua legivel sem exagero). */
export function fluidFactor(width?:number):number{
 const w=typeof width==='number'?width:(typeof window!=='undefined'?window.innerWidth:1440);
 if(!(w>1440))return 1;
 return Math.min(1.8,Math.round((w/1440)*20)/20);
}
let current=1;
export function uiScale():number{return current;}
export function refreshUiScale(width?:number):boolean{const f=fluidFactor(width);if(f===current)return false;current=f;return true;}
if(typeof window!=='undefined')refreshUiScale();

export function scaleFont(v:number):number{
 if(v<=11)return v;
 if(v<=13)return r2(v-0.5);
 if(v<=17)return r2(v-1.5);        // corpo: 15 -> 13,5 ; 16 -> 14,5 ; 17 -> 15,5
 if(v<=22)return r2(v*0.86);       // subtitulos: 18 -> 15,5 ; 20 -> 17 ; 22 -> 19
 return Math.round(v*0.8);         // titulos: 24 -> 19 ; 29 -> 23 ; 38 -> 30 ; 58 (icone de pagina) -> 46
}
export function scaleLine(v:number):number{return v<=14?v:Math.round(v*0.88);}
export function scaleSpace(v:number):number{
 if(v<=4)return v;
 if(v<=10)return r2(v*0.85);
 return Math.round(v*0.72);        // 12 -> 9 ; 16 -> 12 ; 20 -> 14 ; 22 -> 16 ; 28 -> 20 ; 32 -> 23
}
export function scaleRadius(v:number):number{
 if(v>=40)return v;                // pilulas e circulos (99, 999) continuam
 if(v<=8)return v;
 return Math.max(8,Math.round(v*0.55)); // 12 -> 8 ; 16 -> 9 ; 18 -> 10 ; 22 -> 12 ; 28 -> 15
}
/** Alturas e larguras fixas: so as de controle e icone encolhem. Medidas grandes (cartoes, grades,
 * colunas, larguras maximas) ficam como estao - varias telas fazem conta com elas. */
export function scaleSize(v:number):number{
 if(v<=12||v>96)return v;
 return Math.round(v*0.82);        // 44 -> 36 ; 50 -> 41 ; 56 -> 46 ; 36 -> 30
}

const FONT=new Set(['fontSize']);
const LINE=new Set(['lineHeight']);
const SPACE=new Set(['padding','paddingTop','paddingBottom','paddingLeft','paddingRight','paddingHorizontal','paddingVertical','paddingStart','paddingEnd',
 'margin','marginTop','marginBottom','marginLeft','marginRight','marginHorizontal','marginVertical','marginStart','marginEnd','gap','rowGap','columnGap']);
const RADIUS=new Set(['borderRadius','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius']);
const SIZE=new Set(['width','height','minWidth','minHeight','maxHeight']);
const POS=new Set(['top','bottom','left','right']);
const MAXW=new Set(['maxWidth','minWidth']);

/** Recebe um estilo ja achatado e devolve outro com os numeros na escala de computador. */
export function scaleStyle<T extends Record<string,any>>(style:T|null|undefined):T|null|undefined{
 if(!style||typeof style!=='object')return style;
 let out:Record<string,any>|null=null;
 for(const key in style){
  const v=style[key];
  if(typeof v!=='number'||!Number.isFinite(v)||v===0)continue;
  const neg=v<0,a=Math.abs(v);
  let n=a;
  let grow=true;
  if(FONT.has(key))n=scaleFont(a);
  else if(LINE.has(key))n=scaleLine(a);
  else if(SPACE.has(key))n=scaleSpace(a);
  else if(RADIUS.has(key)){n=scaleRadius(a);grow=a<40;}
  else if(SIZE.has(key)){n=scaleSize(a);grow=a<=96;}
  else if(MAXW.has(key)){n=a;grow=a>=200;}            // larguras maximas (colunas, barra da Sofia, janelas) crescem junto
  else if(POS.has(key)){n=a<=24?scaleSpace(a):a;grow=a<=24;}
  else continue;
  if(grow&&current!==1)n=r2(n*current);
  if(n!==a){if(!out)out={...style};out[key]=neg?-n:n;}
 }
 return (out||style) as T;
}

/** 0.3.278: so o fator da tela, sem a conversao celular->computador (para a moldura do site, que ja foi desenhada
 * em tamanhos de computador: lateral, barra de cima, busca). */
export function fluidStyle<T extends Record<string,any>>(style:T|null|undefined):T|null|undefined{
 if(current===1||!style||typeof style!=='object')return style;
 let out:Record<string,any>|null=null;
 for(const key in style){
  const v=style[key];
  if(typeof v!=='number'||!Number.isFinite(v)||v===0)continue;
  const a=Math.abs(v);
  const grow=FONT.has(key)||LINE.has(key)||SPACE.has(key)||(RADIUS.has(key)&&a<40)||(SIZE.has(key)&&a<=96)||(MAXW.has(key)&&a>=200)||(POS.has(key)&&a<=24);
  if(!grow)continue;
  if(!out)out={...style};out[key]=(v<0?-1:1)*r2(a*current);
 }
 return (out||style) as T;
}
