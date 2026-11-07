import React,{useEffect,useRef,useState} from 'react';
import {PALETTE} from '../lib/palette';
import {ShimmerBlock,ShimmerGroup} from './Loading';
import {useTheme} from '../lib/theme';
import {gridColumns,tap} from '../lib/desktop';
import {AccessibilityActionEvent,Animated,Easing,PanResponder,Vibration,View} from 'react-native';

/** 0.3.221: grade de apps como no iPhone - segura o app, ele cresce e segue o dedo; os outros deslizam para abrir
 * espaco; ao soltar, ele assenta no lugar. Toque rapido abre. Rolagem vertical continua normal antes de segurar. */
// 0.3.222: segurar seleciona quase na hora, como no iPhone (antes 320 ms)
const GAP=12,H=148,COLS=2,HOLD=170;
export function AppGrid<T extends {id:string;title:string}>({items,renderCard,onOpen,onReorder,onDragging,onMenu}:{items:T[];renderCard:(item:T,lifted:boolean)=>React.ReactNode;onOpen:(id:string)=>void;onReorder:(ids:string[])=>void;onDragging?:(on:boolean)=>void;onMenu?:(id:string)=>void}){
 // 0.3.250: no celular 2 colunas; no computador quantas couberem (cartoes de ~220 px)
 const [w,setW]=useState(0),cols=w?gridColumns(w):COLS,cellW=w?(w-GAP*(cols-1))/cols:0,key=items.map(i=>i.id).join('|');
 const [ids,setIds]=useState(items.map(i=>i.id)),[active,setActive]=useState<string|null>(null),[pressed,setPressed]=useState<string|null>(null);
 const idsRef=useRef(ids);idsRef.current=ids;
 const geo=useRef({cellW:0,cols:COLS});geo.current.cellW=cellW;geo.current.cols=cols;
 const cb=useRef({onOpen,onReorder,onDragging,onMenu});cb.current={onOpen,onReorder,onDragging,onMenu};
 const drag=useRef<{id:string;startX:number;startY:number;moved:boolean;live:boolean;dragged?:boolean;timer:ReturnType<typeof setTimeout>|null}|null>(null);
 const pos=useRef(new Map<string,Animated.ValueXY>()).current,scale=useRef(new Animated.Value(1)).current,placed=useRef(false);
 // 0.3.223: tudo suave como no iPhone - contorno e sombra aparecem e somem em transicao (antes trocavam de uma vez)
 const lift=useRef(new Animated.Value(0)).current,theme=useTheme();
 const ease=(v:Animated.Value|Animated.ValueXY,toValue:any,duration=220)=>Animated.timing(v as any,{toValue,duration,easing:Easing.bezier(0.25,0.1,0.25,1),useNativeDriver:true});
 const slot=(k:number)=>({x:(k%geo.current.cols)*(geo.current.cellW+GAP),y:Math.floor(k/geo.current.cols)*(H+GAP)});
 const p=(id:string)=>{let v=pos.get(id);if(!v){const k=Math.max(0,idsRef.current.indexOf(id));v=new Animated.ValueXY(slot(k));pos.set(id,v);}return v;};
 useEffect(()=>{if(!drag.current)setIds(items.map(i=>i.id));},[key]);
 useEffect(()=>{if(!w)return;const first=!placed.current;placed.current=true;
  // 0.3.236: so anima enquanto a pessoa arrasta; ordem que chega de fora (ao abrir) aparece direto no lugar
  const live=!!drag.current?.live;
  ids.forEach((id,k)=>{if(live&&drag.current?.id===id)return;const s=slot(k);if(first||!live)p(id).setValue(s);else ease(p(id),s,200).start();});},[ids,w]);
 function end(terminated:boolean){const d=drag.current;drag.current=null;setPressed(null);if(!d)return;if(d.timer)clearTimeout(d.timer);
  if(!d.live){if(!d.moved&&!terminated)cb.current.onOpen(d.id);return;}
  const k=idsRef.current.indexOf(d.id);
  // 0.3.223: soltou - desliza ate o lugar numa animacao curta e suave; contorno e sombra somem no mesmo movimento
  idsRef.current.forEach((id,i)=>{if(id!==d.id)ease(p(id),slot(i),200).start();});
  Animated.parallel([ease(p(d.id),slot(k),240),ease(scale,1,240),ease(lift,0,240)]).start(()=>setActive(a=>a===d.id?null:a));
  cb.current.onDragging?.(false);cb.current.onReorder([...idsRef.current]);
  // 0.3.222: segurou e soltou sem arrastar - abre as opcoes do app (destacar com uma bolinha de cor)
  if(!d.dragged&&!terminated)cb.current.onMenu?.(d.id);}
 const responders=useRef(new Map<string,ReturnType<typeof PanResponder.create>>()).current;
 const responder=(id:string)=>{let r=responders.get(id);if(r)return r;r=PanResponder.create({
  onStartShouldSetPanResponder:()=>true,
  // antes de segurar, a rolagem da tela pode assumir; durante o arrasto, nao
  onShouldBlockNativeResponder:()=>false,onPanResponderTerminationRequest:()=>!drag.current?.live,
  onPanResponderGrant:()=>{const k=idsRef.current.indexOf(id),s=slot(k);const d={id,startX:s.x,startY:s.y,moved:false,live:false,timer:null as ReturnType<typeof setTimeout>|null};setPressed(id);
   d.timer=setTimeout(()=>{if(drag.current!==d)return;d.live=true;setActive(id);setPressed(null);cb.current.onDragging?.(true);try{Vibration.vibrate(12);}catch{/* sem vibracao */}Animated.parallel([ease(scale,1.06,180),ease(lift,1,180)]).start();},HOLD);drag.current=d;},
  onPanResponderMove:(_e,g)=>{const d=drag.current;if(!d||d.id!==id)return;
   if(!d.live){if(Math.abs(g.dx)+Math.abs(g.dy)>10){d.moved=true;if(d.timer)clearTimeout(d.timer);setPressed(null);}return;}
   if(Math.abs(g.dx)+Math.abs(g.dy)>8)d.dragged=true;
   p(id).setValue({x:d.startX+g.dx,y:d.startY+g.dy});
   const cw=geo.current.cellW,cx=d.startX+g.dx+cw/2,cy=d.startY+g.dy+H/2;
   const col=Math.max(0,Math.min(geo.current.cols-1,Math.floor(cx/(cw+GAP)))),row=Math.max(0,Math.floor(cy/(H+GAP)));
   const target=Math.max(0,Math.min(idsRef.current.length-1,row*geo.current.cols+col)),cur=idsRef.current.indexOf(id);
   if(target!==cur){const next=[...idsRef.current];next.splice(cur,1);next.splice(target,0,id);idsRef.current=next;setIds(next);}},
  onPanResponderRelease:()=>end(false),onPanResponderTerminate:()=>end(true)});responders.set(id,r);return r;};
 const move=(id:string,delta:number)=>{const cur=idsRef.current.indexOf(id),to=cur+delta;if(cur<0||to<0||to>=idsRef.current.length)return;const next=[...idsRef.current];next.splice(cur,1);next.splice(to,0,id);setIds(next);cb.current.onReorder(next);};
 const rows=Math.ceil(ids.length/cols);
 return <View onLayout={e=>{const width=e.nativeEvent.layout.width;if(width>0)setW(width);}} style={{height:rows?rows*H+(rows-1)*GAP:0}}>
  {!w?<AppGridSkeleton count={ids.length} bare/>:null}
  {w?ids.map(id=>{const item=items.find(i=>i.id===id);if(!item)return null;const lifted=active===id;
   return <Animated.View key={id} {...responder(id).panHandlers} accessible accessibilityRole="button" accessibilityLabel={'Abrir '+item.title+tap('. Segure e arraste para mudar de lugar.')}
    accessibilityActions={[{name:'activate'},{name:'moveBefore',label:'Mover para antes'},{name:'moveAfter',label:'Mover para depois'}]}
    onAccessibilityAction={(e:AccessibilityActionEvent)=>{const n=e.nativeEvent.actionName;if(n==='activate')cb.current.onOpen(id);else if(n==='moveBefore')move(id,-1);else if(n==='moveAfter')move(id,1);}}
    style={{position:'absolute',left:0,top:0,width:cellW,height:H,zIndex:lifted?20:1,opacity:pressed===id?0.85:1,
     transform:[...p(id).getTranslateTransform(),{scale:lifted?scale:1}]}}>
    {lifted?<Animated.View pointerEvents="none" style={{position:'absolute',left:2,right:2,top:6,bottom:-4,borderRadius:24,backgroundColor:PALETTE.black,opacity:lift.interpolate({inputRange:[0,1],outputRange:[0,0.14]}),transform:[{translateY:4}]}}/>:null}
    {renderCard(item,false)}
    {lifted?<Animated.View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0,borderRadius:22,borderWidth:2,borderColor:theme.accent,opacity:lift}}/>:null}
   </Animated.View>;}):null}
 </View>;
}

/** 0.3.221: enquanto a grade mede a tela (ou le a ordem salva), esqueleto com brilho no lugar dos apps - nunca tela vazia. */
export function AppGridSkeleton({count,bare=false}:{count:number;bare?:boolean}){
 // 07/11/2026 (Pedro: esqueleto tem que respeitar a estrutura real): mesmo numero de colunas da grade de verdade
 // (eram sempre 2; no computador a grade tem 4).
 const c=useTheme(),[w,setW]=useState(0),cols=w?gridColumns(w):COLS,rows=Math.ceil(Math.max(1,count)/cols);
 return <ShimmerGroup><View accessibilityRole="progressbar" accessibilityLabel="Carregando apps" onLayout={e=>{const width=e.nativeEvent.layout.width;if(width>0&&width!==w)setW(width);}} style={[bare?{position:'absolute',left:0,right:0,top:0,gap:GAP}:{gap:GAP},{opacity:w?1:0}]}>
  {Array.from({length:rows},(_,r)=><View key={r} style={{flexDirection:'row',gap:GAP}}>
   {Array.from({length:cols},(_,k)=>r*cols+k<count?<View key={k} style={{flex:1,height:H,padding:18,gap:12,borderRadius:22,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
    <ShimmerBlock width={26} height={26} radius={8}/><ShimmerBlock width={'62%'} height={14}/><ShimmerBlock width={'88%'} height={10}/><ShimmerBlock width={'54%'} height={10}/>
   </View>:<View key={k} style={{flex:1}}/>)}
  </View>)}
 </View></ShimmerGroup>;
}
