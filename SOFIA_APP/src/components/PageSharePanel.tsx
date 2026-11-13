// 06/11/2026 (Pedro: "compartilhar link da pagina para os usuarios visualizarem o conteudo, tipo Notion mesmo; se compartilhar
// a pagina vai tudo, se for so a subpagina, so a subpagina"): botao "Compartilhar" no topo da pagina (computador) com
// "Publicar na web". Ligado, gera um link secreto so de leitura (a pagina e as subpaginas dela). Desligar corta na hora;
// "Gerar novo link" troca o endereco (o antigo para de funcionar).
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';
import {OverAll} from '../lib/over-all';
import type {SofiaApi} from '../lib/api';
import {errorText} from '../lib/chat-model';
import {sharedPages,useStore} from '../lib/desktop';

/** Paginas publicadas (para o sinal na barra lateral). */
export function refreshSharedPages(api:SofiaApi){void api.sharedPages().then(r=>sharedPages.set(Array.isArray(r?.pages)?r.pages:[])).catch(()=>{});}

const origin=()=>{try{return String((globalThis as any).location?.origin||'');}catch{return '';}};
export function shareUrl(token:string){return origin()+'/p/'+token;}

export function PageShareButton({api,pageId,pageTitle}:{api:SofiaApi;pageId:string;pageTitle:string}){
 const c=useTheme(),[open,setOpen]=useState(false),[anchor,setAnchor]=useState<{x:number;y:number}|null>(null);
 const shared=useStore(sharedPages).includes(pageId);
 return <>
  <Pressable testID="page-share" accessibilityRole="button" accessibilityLabel="Compartilhar página" onPress={(e:any)=>{const r=e?.currentTarget?.getBoundingClientRect?.();setAnchor(r?{x:r.right,y:r.bottom}:{x:0,y:60});setOpen(v=>!v);}}
   style={({hovered}:any)=>({height:30,paddingHorizontal:10,marginRight:4,borderRadius:8,flexDirection:'row',alignItems:'center',gap:6,backgroundColor:hovered||open?c.line:'transparent'})}>
   {shared?<View style={{width:7,height:7,borderRadius:4,backgroundColor:c.accent}}/>:null}
   <Text style={{color:c.text,fontSize:13,fontWeight:'500'}}>Compartilhar</Text>
  </Pressable>
  {open&&anchor?<SharePopover api={api} pageId={pageId} pageTitle={pageTitle} anchor={anchor} onClose={()=>setOpen(false)}/>:null}
 </>;
}

function SharePopover({api,pageId,pageTitle,anchor,onClose}:{api:SofiaApi;pageId:string;pageTitle:string;anchor:{x:number;y:number};onClose:()=>void}){
 const c=useTheme(),[token,setToken]=useState<string|null|undefined>(undefined),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[copied,setCopied]=useState(false),[confirmNew,setConfirmNew]=useState(false);
 const box=useRef<any>(null);
 useEffect(()=>{let live=true;api.pageShare(pageId).then(r=>{if(live)setToken(r?.token||null);}).catch(e=>{if(live){setToken(null);setErr(errorText(e));}});return()=>{live=false;};},[api,pageId]);
 useEffect(()=>{const d=(globalThis as any).document;if(!d)return;const down=(e:any)=>{const n=box.current;if(n&&typeof n.contains==='function'&&n.contains(e.target))return;if(e.target?.closest?.('[data-testid="page-share"]'))return;onClose();};const key=(e:any)=>{if(e.key==='Escape'){e.preventDefault?.();onClose();}};
  d.addEventListener('mousedown',down,true);d.addEventListener('keydown',key);return()=>{d.removeEventListener('mousedown',down,true);d.removeEventListener('keydown',key);};},[onClose]);
 async function change(on:boolean,regenerate=false){setBusy(true);setErr('');setCopied(false);try{const r=await api.setPageShare(pageId,{on,regenerate});setToken(r?.token||null);refreshSharedPages(api);setConfirmNew(false);}catch(e){setErr(errorText(e));}finally{setBusy(false);}}
 const url=token?shareUrl(token):'',vw=typeof window!=='undefined'?window.innerWidth:1200,W=380,left=Math.max(8,Math.min(anchor.x-W,vw-W-8));
 const copy=()=>{try{void (navigator as any).clipboard?.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{}};
 const on=!!token;
 return <OverAll><View ref={box} testID="page-share-panel" style={{position:'absolute',left,top:anchor.y+6,width:W,padding:14,gap:12,borderRadius:12,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,pointerEvents:'auto',boxShadow:'0 14px 40px rgba(0,0,0,.35)'} as any}>
  <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <View style={{width:32,height:32,borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:on?c.accentSoft:c.input}}><Icon name="link" size={16} color={on?c.accent:c.muted}/></View>
   <View style={{flex:1,minWidth:0}}><Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>Publicar na web</Text><Text numberOfLines={2} style={{color:c.muted,fontSize:12}}>{on?'Qualquer pessoa com o link vê esta página e as subpáginas dela (só leitura).':'Crie um link para outras pessoas verem “'+(pageTitle||'Sem título')+'” e as subpáginas dela.'}</Text></View>
   {token===undefined||busy?<ActivityIndicator size="small" color={c.muted}/>:
    <Pressable testID="page-share-toggle" accessibilityRole="switch" accessibilityState={{checked:on}} accessibilityLabel="Publicar na web" onPress={()=>void change(!on)} style={{width:38,height:22,borderRadius:11,padding:2,backgroundColor:on?c.accent:c.line,justifyContent:'center'}}>
     <View style={{width:18,height:18,borderRadius:9,backgroundColor:'#fff',transform:[{translateX:on?16:0}]}}/></Pressable>}
  </View>
  {on?<>
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
    <View style={{flex:1,minWidth:0,height:32,borderRadius:8,borderWidth:1,borderColor:c.line,backgroundColor:c.input,justifyContent:'center',paddingHorizontal:10}}><Text testID="page-share-url" numberOfLines={1} selectable style={{color:c.text,fontSize:12}}>{url}</Text></View>
    <Pressable testID="page-share-copy" accessibilityRole="button" accessibilityLabel="Copiar link público" onPress={copy} style={({hovered}:any)=>({height:32,paddingHorizontal:12,borderRadius:8,justifyContent:'center',backgroundColor:hovered?c.accent:c.accent+'E6'})}><Text style={{color:c.onAccent,fontSize:13,fontWeight:'600'}}>{copied?'Copiado':'Copiar'}</Text></Pressable>
   </View>
   <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
    <Pressable accessibilityRole="link" accessibilityLabel="Abrir página publicada" onPress={()=>{try{(globalThis as any).open?.(url,'_blank','noopener,noreferrer');}catch{}}} style={({hovered}:any)=>({height:28,paddingHorizontal:8,borderRadius:6,justifyContent:'center',backgroundColor:hovered?c.line:'transparent'})}><Text style={{color:c.text,fontSize:12}}>Abrir ↗</Text></Pressable>
    <View style={{flex:1}}/>
    {confirmNew?<>
     <Text style={{color:c.muted,fontSize:12}}>O link atual para de funcionar.</Text>
     <Pressable accessibilityRole="button" onPress={()=>void change(true,true)} style={({hovered}:any)=>({height:28,paddingHorizontal:8,borderRadius:6,justifyContent:'center',backgroundColor:hovered?c.line:'transparent'})}><Text style={{color:c.danger,fontSize:12,fontWeight:'600'}}>Gerar</Text></Pressable>
    </>:<Pressable accessibilityRole="button" accessibilityLabel="Gerar novo link" onPress={()=>setConfirmNew(true)} style={({hovered}:any)=>({height:28,paddingHorizontal:8,borderRadius:6,justifyContent:'center',backgroundColor:hovered?c.line:'transparent'})}><Text style={{color:c.muted,fontSize:12}}>Gerar novo link</Text></Pressable>}
   </View>
  </>:null}
  {err?<Text style={{color:c.danger,fontSize:12}}>{err}</Text>:null}
 </View></OverAll>;
}
