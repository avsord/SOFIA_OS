import React,{useEffect,useRef,useState} from 'react';
import {PALETTE} from '../lib/palette';
import {Keyboard,LayoutAnimation,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {dateDisplay} from '../lib/date-time';
import {monthCells,localDateKey} from '../lib/dashboard';
import {IconButton,forms} from './UI';
import {Icon} from './Icon';
import {MonthSwipe} from './MonthSwipe';
import {useReveal} from './RevealScroll';
import {parseDateText,parseTimeText,TIME_SLOTS} from '../lib/date-text';

// 0.3.191: o calendario abre DENTRO do formulario, logo abaixo do campo, em vez de uma segunda janela por
// cima (que deixava o formulario de tras cortado, preso no tamanho que tinha com o teclado aberto).
// Teclado aberto? Ele fecha primeiro e so entao o calendario expande. So data: tocar no dia ja escolhe.
// 14/11/2026 (Pedro, desenho aprovado "padrao Notion"): inicio e fim digitaveis (dd/mm/aaaa e 1530 -> 15:30), lista de
// 15 em 15 min ao clicar na hora, calendario compacto com "Hoje", interruptor "Horario final" (desligado = sem fim, so o
// ponto na linha do tempo) e tudo vale na hora, sem "Confirmar". Mesmo seletor em todo o site.
function smooth(){try{LayoutAnimation.configureNext(LayoutAnimation.create(200,LayoutAnimation.Types.easeInEaseOut,LayoutAnimation.Properties.opacity));}catch{/* sem animacao */}}
function afterKeyboard(run:()=>void){
 const visible=typeof (Keyboard as any).isVisible==='function'?(Keyboard as any).isVisible():false;
 if(!visible){run();return;}
 let done=false;const finish=()=>{if(done)return;done=true;sub.remove();clearTimeout(timer);run();};
 const sub=Keyboard.addListener('keyboardDidHide',finish),timer=setTimeout(finish,320);
 Keyboard.dismiss();
}
const pad=(n:number)=>String(n).padStart(2,'0');
const ddmm=(d:Date)=>`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`,hhmm=(d:Date)=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
type Which='start'|'end';

export function DateTimeField({label,value,onChange,dateOnly=false,timeOnly=false,compact=false,allowClear=true,emptyLabel='Selecionar…',end,onEndChange}:{label:string;value:string;onChange:(value:string)=>void;dateOnly?:boolean;timeOnly?:boolean;compact?:boolean;allowClear?:boolean;emptyLabel?:string;end?:string;onEndChange?:(value:string)=>void}){
 const c=useTheme(),[open,setOpen]=useState(false),[month,setMonth]=useState(new Date()),[which,setWhich]=useState<Which>('start'),[slots,setSlots]=useState<Which|null>(null);
 const busy=useRef(false),panel=useRef<View>(null),reveal=useReveal();
 // 0.3.255: ao abrir, a tela rola sozinha ate o calendario caber inteiro
 useEffect(()=>{if(!open||!reveal)return;const t=setTimeout(()=>reveal(panel.current),260);return()=>clearTimeout(t);},[open,reveal]);
 const hasEnd=!!onEndChange&&!dateOnly&&!timeOnly;
 function parse(v=value){const d=timeOnly?new Date():v?new Date(v.length===10?v+'T12:00:00':v):new Date();if(timeOnly){const parts=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(v||'09:00');if(parts)d.setHours(Number(parts[1]),Number(parts[2]),0,0);}return Number.isFinite(d.getTime())?d:new Date();}
 const start=parse(),endD=hasEnd&&end&&Number.isFinite(Date.parse(end))?new Date(end):null;
 function toggle(){
  if(busy.current)return;
  if(open){smooth();setOpen(false);return;}
  const v=parse();setWhich('start');setMonth(new Date(v.getFullYear(),v.getMonth(),1));
  busy.current=true;afterKeyboard(()=>{busy.current=false;smooth();setOpen(true);});
 }
 const emit=(d:Date)=>timeOnly?hhmm(d):dateOnly?localDateKey(d):d.toISOString();
 function commit(next:Date){onChange(emit(next));smooth();setOpen(false);}
 // tudo vale na hora; mudar o inicio leva o fim junto (mesma duracao), como no Notion
 function set(w:Which,d:Date){d.setSeconds(0,0);
  if(w==='end'){onEndChange?.(d.toISOString());return;}
  onChange(emit(d));if(endD)onEndChange?.(new Date(endD.getTime()+(d.getTime()-start.getTime())).toISOString());}
 const valOf=(w:Which)=>w==='end'&&endD?endD:start;
 const pickDay=(day:Date)=>{const base=valOf(which),next=new Date(day);next.setHours(base.getHours(),base.getMinutes(),0,0);if(dateOnly)commit(next);else set(which,next);};
 const long=(d:Date)=>d.toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'});
 const shown=value?(timeOnly?value:compact&&!dateOnly?long(start):dateDisplay(value,dateOnly))+(endD?' → '+(localDateKey(endD)===localDateKey(start)?hhmm(endD):long(endD)):''):emptyLabel;
 const box={borderRadius:6,borderWidth:1,paddingHorizontal:8,height:32,color:c.text,fontSize:13,backgroundColor:c.surface,outlineStyle:'none'} as any;
 const row=(w:Which)=>{const d=valOf(w),on=which===w;
  return <View key={w}><View style={{flexDirection:'row',gap:6}}>
   {!timeOnly?<TextInput key={'d'+d.getTime()} defaultValue={ddmm(d)} accessibilityLabel={(w==='end'?'Data final':'Data')+' (dd/mm/aaaa)'} onFocus={()=>{setWhich(w);setMonth(new Date(d.getFullYear(),d.getMonth(),1));}}
    onSubmitEditing={(e:any)=>{const n=parseDateText(e.nativeEvent.text,d);if(n){if(dateOnly)commit(n);else set(w,n);}}}
    onEndEditing={(e:any)=>{const n=parseDateText(e.nativeEvent.text,d);if(n&&n.getTime()!==d.getTime()&&!dateOnly)set(w,n);}}
    style={[box,{flex:1.3,borderColor:on?c.accent:c.line}]}/>:null}
   {!dateOnly?<TextInput key={'t'+d.getTime()} defaultValue={hhmm(d)} accessibilityLabel={w==='end'?'Hora final':'Hora'} onFocus={()=>{setWhich(w);setSlots(w);}} onBlur={()=>setTimeout(()=>setSlots(s=>s===w?null:s),180)}
    onSubmitEditing={(e:any)=>{const n=parseTimeText(e.nativeEvent.text,d);if(n)set(w,n);setSlots(null);}}
    onEndEditing={(e:any)=>{const n=parseTimeText(e.nativeEvent.text,d);if(n&&n.getTime()!==d.getTime())set(w,n);}}
    style={[box,{flex:1,borderColor:on&&timeOnly?c.accent:c.line}]}/>:null}
  </View>
  {slots===w?<ScrollView testID={'time-slots-'+w} keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{maxHeight:168,marginTop:4,borderRadius:8,borderWidth:1,borderColor:c.line,backgroundColor:c.surface}} contentOffset={{x:0,y:Math.max(0,(d.getHours()*4+Math.floor(d.getMinutes()/15))*30-60)}}>
   {TIME_SLOTS.map(t=>{const cur=hhmm(d)===t;return <Pressable key={t} accessibilityLabel={'Horário '+t} onPress={()=>{const n=parseTimeText(t,d);if(n)set(w,n);setSlots(null);}} style={({hovered}:any)=>({height:30,justifyContent:'center',paddingHorizontal:10,backgroundColor:cur?c.accentSoft:hovered?c.input:'transparent'})}><Text style={{color:c.text,fontSize:13}}>{t}</Text></Pressable>;})}
  </ScrollView>:null}</View>;};
 const sw=(on:boolean,text:string,run:()=>void)=><Pressable accessibilityRole="switch" accessibilityState={{checked:on}} accessibilityLabel={text} onPress={run} style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',justifyContent:'space-between',height:32,paddingHorizontal:4,borderRadius:6,backgroundColor:hovered?c.surface:'transparent'})}>
  <Text style={{color:c.text,fontSize:13}}>{text}</Text>
  <View style={{width:28,height:16,borderRadius:8,backgroundColor:on?c.accent:c.line,justifyContent:'center',paddingHorizontal:2}}><View style={{width:12,height:12,borderRadius:6,backgroundColor:PALETTE.white,alignSelf:on?'flex-end':'flex-start'}}/></View></Pressable>;
 const today=new Date(),startDay=new Date(start.getFullYear(),start.getMonth(),start.getDate());
 return <View style={{gap:compact?4:0}}>
  <View style={compact?{flexDirection:'row',gap:20,alignItems:'center'}:undefined}>
   <Text style={compact?{color:c.muted,fontSize:13}:[forms.label,{color:c.muted}]}>{label}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{expanded:open}} onPress={toggle}
    style={compact?{flex:1,minHeight:40,flexDirection:'row',alignItems:'center',gap:8}:[forms.input,{backgroundColor:c.input,borderColor:open?c.accent:c.line,borderWidth:open?1.5:1,minHeight:52,flexDirection:'row',alignItems:'center',gap:10}]}>
    <Text style={{flex:1,color:value?c.text:c.muted,fontSize:14}}>{shown}</Text>
    <Icon name="calendar" size={18} color={open?c.accent:c.muted}/>
   </Pressable>
  </View>
  {open?<View ref={panel} collapsable={false} style={{marginTop:8,backgroundColor:c.input,borderRadius:12,padding:10,borderWidth:1,borderColor:c.line,gap:6}}>
   {row('start')}
   {endD?row('end'):null}
   {!timeOnly?<MonthSwipe onMonth={delta=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+delta,1))}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:2}}>
     <Text style={{color:c.text,fontSize:13,fontWeight:'600',paddingLeft:4}}>{month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,s=>s.toUpperCase())}</Text>
     <View style={{flexDirection:'row',alignItems:'center'}}>
      <IconButton name="back" label="Mês anterior do seletor" onPress={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Ir para hoje" onPress={()=>setMonth(new Date(today.getFullYear(),today.getMonth(),1))} style={{paddingHorizontal:6}}><Text style={{color:c.muted,fontSize:12}}>Hoje</Text></Pressable>
      <IconButton name="chevron" label="Próximo mês do seletor" onPress={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}/>
     </View>
    </View>
    <View style={{flexDirection:'row'}}>{['D','S','T','Q','Q','S','S'].map((d,i)=><Text key={i} style={{width:'14.2857%',textAlign:'center',color:c.muted,fontSize:11}}>{d}</Text>)}</View>
    <View style={{flexDirection:'row',flexWrap:'wrap',marginTop:2}}>{monthCells(month).map((d,i)=>{if(!d)return <View key={i} style={{width:'14.2857%',padding:1}}/>;
     const sel=localDateKey(d)===localDateKey(valOf(which)),inRange=!!endD&&d>=startDay&&d<=endD,isToday=localDateKey(d)===localDateKey(today);
     return <View key={i} style={{width:'14.2857%',padding:1}}><Pressable accessibilityLabel={'Selecionar '+dateDisplay(localDateKey(d),true)} onPress={()=>pickDay(d)}
      style={({hovered}:any)=>({height:28,borderRadius:6,alignItems:'center',justifyContent:'center',backgroundColor:sel?c.accent:inRange?c.accentSoft:hovered?c.surface:'transparent'})}>
      <Text style={{color:sel?PALETTE.white:isToday?c.accent:c.text,fontSize:12,fontWeight:sel||isToday?'700':'400'}}>{d.getDate()}</Text></Pressable></View>;})}</View>
   </MonthSwipe>:null}
   {hasEnd||(allowClear&&value)?<View style={{borderTopWidth:1,borderColor:c.line,paddingTop:4}}>
    {hasEnd?sw(!!endD,'Horário final',()=>{if(endD){onEndChange?.('');setWhich('start');}else{onEndChange?.(new Date(start.getTime()+3600000).toISOString());setWhich('end');}}):null}
    {allowClear&&value?<Pressable accessibilityRole="button" onPress={()=>{onChange('');onEndChange?.('');smooth();setOpen(false);}} style={({hovered}:any)=>({height:32,justifyContent:'center',paddingHorizontal:4,borderRadius:6,backgroundColor:hovered?c.surface:'transparent'})}><Text style={{color:c.muted,fontSize:13}}>Limpar</Text></Pressable>:null}
   </View>:null}
  </View>:null}
 </View>;
}
