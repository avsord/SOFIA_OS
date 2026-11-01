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
 const c=useTheme(),records=useWorkspaceRecords(api,'reminder','',true),[editing,setEditing]=useState<Partial<Entity>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(active)void records.load();else setEditing(null);},[active,api]);
 const groups=useMemo(()=>splitReminders(records.items),[records.items]);
 function open(item:Partial<Entity>={}){setError('');setEditing(item.id?item:{kind:'reminder',title:'',content:'',area:'Lembretes',privacy:'private',state:'active',tags:[],data:{remind_at:defaultRemindAt(),message:'',location:''}});}
 function patchData(patch:Record<string,any>){setEditing(old=>old?{...old,data:{...(old.data||{}),...patch}}:old);}
 async function save(){
  if(!editing?.title?.trim()||busy)return;setBusy(true);setError('');
  try{
   const d={...(editing.data||{})};d.remind_at=String(d.remind_at||'');d.message=String(d.message||'');d.location=String(d.location||'');
   if(!Number.isFinite(Date.parse(d.remind_at)))throw Error('Escolha quando lembrar.');
   if(!/(Z|[+-]\d\d:?\d\d)$/.test(d.remind_at))d.remind_at=new Date(Date.parse(d.remind_at)).toISOString();
   const saved=await api.saveEntity({...editing,kind:'reminder',title:editing.title.trim(),content:String(editing.content||''),area:editing.area||'Lembretes',privacy:'private',state:editing.state||'active',tags:editing.tags||[],data:d});
   records.merge(saved);setEditing(null);
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 }
 async function setState(item:Entity,state:string){if(busy)return;setBusy(true);setError('');try{records.merge(await api.saveEntity({...item,state,revision:item.revision}));}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 function remove(item:Entity){appAlert('Excluir lembrete?',`“${item.title}” será removido.`,[{text:'Cancelar'},{text:'Excluir',style:'destructive',onPress:()=>{setBusy(true);api.deleteEntity(item.id).then(()=>{void records.load(false,true);setEditing(null);}).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}]);}
 const row=(item:Entity,late=false,done=false)=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Editar lembrete '+item.title} onPress={()=>open(item)} {...contextMenu(()=>[{label:'Abrir',icon:'edit',run:()=>open(item)},{label:done?'Reativar':'Concluir',icon:done?'undo':'check',run:()=>{void setState(item,done?'active':'done');}},{label:'Apagar',icon:'trash',danger:true,run:()=>remove(item)}])} style={({pressed})=>({minHeight:72,borderRadius:22,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:done?c.surface:c.card,borderWidth:1,borderColor:late?c.danger:c.line,opacity:pressed?0.85:1})}>
  <Pressable accessibilityRole="checkbox" accessibilityState={{checked:done}} accessibilityLabel={(done?'Reativar ':'Concluir ')+item.title} onPress={e=>{e.stopPropagation();void setState(item,done?'active':'done');}} style={{width:30,height:30,borderRadius:15,borderWidth:2,borderColor:done?c.accent:late?c.danger:c.muted,backgroundColor:done?c.accent:'transparent',alignItems:'center',justifyContent:'center'}}>{done?<Icon name="check" size={16} color={PALETTE.white}/>:null}</Pressable>
  <View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={1} style={{fontSize:16,fontWeight:'600',color:done?c.muted:c.text,textDecorationLine:done?'line-through':'none'}}>{item.title}</Text><Text style={{fontSize:11,color:late?c.danger:c.muted}}>{remindLabel(item.data?.remind_at)}</Text>{item.data?.message?<Text numberOfLines={1} style={{fontSize:11,color:c.muted}}>{String(item.data.message)}</Text>:null}</View>
  <Icon name="bell" size={18} color={done?c.muted:c.accent}/>
 </Pressable>;
 const section=(title:string,list:Entity[],late=false,done=false)=>list.length?<View style={{gap:10}}><Text style={{color:c.muted,fontSize:12,fontWeight:'600',paddingHorizontal:6}}>{title}</Text>{list.map(i=>row(i,late,done))}</View>:null;
 return <View style={{flex:1}}>
  <ScreenTitle title="Lembretes" right={<View style={{flexDirection:'row'}}>{desk?null:<IconButton name="back" label="Voltar aos apps" onPress={onBack}/>}<IconButton name="plus" label="Novo lembrete" onPress={()=>open()}/></View>}/>
  {error||records.error?<ErrorBanner text={error||records.error} onRetry={()=>void records.load()}/>:null}
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:22,paddingTop:4,gap:18}}>
   {section('Atrasados',groups.late,true)}
   {section('Próximos',groups.upcoming)}
   {section('Concluídos',groups.done,false,true)}
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
    {field(c,'Detalhes (opcional)',String(editing?.data?.message||''),message=>patchData({message}),true)}
    {field(c,'Local / referência (opcional)',String(editing?.data?.location||''),location=>patchData({location}))}
    <Button title="Salvar lembrete" loading={busy} disabled={!editing?.title?.trim()} onPress={()=>void save()}/>
    {editing?.id?<Button title="Excluir lembrete" secondary disabled={busy} onPress={()=>remove(editing as Entity)}/>:null}
   </ScrollView>
  </Sheet>
 </View>;
}
