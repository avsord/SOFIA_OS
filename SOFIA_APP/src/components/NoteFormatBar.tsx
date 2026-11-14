// 13/11/2026 22h (Pedro: "editor de texto no texto das notas"): barra que aparece ao selecionar um trecho da nota no site,
// no mesmo jeito da barra das Paginas: tipo da linha, negrito, italico, sublinhado, tachado, codigo, cor, marca-texto e limpar.
// So no site (o celular tem a barra de cima do teclado).
import React,{useRef,useState} from 'react';
import {Platform,Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {OverAll} from '../lib/over-all';

const NOTE_TYPES:[string,string][]=[['text','Texto'],['heading1','T1'],['heading2','T2'],['heading3','T3'],['bullet','•'],['number','1.'],['todo','☐'],['quote','❝']];
const NOTE_COLORS:[string,string][]=[['Padrão',''],['Vermelho','#E03E3E'],['Laranja','#E5873A'],['Amarelo','#DFAB01'],['Verde','#0F7B6C'],['Azul','#2E7CD6'],['Roxo','#9065B0'],['Cinza','#9B9A97']];
const NOTE_MARKS:[string,string][]=[['Amarelo','rgba(250,204,21,.38)'],['Azul','rgba(96,165,250,.38)'],['Rosa','rgba(244,114,182,.38)'],['Laranja','rgba(251,146,60,.38)']];
const RESET_INK='#010203';

export function NoteFormatBar({rootRef,activeType,onType}:{rootRef:React.RefObject<any>;activeType:string;onType:(type:string)=>void}){
 const c=useTheme(),[pos,setPos]=useState<{x:number;y:number;bottom:number}|null>(null),barRef=useRef<any>(null);
 React.useEffect(()=>{if(Platform.OS!=='web')return;const d:any=(globalThis as any).document;if(!d)return;
  const check=()=>{const sel=d.getSelection(),root=rootRef.current;if(!sel||!sel.rangeCount||sel.isCollapsed||!root?.contains?.(sel.anchorNode)){setPos(null);return;}
   const n:any=sel.anchorNode?.nodeType===1?sel.anchorNode:sel.anchorNode?.parentElement;if(!n?.closest?.('[data-rich-block]')){setPos(null);return;}
   const r=sel.getRangeAt(0).getBoundingClientRect();if(!r||(!r.width&&!r.height)){setPos(null);return;}setPos({x:r.left+r.width/2,y:r.top,bottom:r.bottom});};
  d.addEventListener('selectionchange',check);return()=>d.removeEventListener('selectionchange',check);},[rootRef]);
 // fica no fim da pagina (OverAll): dentro do painel lateral animado o "fixo" ficava preso a ele e a barra saia cortada
 // clicar na barra nao tira a selecao do texto
 React.useEffect(()=>{const n=barRef.current;if(!n?.addEventListener)return;const keep=(e:any)=>e.preventDefault();n.addEventListener('mousedown',keep);return()=>n.removeEventListener('mousedown',keep);});
 if(!pos||Platform.OS!=='web')return null;
 const d:any=(globalThis as any).document,vw=(globalThis as any).innerWidth||1200,W=372,left=Math.max(12,Math.min(pos.x-W/2,vw-W-12)),above=pos.y>150;
 const rootOfSel=()=>{const s=d.getSelection(),n:any=s?.anchorNode?.nodeType===1?s.anchorNode:s?.anchorNode?.parentElement;return n?.closest?.('[data-rich-block]') as HTMLElement|null;};
 const clean=(root:HTMLElement,fix:(el:any)=>void)=>{root.querySelectorAll('[style]').forEach((el:any)=>{fix(el);if(!el.getAttribute('style'))el.removeAttribute('style');});root.dispatchEvent(new Event('input',{bubbles:true}));};
 const run=(cmd:string,value?:string)=>{const root=rootOfSel();if(!root)return;
  if(cmd==='foreColor'||cmd==='hiliteColor'){d.execCommand('styleWithCSS',false,true);d.execCommand(cmd,false,value);d.execCommand('styleWithCSS',false,false);
   if(value===RESET_INK)clean(root,el=>{if(/rgb\(1, 2, 3\)|#010203/i.test(el.style.color))el.style.color='';});}
  else if(cmd==='code'){const t=d.getSelection()?.toString()||'';if(t)d.execCommand('insertHTML',false,'<code>'+t.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</code>');}
  else if(cmd==='clear'){d.execCommand('removeFormat');clean(root,el=>{el.style.color='';el.style.backgroundColor='';});}
  else d.execCommand(cmd,false,value);};
 const btn=(label:string,onPress:()=>void,child:React.ReactNode,on=false)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({hovered}:any)=>({minWidth:28,height:28,paddingHorizontal:5,borderRadius:6,alignItems:'center',justifyContent:'center',backgroundColor:on?c.accentSoft:hovered?c.input:'transparent'})}>{child}</Pressable>;
 const dot=(label:string,color:string,bg:string,onPress:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({hovered}:any)=>({width:22,height:22,borderRadius:5,borderWidth:1,borderColor:hovered?c.text:c.line,backgroundColor:bg||'transparent',alignItems:'center',justifyContent:'center'})}><Text style={{color:color||c.text,fontSize:11,fontWeight:'700'}}>A</Text></Pressable>;
 return <OverAll><View ref={barRef} testID="note-format-bar" style={{position:'fixed' as any,pointerEvents:'auto',left,...(above?{bottom:((globalThis as any).innerHeight||800)-pos.y+8}:{top:pos.bottom+8}),width:W,zIndex:9600,borderRadius:12,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,padding:6,gap:5,boxShadow:'0 10px 30px rgba(0,0,0,.35)'} as any}>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:2}}>{NOTE_TYPES.map(([t,l])=>btn('Transformar em '+l,()=>onType(t),<Text style={{color:c.text,fontSize:12,fontWeight:t.startsWith('heading')?'700':'500'}}>{l}</Text>,activeType===t))}</View>
  <View style={{height:1,backgroundColor:c.line}}/>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:2,alignItems:'center'}}>
   {btn('Negrito (Ctrl+B)',()=>run('bold'),<Text style={{color:c.text,fontSize:14,fontWeight:'700'}}>B</Text>)}
   {btn('Itálico (Ctrl+I)',()=>run('italic'),<Text style={{color:c.text,fontSize:14,fontStyle:'italic'}}>I</Text>)}
   {btn('Sublinhado (Ctrl+U)',()=>run('underline'),<Text style={{color:c.text,fontSize:14,textDecorationLine:'underline'}}>U</Text>)}
   {btn('Tachado (Ctrl+Shift+S)',()=>run('strikeThrough'),<Text style={{color:c.text,fontSize:14,textDecorationLine:'line-through'}}>S</Text>)}
   {btn('Código (Ctrl+E)',()=>run('code'),<Text style={{color:c.text,fontSize:12}}>{'</>'}</Text>)}
   {btn('Limpar formatação',()=>run('clear'),<Text style={{color:c.text,fontSize:12}}>T<Text style={{fontSize:10}}>x</Text></Text>)}
  </View>
  <View testID="note-color-row" style={{flexDirection:'row',alignItems:'center',gap:4,flexWrap:'wrap'}}><Text style={{color:c.muted,fontSize:11,width:48}}>Cor</Text>{NOTE_COLORS.map(([n,fg])=>dot('Cor do texto: '+n.toLowerCase(),fg,'',()=>run('foreColor',fg||RESET_INK)))}</View>
  <View testID="note-highlight-row" style={{flexDirection:'row',alignItems:'center',gap:4,flexWrap:'wrap'}}><Text style={{color:c.muted,fontSize:11,width:48}}>Marcar</Text>{NOTE_MARKS.map(([n,bg])=>dot('Marcar: '+n.toLowerCase(),'',bg,()=>run('hiliteColor',bg)))}{dot('Tirar marca','','',()=>run('hiliteColor','transparent'))}</View>
 </View></OverAll>;
}
