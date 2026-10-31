import {MOTION_EASE,useReducedMotion} from '../lib/motion';
import {contextMenu} from './ContextMenu';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Animated,FlatList,Pressable,Text,View} from 'react-native';
import type {RefreshControlProps} from 'react-native';
import type {Entity} from '../lib/types';
import {useTheme} from '../lib/theme';
import {Icon} from './Icon';
import {PAGE_INDENT,dropLineY,projectPageDrop} from '../lib/page-order';
import {noteFluencyMovement} from '../lib/fluency';
/**
 * Main page lists own a bounded FlatList viewport: scrolling, not elapsed time,
 * determines which rows exist. Embedded subpage outlines keep the compact
 * document path; no nested vertical VirtualizedList inside its ScrollView.
 */
export const INITIAL_ROWS=16,ROWS_PER_FRAME=15;
import type {PageDrop,PageRect} from '../lib/page-order';

type Props={roots:Entity[];children:Map<string,Entity[]>;expanded:Set<string>;toggle:(id:string)=>void;onOpen:(page:Entity)=>void;
 onMove:(page:Entity,parentId:string,drop?:PageDrop)=>Promise<void>|void;canParent:(pageId:string,parentId:string)=>boolean;onDelete?:(page:Entity)=>void;compact?:boolean;onInteractionChange?:(active:boolean)=>void;onDragChange?:(active:boolean)=>void;
 virtualized?:boolean;header?:React.ReactElement;footer?:React.ReactElement;
 refreshControl?:React.ReactElement<RefreshControlProps>;scrollEnabled?:boolean};
type Visible={page:Entity;depth:number;hasChildren:boolean;open:boolean};
export function PageTreeList({roots,children,expanded,toggle,onOpen,onMove,canParent,onDelete,compact=false,onInteractionChange,onDragChange,virtualized=!compact,header,footer,refreshControl,scrollEnabled=true}:Props){
 const c=useTheme(),host=useRef<View|null>(null),nodes=useRef(new Map<string,View>()),rects=useRef<PageRect[]>([]),origin=useRef({x:0,y:0,width:0});
 const drag=useRef<{page:Entity;startX:number;startY:number;lastX:number;lastY:number;dx:number;dy:number;moved:boolean;drop:PageDrop|null;switchY:number;switchAt:number}|null>(null);
 const reducedMotion=useReducedMotion();
 const [ghost,setGhost]=useState<Visible|null>(null),[drop,setDrop]=useState<PageDrop|null>(null),[context,setContext]=useState<string|null>(null),[geometry,setGeometry]=useState(0),[limit,setLimit]=useState(INITIAL_ROWS);
 const pan=useRef(new Animated.ValueXY()).current;
 useLayoutEffect(()=>{if(!ghost)pan.setValue({x:0,y:0});},[ghost,pan]);
 const all=useMemo(()=>[...new Map([...roots,...[...children.values()].flat()].map(p=>[p.id,p])).values()],[roots,children]);
 const visible=useMemo(()=>{const result:Visible[]=[];const walk=(items:Entity[],depth:number,path:Set<string>)=>{for(const page of items){if(path.has(page.id)||depth>40)continue;const kids=children.get(page.id)||[],open=compact||expanded.has(page.id);result.push({page,depth,hasChildren:!!kids.length,open});if(open)walk(kids,depth+1,new Set([...path,page.id]));}};walk(roots,0,new Set());return result;},[roots,children,expanded,compact]);
 const latest=useRef({all,visible,onMove,onOpen,onDelete,onInteractionChange,onDragChange,canParent});latest.current={all,visible,onMove,onOpen,onDelete,onInteractionChange,onDragChange,canParent};
 // Only mounted cells have native geometry. Nothing sweeps all 600 rows on
 // first paint or when an offscreen row arrives. A drag explicitly requests
 // a bounded snapshot; late callbacks from an ended drag are discarded.
 const rowsById=useMemo(()=>new Map(visible.map(row=>[row.page.id,row])),[visible]);
 const rowsRef=useRef(rowsById);rowsRef.current=rowsById;
 function measure(){
  const owner=drag.current;if(!owner)return;
  const current=[...nodes.current].filter(([id])=>rowsRef.current.has(id));
  const measured=new Map<string,PageRect>();let pending=current.length+1;
  const complete=()=>{if(--pending!==0||drag.current!==owner)return;
   rects.current=[...measured.values()];setGeometry(v=>v+1);
   if(owner.moved)move(owner.lastX,owner.lastY);
  };
  const hostNode=host.current;
  if(hostNode)hostNode.measureInWindow((x,y,width)=>{
   if(drag.current===owner)origin.current={x,y,width};complete();
  });else complete();
  for(const [id,node] of current)node.measureInWindow((x,y,width,height)=>{
   const row=rowsRef.current.get(id);
   if(drag.current===owner&&row&&height>0&&nodes.current.get(id)===node)
    measured.set(id,{...row,x,y,width,height});
   complete();
  });
 }
 function measureOrigin(){if(drag.current)return;host.current?.measureInWindow((x,y,width)=>{if(!drag.current)origin.current={x,y,width};});}
 // This fallback belongs only to compact outlines embedded in the editor.
 useEffect(()=>{if(virtualized||limit>=visible.length)return;const frame=requestAnimationFrame(()=>setLimit(l=>Math.min(visible.length,l+ROWS_PER_FRAME)));return()=>cancelAnimationFrame(frame);},[virtualized,limit,visible.length]);
 useEffect(()=>()=>{drag.current=null;latest.current.onDragChange?.(false);latest.current.onInteractionChange?.(false);},[]);
 function begin(row:Visible,x:number,y:number){
  setContext(null);pan.setValue({x:0,y:0});
  drag.current={page:row.page,startX:x,startY:y,lastX:x,lastY:y,dx:0,dy:0,moved:false,drop:null,switchY:y,switchAt:0};
  rects.current=[];setGhost(row);setDrop(null);latest.current.onDragChange?.(true);measure();
 }
 function move(x:number,y:number){const d=drag.current;if(!d)return;d.dx=x-d.startX;d.dy=y-d.startY;d.lastX=x;d.lastY=y;if(Math.abs(d.dx)+Math.abs(d.dy)>5)d.moved=true;pan.setValue({x:d.dx,y:d.dy});if(!d.moved)return;
  // 0.3.201: antes cada milimetro redesenhava a lista inteira e, na divisa entre "antes" e "depois", o destino
  // trocava sem parar (as linhas pulavam). Agora so muda quando o destino e outro E o dedo andou 8 px desde a
  // ultima troca (ou passaram 90 ms) - suave e sem tremer.
  const next=projectPageDrop(latest.current.all,d.page,rects.current,x,y,d.dx),prev=d.drop;
  const same=!!next&&!!prev&&next.kind===prev.kind&&next.anchorId===prev.anchorId&&next.parentId===prev.parentId&&next.depth===prev.depth;
  if(same||(!next&&!prev))return;
  const now=Date.now();if(prev&&Math.abs(y-d.switchY)<8&&now-d.switchAt<90)return;
  d.drop=next;d.switchY=y;d.switchAt=now;setDrop(next);}
 function end(cancelled=false){const d=drag.current;if(!d)return;drag.current=null;
  // 0.3.268: o deslocamento so volta a zero no mesmo quadro em que a ordem nova aparece (efeito abaixo). Antes a
  // pagina solta voltava ao lugar antigo por um instante antes de pular para o novo.
  const finish=()=>{setGhost(null);setDrop(null);latest.current.onDragChange?.(false);};
  if(cancelled){finish();return;}if(!d.moved){finish();setContext(d.page.id);return;}
  const target=d.drop&&latest.current.canParent(d.page.id,d.drop.parentId)?d.drop:null;
  if(!target){finish();return;}
  const commit=()=>{void latest.current.onMove(d.page,target.parentId,target);finish();};
  const gr=rects.current.find(r=>r.page.id===d.page.id),anchor=rects.current.find(r=>r.page.id===target.anchorId);
  let toY:number|null=null;
  if(gr&&target.kind==='inside'&&anchor)toY=anchor.y-gr.y;
  else if(gr){const raw=dropLineY(target,rects.current);if(raw!=null)toY=(gr.y<raw?raw-gr.height:raw)-gr.y;}
  if(toY==null||reducedMotion){commit();return;}
  Animated.timing(pan,{toValue:{x:target.kind==='inside'?PAGE_INDENT:0,y:toY},duration:140,easing:MOTION_EASE,useNativeDriver:false,isInteraction:false}).start(()=>commit());
 }
 function previewShift(id:string){if(!ghost||!drop||drop.kind==='inside')return 0;const source=visible.findIndex(r=>r.page.id===ghost.page.id),anchor=visible.findIndex(r=>r.page.id===drop.anchorId),row=visible.findIndex(r=>r.page.id===id),target=anchor+(drop.kind==='after'?1:0),height=rects.current.find(r=>r.page.id===ghost.page.id)?.height||46;return source<target&&row>source&&row<target?-height:source>=target&&row>=target&&row<source?height:0;}
 const ghostRect=ghost?rects.current.find(r=>r.page.id===ghost.page.id):null,rawLine=drop?dropLineY(drop,rects.current):null;
 const line=rawLine!=null&&ghostRect&&drop?.kind!=='inside'&&ghostRect.y<rawLine?rawLine-ghostRect.height:rawLine;
 const renderRow=(row:Visible)=>{const p=row.page,target=drop?.kind==='inside'&&drop.anchorId===p.id,isSource=ghost?.page.id===p.id;return <ShiftRow key={p.id} offset={previewShift(p.id)} dragging={!!ghost}>
   <View ref={node=>{if(node)nodes.current.set(p.id,node);else nodes.current.delete(p.id);}} collapsable={false} {...contextMenu(()=>[{label:'Abrir',icon:'book',run:()=>onOpen(p)},...(row.hasChildren?[{label:row.open?'Recolher subpáginas':'Mostrar subpáginas',icon:'list' as const,run:()=>toggle(p.id)}]:[]),...(onDelete?[{label:'Apagar',icon:'trash' as const,danger:true,run:()=>onDelete(p)}]:[])])} style={{flexDirection:'row',alignItems:'center',paddingLeft:row.depth*PAGE_INDENT,borderRadius:9,backgroundColor:target?c.accentSoft:'transparent',borderWidth:1,borderColor:target?c.accent:'transparent',opacity:isSource?0:1}}>
    {!compact?<Pressable disabled={!row.hasChildren} accessibilityLabel={(row.open?'Recolher':'Expandir')+' subpáginas de '+p.title} accessibilityState={{expanded:row.open}} onPress={()=>toggle(p.id)} style={{width:28,height:46,alignItems:'center',justifyContent:'center'}}>{row.hasChildren?<View style={{...({transitionProperty:'transform',transitionDuration:'160ms',transitionTimingFunction:'ease-out'} as any),transform:[{rotate:row.open?'90deg':'0deg'}]}}><Icon name="chevron" size={14} color={c.muted}/></View>:null}</Pressable>:null}
    <PageRow page={p} compact={compact} onTouchStart={()=>latest.current.onInteractionChange?.(true)} onOpen={()=>onOpen(p)} onHold={(x,y)=>begin(row,x,y)} onMove={move} onEnd={()=>end()} onCancel={()=>end(true)}/>
   </View>
   {context===p.id&&onDelete?<View style={{flexDirection:'row',justifyContent:'flex-end',gap:8,padding:6}}><Pressable accessibilityLabel={'Excluir página '+p.title} onPress={()=>{setContext(null);onDelete(p);}} style={{padding:12,borderRadius:9,backgroundColor:c.input}}><Text style={{color:c.danger}}>Excluir “{p.title}”</Text></Pressable><Pressable accessibilityLabel="Fechar ações da página" onPress={()=>setContext(null)} style={{padding:12}}><Text style={{color:c.muted}}>Cancelar</Text></Pressable></View>:null}
  </ShiftRow>;};
 return <View ref={host} collapsable={false} onLayout={measureOrigin} onTouchEnd={e=>{if(e.nativeEvent.touches.length===0)latest.current.onInteractionChange?.(false);}} onTouchCancel={()=>{end(true);latest.current.onInteractionChange?.(false);}} style={{position:'relative',flex:virtualized?1:undefined}}>
  {virtualized?<FlatList
    nativeID="sofia-pages-list" testID="pages-virtual-list"
    data={visible} keyExtractor={row=>row.page.id} renderItem={({item})=>renderRow(item)}
    extraData={{ghost,drop,context,geometry}}
    initialNumToRender={INITIAL_ROWS} maxToRenderPerBatch={8}
    updateCellsBatchingPeriod={50} windowSize={5} removeClippedSubviews={false}
    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
    scrollEnabled={scrollEnabled&&!ghost} onScroll={noteFluencyMovement} scrollEventThrottle={100}
    refreshControl={refreshControl} style={{flex:1}}
    contentContainerStyle={{paddingHorizontal:10,paddingBottom:34}}
    ListHeaderComponent={header?<View style={{marginHorizontal:-10}}>{header}</View>:null}
    ListFooterComponent={footer?<View style={{marginHorizontal:-10}}>{footer}</View>:null}
   />:<>{header}{visible.slice(0,limit).map(renderRow)}{footer}</>}
  {line!=null&&drop?<View pointerEvents="none" accessibilityLabel={'Soltar '+(drop.kind==='before'?'antes':'depois')+' no nível '+drop.depth} style={{position:'absolute',top:line-origin.current.y-1.5,left:drop.depth*PAGE_INDENT+(compact?0:28),right:6,height:3,borderRadius:2,backgroundColor:c.accent,zIndex:99}}/>:null}
  {ghost&&ghostRect?<Animated.View pointerEvents="none" style={{position:'absolute',top:ghostRect.y-origin.current.y,left:ghost.depth*PAGE_INDENT+(compact?0:28),right:4,backgroundColor:c.surface,borderRadius:9,paddingHorizontal:8,elevation:10,zIndex:100,transform:pan.getTranslateTransform()}}><View style={{flexDirection:'row',alignItems:'center',minHeight:compact?40:46,gap:8}}><Text style={{fontSize:24}}>{String(ghost.page.data?.icon||'📄')}</Text><Text numberOfLines={1} style={{flex:1,fontSize:16,fontWeight:'500',color:c.text}}>{ghost.page.title}</Text></View></Animated.View>:null}
 </View>;
}
function PageRow({page,compact,onOpen,onHold,onMove,onEnd,onCancel,onTouchStart}:{page:Entity;compact:boolean;onTouchStart:()=>void;onOpen:()=>void;onHold:(x:number,y:number)=>void;onMove:(x:number,y:number)=>void;onEnd:()=>void;onCancel:()=>void}){
 const c=useTheme(),point=useRef({x:0,y:0}),held=useRef(false),moved=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const latest=useRef({onOpen,onHold,onMove,onEnd,onCancel,onTouchStart});latest.current={onOpen,onHold,onMove,onEnd,onCancel,onTouchStart};
 const stopTimer=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 useEffect(()=>()=>{stopTimer();if(held.current)latest.current.onCancel();},[]);
 return <View style={{flex:1,minHeight:compact?40:46,flexDirection:'row',alignItems:'center',gap:8,paddingRight:10}} accessible accessibilityRole="button" accessibilityLabel={(page.data?.parent_id?'Abrir subpágina ':'Abrir página principal ')+page.title} accessibilityHint="Segure para excluir ou arraste para reorganizar" onAccessibilityTap={()=>latest.current.onOpen()}
  onTouchStart={()=>latest.current.onTouchStart()}
  onStartShouldSetResponder={()=>true}
  onResponderGrant={e=>{latest.current.onTouchStart();stopTimer();point.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};held.current=false;moved.current=false;timer.current=setTimeout(()=>{timer.current=null;held.current=true;latest.current.onHold(point.current.x,point.current.y);},240);}}
  onResponderMove={e=>{const x=e.nativeEvent.pageX,y=e.nativeEvent.pageY;if(Math.abs(x-point.current.x)+Math.abs(y-point.current.y)>7)moved.current=true;if(held.current)latest.current.onMove(x,y);else if(moved.current)stopTimer();}}
  onResponderRelease={e=>{stopTimer();if(held.current){latest.current.onMove(e.nativeEvent.pageX,e.nativeEvent.pageY);latest.current.onEnd();}else if(!moved.current)latest.current.onOpen();held.current=false;}}
  onResponderTerminationRequest={()=>!held.current}
  onResponderTerminate={()=>{stopTimer();if(held.current)latest.current.onCancel();held.current=false;}}>
  <Text style={{fontSize:24,color:c.text,width:30,textAlign:'center'}}>{String(page.data?.icon||'').trim()||'📄'}</Text><Text numberOfLines={1} style={{flex:1,fontSize:16,color:c.text,fontWeight:compact?'500':'600'}}>{page.title}</Text>
 </View>;
}

function ShiftRow({offset,children,dragging}:{offset:number;children:React.ReactNode;dragging:boolean}){const reduced=useReducedMotion(),shift=useRef(new Animated.Value(offset)).current;useLayoutEffect(()=>{if(!dragging){shift.stopAnimation();shift.setValue(0);return;}const animation=Animated.timing(shift,{toValue:offset,duration:reduced?0:160,easing:MOTION_EASE,useNativeDriver:true,isInteraction:false});animation.start();return()=>animation.stop();},[offset,reduced,shift,dragging]);return <Animated.View style={{transform:[{translateY:shift}]}}>{children}</Animated.View>;}
