import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,ScrollView,FlatList,Linking,BackHandler,Switch} from 'react-native';
import * as Sharing from 'expo-sharing';
import {File,Paths} from 'expo-file-system';
import {SofiaApi,DriveSummary,DriveFile,DriveCategory} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {appAlert} from '../lib/app-alert';
import {MotionModal} from './MotionModal';
import {IconButton,Button,ErrorBanner} from './UI';
import {Icon,IconName} from './Icon';
import {ShimmerGroup,ShimmerBlock,Spinner} from './Loading';
import {fileSize,filesNotice,shortDate as when} from '../lib/drive-files';

// 0.3.244: os arquivos da Sofia moram numa área oculta do Drive (ninguém apaga sem querer).
// Esta tela é a porta de entrada: vê por tipo, abre/compartilha cada arquivo e faz uma cópia visível.
const ICONS:Record<string,IconName>={'Páginas':'book','Anexos':'clip','Comprovantes':'image','Áudios':'volume','Backup com senha':'shield','Backups':'history'};
function Skeleton({rows=5}:{rows?:number}){const c=useTheme();return <ShimmerGroup><View style={{gap:10}}>{Array.from({length:rows},(_,i)=><View key={i} style={{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.line,padding:16,flexDirection:'row',gap:14,alignItems:'center',boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}><ShimmerBlock width={36} height={36} radius={12}/><View style={{flex:1,gap:8}}><ShimmerBlock width="55%" height={13}/><ShimmerBlock width="80%" height={10}/></View></View>)}</View></ShimmerGroup>;}

export function SofiaFiles({api,visible=true,onClose}:{api:SofiaApi;visible?:boolean;onClose:()=>void}){
 const c=useTheme();
 const [summary,setSummary]=useState<DriveSummary|null>(null),[error,setError]=useState('');
 const [cat,setCat]=useState<DriveCategory|null>(null),[items,setItems]=useState<DriveFile[]|null>(null),[page,setPage]=useState(''),[listError,setListError]=useState('');
 const [opening,setOpening]=useState(''),[exporting,setExporting]=useState(false),[picked,setPicked]=useState<string[]|null>(null);
 const alive=useRef(true);useEffect(()=>()=>{alive.current=false;},[]);
 const load=useCallback(async()=>{try{const s=await api.driveFiles();if(!alive.current)return;setSummary(s);setError('');setPicked(p=>p??s.categories.filter(x=>x.key!=='Backups').map(x=>x.key));}catch(e){if(alive.current)setError(errorText(e));}},[api]);
 useEffect(()=>{if(visible)void load();},[visible,load]);
 // Enquanto copia ou migra, o progresso se atualiza sozinho.
 const busy=summary?.export?.state==='running'||summary?.migration?.state==='running';
 useEffect(()=>{if(!visible||!busy)return;const t=setInterval(()=>void load(),4000);return()=>clearInterval(t);},[visible,busy,load]);
 const back=useCallback(()=>{if(cat){setCat(null);setItems(null);setListError('');return true;}onClose();return true;},[cat,onClose]);
 useEffect(()=>{if(!visible)return;const s=BackHandler.addEventListener('hardwareBackPress',back);return()=>s.remove();},[visible,back]);
 async function openCat(k:DriveCategory,more=false){
  if(!more){setCat(k);setItems(null);setPage('');setListError('');}
  try{const r=await api.driveList(k.key,more?page:'');if(!alive.current)return;setItems(prev=>more&&prev?[...prev,...r.items]:r.items);setPage(r.next_page||'');}catch(e){if(alive.current)setListError(errorText(e));}
 }
 async function open(f:DriveFile){
  if(opening)return;setOpening(f.id);
  try{
   const source=api.driveFileSource(f.id),safe=f.name.replace(/[^\p{L}\p{N}._-]/gu,'_');
   const target=new File(Paths.cache,'drive-'+f.id+'-'+safe);try{if(target.exists)target.delete();}catch{/* baixa de novo */}
   const file=await File.downloadFileAsync(source.uri,target,{headers:source.headers,idempotent:true});
   await Sharing.shareAsync(file.uri,{mimeType:f.mime||undefined,dialogTitle:f.name});
  }catch(e){appAlert('Não consegui abrir o arquivo',errorText(e));}
  finally{if(alive.current)setOpening('');}
 }
 function remove(f:DriveFile){
  const backup=cat?.key==='Backups'||cat?.key==='Backup com senha';
  appAlert('Apagar este arquivo?','"'+f.name+'" sai do Drive de vez (a área oculta não tem lixeira).'+(backup?' Os outros backups continuam.':' Onde ele aparecia na Sofia, fica um aviso de que foi apagado.'),[{text:'Cancelar',style:'cancel'},{text:'Apagar',style:'destructive',onPress:()=>{
   setItems(prev=>prev?prev.filter(x=>x.id!==f.id):prev);
   api.driveDelete(f.id).then(()=>void load()).catch(e=>{appAlert('Não consegui apagar',errorText(e));if(cat)void openCat(cat);});
  }}]);
 }
 // Limpeza automática: Comprovantes e Áudios, cada um com a sua chave (7 dias, igual para os dois).
 const cleanupKey=(k?:string)=>k==='Comprovantes'?'receipts_cleanup':k==='Áudios'?'voices_cleanup':null;
 const cleanup=cat&&cleanupKey(cat.key)&&summary?summary[cleanupKey(cat.key) as 'receipts_cleanup'|'voices_cleanup']:undefined;
 function toggleCleanup(on:boolean){
  const k=cat&&cleanupKey(cat.key);if(!cat||!k)return;const which=cat.key as 'Comprovantes'|'Áudios';
  setSummary(s=>s&&s[k]?{...s,[k]:{...s[k]!,enabled:on}}:s);
  api.driveCleanup(which,on).then(r=>{setSummary(s=>s?{...s,[k]:r}:s);if(on)setTimeout(()=>{void load();if(cat)void openCat(cat);},1500);}).catch(e=>{appAlert('Não consegui mudar a limpeza',errorText(e));void load();});
 }
 function startExport(){
  const cats=picked||[];if(!cats.length){appAlert('Exportar cópia','Escolha pelo menos um tipo de arquivo.');return;}
  appAlert('Exportar cópia para o Drive','A Sofia cria uma pasta normal no seu Drive com uma cópia do que você marcou. Ela aparece também nos computadores com o Google Drive. Os originais continuam guardados na área oculta.',[{text:'Cancelar',style:'cancel'},{text:'Exportar',onPress:()=>{setExporting(true);api.driveExport(cats).then(load).catch(e=>appAlert('Não consegui exportar',errorText(e))).finally(()=>{if(alive.current)setExporting(false);});}}]);
 }
 const total=summary?summary.categories.reduce((n,x)=>n+x.bytes,0):0,notice=summary?filesNotice(summary):null,exp=summary?.export||null;
 const header=<View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingTop:36,paddingBottom:8}}><IconButton name={cat?'back':'close'} label={cat?'Voltar aos tipos de arquivo':'Fechar'} onPress={back}/><View style={{flex:1,paddingHorizontal:4}}><Text style={{fontSize:24,fontWeight:'700',color:c.text}} numberOfLines={1}>{cat?cat.label:'Arquivos da Sofia'}</Text></View></View>;
 return <MotionModal visible={visible} animationType="slide" onRequestClose={back}><View style={{flex:1,backgroundColor:c.bg}}>{header}
  {cat?<FlatList keyboardShouldPersistTaps="handled" data={items||[]} keyExtractor={f=>f.id} contentContainerStyle={{padding:18,paddingTop:6,gap:10,flexGrow:1}}
    ListHeaderComponent={<View style={{gap:10,marginBottom:6}}><Text style={{color:c.muted,fontSize:13,lineHeight:19}}>{cat.hint} Toque num arquivo para abrir, salvar ou compartilhar.{cat.deletable===false?' Para apagar, apague a página em Páginas.':''}</Text>
     {cleanup?<View style={{backgroundColor:c.accentSoft,borderRadius:16,padding:14,gap:6}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={{flex:1,color:c.text,fontSize:14,fontWeight:'500'}}>Apagar sozinho com mais de {cleanup.days} dias</Text><Switch accessibilityLabel={'Limpeza automática: '+cat.label} value={cleanup.enabled} onValueChange={toggleCleanup} trackColor={{true:c.accent,false:c.line}} thumbColor={c.surface}/></View><Text style={{color:c.muted,fontSize:12,lineHeight:17}}>{cleanup.last_at?'Última limpeza: '+when(cleanup.last_at)+(cleanup.last_removed?' · '+cleanup.last_removed+(cleanup.last_removed===1?' apagado':' apagados'):'')+'. ':''}{cat.key==='Áudios'?'A transcrição de cada áudio continua na conversa.':'A despesa lançada em Finanças e a miniatura na conversa continuam.'}</Text></View>:null}</View>}
    ListEmptyComponent={listError?<ErrorBanner text={listError} onRetry={()=>void openCat(cat)}/>:items?<Text style={{color:c.muted,textAlign:'center',paddingVertical:30}}>Nada aqui ainda.</Text>:<Skeleton/>}
    ListFooterComponent={page?<Button title="Mostrar mais" secondary onPress={()=>void openCat(cat,true)}/>:null}
    renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={'Abrir '+item.name} onPress={()=>void open(item)} style={({pressed})=>({backgroundColor:pressed?c.card:c.surface,borderRadius:18,borderWidth:1,borderColor:c.line,padding:14,flexDirection:'row',gap:12,alignItems:'center'})}>
     <View style={{width:36,height:36,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}>{opening===item.id?<Spinner size={18}/>:<Icon name={ICONS[cat.key]||'clip'} color={c.accent} size={18}/>}</View>
     <View style={{flex:1,gap:3}}><Text style={{color:c.text,fontSize:16,fontWeight:'500'}} numberOfLines={2}>{item.name}</Text><Text style={{color:c.muted,fontSize:12}} numberOfLines={2}>{[item.origin,fileSize(item.size),when(item.modified)].filter(Boolean).join(' · ')}</Text></View>
     {item.deletable?<IconButton name="trash" label={'Apagar '+item.name} size={38} onPress={()=>remove(item)}/>:<Icon name="send" color={c.muted} size={16}/>}</Pressable>}/>
  :<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:18,paddingTop:6,gap:14,paddingBottom:40}}>
   <Text style={{color:c.muted,fontSize:13,lineHeight:20}}>Ficam numa área oculta do seu Google Drive, que só a Sofia acessa. Não aparecem no Drive, então ninguém apaga sem querer.</Text>
   {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}
   {notice?<View style={{backgroundColor:notice.tone==='danger'?c.dangerBg:c.accentSoft,borderRadius:16,padding:14}}><Text style={{color:notice.tone==='danger'?c.danger:c.text,fontSize:13,lineHeight:19}}>{notice.text}</Text></View>:null}
   {!summary&&!error?<Skeleton rows={6}/>:null}
   {summary?<>
    <View style={{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.line,padding:16,gap:10,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
     <View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}><Text style={{color:c.text,fontSize:14,fontWeight:'500'}}>{summary.quota&&summary.quota.limit?'Drive: '+fileSize(summary.quota.usage)+' de '+fileSize(summary.quota.limit):'Espaço do Drive'}</Text><Text style={{color:c.muted,fontSize:13}}>Sofia: {fileSize(total)}</Text></View>
     {summary.quota&&summary.quota.limit?<View style={{height:8,borderRadius:8,backgroundColor:c.line,overflow:'hidden'}}><View style={{width:`${Math.min(100,Math.round(summary.quota.usage/summary.quota.limit*100))}%`,height:8,backgroundColor:c.accent,borderRadius:8}}/></View>:null}
    </View>
    {summary.categories.map(k=><Pressable key={k.key} accessibilityRole="button" accessibilityLabel={k.label+', '+k.count+' arquivos'} onPress={()=>void openCat(k)} style={({pressed})=>({backgroundColor:pressed?c.card:c.surface,borderRadius:18,borderWidth:1,borderColor:c.line,padding:14,flexDirection:'row',gap:12,alignItems:'center'})}>
     <View style={{width:36,height:36,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={ICONS[k.key]||'clip'} color={c.accent} size={18}/></View>
     <View style={{flex:1,gap:3}}><Text style={{color:c.text,fontSize:16,fontWeight:'500'}}>{k.label}</Text><Text style={{color:c.muted,fontSize:12,lineHeight:17}}>{k.hint}</Text></View>
     <View style={{alignItems:'flex-end',gap:2}}><Text style={{color:c.text,fontSize:14,fontWeight:'500'}}>{k.count}</Text><Text style={{color:c.muted,fontSize:11}}>{fileSize(k.bytes)}</Text></View>
     <Icon name="chevron" color={c.muted} size={16}/></Pressable>)}
    <View style={{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.line,padding:16,gap:12,marginTop:4,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
     <Text style={{color:c.text,fontSize:18,fontWeight:'500'}}>Cópia visível no Drive</Text>
     <Text style={{color:c.muted,fontSize:13,lineHeight:19}}>Cria uma pasta normal no seu Drive com uma cópia dos tipos marcados. Ela aparece também nos computadores com o Google Drive instalado.</Text>
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{summary.categories.map(k=>{const on=!!picked?.includes(k.key);return <Pressable key={k.key} accessibilityRole="checkbox" accessibilityState={{checked:on}} onPress={()=>setPicked(p=>{const cur=p||[];return on?cur.filter(x=>x!==k.key):[...cur,k.key];})} style={{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:8,paddingHorizontal:12,borderRadius:99,borderWidth:1,borderColor:on?c.accent:c.line,backgroundColor:on?c.accentSoft:'transparent'}}>{on?<Icon name="check" color={c.accent} size={14}/>:null}<Text style={{color:on?c.text:c.muted,fontSize:13}}>{k.label}</Text></Pressable>;})}</View>
     {exp&&exp.state==='running'?<View style={{gap:8}}><Text style={{color:c.text,fontSize:13}}>Copiando: {exp.done} de {exp.total}…</Text><View style={{height:6,borderRadius:6,backgroundColor:c.line,overflow:'hidden'}}><View style={{width:`${exp.total?Math.round(exp.done/exp.total*100):0}%`,height:6,backgroundColor:c.accent}}/></View></View>
      :<Button title="Exportar cópia para o Drive" loading={exporting} onPress={startExport}/>}
     {exp&&exp.state==='done'?<View style={{gap:6}}><Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Última cópia: {exp.done} {exp.done===1?'arquivo':'arquivos'}{exp.failed?' ('+exp.failed+' com erro)':''} em "{exp.folder_name}".</Text>{exp.link?<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(exp.link)}><Text style={{color:c.accent,fontSize:13,fontWeight:'500'}}>Abrir a pasta no Drive</Text></Pressable>:null}</View>:null}
     {exp&&exp.state==='error'?<Text style={{color:c.danger,fontSize:12}}>A cópia parou: {exp.error}</Text>:null}
    </View>
   </>:null}
  </ScrollView>}
 </View></MotionModal>;
}
