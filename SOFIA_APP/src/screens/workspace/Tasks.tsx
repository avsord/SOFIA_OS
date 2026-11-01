import {openMore} from '../../components/AppKit';
import {useDesktop} from '../../lib/desktop';
import {Presence} from '../../components/Presence';
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
import {Button,Empty,ErrorBanner,IconButton,ModuleHeader,ScreenTitle,forms,DeskTabs} from '../../components/UI';
import {Spinner,LoadingLines} from '../../components/Loading';
import {appAlert} from '../../lib/app-alert';
// 0.3.263: parte de Workspace (ver src/screens/Workspace.tsx).
import {Input} from './core';
export function Tasks({api,onBack,active,areas,onDiscussTask}:{onDiscussTask?:(task:Task)=>void;api:SofiaApi;onBack:()=>void;active:boolean;areas:string[]}){const deskNoBack=useDesktop();const [stateTab,setStateTab]=React.useState<'todo'|'scheduled'|'done'>('todo');
 const pad=useColumnPad(); // 0.3.254 (computador): busca e filtros alinhados a coluna
 // 0.3.263 (fase 3 — listas): no computador largo os cartoes ficam em duas colunas (menos caminho para o olho)
 const {width:listWinW}=useWindowDimensions(),listCols=1 /* 0.3.273: no computador a lista vira uma caixa so com divisorias (padrao aprovado), uma coluna */;
 const c=useTheme(),[items,setItems]=useState<Task[]>([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<Partial<Task>|null>(null),[saving,setSaving]=useState(false),[query,setQuery]=useState(''),[areaFilter,setAreaFilter]=useState(''),[priorityFilter,setPriorityFilter]=useState(''),[quick,setQuick]=useState<Task|null>(null);
 const requestId=useRef(0);
 async function load(manual=false){const id=++requestId.current;if(manual)setRefreshing(true);try{const result=await api.tasks();if(id!==requestId.current)return;setItems(result.items);setError('');}catch(e){if(id===requestId.current)setError(errorText(e));}finally{if(id===requestId.current){setLoading(false);setRefreshing(false);}}}
 // Prefetch once while Apps is mounted, then keep rows mounted across module visits.
 useVisibleLoad(()=>{void load();return()=>{requestId.current++;};},[api]);
 useVisibleLoad(()=>subscribeSystemChanged(owner=>{if(owner===api)void load();}),[api]);
 useVisibleLoad(()=>{if(active)void load();else setEditing(null);},[active]);
 const merge=(item:Task)=>{requestId.current++;setLoading(false);setRefreshing(false);setItems(previous=>previous.some(t=>t.id===item.id)?previous.map(t=>t.id===item.id?item:t):[item,...previous]);};
 async function save(){if(saving||!editing?.title?.trim())return;setSaving(true);setError('');try{if(!intervalValid(editing.start_at||editing.due_at,editing.end_at))throw Error('O fim precisa ser depois do início.');if(editing.end_at&&!await api.feature('task_intervals'))throw Error('O servidor ainda precisa ser atualizado para salvar início e fim das tarefas. Seus dados foram mantidos.');const result=await api.saveTask({...editing,area:editing.area?.trim()||'Pessoal',due_at:editing.due_at?new Date(editing.due_at.replace(' ','T')).toISOString():''});merge(result.item);setEditing(null);}catch(e){setError(errorText(e));}finally{setSaving(false);}}
 function removeTask(){
  if(!editing?.id||saving)return;const id=editing.id;
  appAlert('Excluir tarefa?','Esta ação também remove a tarefa do site.',[
   {text:'Cancelar',style:'cancel'},
   {text:'Excluir',style:'destructive',onPress:()=>{void(async()=>{setSaving(true);setError('');try{await api.deleteTask(id);requestId.current++;setItems(previous=>previous.filter(t=>t.id!==id));setEditing(null);}catch(e){setError(errorText(e));}finally{setSaving(false);}})();}}
  ]);
 }
 const areaOptions=[...new Set([...areas,...items.map(t=>t.area?.trim()||'Pessoal')])].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 // 0.3.263: a busca geral (Ctrl+K) abre a tarefa escolhida
 // a tarefa pedida fica guardada ate a lista carregar (a tela pode ainda estar baixando quando o pedido chega)
 useEffect(()=>{if(typeof window==='undefined'||!window.addEventListener)return;const tryOpen=()=>{const id=String((window as any).__sofiaOpenTask||'');if(!id)return;const t=items.find(x=>x.id===id);if(t){(window as any).__sofiaOpenTask='';setError('');setEditing({...t});}};tryOpen();const on=()=>tryOpen();window.addEventListener('sofia:open-task',on);return()=>window.removeEventListener('sofia:open-task',on);},[items]);
 // 0.3.255: Tarefas backlog - a que subiu para a agenda (estado "scheduled") sai daqui e vive na Agenda
 const [toAgenda,setToAgenda]=useState<Task|null>(null);
 const visible=filterTasks(items.filter(t=>deskNoBack?(stateTab==='done'?t.state==='done':stateTab==='scheduled'?t.state==='scheduled':t.state!=='scheduled'&&t.state!=='done'):t.state!=='scheduled'),{query,area:areaFilter,priority:priorityFilter});
 return <View style={{flex:1}}><ScreenTitle title="Tarefas" subtitle={(()=>{const open=items.filter(t=>t.state!=='done'),imp=open.filter(t=>t.priority_level==='important');if(loading&&!items.length)return ' ';if(!open.length)return 'Tudo feito. Nenhuma tarefa em aberto.';return imp.length?(imp.length===1?'Uma tarefa importante em aberto: '+imp[0].title+'.':imp.length+' tarefas importantes em aberto; comece por '+imp[0].title+'.'):open.length+(open.length===1?' tarefa em aberto.':' tarefas em aberto, nenhuma marcada como importante.');})()} right={deskNoBack?<Button title="Nova tarefa" onPress={()=>{setError('');setEditing({title:'',state:'todo',priority_level:priorityFilter||'none',area:areaFilter||'Pessoal'});}}/>:<View style={{flexDirection:'row'}}><IconButton name="back" label="Voltar aos apps" onPress={onBack}/><IconButton name="plus" label="Nova tarefa" onPress={()=>{setError('');setEditing({title:'',state:'todo',priority_level:priorityFilter||'none',area:areaFilter||'Pessoal'});}}/></View>}/>
 {deskNoBack?<View style={{paddingHorizontal:22,paddingBottom:16,...pad(22)}}><DeskTabs value={stateTab} onChange={setStateTab} options={[{value:'todo',label:'A fazer',count:items.filter(t=>t.state!=='scheduled'&&t.state!=='done').length},{value:'scheduled',label:'Agendadas',count:items.filter(t=>t.state==='scheduled').length},{value:'done',label:'Feitas',count:items.filter(t=>t.state==='done').length}]}/></View>:null}
{deskNoBack?<ScrollView keyboardShouldPersistTaps="handled" testID="task-list" style={{flex:1}} contentContainerStyle={{paddingHorizontal:22,paddingBottom:40,gap:10,...pad(22)}}>
  {/* 0.3.276 (plano de design no site): busca + filtros discretos numa linha; tarefas agrupadas por prioridade, cada grupo numa caixa com divisorias */}
  <View style={{flexDirection:'row',alignItems:'center',gap:14}}>
   <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,borderRadius:10,borderWidth:1,borderColor:c.line,backgroundColor:c.surface}}><Icon name="search" size={15} color={c.muted}/><TextInput accessibilityLabel="Buscar tarefa" value={query} onChangeText={setQuery} placeholder="Buscar tarefa" placeholderTextColor={c.muted} style={{flex:1,color:c.text,fontSize:14,paddingVertical:9,outlineStyle:'none'} as any}/></View>
   <Pressable accessibilityRole="button" accessibilityLabel="Filtrar por área" onPress={e=>openMore(e,'Área',[{label:'Todas as áreas',run:()=>setAreaFilter('')},...areaOptions.map(v=>({label:v,run:()=>setAreaFilter(v)}))])}><Text style={{color:areaFilter?c.text:c.muted,fontSize:13}}>{areaFilter||'Todas as áreas'} ▾</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Filtrar por prioridade" onPress={e=>openMore(e,'Prioridade',[{label:'Todas as prioridades',run:()=>setPriorityFilter('')},...TASK_PRIORITIES.map(p=>({label:p.label,run:()=>setPriorityFilter(p.value)}))])}><Text style={{color:priorityFilter?c.text:c.muted,fontSize:13}}>{TASK_PRIORITIES.find(p=>p.value===priorityFilter)?.label||'Todas as prioridades'} ▾</Text></Pressable>
  </View>
  {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}
  {TASK_PRIORITIES.map(p=>{const list=visible.filter(t=>(t.priority_level||'none')===p.value);if(!list.length)return null;return <View key={p.value} style={{gap:8,marginTop:14}}>
   <View style={{flexDirection:'row',alignItems:'baseline',gap:8}}>{p.color?<View style={{width:8,height:8,borderRadius:4,backgroundColor:p.color}}/>:null}<Text style={{color:c.text,fontSize:16,fontWeight:'600'}}>{p.label}</Text><Text style={{color:c.muted,fontSize:13}}>{list.length}</Text></View>
   <View style={{borderRadius:12,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,overflow:'hidden'}}>{list.map((t,ti)=><View key={t.id} testID={'task-row-'+t.id} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:11,paddingHorizontal:14,borderTopWidth:ti?1:0,borderColor:c.line}}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{checked:t.state==='done'}} accessibilityLabel={(t.state==='done'?'Reabrir ':'Concluir ')+t.title} onPress={()=>{api.taskState(t,t.state==='done'?'todo':'done').then(r=>merge(r.item)).catch(e=>setError(errorText(e)));}} hitSlop={6} style={{width:18,height:18,borderRadius:9,borderWidth:1.5,borderColor:t.state==='done'?c.accent:c.muted,backgroundColor:t.state==='done'?c.accent:'transparent',alignItems:'center',justifyContent:'center'}}>{t.state==='done'?<Icon name="check" size={11} color={c.onAccent}/>:null}</Pressable>
    <Pressable accessibilityLabel={'Abrir tarefa '+t.title} onPress={()=>{setError('');setEditing({...t});}} {...contextMenu(()=>[{label:'Abrir',icon:'edit',run:()=>{setError('');setEditing({...t});}},{label:'Levar para a agenda',icon:'toAgenda',run:()=>setToAgenda(t)},{label:'Editar data e lembrete',icon:'alarm',run:()=>{setError('');setQuick(t);}},...(onDiscussTask?[{label:'Levar para a conversa',icon:'sofia' as const,run:()=>onDiscussTask(t)}]:[]),{label:'Apagar',icon:'trash',danger:true,run:()=>appAlert('Excluir tarefa?','Esta ação também remove a tarefa do app.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{void api.deleteTask(t.id).then(()=>{requestId.current++;setItems(prev=>prev.filter(x=>x.id!==t.id));}).catch(e=>setError(errorText(e)));}}])}])} style={{flex:1,minWidth:0,gap:2}}>
     <Text numberOfLines={1} style={{color:t.state==='done'?c.muted:c.text,fontSize:14,textDecorationLine:t.state==='done'?'line-through':'none'}}>{t.title}</Text>
     {t.due_at?<Text style={{color:c.muted,fontSize:12}}>{new Date(t.due_at).toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</Text>:null}
    </Pressable>
    <Text style={{color:c.muted,fontSize:12}}>{t.area?.trim()||'Pessoal'}</Text>
    {t.state!=='done'?<Pressable accessibilityRole="button" accessibilityLabel={'Levar para a agenda: '+t.title} onPress={()=>setToAgenda(t)} style={({hovered}:any)=>({width:30,height:30,borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:hovered?c.input:'transparent'})}><Icon name="toAgenda" size={17} color={c.muted}/></Pressable>:null}
   </View>)}</View>
  </View>;})}
  {loading&&!items.length?<View style={{borderRadius:14,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,padding:14,marginTop:14}}><LoadingLines rows={5}/></View>:null}
  {!visible.length&&!loading?<Empty icon="check" title={items.length?'Nenhuma tarefa neste filtro':'Sua lista começa aqui'} body={items.length?'Escolha outra área ou prioridade, ou limpe a busca.':'Use o botão Nova tarefa para criar a primeira.'}/>:null}
 </ScrollView>:<> <View style={{paddingHorizontal:22,gap:10,paddingBottom:12,...pad(22)}}><TextInput accessibilityLabel="Buscar tarefa" value={query} onChangeText={setQuery} placeholder="Buscar tarefa" placeholderTextColor={c.muted} style={[forms.input,{color:c.text,borderColor:c.line}]}/><View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Choice label="Filtrar por área" value={areaFilter} onChange={setAreaFilter} options={[{value:'',label:'Todas as áreas'},...areaOptions.map(value=>({value,label:value}))]}/></View><View style={{flex:1}}><Choice label="Filtrar por prioridade" value={priorityFilter} onChange={setPriorityFilter} options={[{value:'',label:'Todas as prioridades'},...TASK_PRIORITIES.map(p=>({value:p.value,label:p.label}))]}/></View></View><Text accessibilityLabel="Contagem de tarefas" style={{color:c.muted,fontSize:12}}>{visible.length} de {items.length} tarefas</Text></View>
 {error?<ErrorBanner text={error} onRetry={()=>void load()}/>:null}<FlatList testID="task-list" data={visible} keyExtractor={item=>item.id} numColumns={listCols} key={'task-cols-'+listCols} columnWrapperStyle={listCols>1?{gap:12}:undefined}
 initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5}
 updateCellsBatchingPeriod={50} removeClippedSubviews={false}
 onScroll={noteFluencyMovement} scrollEventThrottle={100} style={{flex:1}}
 contentContainerStyle={{padding:22,paddingTop:0,...pad(22)}} // no computador a lista ja vem centrada na coluna (mesma margem da busca e dos filtros)
 refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)}/>}
 ItemSeparatorComponent={deskNoBack?undefined:()=><View style={{height:10}}/>}
 renderItem={({item:t,index:ti})=><View testID={'task-row-'+t.id} key={t.id} style={deskNoBack?{flex:1,flexDirection:'row',alignItems:'flex-start',gap:8,backgroundColor:c.surface,paddingVertical:6,paddingHorizontal:10,borderColor:c.line,borderLeftWidth:1,borderRightWidth:1,borderTopWidth:1,...(ti===0?{borderTopLeftRadius:12,borderTopRightRadius:12}:null),...(ti===visible.length-1?{borderBottomWidth:1,borderBottomLeftRadius:12,borderBottomRightRadius:12}:null)}:{flex:1,flexDirection:'row',alignItems:'flex-start',gap:8,borderRadius:18,backgroundColor:c.surface,padding:12,borderWidth:1,borderColor:c.line,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}><Pressable testID={'task-to-agenda-'+t.id} onPress={()=>{if(t.state==='done'){api.taskState(t,'todo').then(r=>merge(r.item)).catch(e=>setError(errorText(e)));return;}setToAgenda(t);}} accessibilityRole="button" accessibilityLabel={t.state==='done'?'Reabrir '+t.title:'Levar para a agenda: '+t.title} style={{minWidth:42,minHeight:42,paddingTop:9,alignItems:'center',justifyContent:'flex-start'}}><Icon name={t.state==='done'?'check':'toAgenda'} color={c.accent}/></Pressable><Pressable onLongPress={()=>onDiscussTask&&appAlert(t.title,'Opções da tarefa',[{text:'Levar para conversa',onPress:()=>onDiscussTask(t)},{text:'Editar data e lembrete',onPress:()=>{setError('');setQuick(t);}},{text:'Cancelar',style:'cancel'}])} {...contextMenu(()=>[
 {label:'Abrir',icon:'edit',run:()=>{setError('');setEditing({...t});}},
 ...(t.state==='done'?[{label:'Reabrir',icon:'undo' as const,run:()=>{api.taskState(t,'todo').then(r=>merge(r.item)).catch(e=>setError(errorText(e)));}}]:[{label:'Levar para a agenda',icon:'toAgenda' as const,run:()=>setToAgenda(t)},{label:'Concluir',icon:'check' as const,run:()=>{api.taskState(t,'done').then(r=>merge(r.item)).catch(e=>setError(errorText(e)));}}]),
 {label:'Editar data e lembrete',icon:'alarm',run:()=>{setError('');setQuick(t);}},
 ...(onDiscussTask?[{label:'Levar para a conversa',icon:'sofia' as const,run:()=>onDiscussTask(t)}]:[]),
 {label:'Apagar',icon:'trash',danger:true,run:()=>appAlert('Excluir tarefa?','Esta ação também remove a tarefa do site.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{void api.deleteTask(t.id).then(()=>{requestId.current++;setItems(prev=>prev.filter(x=>x.id!==t.id));}).catch(e=>setError(errorText(e)));}}])},
])} accessibilityLabel={'Abrir tarefa '+t.title} onPress={()=>{setError('');setEditing({...t});}} style={{flex:1,gap:6,paddingVertical:10}}><Text style={{fontSize:16,color:c.text,textDecorationLine:t.state==='done'?'line-through':'none'}}>{t.title}</Text>{t.description?<TaskDescription text={t.description} document={t.description_document} lines={2}/>:null}<Text style={{fontSize:11,color:c.muted}}>{t.area?.trim()||'Pessoal'}{t.due_at?' · '+new Date(t.due_at).toLocaleDateString('pt-BR'):''}</Text><TaskPriority task={t}/></Pressable><View style={{alignSelf:'center'}}><Icon name="edit" color={c.muted} size={18}/></View></View>}
 ListFooterComponent={<>
 {!visible.length&&!loading?<><Empty icon="check" title={items.length?'Nenhuma tarefa neste filtro':'Sua lista começa aqui'} body={items.length?'Escolha outra área ou prioridade, ou limpe a busca.':tap('Toque no + para criar uma tarefa. Ela também aparece no site.')}/>{items.length?<Button title="Limpar filtros" secondary onPress={()=>{setQuery('');setAreaFilter('');setPriorityFilter('');}}/>:null}</>:null}</>}/></>}
 <Presence>{quick?<TaskQuickSchedule api={api} task={quick} onClose={()=>setQuick(null)} onSaved={t=>{merge(t);setQuick(null);}} onRemoved={id=>{requestId.current++;setItems(previous=>previous.filter(t=>t.id!==id));setQuick(null);}} onDetails={()=>{const t=quick;setQuick(null);setEditing({...t});}}/>:null}</Presence><Presence>{editing?<MotionModal visible animationType="none" onRequestClose={()=>{if(!saving)setEditing(null);}}><SafeAreaView style={{flex:1,backgroundColor:c.bg}}><ScrollView onScroll={noteFluencyMovement} scrollEventThrottle={100} keyboardShouldPersistTaps="always" contentContainerStyle={{padding:20,paddingTop:12,gap:18,flexGrow:1,backgroundColor:c.bg}}><ScreenTitle title={editing.id?'Editar tarefa':'Nova tarefa'} right={<View style={{flexDirection:'row'}}>{editing.id?<IconButton name="trash" label="Excluir tarefa" disabled={saving} onPress={removeTask}/>:null}<IconButton name="close" label="Fechar" disabled={saving} onPress={()=>setEditing(null)}/></View>}/>{error?<ErrorBanner text={error}/>:null}<Input label="Título" value={editing.title??''} onChange={v=>setEditing(t=>({...t,title:v}))}/><TaskDescriptionEditor disabled={saving} text={editing.description||''} document={editing.description_document} onChange={(description,description_document)=>setEditing(t=>({...t,description,description_document}))}/><DateTimeField label="Início" value={editing.start_at||editing.due_at||''} onChange={v=>setEditing(t=>({...t,start_at:v,due_at:v}))}/><DateTimeField label="Fim" value={editing.end_at||''} onChange={v=>setEditing(t=>({...t,end_at:v}))}/><View style={{gap:7}}><Text style={[forms.label,{color:c.muted}]}>ÁREA</Text><Choice creatable label="Área da tarefa" value={editing.area??''} onChange={v=>setEditing(t=>({...t,area:v}))} options={areaOptions.map(value=>({value,label:value}))}/><Text style={{color:c.muted,fontSize:11,lineHeight:17}}>Escolha uma área existente ou pesquise e crie uma nova. Ao salvar a tarefa, a nova área passa a aparecer também no filtro.</Text></View><Choice label="Prioridade" value={taskPriority(editing).value} onChange={v=>setEditing(t=>({...t,priority_level:v}))} options={TASK_PRIORITIES.map(p=>({value:p.value,label:p.label}))}/><Button title="Salvar tarefa" loading={saving} onPress={()=>void save()}/>{editing.id?<Button title="Excluir tarefa" secondary disabled={saving} onPress={removeTask}/>:null}</ScrollView></SafeAreaView></MotionModal>:null}</Presence><Presence>{toAgenda?<TaskToAgendaSheet api={api} task={toAgenda} onClose={()=>setToAgenda(null)} onSaved={t=>{setToAgenda(null);merge(t);}}/>:null}</Presence></View>;
}