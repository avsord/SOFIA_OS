import React,{useEffect,useRef,useState} from 'react';
import {PALETTE} from '../lib/palette';
import {Keyboard,LayoutAnimation,Pressable,ScrollView,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {dateDisplay} from '../lib/date-time';
import {monthCells,localDateKey} from '../lib/dashboard';
import {Button,IconButton,forms} from './UI';
import {Icon} from './Icon';
import {MonthSwipe} from './MonthSwipe';
import {useReveal} from './RevealScroll';

// 0.3.191: o calendario abre DENTRO do formulario, logo abaixo do campo, em vez de uma segunda janela por
// cima (que deixava o formulario de tras cortado, preso no tamanho que tinha com o teclado aberto).
// Teclado aberto? Ele fecha primeiro e so entao o calendario expande. So data: tocar no dia ja escolhe.
function smooth(){try{LayoutAnimation.configureNext(LayoutAnimation.create(200,LayoutAnimation.Types.easeInEaseOut,LayoutAnimation.Properties.opacity));}catch{/* sem animacao */}}
function afterKeyboard(run:()=>void){
 const visible=typeof (Keyboard as any).isVisible==='function'?(Keyboard as any).isVisible():false;
 if(!visible){run();return;}
 let done=false;const finish=()=>{if(done)return;done=true;sub.remove();clearTimeout(timer);run();};
 const sub=Keyboard.addListener('keyboardDidHide',finish),timer=setTimeout(finish,320);
 Keyboard.dismiss();
}
const pad=(n:number)=>String(n).padStart(2,'0');

export function DateTimeField({label,value,onChange,dateOnly=false,timeOnly=false,compact=false,allowClear=true,emptyLabel='Selecionar…'}:{label:string;value:string;onChange:(value:string)=>void;dateOnly?:boolean;timeOnly?:boolean;compact?:boolean;allowClear?:boolean;emptyLabel?:string}){
 const c=useTheme(),[open,setOpen]=useState(false),[selected,setSelected]=useState(new Date()),[month,setMonth]=useState(new Date());
 const busy=useRef(false),panel=useRef<View>(null),reveal=useReveal();
 // 0.3.255: ao abrir, a tela rola sozinha ate o calendario caber inteiro
 useEffect(()=>{if(!open||!reveal)return;const t=setTimeout(()=>reveal(panel.current),260);return()=>clearTimeout(t);},[open,reveal]);
 function parse(){const d=timeOnly?new Date():value?new Date(value.length===10?value+'T12:00:00':value):new Date();if(timeOnly){const parts=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(value||'09:00');if(parts)d.setHours(Number(parts[1]),Number(parts[2]),0,0);}return Number.isFinite(d.getTime())?d:new Date();}
 function toggle(){
  if(busy.current)return;
  if(open){smooth();setOpen(false);return;}
  const v=parse();setSelected(v);setMonth(new Date(v.getFullYear(),v.getMonth(),1));
  busy.current=true;afterKeyboard(()=>{busy.current=false;smooth();setOpen(true);});
 }
 function commit(next:Date){onChange(timeOnly?pad(next.getHours())+':'+pad(next.getMinutes()):dateOnly?localDateKey(next):next.toISOString());smooth();setOpen(false);}
 // 06/11/2026 (Pedro: "alterei a data da tarefa e a tarefa nao se moveu"): no editor pequeno (compact) o dia/hora escolhido ja
 // vale na hora; antes so valia depois de "Confirmar" e o Salvar gravava a data antiga
 const pick=(d:Date)=>{setSelected(d);if(compact&&!dateOnly)onChange(timeOnly?pad(d.getHours())+':'+pad(d.getMinutes()):d.toISOString());};
 const change=(part:'hours'|'minutes',n:number)=>{const d=new Date(selected);part==='hours'?d.setHours(n):d.setMinutes(n);d.setSeconds(0,0);pick(d);};
 const shown=value&&compact?new Date(value).toLocaleString('pt-BR',{dateStyle:'long',timeStyle:'short'}):(timeOnly?value:dateDisplay(value,dateOnly))||emptyLabel;
 return <View style={{gap:compact?4:0}}>
  <View style={compact?{flexDirection:'row',gap:20,alignItems:'center'}:undefined}>
   <Text style={compact?{color:c.muted,fontSize:13}:[forms.label,{color:c.muted}]}>{label}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{expanded:open}} onPress={toggle}
    style={compact?{flex:1,minHeight:40,flexDirection:'row',alignItems:'center',gap:8}:[forms.input,{backgroundColor:c.input,borderColor:open?c.accent:c.line,borderWidth:open?1.5:1,minHeight:52,flexDirection:'row',alignItems:'center',gap:10}]}>
    <Text style={{flex:1,color:value?c.text:c.muted,fontSize:14}}>{shown}</Text>
    <Icon name="calendar" size={18} color={open?c.accent:c.muted}/>
   </Pressable>
  </View>
  {open?<View ref={panel} collapsable={false} style={{marginTop:8,backgroundColor:c.input,borderRadius:16,padding:12,borderWidth:1,borderColor:c.line}}>
   {!timeOnly?<MonthSwipe onMonth={delta=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+delta,1))}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
     <IconButton name="back" label="Mês anterior do seletor" onPress={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}/>
     <Text style={{color:c.text,fontSize:16,fontWeight:'500'}}>{month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</Text>
     <IconButton name="chevron" label="Próximo mês do seletor" onPress={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}/>
    </View>
    <View style={{flexDirection:'row',marginTop:4}}>{['D','S','T','Q','Q','S','S'].map((d,i)=><Text key={i} style={{width:'14.2857%',textAlign:'center',color:c.muted,fontSize:12}}>{d}</Text>)}</View>
    <View style={{flexDirection:'row',flexWrap:'wrap',marginTop:6}}>{monthCells(month).map((d,i)=><View key={i} style={{width:'14.2857%',padding:2}}>{d?<Pressable accessibilityLabel={'Selecionar '+dateDisplay(localDateKey(d),true)} onPress={()=>{const next=new Date(d);next.setHours(selected.getHours(),selected.getMinutes(),0,0);pick(next);if(dateOnly)commit(next);}}
     style={{height:36,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:localDateKey(d)===localDateKey(selected)?c.accent:'transparent',borderWidth:localDateKey(d)===localDateKey(new Date())&&localDateKey(d)!==localDateKey(selected)?1:0,borderColor:c.accent}}>
     <Text style={{color:localDateKey(d)===localDateKey(selected)?PALETTE.white:c.text,fontWeight:localDateKey(d)===localDateKey(selected)?'700':'400'}}>{d.getDate()}</Text></Pressable>:null}</View>)}</View>
   </MonthSwipe>:null}
   {!dateOnly?<View style={{flexDirection:'row',gap:12,marginTop:timeOnly?0:10}}>{(['hours','minutes'] as const).map(part=><View key={part} style={{flex:1}}>
    <Text style={{textAlign:'center',color:c.muted,marginBottom:6,fontSize:12}}>{part==='hours'?'Hora':'Minutos'}</Text>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{height:126,backgroundColor:c.surface,borderRadius:12}} nestedScrollEnabled contentOffset={{x:0,y:Math.max(0,(part==='hours'?selected.getHours():selected.getMinutes())*42-42)}}>
     {Array.from({length:part==='hours'?24:60},(_,i)=><Pressable key={i} accessibilityLabel={(part==='hours'?'Hora ':'Minuto ')+i} onPress={()=>change(part,i)} style={{height:42,alignItems:'center',justifyContent:'center',backgroundColor:(part==='hours'?selected.getHours():selected.getMinutes())===i?c.accentSoft:'transparent'}}><Text style={{color:c.text,fontSize:20,fontWeight:'500'}}>{pad(i)}</Text></Pressable>)}
    </ScrollView></View>)}</View>:null}
   {!dateOnly?<View style={{marginTop:12}}><Button title={'Confirmar '+(timeOnly?pad(selected.getHours())+':'+pad(selected.getMinutes()):dateDisplay(selected.toISOString(),false))} onPress={()=>commit(selected)}/></View>:null}
   <View style={{flexDirection:'row',justifyContent:allowClear&&value?'space-between':'flex-end',marginTop:8}}>
    {allowClear&&value?<Pressable accessibilityRole="button" onPress={()=>{onChange('');smooth();setOpen(false);}} style={{padding:8}}><Text style={{color:c.muted,fontWeight:'500'}}>Limpar</Text></Pressable>:null}
    <Pressable accessibilityRole="button" onPress={()=>{smooth();setOpen(false);}} style={{padding:8}}><Text style={{color:c.accent,fontWeight:'600'}}>Fechar</Text></Pressable>
   </View>
  </View>:null}
 </View>;
}
