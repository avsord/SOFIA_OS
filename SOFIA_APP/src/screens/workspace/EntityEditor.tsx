import {noteFluencyMovement} from '../../lib/fluency';
import {PALETTE} from '../../lib/palette';
import {contextMenu} from '../../components/ContextMenu';
import {rightClick} from '../../lib/web-page';
import {TaskLinkPanel,saveEventAsTask,type TaskLink} from '../../components/TaskLinkPanel';
import {TaskToAgendaSheet} from '../../components/TaskToAgendaSheet';
import {LIBRARY_BASE_KINDS,hasNoteCategory,noteCategories,noteCategoryOptions} from '../../lib/note-categories';
import {AppGrid,AppGridSkeleton} from '../../components/AppGrid';
import {APP_ORDER_KEY,orderApps} from '../../lib/app-order';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {TaskQuickSchedule} from '../../components/TaskQuickSchedule';
import {AlarmModeField,RemindersField} from '../../components/RemindersField';
import {useRenderCost} from '../../lib/render-cost';
import {useVisibleLoad} from '../../lib/visible-load';
import {TaskDescription,TaskDescriptionEditor} from '../../components/TaskDescription';
import {Capsules} from '../Capsules';
import {Routines} from '../Routines';
import {Reminders} from '../Reminders';
import {Packages} from '../Packages';
import {NoteEditor} from '../../components/NoteEditor';
import {Choice} from '../../components/Choice';
export {Choice} from '../../components/Choice';
import {Monitoring} from '../Monitoring';
import {Finance} from '../Finance';
import {Mail} from '../Mail';
import {ModuleSkeleton,useAfterFrame} from '../../components/ModuleSkeleton';
import {propertyOf,propertyTags,isProperty,organizationOptions} from '../../lib/library-organization';
import {LibraryAreaEditor,LibraryRecordEditor} from '../../components/LibraryAreaEditor';
import {AREA_PREFIX,isAreaRecord,memberArea,readArea,customFacets,filterCustom} from '../../lib/library-areas';
import type {LibraryArea} from '../../lib/library-areas';
import {RatingStars} from '../../components/RatingStars';
import {libraryRating,libraryTags,isLibraryMeta,filterLibrary,facetOptions,libraryPresentation,libraryTopic,LIBRARY_TOPIC_LIMIT,normalizeLibraryTag} from '../../lib/library-filters';
import {LIBRARY_ALL,LISTS_ALL,allRecordKinds,useWorkspaceRecords} from '../../lib/workspace-records';
import {REPEATS,readRepeat,agendaTags,isAgendaMeta} from '../../lib/agenda-recurrence';
import type {Repeat} from '../../lib/agenda-recurrence';
import {requestAgendaPermission} from '../../lib/agenda-notifications';
import {TASK_PRIORITIES,taskPriority,filterTasks} from '../../lib/task-filters';
import {TaskPriority} from '../../components/TaskPriority';
import {subscribeSystemChanged} from '../../lib/system-events';
import {MotionModal} from '../../components/MotionModal';
import {GoogleCalendarProperty} from '../../components/GoogleCalendarProperty';
import React,{useEffect,useLayoutEffect,useRef,useState,useMemo} from 'react';
import {useReturnToTop} from '../../lib/return-to-top';
import {View,Text,FlatList,TextInput,Pressable,Modal,Switch,Alert,RefreshControl,Linking,KeyboardAvoidingView,Platform,BackHandler,Dimensions,Animated,Easing,useWindowDimensions} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from '../../components/RevealScroll';
import {appModuleTitle,isDesktopWidth,tap,useColumnPad} from '../../lib/desktop';
import {SofiaApi} from '../../lib/api';
import {SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {DateTimeField} from '../../components/DateTimeField';
import {Sheet} from '../../components/Sheet';
import {intervalValid} from '../../lib/date-time';
import {InternalBackGesture} from '../../components/InternalBackGesture';
import {NotificationBell} from '../../components/NotificationCenter';
import type {Catalog,Definition,Entity,Field,Task,Tab} from '../../lib/types';
import {useTheme} from '../../lib/theme';
import {TagPicker} from '../../components/TagPicker';
import {LibraryTagManager} from '../../components/LibraryTagManager';
import {tagOptions} from '../../lib/library-tags';
import {errorText} from '../../lib/chat-model';
import {Icon,IconName} from '../../components/Icon';
import {Button,Empty,ErrorBanner,IconButton,ModuleHeader,ScreenTitle,forms} from '../../components/UI';
import {Spinner,LoadingLines} from '../../components/Loading';
import {appAlert} from '../../lib/app-alert';
// 0.3.263: parte de Workspace (ver src/screens/Workspace.tsx).
import {translated, Input, FieldInput} from './core';
export function EntityEditor({api,item,definition,areas,onClose,onSaved}:{api:SofiaApi;item:Partial<Entity>;definition:Definition;areas:string[];onClose:()=>void;onSaved:()=>void}){
 const c=useTheme(),insets=useSafeAreaInsets(),[title,setTitle]=useState(item.title||''),[content,setContent]=useState(item.content||''),[area,setArea]=useState(definition.group==='library'?(item.area&&areas.includes(item.area)?item.area:definition.label):(item.area||'Pessoal')),[privacy,setPrivacy]=useState(item.privacy||'private'),[state,setState]=useState(item.state||(item.kind==='monitor'?'active':definition.states[0])),[tags,setTags]=useState((item.tags||[]).filter(t=>!isAgendaMeta(t)&&!(definition.group==='library'&&(isLibraryMeta(t)||isProperty(t)))).join(', ')),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // 0.3.256: evento da Agenda pode virar tarefa (check + passa para o dia seguinte) e buscar/criar a tarefa
 const [taskLink,setTaskLink]=useState<TaskLink>({asTask:false,task:null});
 const [property,setProperty]=useState(propertyOf(item)||((definition.group==='library'&&item.area&&!areas.includes(item.area)&&!['Geral','Pessoal'].includes(item.area))?item.area:''));
 const [orgRecords,setOrgRecords]=useState<Entity[]>([]);
 useVisibleLoad(()=>{if(definition.group!=='library')return;let alive=true;api.libraryOrganization().then(result=>{if(alive)setOrgRecords(result.items);}).catch(()=>{});return()=>{alive=false;};},[api,definition.group]);
 const [data,setData]=useState<Record<string,any>>(()=>item.kind==='monitor'&&!item.id?{method:'product',currency:'BRL',interval_minutes:360,line_color:PALETTE.brandLight,discover:true,new_low:true,...item.data}:{...item.data});
 const [rating,setRating]=useState(libraryRating(item)),[topic,setTopic]=useState(libraryTopic(item));
 const library=definition.group==='library',presentation=libraryPresentation(item.kind||'');
 const [repeat,setRepeat]=useState<Repeat>(readRepeat(item).frequency),[notify,setNotify]=useState(!item.tags?.includes('sofia-notify-v1:off'));
 const isAppointment=['commitment','reminder'].includes(item.kind||'');
 // 05/11/2026: lista de áreas criadas pela pessoa (criar no próprio seletor; tirar da lista pelo ×)
 const [areaList,setAreaList]=useState<string[]>(()=>areas||[]);useEffect(()=>{setAreaList(areas||[]);},[areas]);
 const fields=definition.fields.filter(f=>!(item.kind==='monitor'&&data.method==='product'&&['target_id','feed_url','price_path','variant_path','currency_path','shipping_path','consent'].includes(f.key))&&!(isAppointment&&f.key==='priority_level')&&!(f as any).developerOnly&&!['calendar_provider','calendar_id','external_event_id','sync_state'].includes(f.key)&&!(data.calendar_all_day&&['start_at','end_at','remind_at'].includes(f.key))
  // 05/11/2026 (Pedro: janelas com bug): o "Dia inteiro" ja tem a chave propria no topo; as datas do dia inteiro so aparecem com ele ligado
  &&!(isAppointment&&f.key==='calendar_all_day')&&!(isAppointment&&!data.calendar_all_day&&['calendar_date_start','calendar_date_end'].includes(f.key)));
 const dayEnd=()=>{const value=data.calendar_date_end;return value?new Date(Date.parse(value+'T12:00:00Z')-86400000).toISOString().slice(0,10):data.calendar_date_start||'';};
 async function save(){if(busy||!title.trim())return;setBusy(true);setError('');try{const packed={...data};if(item.kind==='monitor'&&packed.method==='product'&&!packed.variant)packed.variant=title.trim();if(isAppointment&&repeat!=='none'&&packed.calendar_provider==='google'&&!await api.feature('calendar_recurrence'))throw Error('A sincronização desta série com o Google aguarda a atualização do servidor. Desative Google Agenda para salvar a repetição na Sofia.');if(isAppointment&&packed.calendar_all_day&&!definition.fields.some(f=>f.key==='calendar_all_day'))throw Error('Dia inteiro aguarda a atualização do servidor. O compromisso não foi alterado.');if(packed.calendar_all_day&&(!packed.calendar_date_start||!packed.calendar_date_end||packed.calendar_date_end<=packed.calendar_date_start))throw Error('Selecione o dia inicial e o último dia.');if(isAppointment&&!(packed.calendar_all_day?packed.calendar_date_start:packed.start_at||packed.remind_at||packed.due_at))throw Error('Selecione a data e o horário.');if(!intervalValid(packed.start_at,packed.end_at))throw Error('O fim precisa ser depois do início.');for(const f of definition.fields){const v=packed[f.key];if(f.type==='number'&&v!==''&&v!==undefined)packed[f.key]=Number(String(v).replace(',','.'));if(f.type==='datetime'&&v){const d=new Date(String(v).replace(' ','T'));if(!Number.isFinite(d.getTime()))throw new Error(f.label+': selecione uma data e horário válidos');packed[f.key]=d.toISOString();}}
 if(item.kind==='commitment'&&taskLink.asTask){if(packed.calendar_all_day)throw Error('Como tarefa, o evento precisa de dia e horário: desligue Dia inteiro.');if(repeat!=='none')throw Error('Como tarefa, o evento não repete: deixe Repetição em Não repetir.');if(!packed.start_at)throw Error('Selecione o dia e o horário.');await saveEventAsTask(api,{title,startIso:packed.start_at,description:content,priority:packed.priority_level,area,task:taskLink.task});if(item.id)await api.deleteEntity(item.id);onSaved();return;}
 await api.saveEntity({...item,title:title.trim(),content,area,state,privacy,tags:isAppointment?agendaTags(tags.split(',').map(x=>x.trim()).filter(Boolean),repeat,readRepeat(item).timeZone,notify):library?propertyTags(libraryTags(tags.split(',').map(x=>x.trim()).filter(Boolean),rating,presentation.key?'':topic),property):tags.split(',').map(x=>x.trim()).filter(Boolean),data:packed});if(isAppointment&&notify)await requestAgendaPermission().catch(()=>false);onSaved();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 function remove(){appAlert('Excluir registro?',`“${item.title}” será removido também do site.`,[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{setBusy(true);api.deleteEntity(item.id!).then(onSaved).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}]);}
 return <MotionModal visible animationType="slide" onRequestClose={()=>{if(!busy)onClose();}}><KeyboardAvoidingView style={{flex:1,backgroundColor:c.bg}} behavior={Platform.OS==='ios'?'padding':undefined}><View style={{paddingTop:insets.top+12,paddingBottom:10,flexDirection:'row',alignItems:'center',paddingHorizontal:12,borderBottomWidth:1,borderColor:c.line}}><IconButton name="close" label="Fechar editor" onPress={onClose} disabled={busy}/><Text numberOfLines={1} style={{flex:1,fontWeight:'600',fontSize:18,color:c.text}}>{item.id?'Editar':'Criar'} · {definition.label}</Text>{item.id?<IconButton name="trash" label="Excluir registro" onPress={remove} disabled={busy}/>:null}</View><ScrollView onScroll={noteFluencyMovement} scrollEventThrottle={100} keyboardShouldPersistTaps="always" contentContainerStyle={{padding:22,gap:18,paddingBottom:35}}>{error?<ErrorBanner text={error}/>:null}<Input label="Título" value={title} onChange={setTitle}/><Input label="Descrição" value={content} onChange={setContent} multiline/>{library?<><RatingStars value={rating} onChange={setRating} label={presentation.rating}/>{!presentation.key?<TagPicker label={presentation.facet} value={topic} onChange={setTopic} maxLength={LIBRARY_TOPIC_LIMIT} options={tagOptions(orgRecords.filter(e=>e.kind===item.kind))}/>:null}</>:null}{item.kind==='commitment'?<TaskLinkPanel api={api} value={taskLink} onChange={setTaskLink} onPick={(t,task)=>{setTitle(t);if(task?.description&&!content.trim())setContent(task.description);if(task?.priority_level&&task.priority_level!=='none')setData(d=>({...d,priority_level:task.priority_level}));}}/>:null}{isAppointment?<><Choice label="Prioridade" value={data.priority_level||'none'} onChange={v=>setData(d=>({...d,priority_level:v}))} options={TASK_PRIORITIES.map(p=>({value:p.value,label:p.label}))}/><View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text}}>Dia inteiro</Text><Switch accessibilityLabel="Dia inteiro" value={!!data.calendar_all_day} onValueChange={v=>setData(d=>({...d,calendar_all_day:v,calendar_date_start:d.calendar_date_start||new Date(d.start_at||Date.now()).toISOString().slice(0,10),calendar_date_end:d.calendar_date_end||new Date(Date.parse(d.start_at||new Date().toISOString())+86400000).toISOString().slice(0,10)}))}/></View>{item.kind==='commitment'?<View style={{gap:6}}><Text style={{color:c.muted,fontSize:12}}>Repetição</Text><Choice label="Repetir compromisso" value={repeat} options={[...REPEATS]} onChange={v=>setRepeat(v as Repeat)}/>{repeat!=='none'?<Text style={{color:c.muted,fontSize:12}}>Alterações valem para toda a série.</Text>:null}</View>:null}<View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text}}>Notificar neste celular</Text><Switch accessibilityLabel="Notificar neste celular" value={notify} onValueChange={setNotify}/></View><GoogleCalendarProperty autoEnable={!item.id} api={api} value={data.calendar_provider==='google'} onChange={v=>setData(d=>({...d,calendar_provider:v?'google':'local'}))}/></>:null}{isAppointment?<>{data.calendar_all_day?<><DateTimeField dateOnly label="Dia inicial" value={data.calendar_date_start||''} onChange={v=>setData(d=>({...d,calendar_date_start:v}))}/><DateTimeField dateOnly label="Último dia (incluindo)" value={dayEnd()} onChange={v=>{if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z')))setData(d=>({...d,calendar_date_end:new Date(Date.parse(v+'T12:00:00Z')+86400000).toISOString().slice(0,10)}));}}/></>:null}{fields.map(f=>library&&f.key===presentation.key&&f.type!=='select'?<TagPicker key={f.key} label={presentation.facet} value={String(data[f.key]||'')} maxLength={f.max||1000} options={tagOptions(orgRecords.filter(e=>e.kind===item.kind))} onChange={v=>setData(d=>({...d,[f.key]:v}))}/>:item.kind==='commitment'&&f.key==='remind_minutes'?<RemindersField key={f.key} data={data} onChange={patch=>setData(d=>({...d,...patch}))}/>:(item.kind==='reminder'||item.kind==='commitment')&&f.key==='alarm_mode'?<AlarmModeField key={f.key} value={String(data.alarm_mode||'none')} onChange={v=>setData(d=>({...d,alarm_mode:v}))}/>:<FieldInput key={f.key} field={f} value={data[f.key]} onChange={v=>setData(d=>({...d,[f.key]:v}))} api={api}/>)}</>:null}<View><Text style={[forms.label,{color:c.muted}]}>Estado</Text><Choice label="Estado" value={state} options={definition.states.map(v=>({value:v,label:translated(v)}))} onChange={setState}/></View><View><Text style={[forms.label,{color:c.muted}]}>Área</Text><Choice label="Área" creatable value={area} options={[...new Set([area,...areaList,...(library?organizationOptions(orgRecords,'area'):[])].filter(Boolean))].map(v=>({value:v,label:v}))} onChange={setArea}
 emptyHint="Suas áreas aparecem aqui. Digite um nome para criar uma nova." onCreate={v=>{setAreaList(l=>l.includes(v)?l:[...l,v]);void api.areaChange({add:v}).then(r=>setAreaList(r.areas)).catch(()=>{});}} onRemove={v=>{setAreaList(l=>l.filter(x=>x!==v));void api.areaChange({remove:v}).then(r=>setAreaList(r.areas)).catch(()=>{});}}/>{library?<View style={{marginTop:18,gap:6}}><Text style={{color:c.muted,fontSize:12}}>Propriedade · marca, projeto ou pessoa de referência</Text><Choice creatable label="Propriedade" value={property} options={[{value:'',label:'Sem propriedade'},...organizationOptions(orgRecords,'property').map(value=>({value,label:value}))]} onChange={setProperty}/></View>:null}</View><View><Text style={[forms.label,{color:c.muted}]}>Privacidade</Text><Choice label="Privacidade" value={privacy} options={(definition.private?['private','local']:['private','local','shared']).map(v=>({value:v,label:translated(v)}))} onChange={setPrivacy}/></View><Input label="Etiquetas separadas por vírgula" value={tags} onChange={setTags}/>{!isAppointment?<>{data.calendar_all_day?<><DateTimeField dateOnly label="Dia inicial" value={data.calendar_date_start||''} onChange={v=>setData(d=>({...d,calendar_date_start:v}))}/><DateTimeField dateOnly label="Último dia (incluindo)" value={dayEnd()} onChange={v=>{if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z')))setData(d=>({...d,calendar_date_end:new Date(Date.parse(v+'T12:00:00Z')+86400000).toISOString().slice(0,10)}));}}/></>:null}{fields.map(f=>library&&f.key===presentation.key&&f.type!=='select'?<TagPicker key={f.key} label={presentation.facet} value={String(data[f.key]||'')} maxLength={f.max||1000} options={tagOptions(orgRecords.filter(e=>e.kind===item.kind))} onChange={v=>setData(d=>({...d,[f.key]:v}))}/>:item.kind==='commitment'&&f.key==='remind_minutes'?<RemindersField key={f.key} data={data} onChange={patch=>setData(d=>({...d,...patch}))}/>:(item.kind==='reminder'||item.kind==='commitment')&&f.key==='alarm_mode'?<AlarmModeField key={f.key} value={String(data.alarm_mode||'none')} onChange={v=>setData(d=>({...d,alarm_mode:v}))}/>:<FieldInput key={f.key} field={f} value={data[f.key]} onChange={v=>setData(d=>({...d,[f.key]:v}))} api={api}/>)}</>:null}<Text style={{fontSize:12,color:c.muted,lineHeight:19}}>As alterações usam o mesmo registro do site. Se ele mudar em outro dispositivo, reabra antes de salvar.</Text><Button title="Salvar alterações" loading={busy} disabled={!title.trim()} onPress={()=>void save()}/></ScrollView></KeyboardAvoidingView></MotionModal>;
}