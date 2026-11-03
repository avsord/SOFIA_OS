import {useDraft} from '../lib/draft-bus';
import {REPEATS,agendaTags,readRepeat,type Repeat} from '../lib/agenda-recurrence';
import {dpx} from '../lib/content-width';
import {useDesktop} from '../lib/desktop';
import React,{useEffect,useMemo,useState} from 'react';
import {contextMenu} from '../components/ContextMenu';
import {PALETTE} from '../lib/palette';
import {tap} from '../lib/desktop';
import {Alert,Pressable,Text,TextInput,View} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from '../components/RevealScroll';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {useWorkspaceRecords} from '../lib/workspace-records';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {DateTimeField} from '../components/DateTimeField';
import {Sheet} from '../components/Sheet';
import {Button,Empty,ErrorBanner,IconButton,ScreenTitle,forms} from '../components/UI';
import {Icon} from '../components/Icon';
import {appAlert} from '../lib/app-alert';

// 0.3.141: app Lembretes. Usa o registro "reminder" que a Agenda ja conhece: o aviso no
// celular sai pelo mesmo agendador da Agenda (api.saveEntity avisa agendaChanged).
const pad=(n:number)=>String(n).padStart(2,'0');
// 0.3.146: o servidor exige data, hora E fuso; sem fuso, o lembrete nao salvava se a pessoa
// nao mexesse no campo "Quando". toISOString() leva o fuso (UTC, 'Z'), como o DateTimeField.
export function defaultRemindAt(now=new Date()){const d=new Date(now.getTime()+60*60*1000);d.setMinutes(0,0,0);return d.toISOString();}
export function remindLabel(value:unknown,now=new Date()){
 const t=Date.parse(String(value||''));if(!Number.isFinite(t))return 'Sem horário';
 const d=new Date(t),sameDay=(a:Date,b:Date)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
 const tomorrow=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1),time=`${pad(d.getHours())}:${pad(d.getMinutes())}`;
 if(sameDay(d,now))return (t<now.getTime()?'Hoje, passou às ':'Hoje às ')+time;
 if(sameDay(d,tomorrow))return 'Amanhã às '+time;
 return d.toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})+' às '+time;
}
// 0.3.310 (Pedro): um lembrete com mais de uma data. Cada data e um registro "reminder" proprio (aviso no celular,
// repeticao e reagendamento no servidor continuam iguais), ligados pela marca sofia-rgroup-v1:<id>.
const GROUP='sofia-rgroup-v1:';
export const groupOf=(e:{tags?:string[]})=>(e.tags||[]).find(t=>t.startsWith(GROUP))||'';
const withGroup=(tags:string[],g:string)=>[...tags.filter(t=>!t.startsWith(GROUP)),...(g?[g]:[])];
export function splitReminders(items:Entity[],now=new Date()){
 const active=items.filter(i=>i.state==='active'),done=items.filter(i=>i.state==='done');
 const at=(i:Entity)=>Date.parse(String(i.data?.remind_at||''))||0;
 active.sort((a,b)=>at(a)-at(b));done.sort((a,b)=>at(b)-at(a));
 return {late:active.filter(i=>at(i)&&at(i)<now.getTime()),upcoming:active.filter(i=>!at(i)||at(i)>=now.getTime()),done:done.slice(0,20)};
}
function field(c:any,label:string,value:string,onChange:(v:string)=>void,multiline=false,placeholder=''){
 return <View style={{gap:6}}><Text style={{color:c.muted,fontSize:12}}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} placeholder={placeholder} placeholderTextColor={c.muted} style={[forms.input,{color:c.text,backgroundColor:c.input,borderColor:c.line,minHeight:multiline?88:48,textAlignVertical:multiline?'top':'center'}]}/></View>;
}

export function Reminders({api,active,onBack}:{api:SofiaApi;active:boolean;onBack:()=>void}){const desk=useDesktop();
 const c=useTheme(),records=useWorkspaceRecords(api,'reminder','',true),[editing,setEditing]=useState<Partial<Entity>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[extras,setExtras]=useState<{id?:string;at:string}[]>([]);
 useEffect(()=>{if(active)void records.load();else setEditing(null);},[active,api]);
 const membersOf=(e:Entity)=>{const g=groupOf(e);return g?records.items.filter(x=>groupOf(x)===g):[e];};
 const groups=useMemo(()=>splitReminders(records.items),[records.items]);
 function open(item:Partial<Entity>={}){setError('');setExtras(item.id&&groupOf(item)?records.items.filter(x=>groupOf(x)===groupOf(item)&&x.id!==item.id&&x.state===item.state).map(x=>({id:x.id,at:String(x.data?.remind_at||'')})):[]);setEditing(item.id?item:{kind:'reminder',title:'',content:'',area:'Lembretes',privacy:'private',state:'active',tags:[],...item,data:{remind_at:defaultRemindAt(),message:'',location:'',...(item.data||{})}});}
 // 0.3.331: rascunho vindo da linha do tempo do Inicio (horario do clique)
 useDraft<Partial<Entity>>('reminder',active,d=>open(d));
 function patchData(patch:Record<string,any>){setEditing(old=>old?{...old,data:{...(old.data||{}),...patch}}:old);}
 async function save(){
  if(!editing?.title?.trim()||busy)return;setBusy(true);setError('');
  try{
   const d={...(editing.data||{})};d.remind_at=String(d.remind_at||'');d.message=String(d.message||'');d.location=String(d.location||'');
   if(!Number.isFinite(Date.parse(d.remind_at)))throw Error('Escolha quando lembrar.');
   if(!/(Z|[+-]\d\d:?\d\d)$/.test(d.remind_at))d.remind_at=new Date(Date.parse(d.remind_at)).toISOString();
   const iso=(v:string)=>{if(!Number.isFinite(Date.parse(v)))throw Error('Escolha quando lembrar em todas as datas.');return /(Z|[+-]\d\d:?\d\d)$/.test(v)?v:new Date(Date.parse(v)).toISOString();};
   const extraAts=extras.map(x=>({...x,at:iso(x.at)}));
   const g=extraAts.length?(groupOf(editing)||GROUP+(editing.id||'r'+Date.now().toString(36))):'';
   const base={kind:'reminder',title:editing.title.trim(),content:String(editing.content||''),area:editing.area||'Lembretes',privacy:'private' as const,state:editing.state||'active',tags:withGroup(editing.tags||[],g)};
   const saved=await api.saveEntity({...editing,...base,data:d});records.merge(saved);
   // as outras datas: atualiza as que ja existiam, cria as novas e apaga as que a pessoa tirou
   const before=editing.id&&groupOf(editing)?records.items.filter(x=>groupOf(x)===groupOf(editing)&&x.id!==editing.id):[];
   for(const x of extraAts){const old=before.find(b=>b.id===x.id);const r=await api.saveEntity(old?{...old,...base,revision:old.revision,data:{...d,remind_at:x.at}}:{...base,data:{...d,remind_at:x.at}} as any);records.merge(r);}
   for(const b of before)if(!extraAts.some(x=>x.id===b.id))await api.deleteEntity(b.id).catch(()=>undefined);
   if(before.length)void records.load(false,true);
   setEditing(null);setExtras([]);
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 }
 async function setState(item:Entity,state:string){if(busy)return;setBusy(true);setError('');try{for(const m of membersOf(item).filter(m=>m.state===item.state))records.merge(await api.saveEntity({...m,state,revision:m.revision}));}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 function remove(item:Entity){appAlert('Excluir lembrete?',`“${item.title}” será removido.`,[{text:'Cancelar'},{text:'Excluir',style:'destructive',onPress:()=>{setBusy(true);Promise.all(membersOf(item).map(m=>api.deleteEntity(m.id))).then(()=>{void records.load(false,true);setEditing(null);}).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}]);}
 const row=(item:Entity,late=false,done=false)=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Editar lembrete '+item.title} onPress={()=>open(item)} {...contextMenu(()=>[{label:'Abrir',icon:'edit',run:()=>open(item)},{label:done?'Reativar':'Concluir',icon:done?'undo':'check',run:()=>{void setState(item,done?'active':'done');}},{label:'Apagar',icon:'trash',danger:true,run:()=>remove(item)}])} style={({pressed,hovered}:any)=>(desk?{paddingHorizontal:14,paddingVertical:11,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:hovered?c.input:'transparent',borderTopWidth:1,borderColor:c.line,marginTop:-1}:{minHeight:72,borderRadius:22,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:done?c.surface:c.card,borderWidth:1,borderColor:late?c.danger:c.line,opacity:pressed?0.85:1})}>
  <Pressable accessibilityRole="checkbox" accessibilityState={{checked:done}} accessibilityLabel={(done?'Reativar ':'Concluir ')+item.title} onPress={e=>{e.stopPropagation();void setState(item,done?'active':'done');}} style={{width:30,height:30,borderRadius:15,borderWidth:2,borderColor:done?c.accent:late?c.danger:c.muted,backgroundColor:done?c.accent:'transparent',alignItems:'center',justifyContent:'center'}}>{done?<Icon name="check" size={16} color={PALETTE.white}/>:null}</Pressable>
  <View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={1} style={{fontSize:16,fontWeight:'600',color:done?c.muted:c.text,textDecorationLine:done?'line-through':'none'}}>{item.title}</Text><Text style={{fontSize:11,color:late?c.danger:c.muted}}>{groupOf(item)?membersOf(item).filter(m=>m.state===item.state).sort((a,b)=>Date.parse(String(a.data?.remind_at))-Date.parse(String(b.data?.remind_at))).map(m=>remindLabel(m.data?.remind_at)).join(' e '):remindLabel(item.data?.remind_at)}{readRepeat(item).frequency!=='none'?' · '+REPEATS.find(r=>r.value===readRepeat(item).frequency)!.label.toLowerCase():''}</Text>{item.data?.message?<Text numberOfLines={1} style={{fontSize:11,color:c.muted}}>{String(item.data.message)}</Text>:null}</View>
  <Icon name="bell" size={18} color={done?c.muted:c.accent}/>
 </Pressable>;
 const once=(list:Entity[])=>{const seen=new Set<string>();return list.filter(e=>{const g=groupOf(e);if(!g)return true;if(seen.has(g))return false;seen.add(g);return true;});};
 const section=(title:string,all:Entity[],late=false,done=false,list=once(all))=>list.length?(desk?<View style={{gap:8}}><View style={{flexDirection:'row',alignItems:'baseline',gap:8}}><Text style={{color:late?c.danger:c.text,fontSize:16,fontWeight:'600'}}>{title}</Text><Text style={{color:c.muted,fontSize:13}}>{list.length}</Text></View><View style={{borderRadius:14,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,overflow:'hidden'}}>{list.map(i=>row(i,late,done))}</View></View>:<View style={{gap:10}}><Text style={{color:c.muted,fontSize:12,fontWeight:'600',paddingHorizontal:6}}>{title}</Text>{list.map(i=>row(i,late,done))}</View>):null;
 return <View style={{flex:1}}>
  <ScreenTitle title="Lembretes" onBack={onBack} backLabel="Voltar aos apps" subtitle={!records.loaded?' ':groups.late.length?(groups.late.length===1?'“'+groups.late[0].title+'” já passou da hora.':groups.late.length+' lembretes já passaram da hora.'):groups.upcoming.length?'O próximo é “'+groups.upcoming[0].title+'”, '+new Date(Date.parse(String(groups.upcoming[0].data?.remind_at||''))).toLocaleString('pt-BR',{weekday:'long',hour:'2-digit',minute:'2-digit'})+'.':'Nenhum lembrete marcado.'} right={desk?<Button title="Novo lembrete" onPress={()=>open()}/>:<View style={{flexDirection:'row'}}><IconButton name="plus" label="Novo lembrete" onPress={()=>open()}/></View>}/>
  {error||records.error?<ErrorBanner text={error||records.error} onRetry={()=>void records.load()}/>:null}
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:22,paddingTop:4,gap:18,...(desk?{paddingLeft:dpx(40),paddingRight:dpx(40)}:null)} as any}>
   {section('Atrasados',groups.late,true)}
   {/* 03/11/2026 (desenho 34): Hoje separado dos Proximos (Atrasados continua: e funcao) */}
   {section('Hoje',groups.upcoming.filter(i=>{const t=Date.parse(String(i.data?.remind_at||''));return !!t&&new Date(t).toDateString()===new Date().toDateString();}))}
   {section('Próximos',groups.upcoming.filter(i=>!(i=>{const t=Date.parse(String(i.data?.remind_at||''));return !!t&&new Date(t).toDateString()===new Date().toDateString();})(i)))}
   {section('Feitos',groups.done,false,true)}
   {!records.loaded&&!records.error?<Text style={{color:c.muted,padding:18}}>Carregando lembretes…</Text>:null}
   {records.loaded&&!records.items.length?<Empty icon="bell" title="Seu primeiro lembrete" body="Ex.: ligar para o dentista às 15h, pagar o condomínio amanhã, tirar a roupa da máquina."/>:null}
   <Text style={{color:c.muted,fontSize:11,lineHeight:18,paddingHorizontal:4}}>{tap('O celular avisa no horário escolhido, mesmo com o app fechado. Os lembretes também aparecem na Agenda.')}</Text>
  </ScrollView>
  <Sheet visible={!!editing} onClose={()=>{if(!busy)setEditing(null);}} label="Fechar lembrete">
   <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text,fontSize:24,fontWeight:'600'}}>{editing?.id?'Editar lembrete':'Novo lembrete'}</Text><IconButton name="close" label="Fechar lembrete" disabled={busy} onPress={()=>setEditing(null)}/></View>
   <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:16,paddingBottom:18}}>
    {error?<ErrorBanner text={error}/>:null}
    {field(c,'O que lembrar',editing?.title||'',title=>setEditing(old=>old?{...old,title}:old),false,'Ex.: ligar para o dentista')}
    <DateTimeField allowClear={false} label="Quando" value={String(editing?.data?.remind_at||'')} onChange={remind_at=>patchData({remind_at})}/>
    {extras.map((x,i)=><View key={x.id||'n'+i} style={{flexDirection:'row',alignItems:'flex-end',gap:8}}><View style={{flex:1}}><DateTimeField allowClear={false} label={'Outra data '+(i+1)} value={x.at} onChange={at=>setExtras(list=>list.map((y,k)=>k===i?{...y,at}:y))}/></View><IconButton name="close" label={'Tirar a outra data '+(i+1)} onPress={()=>setExtras(list=>list.filter((_,k)=>k!==i))}/></View>)}
    <Pressable accessibilityRole="button" onPress={()=>setExtras(list=>[...list,{at:defaultRemindAt(new Date((Date.parse(String((list.at(-1)?.at)||editing?.data?.remind_at||''))||Date.now())+23*3600000))}])} style={({hovered}:any)=>({alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6,height:32,paddingHorizontal:10,borderRadius:9,backgroundColor:hovered?c.input:'transparent'})}><Icon name="plus" size={14} color={c.accent}/><Text style={{color:c.accent,fontSize:13,fontWeight:'600'}}>Outra data</Text></Pressable>
    {/* 0.3.304 (Pedro): lembretes que se repetem (ex.: todo mes, emitir a nota) */}
    <View style={{gap:6}}><Text style={{color:c.muted,fontSize:12}}>Repetir</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{REPEATS.map(r=>{const on=readRepeat(editing||{}).frequency===r.value;return <Pressable key={r.value} accessibilityRole="button" accessibilityState={{selected:on}} onPress={()=>setEditing(old=>old?{...old,tags:agendaTags(old.tags||[],r.value as Repeat)}:old)} style={{paddingHorizontal:12,height:32,borderRadius:16,justifyContent:'center',backgroundColor:on?c.accentSoft:c.input,borderWidth:1,borderColor:on?c.accent:'transparent'}}><Text style={{fontSize:13,color:on?c.accent:c.text,fontWeight:on?'600':'400'}}>{r.label}</Text></Pressable>;})}</View></View>
    {field(c,'Detalhes (opcional)',String(editing?.data?.message||''),message=>patchData({message}),true)}
    {field(c,'Local / referência (opcional)',String(editing?.data?.location||''),location=>patchData({location}))}
    <Button title="Salvar lembrete" loading={busy} disabled={!editing?.title?.trim()} onPress={()=>void save()}/>
    {editing?.id?<Button title="Excluir lembrete" secondary disabled={busy} onPress={()=>remove(editing as Entity)}/>:null}
   </ScrollView>
  </Sheet>
 </View>;
}
