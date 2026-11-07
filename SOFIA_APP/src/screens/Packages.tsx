import React,{useEffect,useMemo,useState} from 'react';
import {contextMenu} from '../components/ContextMenu';
import {EmojiIcon} from '../components/Icon';
import {tap} from '../lib/desktop';
import {Alert,Linking,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {useWorkspaceRecords} from '../lib/workspace-records';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Sheet} from '../components/Sheet';
import {Button,Empty,ErrorBanner,IconButton,ScreenTitle,forms} from '../components/UI';
import {Icon} from '../components/Icon';
import {appAlert} from '../lib/app-alert';

// 0.3.142: app Encomendas (inspirado no Muambator). Cadastre o código, dê um nome e a Sofia
// acompanha: o servidor consulta a transportadora e avisa quando o status muda.
export type PackageEvent={at:string;status:string;local?:string};
export const normalizeCode=(code:string)=>code.replace(/[\s.-]/g,'').toUpperCase();
/** 07/11/2026 (revisao do site): erro tecnico em ingles ("fetch failed") vira uma frase que a pessoa entende. */
export function friendlyTrackError(m: string): string {
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|socket|aborted|timeout/i.test(m)) return 'não consegui falar com a transportadora. Tento de novo sozinha em alguns minutos.';
  if (/^[\x00-\x7F]*$/.test(m) && /[a-z]{4,} [a-z]{3,}/i.test(m) && !/[áéíóúãõç]/i.test(m)) return 'não consegui consultar o rastreio agora. Tento de novo mais tarde.';
  return m;
}
export function detectCarrier(code:string){const c=normalizeCode(code);if(/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c))return 'correios';if(/^\d{14}$/.test(c))return 'jadlog';if(/^(LP|CNBR|SYRM|YT|CNB)\w{8,}$/.test(c))return 'cainiao';if(/^BR\d{12,}[A-Z]?$/.test(c))return 'shopee';return 'outro';}
export const CARRIER_LABEL:Record<string,string>={correios:'Correios',jadlog:'Jadlog',cainiao:'Cainiao / AliExpress',shopee:'Shopee (SPX)',outro:'Outra transportadora'};
export function officialUrl(carrier:string,code:string){const c=encodeURIComponent(normalizeCode(code));if(carrier==='correios')return 'https://rastreamento.correios.com.br/app/index.php?objetos='+c;if(carrier==='jadlog')return 'https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte='+c;if(carrier==='cainiao')return 'https://global.cainiao.com/newDetail.htm?mailNoList='+c;if(carrier==='shopee')return 'https://spx.com.br/track?'+c;return 'https://www.google.com/search?q='+c;}
export function parseEvents(raw:unknown):PackageEvent[]{try{const v=JSON.parse(String(raw||'[]'));return Array.isArray(v)?v.filter(e=>e&&e.status):[];}catch{return [];}}
export function whenLabel(at:string){const t=Date.parse(at);if(!Number.isFinite(t))return at||'';const d=new Date(t);return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
export function splitPackages(items:Entity[]){const at=(i:Entity)=>Date.parse(String(i.data?.last_event_at||''))||0;const active=items.filter(i=>i.state==='active').sort((a,b)=>at(b)-at(a)),delivered=items.filter(i=>i.state==='delivered').sort((a,b)=>at(b)-at(a));return {active,delivered};}
function field(c:any,label:string,value:string,onChange:(v:string)=>void,placeholder='',props:any={}){
 return <View style={{gap:6}}><Text style={{color:c.muted,fontSize:12}}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} style={[forms.input,{color:c.text,backgroundColor:c.input,borderColor:c.line,minHeight:48}]} {...props}/></View>;
}

export function Packages({api,active,onBack}:{api:SofiaApi;active:boolean;onBack:()=>void}){
 const c=useTheme(),records=useWorkspaceRecords(api,'package','',true),[editing,setEditing]=useState<Partial<Entity>|null>(null),[viewing,setViewing]=useState<Entity|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(active)void records.load();else{setEditing(null);setViewing(null);}},[active,api]);
 const groups=useMemo(()=>splitPackages(records.items.filter(i=>i.state!=='archived')),[records.items]);
 function open(){setError('');setEditing({kind:'package',title:'',content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{code:'',carrier:'',status:'',last_event_at:'',events:'[]',checked_at:'',error:'',note:''}});}
 function patchData(patch:Record<string,any>){setEditing(old=>old?{...old,data:{...(old.data||{}),...patch}}:old);}
 async function save(){
  if(busy||!editing)return;const code=normalizeCode(String(editing.data?.code||''));if(code.length<8){setError('Digite o código de rastreio completo.');return;}
  setBusy(true);setError('');
  try{
   const carrier=detectCarrier(code);
   const saved=await api.saveEntity({...editing,kind:'package',title:(editing.title||'').trim()||code,content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{...(editing.data||{}),code,carrier}});
   records.merge(saved);setEditing(null);
   void refresh(saved,true);
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 }
 async function refresh(item:Entity,silent=false){
  setBusy(true);if(!silent)setError('');
  try{const r=await api.refreshPackage(item.id);records.merge(r.item);if(viewing?.id===item.id)setViewing(r.item);if(!silent&&r.error)setError(/fecharam a consulta/.test(r.error)?r.error:'Não foi possível consultar agora: '+r.error);}
  catch(e){if(!silent)setError(errorText(e));}finally{setBusy(false);}
 }
 function archive(item:Entity){appAlert('Remover encomenda?',`“${item.title}” sai da lista (fica no histórico).`,[{text:'Cancelar'},{text:'Remover',style:'destructive',onPress:()=>{setBusy(true);api.saveEntity({...item,state:'archived',revision:item.revision}).then(saved=>{records.merge(saved);setViewing(null);}).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}]);}
 const row=(item:Entity)=>{const delivered=item.state==='delivered',err=String(item.data?.error||''),status=String(item.data?.status||'')||(err?'Consulta indisponível':'Aguardando a primeira consulta');
  return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Abrir encomenda '+item.title} onPress={()=>setViewing(item)} {...contextMenu(()=>[{label:'Abrir',icon:'box',run:()=>setViewing(item)},{label:'Remover',icon:'trash',danger:true,run:()=>archive(item)}])} style={({pressed})=>({minHeight:74,borderRadius:22,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:delivered?c.surface:c.card,borderWidth:1,borderColor:c.line,opacity:pressed?0.85:1})}>
   <View style={{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:delivered?c.accentSoft:c.surface}}><EmojiIcon e={delivered?'✅':'📦'} size={22} color={c.accent}/></View>
   <View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={1} style={{fontSize:16,fontWeight:'600',color:c.text}}>{item.title}</Text><Text numberOfLines={2} style={{fontSize:12,color:err&&!item.data?.status?c.danger:c.muted}}>{status}</Text><Text style={{fontSize:10,color:c.muted}}>{CARRIER_LABEL[String(item.data?.carrier)]||'Transportadora'} · {String(item.data?.code||'')}{item.data?.last_event_at?' · '+whenLabel(String(item.data.last_event_at)):''}</Text></View>
   <Icon name="chevron" size={18} color={c.muted}/>
  </Pressable>;};
 const section=(title:string,list:Entity[])=>list.length?<View style={{gap:10}}><Text style={{color:c.muted,fontSize:12,fontWeight:'600',paddingHorizontal:6}}>{title}</Text>{list.map(row)}</View>:null;
 const events=viewing?parseEvents(viewing.data?.events):[];
 return <View style={{flex:1}}>
  <ScreenTitle title="Encomendas" eyebrow="RASTREIO · AVISA QUANDO MUDA" right={<View style={{flexDirection:'row'}}><IconButton name="back" label="Voltar aos apps" onPress={onBack}/><IconButton name="plus" label="Nova encomenda" onPress={open}/></View>}/>
  {error||records.error?<ErrorBanner text={error||records.error} onRetry={()=>void records.load()}/>:null}
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:22,paddingTop:4,gap:18}}>
   {section('A caminho',groups.active)}
   {section('Entregues',groups.delivered)}
   {!records.loaded&&!records.error?<Text style={{color:c.muted,padding:18}}>Carregando encomendas…</Text>:null}
   {records.loaded&&!groups.active.length&&!groups.delivered.length?<Empty icon="box" title="Sua primeira encomenda" body="Cole o código de rastreio (ex.: AA123456789BR) e dê um nome. A Sofia consulta a transportadora e avisa a cada mudança."/>:null}
   <Text style={{color:c.muted,fontSize:11,lineHeight:18,paddingHorizontal:4}}>Todas as transportadoras (Correios, AliExpress, Shopee e outras) são acompanhadas automaticamente pela Ship24, e você recebe aviso quando o status muda. Cada encomenda nova usa 1 das 10 grátis do mês; atualizar não gasta.</Text>
  </ScrollView>
  <Sheet visible={!!editing} onClose={()=>{if(!busy)setEditing(null);}} label="Fechar encomenda">
   <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text,fontSize:24,fontWeight:'600'}}>Nova encomenda</Text><IconButton name="close" label="Fechar encomenda" disabled={busy} onPress={()=>setEditing(null)}/></View>
   <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:16,paddingBottom:18}}>
    {error?<ErrorBanner text={error}/>:null}
    {field(c,'Código de rastreio',String(editing?.data?.code||''),code=>patchData({code}),'Ex.: AA123456789BR',{autoCapitalize:'characters',autoCorrect:false})}
    {editing?.data?.code?<Text style={{color:c.muted,fontSize:12}}>{CARRIER_LABEL[detectCarrier(String(editing.data.code))]}</Text>:null}
    {field(c,'Nome (opcional)',editing?.title||'',title=>setEditing(old=>old?{...old,title}:old),'Ex.: Fone novo')}
    {field(c,'Observação (opcional)',String(editing?.data?.note||''),note=>patchData({note}))}
    <Button title="Acompanhar" loading={busy} disabled={!String(editing?.data?.code||'').trim()} onPress={()=>void save()}/>
   </ScrollView>
  </Sheet>
  <Sheet visible={!!viewing} onClose={()=>setViewing(null)} label="Fechar linha do tempo">
   {viewing?<View style={{gap:14,paddingBottom:18}}>
    <View style={{flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}><Text style={{color:c.text,fontSize:24,fontWeight:'600'}}>{viewing.title}</Text><Text style={{color:c.muted,fontSize:12}}>{CARRIER_LABEL[String(viewing.data?.carrier)]||'Transportadora'} · {String(viewing.data?.code||'')}</Text></View><IconButton name="close" label="Fechar linha do tempo" onPress={()=>setViewing(null)}/></View>
    {/* 0.3.232: etapa em portugues, taxa a pagar e previsao de entrega (Ship24) */}
    {viewing.data?.milestone_label?<View style={{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:5,borderRadius:99,backgroundColor:c.accentSoft}}><Text style={{color:c.accent,fontWeight:'700',fontSize:12}}>{String(viewing.data.milestone_label)}</Text></View>:null}
    {viewing.data?.fee?<View style={{padding:12,borderRadius:12,backgroundColor:c.danger+'1f',gap:4}}><View style={{flexDirection:'row',alignItems:'center',gap:6}}><Icon name="coins" size={16} color={c.danger}/><Text style={{color:c.danger,fontWeight:'600'}}>Taxa a pagar</Text></View><Text style={{color:c.text,fontSize:13}}>{tap('A encomenda está esperando o pagamento de taxa/imposto. Toque em "Abrir rastreio oficial" para pagar.')}</Text></View>:null}
    {viewing.data?.estimated&&viewing.state!=='delivered'?<Text style={{color:c.muted,fontSize:12}}>Previsão de entrega: {String(viewing.data.estimated).slice(8,10)+'/'+String(viewing.data.estimated).slice(5,7)}</Text>:null}
    {viewing.data?.error?<Text style={{color:c.danger,fontSize:12}}>Última consulta falhou: {friendlyTrackError(String(viewing.data.error))}</Text>:null}
    {viewing.data?.ok_at?<Text style={{color:c.muted,fontSize:11}}>Última atualização com sucesso: {whenLabel(String(viewing.data.ok_at))}</Text>:<Text style={{color:c.muted,fontSize:11}}>Ainda sem nenhuma atualização com sucesso.</Text>}
    {viewing.data?.checked_at?<Text style={{color:c.muted,fontSize:11}}>Última tentativa: {whenLabel(String(viewing.data.checked_at))}</Text>:null}
    <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:360}} contentContainerStyle={{gap:10}}>
     {events.length?events.map((e,i)=><View key={i} style={{flexDirection:'row',gap:12}}><View style={{alignItems:'center'}}><View style={{width:12,height:12,borderRadius:6,backgroundColor:i===0?c.accent:c.line,marginTop:4}}/>{i<events.length-1?<View style={{width:2,flex:1,backgroundColor:c.line,marginTop:2}}/>:null}</View><View style={{flex:1,paddingBottom:8}}><Text style={{color:i===0?c.text:c.muted,fontWeight:i===0?'700':'500',fontSize:14}}>{e.status}</Text><Text style={{color:c.muted,fontSize:11}}>{whenLabel(e.at)}{e.local?' · '+e.local:''}</Text></View></View>):<Text style={{color:c.muted,fontSize:13}}>{tap('Ainda sem eventos. Toque em Atualizar agora ou abra o rastreio oficial.')}</Text>}
    </ScrollView>
    <Button title="Atualizar agora" loading={busy} onPress={()=>void refresh(viewing)}/>
    <Button title="Abrir rastreio oficial" secondary onPress={()=>void Linking.openURL(officialUrl(String(viewing.data?.carrier||'outro'),String(viewing.data?.code||'')))}/>
    <Button title="Remover da lista" secondary disabled={busy} onPress={()=>archive(viewing)}/>
   </View>:null}
  </Sheet>
 </View>;
}
