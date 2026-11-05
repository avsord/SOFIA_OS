import {focusTask} from '../lib/task-focus';
import {HomeBrief,HomeBriefSkeleton,briefLine,homeZoom,type QuickEdit,type MuteTarget,type TimeMark,type Move,type AddKind,type MiniSave,type SofiaBridge} from '../desktop/HomeBrief';
import {withMove,doseFrom} from '../lib/timeline-move';
import {expandForHome} from '../lib/agenda-recurrence';
import {sendDraft,useDraft} from '../lib/draft-bus';
import {agendaTags} from '../lib/agenda-recurrence';
import {SITE,saveEarlyPaths} from '../lib/api';
import {attachmentMime,attachmentText} from '../lib/chat-attachments';
import {attachmentBase64} from '../lib/attachment-read';
import {receiveTx} from './finance/Home';
import {useHomeBriefData} from '../lib/home-brief';
import {dpx} from '../lib/content-width';
import {Presence} from '../components/Presence';
import {noteFluencyMovement} from '../lib/fluency';
import {HomeHero, INTRO, INTRO_T, introAnim} from '../components/HomeHero';
import {DaySummaryCard,DeskTasksCard,DeskCapsulesCard,daySentence,HomeDeskSkeleton} from '../desktop/HomeDeskCards';
import {useNotifications} from '../components/NotificationCenter';
import {rightClick} from '../lib/web-page';
import {useValuesHidden} from '../lib/values-mask';
import {msToMidnight,overdueScheduled} from '../lib/task-rollover';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFinanceGoal} from './finance/Goal'; // 0.3.263: so a parte da Meta (o Inicio nao carrega Financas inteira)
import {GoalProgressCard} from '../components/GoalProgress';
import {TaskQuickSchedule} from '../components/TaskQuickSchedule';
import {fuzzyFilter} from '../lib/fuzzy';
import {useReturnToTop} from '../lib/return-to-top';
import {useRenderCost} from '../lib/render-cost';
import {readHomeRows} from '../lib/home-rows';
import {scheduleIdleTask} from '../lib/idle-task';
import {ProfileAvatar} from '../components/ProfileAvatar';
import {DeferredScreen,loadEntityEditor,loadHomeCommitmentEditor,loadHomeTaskDetails} from '../lib/screen-loader';
import type {Catalog} from '../lib/types';
import {CapsuleWidget} from '../components/CapsuleWidget';
import {PackagesWidget,RemindersWidget} from '../components/HomeListWidgets';
import {useAgendaMonth} from '../lib/use-agenda-month';

import {TASK_PRIORITIES,taskPriority} from '../lib/task-filters';
import {Sheet} from '../components/Sheet';
import {TaskPriority} from '../components/TaskPriority';
import {SortableWidgets} from '../components/SortableWidgets';
import React,{startTransition,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Alert,Animated,AppState,Easing,Platform,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View,TextInput,useWindowDimensions} from 'react-native';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import type {AgendaItem,Bootstrap,Entity,HomeData,Tab,Task} from '../lib/types';
import {dayRecords,observationPoints,stableProductColor,localDateKey} from '../lib/dashboard';
import type {DayRecord,PriceSeries} from '../lib/dashboard';
import {Brand,Empty,ErrorBanner,ScreenTitle} from '../components/UI';
import {Icon} from '../components/Icon';
import {NotificationBell} from '../components/NotificationCenter';
import {subscribeSystemChanged} from '../lib/system-events';
import {subscribeRecordRemoved} from '../lib/agenda-events';
import {MiniAgenda} from '../components/DashboardWidgets';
import {MonitorWidget} from '../components/MonitorWidget';
import {productsFrom,onCollector,collectorState} from '../lib/monitor-collector';
import {widgetRows,validWidgetRows,type MonitorWidgetRow} from '../lib/monitoring';
import {MONITOR_WIDGET_PATH} from '../lib/startup-snapshot';
import {readGoalWidget, writeGoalWidget} from '../lib/goal-widget';
import {appAlert} from '../lib/app-alert';
import {dashboardColumns,useDesktop} from '../lib/desktop';
export const HOME_WIDGET_IDS=['goal','monitoring','tasks','capsules','reminders','packages'];
/** 0.3.227: todos os widgets podem sair (a meta tambem). Listas antigas sem a meta recebem a meta no topo, a menos que a
 * pessoa tenha tirado (guardado no celular). A agenda e fixa, fora da lista. */
export const HOME_FIXED_WIDGETS:string[]=[];
export const GOAL_HIDDEN_KEY='sofia.home.goal.hidden.v1';
export function withFixedWidgets(order:string[],goalHidden=false):string[]{return goalHidden||order.includes('goal')?order:['goal',...order];}
/** 03/11/2026 (Pedro: "subir um pouco tudo da tela do inicio"): folga embaixo do Inicio no computador (antes 28). Entra no encaixe sem scroll. */
/** 03/11/2026: entrada suave do Inicio no computador (fade + 8 px). StyleSheet.create: o site so anima por ele. */
/* 04/11/2026 (Pedro: "depois de carregar da uma leve subida"): a entrada do Inicio comecava 8 px abaixo e subia; agora so
   aparece, sem mover (o esqueleto ja fica no mesmo lugar do conteudo) */
/** 04/11/2026 (Pedro: "Bom dia comecando bem maior no centro, com um zoom out suave"): tamanho inicial da saudacao */
const INTRO_SCALE=INTRO.scale,INTRO_LEAD=640;
// 05/11/2026 (Pedro: "o oval acaba no mesmo tempo que a segunda fileira termina"): fim da 2a fileira = rows + 1 intervalo + duracao da fileira
const GLOW_MS=INTRO_T.rows+INTRO.rowGap+INTRO.rowMs-INTRO_T.glow; /* = INTRO_T.move: quando a tela abre, a saudacao ja esta subindo (Pedro: "abre com o boa tarde parado") */
const HOME_ENTER=StyleSheet.create({blocks:{animationKeyframes:{'0%':{opacity:0},'100%':{opacity:1}},animationDuration:'480ms',animationDelay:'390ms',animationTimingFunction:'ease-out',animationFillMode:'both'} as any,out:{animationKeyframes:{'0%':{opacity:1},'100%':{opacity:0}},animationDuration:'320ms',animationTimingFunction:'ease-out',animationFillMode:'both'} as any,fit:{animationKeyframes:{'0%':{opacity:0},'100%':{opacity:1}},animationDuration:'520ms',animationDelay:'80ms',animationTimingFunction:'cubic-bezier(0.22,0.8,0.24,1)',animationFillMode:'both'} as any});
const DESK_HOME_BOTTOM=60,FIT_KEY='sofia.home.fit.v1';
export function Home({api,bootstrap,navigate,onOpenAgenda,active=true,launchVisible=true,onGestureLock,onOpenCapsules,onOpenMonitoring,onOpenTasks,onOpenModule,onDiscussTask,homeTopKey=0,homeTopSmooth=false}:{homeTopKey?:number;homeTopSmooth?:boolean;onOpenModule?:(id:string)=>void;onDiscussTask?:(task:Task)=>void;onOpenCapsules?:()=>void;onOpenMonitoring?:()=>void;onOpenTasks?:()=>void;onGestureLock?:(locked:boolean)=>void;api:SofiaApi;bootstrap:Bootstrap;navigate:(tab:Tab)=>void;onOpenAgenda?:(date:string,id?:string,create?:boolean)=>void;active?:boolean;launchVisible?:boolean}){useRenderCost('home');
 const [agendaDraft,setAgendaDraft]=useState<Partial<Entity>|null>(null),[agendaCatalog,setAgendaCatalog]=useState<Catalog|null>(()=>api.cached<Catalog>('/workspace/catalog')||null);
 // Catalog metadata is optional on launch. Keep cached areas synchronously,
 // then refresh after native Home is actually visible and the JS thread yields.
 useEffect(()=>{
  if(!active||!launchVisible||agendaCatalog)return;
  let alive=true;
  const cancel=scheduleIdleTask(()=>{void api.catalog().then(cat=>{if(alive)startTransition(()=>setAgendaCatalog(cat));}).catch(()=>{});});
  return()=>{alive=false;cancel();};
 },[api,active,launchVisible,agendaCatalog]);
 // 0.3.145: volta ao topo ainda escondido, depois de 10 s seguidos fora (ver return-to-top.ts).
 const homeScroll=useReturnToTop(active);
 // 0.3.223: tocar em Inicio na barra leva ao topo (suave se ja estava no Inicio)
 const topSeen=useRef(homeTopKey);useEffect(()=>{if(homeTopKey===topSeen.current)return;topSeen.current=homeTopKey;homeScroll.current?.scrollTo({y:0,animated:homeTopSmooth});},[homeTopKey,homeTopSmooth]);
 function createHomeCommitment(day:string){setAgendaDraft({kind:'commitment',title:'',data:{home_day:day}});}
 const [detail,setDetail]=useState<Task|null>(null),[detailOpen,setDetailOpen]=useState(false);
 const [detailEdit,setDetailEdit]=useState(false);
 const openTask=(task:Task)=>{setDetail(task);setDetailEdit(false);setDetailOpen(true);};
 const openTaskEditing=(task:Task)=>{setDetail(task);setDetailEdit(true);setDetailOpen(true);};
 const [priority,setPriority]=useState(''),[areaFilter,setAreaFilter]=useState(''),[filterOpen,setFilterOpen]=useState(false),[areaFilterOpen,setAreaFilterOpen]=useState(false);
 const [widgets,setWidgets]=useState(()=>(()=>{const w=api.cached<{widgets:string[]|null}>('/md/dashboard')?.widgets;return Array.isArray(w)?w.filter(x=>HOME_WIDGET_IDS.includes(x)):null;})()||['monitoring','tasks']),[dragging,setDragging]=useState(false);
 const c=useTheme(),[data,setData]=useState<HomeData|null>(()=>api.cached<HomeData>('/home')||null),[tasks,setTasks]=useState<Task[]>(()=>api.cached<{items:Task[]}>('/tasks')?.items||[]),[tasksReady,setTasksReady]=useState(()=>!!api.cached('/tasks')),[series,setSeries]=useState<MonitorWidgetRow[]|null>(()=>validWidgetRows(api.cached(MONITOR_WIDGET_PATH))),[seriesFailed,setSeriesFailed]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(''),[refreshEpoch,setRefreshEpoch]=useState(0);
 useEffect(()=>subscribeSystemChanged(owner=>{if(owner===api)setRefreshEpoch(x=>x+1);}),[api]);
 // 0.3.351: item apagado em qualquer tela sai da linha do tempo na hora (a releitura do servidor so confirma)
 const [gone,setGone]=useState<ReadonlySet<string>>(()=>new Set());
 useEffect(()=>subscribeRecordRemoved((owner,id)=>{if(owner!==api)return;setGone(prev=>{const next=new Set(prev);next.add(id);next.add('task:'+id);return next;});setTasks(prev=>prev.some(t=>t.id===id)?prev.filter(t=>t.id!==id):prev);}),[api]);
 useEffect(()=>{if(!refreshEpoch)return;let alive=true;void api.catalog().then(value=>{if(alive)setAgendaCatalog(value);}).catch(()=>{});return()=>{alive=false;};},[api,refreshEpoch]);
 const homeActive=useRef(active);homeActive.current=active;
 useEffect(()=>{let alive=true;async function load(){
 // Tasks may already be local while /home is slow or failing. Publish each
 // independent result immediately rather than holding both behind Promise.all.
 const results=await readHomeRows(api,home=>{if(alive)setData(home);},rows=>{if(alive){setTasks(rows);setTasksReady(true);}});
 if(!alive)return;
 const failure=results.find((r):r is PromiseRejectedResult=>r.status==='rejected');
 setRefreshing(false);setError(failure?errorText(failure.reason):'');if(failure)return;
 }void load();const timer=setInterval(()=>{if(homeActive.current&&AppState.currentState==='active')void load();},60000);const foreground=AppState.addEventListener('change',state=>{if(state==='active'&&homeActive.current)void load();});return()=>{alive=false;clearInterval(timer);foreground.remove();};},[api,refreshEpoch]);
 // Widget order comes from the encrypted launch snapshot. Refreshing its
 // metadata must not compete with Home tasks and the current Agenda month.
 useEffect(()=>{
  if(!launchVisible||!active)return;
  let alive=true;
  const cancel=scheduleIdleTask(()=>{void api.dashboardWidgets().then(r=>{if(alive)startTransition(()=>setWidgets(prev=>{const next=(Array.isArray(r.widgets)?r.widgets:['monitoring','tasks']).filter(x=>HOME_WIDGET_IDS.includes(x));return prev.length===next.length&&prev.every((x,i)=>x===next[i])?prev:next;}));}).catch(()=>{});});
  return()=>{alive=false;cancel();};
 },[api,refreshEpoch,launchVisible,active]);
 // Monitoring may involve many reads; it must not compete with the first usable frame.
 useEffect(()=>{if(!launchVisible)return;let alive=true;async function load(){try{const monitors:Entity[]=[];for(let offset=0;;offset+=100){const r=await api.entities('monitor','',offset);monitors.push(...r.items);if(r.items.length<100)break;}const result=await productsFrom(api,monitors);/* One broken monitor must not turn the whole Home into an error. */if(alive){setSeriesFailed(false);const rows=widgetRows(result);api.rememberLocal(MONITOR_WIDGET_PATH,rows);startTransition(()=>setSeries(rows));}}catch{/* Monitoring is secondary; Home, Agenda and Tasks stay usable. */if(alive)setSeriesFailed(true);}}const cancel=scheduleIdleTask(()=>{void load();});const timer=setInterval(()=>{if(homeActive.current&&AppState.currentState==='active')void load();},60000);const foreground=AppState.addEventListener('change',state=>{if(state==='active'&&homeActive.current)void load();});const stop=onCollector(()=>{if(!collectorState().running&&homeActive.current)void load();});return()=>{alive=false;cancel();clearInterval(timer);foreground.remove();stop();};},[api,refreshEpoch,launchVisible]);
 const [calendarDate,setCalendarDate]=useState(()=>new Date());
 const calendar=useAgendaMonth(api,calendarDate,active,launchVisible);
 const notGone=useCallback((list:AgendaItem[]|undefined)=>!gone.size||!list?list||[]:list.filter(e=>!gone.has(e.id)&&!gone.has(String((e.data as {task_id?:string}|undefined)?.task_id||''))),[gone]);
 const events=useMemo(()=>notGone(calendar.items),[calendar.items,notGone]);
 const calendarMonth=useCallback((month:Date)=>setCalendarDate(month),[]);
 useEffect(()=>{if(refreshEpoch)void calendar.refresh();},[refreshEpoch]);
 // 0.3.321: devolve se deu certo (o bloco Tarefas do Inicio confirma ou oferece tentar de novo)
 const tasksNow=useRef<Task[]>([]);tasksNow.current=tasks;
 async function toggle(task:Task):Promise<boolean>{if(saving)return false;setSaving(task.id);try{const fresh=tasksNow.current.find(x=>x.id===task.id);await api.taskState(fresh?{...task,revision:fresh.revision}:task,task.state==='done'?'todo':'done');setTasks((await api.tasks()).items);return true;}catch(e){setError(errorText(e));return false;}finally{setSaving('');}}
 const openAgenda=(day:string,id?:string)=>{if(onOpenAgenda)onOpenAgenda(day,id);else navigate('agenda');};
 // 0.3.255: tocar num compromisso do Inicio abre o proprio compromisso aqui (antes ia para a Agenda e de la para ele); voltar fecha e fica no Inicio
 const [valuesHidden,setValuesHidden]=useValuesHidden(api);
 // 0.3.255: check da tarefa na agenda do Inicio. Desmarcar devolve para a agenda (estado "scheduled").
 const toggling=useRef(new Set<string>());
 async function toggleAgendaTask(rec:DayRecord){const t=rec.original as Task;if(!t?.id||toggling.current.has(t.id))return;toggling.current.add(t.id);try{const fresh=tasks.find(x=>x.id===t.id)||t;const r=await api.taskSetState(fresh,fresh.state==='done'?'scheduled':'done');setTasks(prev=>prev.some(x=>x.id===r.item.id)?prev.map(x=>x.id===r.item.id?r.item:x):[...prev,r.item]);void calendar.refresh();}catch(e){setError(errorText(e));}finally{toggling.current.delete(t.id);}}
 // 0.3.255: tarefa da agenda que nao foi ticada passa para o dia seguinte a meia-noite (no mesmo horario)
 const [dayTick,setDayTick]=useState(()=>localDateKey(new Date()));
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const arm=()=>{timer=setTimeout(()=>{setDayTick(localDateKey(new Date()));arm();},msToMidnight());};arm();const sub=AppState.addEventListener('change',st=>{if(st==='active')setDayTick(localDateKey(new Date()));});return()=>{clearTimeout(timer);sub.remove();};},[]);
 const rolling=useRef(false),homeMounted=useRef(true);useEffect(()=>()=>{homeMounted.current=false;},[]);
 useEffect(()=>{if(!tasksReady||rolling.current)return;const list=overdueScheduled(tasks);if(!list.length)return;rolling.current=true;
  void (async()=>{const moved:Task[]=[];for(const {task,due,end} of list){try{const r=await api.saveTask({...task,due_at:due,start_at:due,end_at:end});moved.push(r.item);}catch{/* tenta de novo na proxima abertura */}}
   if(homeMounted.current&&moved.length){setTasks(prev=>prev.map(x=>moved.find(m=>m.id===x.id)||x));void calendar.refresh();}rolling.current=false;})();
 },[tasksReady,tasks,dayTick]);
 const [eventEdit,setEventEdit]=useState<Partial<Entity>|null>(null),eventOpening=useRef('');
 // 05/11/2026 (Pedro: "cliquei em mais opcoes de lembrete e demorou muito"): abre na hora com o que o Inicio ja tem (o tipo de
 // registros vem pre-carregado) e troca pela versao do servidor quando ela chega
 useEffect(()=>{if(Platform.OS!=='web'||agendaCatalog||!active)return;let live=true;void api.catalog().then(cat=>{if(live)setAgendaCatalog(cat);}).catch(()=>{});return()=>{live=false;};},[active,agendaCatalog,api]);
 async function openEvent(id:string,day:string,known?:any){if(eventOpening.current)return;eventOpening.current=id;try{
  const catP=agendaCatalog?Promise.resolve(agendaCatalog):api.catalog(),entP=api.entity(id);
  if(known&&known.kind&&agendaCatalog?.catalog[known.kind])setEventEdit(known);
  const [cat,entity]=await Promise.all([catP,entP]);if(!agendaCatalog)setAgendaCatalog(cat);
  if(entity&&cat.catalog[entity.kind])setEventEdit(cur=>!cur||cur.id===entity.id?entity:cur);else if(!(known&&agendaCatalog?.catalog[known.kind]))openAgenda(day,id);}catch(e){setError(errorText(e));}finally{eventOpening.current='';}}
 function itemDetails(item:DayRecord,edit=false){if(!item.isTask){if(item.original?.id)void openEvent(item.original.id,localDateKey(item.date),rawEvent(item.original));else openAgenda(localDateKey(item.date));return;}if(edit){setDetail(item.original as Task);setDetailEdit(true);setDetailOpen(true);return;} /* 05/11/2026: Mais opcoes da linha do tempo abre direto o painel de editar */openTask(item.original as Task);}
 const calendarRecords=useMemo(()=>dayRecords(expandForHome(events),tasks),[events,tasks]);
 // 0.3.296: o bloco Agenda do Inicio mostra TODOS os proximos compromissos (este mes e os dois seguintes), com rolagem
 const wideWebHome=Platform.OS==='web'&&typeof window!=='undefined'&&window.innerWidth>=1024;
 const calNext1=useAgendaMonth(api,new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1),active&&wideWebHome,false),calNext2=useAgendaMonth(api,new Date(calendarDate.getFullYear(),calendarDate.getMonth()+2,1),active&&wideWebHome,false);
 const futureRecords=useMemo(()=>dayRecords(expandForHome([...events,...notGone(calNext1.items),...notGone(calNext2.items)]),tasks),[events,calNext1.items,calNext2.items,tasks,notGone]);
 const areaOptions=useMemo(()=>[...new Set([...(agendaCatalog?.areas||[]),...tasks.map(t=>t.area?.trim()||'Pessoal'),...events.map(e=>(e as AgendaItem & {area?:string}).area?.trim()||'').filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'pt-BR')),[agendaCatalog,events,tasks]);
 const [taskQuery,setTaskQuery]=useState(''),[quick,setQuick]=useState<Task|null>(null);
 const first=bootstrap.profile.name.split(' ')[0],todo=useMemo(()=>fuzzyFilter([...tasks].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).filter(t=>!['done','cancelled'].includes(t.state)&&(!priority||taskPriority(t).value===priority)&&(!areaFilter||(t.area?.trim()||'Pessoal')===areaFilter)),taskQuery,t=>t.title+' '+(t.description||'')),[tasks,priority,areaFilter,taskQuery]);
 async function saveWidgets(next:string[]){const old=widgets;setWidgets(next);try{await api.saveDashboardWidgets(next);setError('');}catch(e){setWidgets(old);setError(errorText(e));throw e;}}
 // 0.3.240: "Meta escondida" tambem vem do ultimo estado (antes nascia false e a ordem mudava no meio); AsyncStorage fica so para quem ja tinha escondido antes
 const [goalHidden,setGoalHidden]=useState(()=>readGoalWidget(api).hidden);
 useEffect(()=>{AsyncStorage.getItem(GOAL_HIDDEN_KEY).then(v=>{const h=v==='1';setGoalHidden(h);writeGoalWidget(api,{hidden:h});}).catch(()=>{});},[api]);
 const saveHomeOrder=async(next:string[])=>{const hidden=!next.includes('goal');setGoalHidden(hidden);writeGoalWidget(api,{hidden});void AsyncStorage.setItem(GOAL_HIDDEN_KEY,hidden?'1':'0').catch(()=>{});await saveWidgets(next);};
 const goal=useFinanceGoal(api,active&&launchVisible);
 const lockWidgets=(locked:boolean)=>{setDragging(locked);onGestureLock?.(locked);};
 // 0.3.250 (computador): painel em colunas pela largura; sino e perfil ficam na barra de cima; Organizar por botao
 const desktop=useDesktop(),[homeWidth,setHomeWidth]=useState(0),[organizeKey,setOrganizeKey]=useState(0);
 const {width:winW,height:winH}=useWindowDimensions(); // 0.3.310: Inicio ampliado por igual em tela grande (homeZoom)
 // 0.3.320 (Pedro): em tela grande o espaco que sobra vai para CIMA (respiro antes da saudacao), nao para baixo - o Inicio encosta no pe como no notebook
 const [homeViewH,setHomeViewH]=useState(0),homeZ=homeZoom(winW,winH);
 const columns=desktop?dashboardColumns(homeWidth):1,wideHome=desktop&&(homeWidth?homeWidth>=980:winW-260>=980); /* 04/11/2026: antes de medir (homeWidth 0) a tela grande mostrava o Inicio antigo por um instante ao abrir o site (a "flikada"); estima pela janela menos a lateral */
 const notices=(()=>{try{return useNotifications();}catch{return null;}})();
 const homeItems=[...(goal?[{id:'goal',title:'Meta',content:<GoalProgressCard g={goal} compact masked={valuesHidden} onToggleMask={()=>setValuesHidden(!valuesHidden)} onPress={()=>onOpenModule?onOpenModule('finance'):navigate('apps')}/>}]:[]),{id:'capsules',title:'Rotina',content:<CapsuleWidget api={api} active={active} onOpen={()=>onOpenCapsules?onOpenCapsules():navigate('apps')}/>},{id:'reminders',title:'Lembretes',content:<RemindersWidget api={api} active={active} onOpen={()=>onOpenModule?onOpenModule('reminders'):navigate('apps')}/>},{id:'packages',title:'Encomendas',content:<PackagesWidget api={api} active={active} onOpen={()=>onOpenModule?onOpenModule('packages'):navigate('apps')}/>},{id:'monitoring',title:'Price Tracker',content:<MonitorWidget rows={series} failed={seriesFailed} onOpen={()=>onOpenMonitoring?onOpenMonitoring():navigate('apps')}/>},{id:'tasks',title:'Tarefas',content:<><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:0,marginBottom:12}}><Text style={{fontSize:20,fontWeight:'500',color:c.text}}>Tarefas</Text><View style={{flexDirection:'row',alignItems:'center',gap:6}}><Pressable accessibilityRole="button" accessibilityLabel="Filtrar áreas das tarefas do Início" onPress={()=>setAreaFilterOpen(true)} style={{paddingHorizontal:9,paddingVertical:7,borderRadius:14,backgroundColor:c.accentSoft}}><Text numberOfLines={1} style={{fontSize:11,color:c.accent,maxWidth:90}}>{areaFilter||'Áreas'} ▾</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Filtrar níveis das tarefas do Início" onPress={()=>setFilterOpen(true)} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:14,backgroundColor:c.accentSoft}}><Text style={{fontSize:11,color:c.accent}}>{TASK_PRIORITIES.find(p=>p.value===priority)?.label||'Todas'} ▾</Text></Pressable><Text accessibilityLabel="Total de tarefas no Início" style={{color:c.muted}}>{todo.length}</Text></View></View>{!tasksReady?<Text accessibilityRole="progressbar" style={{color:c.muted,padding:16,fontSize:13}}>Sincronizando tarefas…</Text>:todo.length||(tasks.length>2||taskQuery)?<View style={{backgroundColor:c.surface,borderRadius:18,paddingHorizontal:14,borderWidth:1,borderColor:c.line,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>{(tasks.length>2||taskQuery)?<TextInput accessibilityLabel="Buscar tarefa no Início" value={taskQuery} onChangeText={setTaskQuery} placeholder="🔍 Buscar tarefa" placeholderTextColor={c.muted} returnKeyType="search" style={{color:c.text,backgroundColor:c.input,borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontSize:14,marginTop:14,marginBottom:6}}/>:null}{!todo.length?<Text style={{color:c.muted,fontSize:13,paddingVertical:16}}>Nenhuma tarefa com essa busca.</Text>:null}{todo.slice(0,8).map((task,i)=><View key={task.id} style={{flexDirection:'row',gap:12,alignItems:'center',paddingVertical:14,borderBottomWidth:i<Math.min(todo.length,8)-1?1:0,borderColor:c.line}}><Pressable disabled={!!saving} accessibilityRole="checkbox" accessibilityLabel={'Concluir '+task.title} accessibilityState={{checked:task.state==='done'}} onPress={()=>void toggle(task)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><View style={{width:22,height:22,borderWidth:1.5,borderColor:c.accent,borderRadius:7}}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={'Abrir tarefa '+task.title} onLongPress={()=>onDiscussTask&&appAlert(task.title,'Opções da tarefa',[{text:'Levar para conversa',onPress:()=>onDiscussTask(task)},{text:'Abrir detalhes',onPress:()=>openTask(task)},{text:'Cancelar',style:'cancel'}])} {...rightClick(()=>onDiscussTask&&appAlert(task.title,'Opções da tarefa',[{text:'Levar para conversa',onPress:()=>onDiscussTask(task)},{text:'Abrir detalhes',onPress:()=>openTask(task)},{text:'Cancelar',style:'cancel'}]))} onPress={()=>openTask(task)} style={{flex:1,gap:4,paddingVertical:6}}><Text style={{color:c.text,fontSize:14}}>{task.title}</Text><TaskPriority task={task}/>{task.due_at?<Text style={{color:c.muted,fontSize:11}}>{new Date(task.due_at).toLocaleString('pt-BR')}</Text>:null}</Pressable></View>)}{todo.length>8?<Pressable accessibilityRole="button" accessibilityLabel={'Ver todas as '+todo.length+' tarefas'} onPress={()=>onOpenTasks?onOpenTasks():navigate('apps')} style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:14,borderTopWidth:1,borderColor:c.line}}><Text style={{color:c.accent,fontWeight:'600',fontSize:14}}>Ver mais</Text><Icon name="chevron" size={16} color={c.accent}/></Pressable>:null}</View>:<Empty icon="check" title={priority||areaFilter?'Nenhuma tarefa neste filtro':'Tudo em dia por aqui'} body={priority||areaFilter?'Escolha outra área ou prioridade.':'Suas próximas tarefas aparecem neste espaço.'}/>}</>}];
 // 0.3.265: Inicio do computador (desenho aprovado): ordem dos cartoes da direita segue o Organizar; Capsulas no desenho novo
 const deskOrder=withFixedWidgets(widgets,goalHidden).filter(id=>id==='tasks'||homeItems.some(x=>x.id===id));
 const todayItems=calendarRecords.filter(r=>{const d=new Date(r.date),n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();}).map(r=>({title:r.title,date:r.date}));
 // 0.3.288 (Pedro: "o site inicia e os blocos se movem"): no computador os cartoes so aparecem quando tarefas e agenda
 // ja chegaram (montados por baixo, invisiveis), entao nada pula de lugar; a frase da saudacao espera os mesmos dados
 const [deskShown,setDeskShown]=useState(false),[skelFade,setSkelFade]=useState(true);
 // 0.3.352 (Pedro: "a pagina principal inicial ta com scroll, tem que ser sem scroll"): o Inicio do computador sempre
 // cabe na janela. O zoom do Inicio (homeZ) so cresce; aqui ele tambem DIMINUI o necessario quando o conteudo e mais
 // alto que a janela (janela baixa, frase da Sofia em duas linhas, aviso). Mede o conteudo em pixels sem zoom e
 // so desce enquanto a janela e a mesma (nao oscila: frase que quebra e desquebra); outra janela recomeca do zero.
 const winKey=winW+'x'+winH,[fit,setFit]=useState<{key:string;z:number}|null>(null);
 // 04/11/2026: o encaixe guardado no navegador (rodada anterior) so diminuia e deixou o Inicio pequeno; desfeito e apagado
 useEffect(()=>{try{localStorage.removeItem(FIT_KEY);}catch{/* modo privado */}},[]);
 const fitZ=fit&&fit.key===winKey?Math.min(homeZ,fit.z):homeZ;
 useLayoutEffect(()=>{
  if(Platform.OS!=='web'||typeof document==='undefined'||!desktop||homeWidth<980)return;
  const box=document.getElementById('sofia-home-fit'),scroller=document.getElementById('sofia-home-scroll');
  if(!box||!scroller)return;
  const measure=()=>{const view=scroller.clientHeight,applied=fitZ||1;if(!view)return;const natural=box.getBoundingClientRect().height/applied+DESK_HOME_BOTTOM;if(!(natural>DESK_HOME_BOTTOM))return;
   const need=Math.max(0.6,Math.min(homeZ,Math.floor(view/natural*200)/200));
   setFit(old=>old&&old.key===winKey?(need<old.z-0.004?{key:winKey,z:need}:old):{key:winKey,z:need});};
  measure();
  if(typeof ResizeObserver==='undefined')return;
  const ro=new ResizeObserver(measure);ro.observe(box);ro.observe(scroller);return()=>ro.disconnect();
 },[winKey,homeZ,fitZ,desktop,homeWidth,deskShown]);
 // 0.3.290: so troca quando TUDO do Inicio chegou (tarefas, agenda, avisos do Resumo e Price Tracker); 3 s no maximo
 const brief=useHomeBriefData(api,active); // 03/11/2026: o celular tambem usa o Inicio do site (HomeBrief compacto)
 // 0.3.312 (Pedro): desligar/ligar o aviso pela linha do tempo - so desta vez (marca sofia-skip-v1) ou todos
 // 0.3.317: com as repeticoes abertas no Inicio, o item da linha do tempo e uma OCORRENCIA (horario daquela vez); para
 // gravar usa o registro de verdade, senao o horario do cadastro viraria o daquela vez
 const rawEvent=(o:any)=>[...events,...(calNext1.items||[]),...(calNext2.items||[])].find(e=>e.id===o?.id)||o;
 const refreshAgenda=()=>{void calendar.refresh();void calNext1.refresh?.();void calNext2.refresh?.();};
 // 0.3.317 (Pedro): arrastar na linha do tempo muda SO aquela vez. Compromisso/lembrete: marca sofia-move-v1 no registro;
 // dose da Rotina: marca no plano; tarefa: muda o horario guardando o combinado (volta para ele se nao fizer)
 // 0.3.318: um arrastar pode levar varios itens (bolinha com "2 itens", pilula com varias doses): doses do mesmo plano vao
 // numa gravacao so (senao a segunda daria conflito de versao); o resto, um por vez
 const moveFromTimeline=async(moves:Move[])=>{try{
  const doses=moves.filter(m=>'dose' in m.t),byPlan=new Map<string,Move[]>();for(const m of doses){const id=(m.t as any).dose.planId;byPlan.set(id,[...(byPlan.get(id)||[]),m]);}
  for(const [id,list] of byPlan){const plan=brief.capsules.plans.find(x=>x.id===id);if(!plan)continue;let tags=plan.tags;
   for(const m of list){const d=(m.t as any).dose,from=doseFrom(d.day,d.time),orig=new Date(from+':00').getTime();tags=withMove(tags,from,Math.abs(m.to.getTime()-orig)<60000?null:m.to.toISOString());}
   await brief.capsules.save({...plan,tags,revision:plan.revision});}
  const byEvent=new Map<string,{raw:any;tags:string[]}>();
  for(const m of moves){if(!('rec' in m.t))continue;const r=m.t.rec,o:any=r.original,iso=m.to.toISOString();if(!o)continue;
   if(r.isTask){const id=String(o.id||r.id.replace(/^task:/,'')),task=tasks.find(x=>x.id===id);if(!task||!task.due_at)continue;const planned=task.planned_due_at||task.due_at;
    const res=await api.saveTask({...task,due_at:iso,...(task.end_at&&Date.parse(task.end_at)>Date.parse(task.due_at)?{end_at:new Date(m.to.getTime()+Date.parse(task.end_at)-Date.parse(task.due_at)).toISOString()}:{}),timeline_move:false /* 05/11/2026 (Pedro): mover na linha do tempo e definitivo; o horario combinado antigo e limpo */} as any);
    setTasks(prev=>prev.map(x=>x.id===id?res.item:x));continue;}
   const raw:any=rawEvent(o),from=String(o.data?.sofia_moved_from||new Date(r.date).toISOString());
   const cur=byEvent.get(raw.id)||{raw,tags:raw.tags};cur.tags=withMove(cur.tags,from,from===iso?null:iso);byEvent.set(raw.id,cur);}
  // varias vezes do mesmo compromisso no mesmo arrastar: uma gravacao so
  for(const {raw,tags} of byEvent.values())await api.saveEntity({...raw,tags,revision:raw.revision});
  refreshAgenda();
 }catch(e){setError(errorText(e));refreshAgenda();}};
 // 05/11/2026 (Pedro: "alterar por ali, um mini editor"): editor pequeno do balao da linha do tempo (nome, horario, importante)
 const quickEdit=async(r:DayRecord,ch:QuickEdit)=>{const o:any=r.original;if(!o)return;const iso=ch.at.toISOString(),moved=Math.abs(ch.at.getTime()-new Date(r.date).getTime())>=60000;
  if(r.isTask){const id=String(o.id||r.id.replace(/^task:/,'')),task=tasks.find(x=>x.id===id);if(!task)return;const shift=moved&&task.due_at&&task.end_at&&Date.parse(task.end_at)>Date.parse(task.due_at)?{end_at:new Date(ch.at.getTime()+Date.parse(task.end_at)-Date.parse(task.due_at)).toISOString()}:{};
   const res=await api.saveTask({...task,title:ch.title,priority_level:ch.priority,...(ch.description!==(task.description||'')?{description:ch.description,...(task.description_document?{description_document:{version:1,text:ch.description,marks:[]}}:{})}:{}) /* texto mudou no mini editor: a formatacao antiga nao vale mais */,...(moved&&task.due_at?{due_at:iso,...shift,timeline_move:false}:{})} as any);setTasks(prev=>prev.map(x=>x.id===id?res.item:x));refreshAgenda();return;}
  const raw:any=rawEvent(o),from=String(o.data?.sofia_moved_from||new Date(r.date).toISOString());
  // 05/11/2026 (Pedro): lembrete com outras datas (grupo) pergunta se a mudanca vale so para esta data ou para todas
  const grp=(raw.tags||[]).find((t:string)=>String(t).startsWith('sofia-rgroup-v1:')),textChanged=ch.title!==raw.title||ch.description!==String(raw.content||'')||ch.priority!==String(raw.data?.priority_level||'');
  const sibs=grp&&textChanged?[...events,...(calNext1.items||[]),...(calNext2.items||[])].filter((e:any)=>e.id!==raw.id&&(e.tags||[]).includes(grp)).filter((e:any,i:number,a:any[])=>a.findIndex((x:any)=>x.id===e.id)===i):[];
  const all=sibs.length?await new Promise<boolean|null>(res=>appAlert('Alterar as outras datas também?','Este lembrete tem '+(sibs.length+1)+' datas.',[{text:'Cancelar',style:'cancel',onPress:()=>res(null)},{text:'Só esta data',onPress:()=>res(false)},{text:'Todas as datas',onPress:()=>res(true)}])):false;
  if(all===null)throw Error('Nada foi alterado.');
  if(all)for(const sb of sibs as any[])await api.saveEntity({...sb,title:ch.title,content:ch.description,data:{...(sb.data||{}),priority_level:ch.priority},revision:sb.revision});
  await api.saveEntity({...raw,title:ch.title,content:ch.description,data:{...(raw.data||{}),priority_level:ch.priority,...(raw.data?.description!==undefined?{description:ch.description}:{})},...(moved?{tags:withMove(raw.tags,from,iso)}:{}),revision:raw.revision});refreshAgenda();};
 // 05/11/2026 (Pedro: X na linha do tempo): tarefa sai so da linha (fica sem horario, em Tarefas) ou e excluida; compromisso/lembrete excluido
 const removeFromTimeline=async(r:DayRecord,mode:'timeline'|'all')=>{try{const o:any=r.original;if(!o)return;
  if(r.isTask){const id=String(o.id||r.id.replace(/^task:/,'')),task=tasks.find(x=>x.id===id);if(!task)return;
   if(mode==='all'){await api.deleteTask(id);setTasks(prev=>prev.filter(x=>x.id!==id));}
   else{const res=await api.saveTask({...task,due_at:'',start_at:'',end_at:'',state:task.state==='scheduled'?'todo':task.state,timeline_move:false} as any);setTasks(prev=>prev.map(x=>x.id===id?res.item:x));}
   refreshAgenda();return;}
  const raw:any=rawEvent(o);await api.deleteEntity(String(raw.id||o.id));refreshAgenda();
 }catch(e){setError(errorText(e));refreshAgenda();}};
 // 0.3.331 (Pedro): clicar num lugar vazio da linha do tempo -> seletor -> abre o editor da funcao ja com o horario clicado
 const addAt=(kind:AddKind,at:Date)=>{const iso=at.toISOString(),hm=String(at.getHours()).padStart(2,'0')+':'+String(at.getMinutes()).padStart(2,'0');
  if(kind==='event'){setAgendaDraft({kind:'commitment',title:'',data:{home_day:iso}});return;}
  if(kind==='task'){sendDraft('task',{title:'',state:'scheduled',priority_level:'none',area:'Pessoal',due_at:iso,start_at:iso});if(onOpenTasks)onOpenTasks();else navigate('apps');return;}
  if(kind==='reminder'){sendDraft('reminder',{data:{remind_at:iso,message:'',location:''}});if(onOpenModule)onOpenModule('reminders');else navigate('apps');return;}
  sendDraft('capsule',{data:{times_json:JSON.stringify([hm]),start_date:localDateKey(at),rotina_type:'capsula'}});if(onOpenCapsules)onOpenCapsules();else if(onOpenModule)onOpenModule('capsules');else navigate('apps');
 };
 // 0.3.333 (aprovado por foto): ponte da linha do tempo com a Sofia - conversar (texto e foto, como na Conversa; tudo fica
 // no mesmo historico) e gravar pelo mini editor preso ao ponto, devolvendo o "Desfazer"
 // 03/11/2026: a seta da barrinha da Conversa (criar manualmente) volta aqui com o tipo e o horario
 useDraft<{kind:AddKind;at:string}>('homeAdd',active,d=>addAt(d.kind,new Date(d.at)));
 const reloadAll=()=>{refreshAgenda();void readHomeRows(api,()=>{},rows=>setTasks(rows)).catch(()=>{});brief.reload();};
 const sofiaBridge:SofiaBridge={first,
  ask:async(text,file)=>{const page=await api.ensureChat();const conv=page.conversation;if(!conv)throw Error('Não deu para abrir a conversa com a Sofia.');
   let message=text;
   if(file){const uri=URL.createObjectURL(file),name=String(file.name||'Imagem.png'),mime=attachmentMime(name,file.type);
    const entity=await api.saveEntity({kind:'file',title:name,state:'saved',privacy:'private',area:'Pessoal',content:'Anexo da conversa '+conv.id,tags:['chat-attachment'],data:{provider:'local',logical_path:'conversations/'+conv.id,description:'Arquivo enviado na conversa com a Sofia'}} as any);
    const up=await api.uploadAttachment(entity.id,{name,mime,base64:await attachmentBase64(uri)});
    message=[text,attachmentText([{uri,name,mime,size:file.size||0,entityId:entity.id,attachmentId:up.id}],SITE)].filter(Boolean).join('\n\n');}
   const result=await api.chat({conversation_id:conv.id,message,client_message_id:'linha-'+Date.now().toString(36)});
   reloadAll();setTimeout(reloadAll,1500) /* 05/11/2026 (Pedro: "a bolinha demora a ser criada"): le de novo logo em seguida caso o servidor ainda esteja gravando */;return result.reply||'';},
  save:async(x:MiniSave)=>{const iso=x.at.toISOString(),hm=String(x.at.getHours()).padStart(2,'0')+':'+String(x.at.getMinutes()).padStart(2,'0');
   if(x.kind==='task'){const r=await api.saveTask({title:x.title,area:'Pessoal',state:'scheduled',due_at:iso,start_at:iso,priority_level:x.priority||'none',...(x.notify===false?{tags:['sofia-notify-v1:off']}:{})} as any);setTasks(prev=>[r.item,...prev.filter(t=>t.id!==r.item.id)]);refreshAgenda();
    return async()=>{await api.deleteTask(r.item.id);setTasks(prev=>prev.filter(t=>t.id!==r.item.id));refreshAgenda();};}
   if(x.kind==='event'){const saved=await api.saveEntity({kind:'commitment',title:x.title,content:'',area:'Pessoal',state:'planned',privacy:'private',tags:x.notify===false?['sofia-notify-v1:off']:[],data:{start_at:iso,end_at:new Date(x.at.getTime()+(x.minutes||60)*60000).toISOString(),priority_level:'none',calendar_provider:x.google===false?'local':'google',...(x.notify!==false?{remind_minutes:10}:{})}} as any);refreshAgenda();
    return async()=>{await api.saveEntity({...saved,state:'archived'} as any);refreshAgenda();};}
   if(x.kind==='reminder'){const saved=await api.saveEntity({kind:'reminder',title:x.title,content:'',area:'Pessoal',privacy:'private',state:'active',tags:agendaTags([],(x.repeat||'none') as any),data:{remind_at:iso,message:x.message||'',location:''}} as any);refreshAgenda();
    return async()=>{await api.saveEntity({...saved,state:'archived'} as any);refreshAgenda();};}
   const day=localDateKey(x.at);
   const plan=await brief.capsules.save({kind:'capsule',title:x.title,content:'',area:'Pessoal',privacy:'private',state:'active',tags:[],data:{rotina_type:x.rtype||'capsula',capsule_type:'supplement',dose_text:x.dose||'',count_target:1,times_json:JSON.stringify([hm]),start_date:day,end_date:'',repeat_type:x.daily?'daily':'once',weekdays_json:'[]',interval_days:1,remind_minutes:0,notifications:x.notify!==false}} as any);
   return async()=>{const p:any=plan;if(p?.id)await brief.capsules.save({...p,state:'archived'} as any);};}};
 const muteFromTimeline=async(t:MuteTarget,scope:'one'|'all',on:boolean)=>{try{
  if('rec' in t){const o:any=rawEvent(t.rec.original);if(!o?.id)return;const iso=new Date(t.rec.date).toISOString();let tags:string[]=[...(o.tags||[])];
   if(on)tags=tags.filter(x=>x!=='sofia-notify-v1:off'&&x!=='sofia-skip-v1:'+iso);else if(scope==='one')tags=[...tags.filter(x=>x!=='sofia-skip-v1:'+iso),'sofia-skip-v1:'+iso];else tags=[...tags.filter(x=>x!=='sofia-notify-v1:off'),'sofia-notify-v1:off'];
   await api.saveEntity({...o,tags,revision:o.revision});calendar.refresh();}
  else{const plan=brief.capsules.plans.find(x=>x.id===t.dose.planId);if(!plan)return;const k='sofia-skip-v1:'+t.dose.day+'T'+t.dose.time;let tags=[...(plan.tags||[])],data={...plan.data};
   if(on){tags=tags.filter(x=>x!==k);data.notifications=true;}else if(scope==='one')tags=[...tags.filter(x=>x!==k),k];else data.notifications=false;
   await brief.capsules.save({...plan,tags,data,revision:plan.revision});}
 }catch(e){setError(errorText(e));}};
 // 0.3.313: agir pela previa da linha do tempo - Paguei/Recebi (conta ou receita) e Tomei (rotina)
 const markAction=async(m:TimeMark)=>{try{
  if((m.kind==='bill'||m.kind==='income')&&m.due?.tx&&brief.fin){await receiveTx(api,brief.fin,m.due.tx);brief.reload();}
  else if(m.kind==='routine'&&m.dose)await brief.capsules.take(m.dose.planId,m.dose.day,m.dose.time,true);
 }catch(e){setError(errorText(e));}};
 const noticesReady=!notices||(notices as any).ready!==false,seriesReady=!deskOrder.includes('monitoring')||series!==null;
 // 04/11/2026 (Pedro: "Bom dia, Pedro centralizado; depois que tudo carregar ele sobe puxando tudo"): no site a saudacao
 // abre no CENTRO da tela; quando os dados chegam ela sobe para o lugar dela (curva longa e suave) e os blocos vem atras,
 // subindo e aparecendo. Mede a posicao final antes de pintar (useLayoutEffect) para nao aparecer no lugar e pular.
 const homeMountAt=useRef(Date.now());
 const heroRef=useRef<any>(null),introUsed=useRef(false),[introT,setIntroT]=useState(0),[introDy,setIntroDy]=useState(0),glowBack=useRef(new Animated.Value(1)).current,wasActive=useRef(active),deskAt=useRef(0),[introDone,setIntroDone]=useState(false);const revealAt=introT?introT+INTRO_T.rows:0;
 // 04/11/2026: terminada a abertura (ou saindo do Inicio no meio dela) tudo fica parado no lugar final, sem animacao: ao voltar
 // de outra aba o navegador reiniciaria as animacoes CSS e a abertura inteira se repetia
 // so ao SAIR do Inicio (tela escondida): trocar as animacoes terminadas por estilo fixo com a tela visivel fazia o navegador
 // redesenhar os textos e dava uma piscada/pulo nos nomes no fim da abertura (Pedro, 04/11/2026)
 useEffect(()=>{if(introT&&!introDone&&!active)setIntroDone(true);},[introT,introDone,active]);if(deskShown&&!deskAt.current)deskAt.current=Date.now();
 // dados chegaram depois da hora das fileiras: elas entram (uma a uma) a partir de quando chegaram
 const swapAt=deskShown&&(!introUsed.current||deskAt.current>=revealAt)?deskAt.current:undefined;
 const introCss=useMemo(()=>introT&&introDy&&!introDone?{move:{...introAnim(introT,INTRO_T.move,INTRO.moveMs,{transform:'translateY('+Math.round(introDy*INTRO.travel)+'px)'},{transform:'translateY(0px)'},INTRO.ease) /* travel<1: o conteudo desce menos (teste) */,willChange:'transform'} /* fica na mesma camada depois de parar: sem redesenhar o texto no fim (Pedro: "estralo no final") */,band:introAnim(introT,INTRO_T.glow,GLOW_MS,{opacity:1},{opacity:0},'cubic-bezier(0.4,0,0.1,1)') /* 05/11/2026 (Pedro: "volta como estava, menos opaco e bem mais suave quando termina"): troca ao mesmo tempo, como antes, mais longa e com o fim bem devagar */,oval:introAnim(introT,INTRO_T.glow,GLOW_MS,{opacity:0},{opacity:1},'cubic-bezier(0.4,0,0.1,1)')}:null,[introT,introDy,introDone]);
 useLayoutEffect(()=>{if(Platform.OS!=='web'||!wideHome||Date.now()-homeMountAt.current>4000||introUsed.current)return; /* 04/11/2026 (Pedro: "a animacao inicial ja pode estar iniciando antes"): comeca assim que o Inicio e desenhado, mesmo por baixo do veu da abertura */const el:any=heroRef.current;const r=(el?.querySelector?.('[role="heading"]')||el)?.getBoundingClientRect?.(); /* centra a SAUDACAO (data e resumo ainda escondidos) */if(!r||!r.height||typeof window==='undefined')return;
  const z=fitZ||1;const dy=(window.innerHeight/2-(r.top+r.height/2))/z; /* a saudacao cresce pela letra, no proprio lugar */if(dy<24)return;introUsed.current=true;setIntroDy(dy);setIntroT(Date.now()-INTRO_LEAD); /* 04/11/2026 (Pedro: "a animacao ja tem que estar acontecendo por tras do fade quando ele abre"): a linha do tempo comeca adiantada */ },[wideHome]);
 // 04/11/2026: a ordem da abertura (saudacao, subida, data digitada, resumo, fileiras, brilho oval) e a linha do tempo INTRO_T, toda em CSS
 // 04/11/2026 (Pedro: "quando entro em uma pagina e volto, da uma flikada no degrade oval"): ao voltar ao Inicio o brilho
 // reaparece com fade curto (o navegador redesenha a camada grande; sem o fade ele surgia de uma vez e piscava)
 useEffect(()=>{const back=active&&!wasActive.current;wasActive.current=active;if(!back||!wideHome)return;glowBack.setValue(0);Animated.timing(glowBack,{toValue:1,duration:350,easing:Easing.out(Easing.quad),useNativeDriver:false}).start();},[active]);
 // 04/11/2026 (Pedro: "quando o shimmer finaliza da uma piscada"): o esqueleto fica por cima do conteudo e apaga devagar, em vez de sumir de uma vez
 useEffect(()=>{if(!deskShown||!wideHome)return;saveEarlyPaths();const t=setTimeout(()=>setSkelFade(false),Math.max(400,(swapAt||Date.now())+1250-Date.now())) /* as 3 fileiras do esqueleto apagam uma a uma */;return()=>clearTimeout(t);},[deskShown]);
 useEffect(()=>{if(deskShown||!active)return; /* 03/11/2026: o painel do Inicio so monta com o Inicio na tela; montado com a pessoa em outra aba (modo Antigo) ele travava o processador no meio da abertura dela */if(tasksReady&&calendar.loadedAt&&noticesReady&&seriesReady&&brief.ready&&(!desktop||(calNext1.loadedAt&&calNext2.loadedAt))){setDeskShown(true);return;}const t=setTimeout(()=>setDeskShown(true),8000) /* 04/11/2026: so desiste de esperar os dados depois de 8 s (aos 3 s o conteudo entrava pela metade e pulava quando o resto chegava) */;return()=>clearTimeout(t);},[deskShown,active,tasksReady,calendar.loadedAt,noticesReady,seriesReady,brief.ready,calNext1.loadedAt,calNext2.loadedAt]);
 const homePad=24;
 return <><ScrollView ref={homeScroll} onScroll={noteFluencyMovement} scrollEventThrottle={100} nestedScrollEnabled={false} keyboardShouldPersistTaps="always" testID="home-scroll" nativeID="sofia-home-scroll" scrollEnabled={!dragging&&!wideHome} onLayout={e=>{const h=Math.round(e.nativeEvent.layout.height);if(Math.abs(h-homeViewH)>1)setHomeViewH(h);}} contentContainerStyle={wideHome?{paddingBottom:DESK_HOME_BOTTOM,zoom:fitZ,flexGrow:1,justifyContent:'flex-end',minHeight:homeViewH?Math.floor(homeViewH/fitZ):undefined} as any:{paddingBottom:28}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{console.info('SOFIA_HOME_PULL_REFRESH');setRefreshing(true);setRefreshEpoch(x=>x+1);}} tintColor={c.accent}/>}><View nativeID="sofia-home-fit" collapsable={false} style={{flexShrink:0}} /* 04/11/2026: sem o aparecer unico da pagina; a ordem (data, saudacao, resumo, blocos) e por item */>{/* 03/11/2026 (Pedro: "site iniciando bugado, dando um estalo"; "a animacao pode ser de fade da entrada"): no computador o Inicio entra com um fade suave; os ajustes de encaixe dos primeiros quadros acontecem enquanto ele ainda esta transparente */}{/* 0.3.265 (Inicio aprovado pelo Pedro): saudacao centralizada com o nome em italico, frase do dia e a barra da Sofia; no computador o Organizar fica no canto; no celular o sino e o perfil ficam no alto, como antes. */}{desktop?<View style={{position:'relative'}}>{/* 0.3.321 (Pedro: "pode deixar os blocos fixos"): o Organizar so vale na montagem antiga; no Inicio atual nao aparece */}{wideHome?null:<View style={{position:'absolute',right:homePad,top:14,zIndex:2}}><Pressable accessibilityRole="button" accessibilityLabel="Organizar Início" onPress={()=>setOrganizeKey(k=>k+1)} style={{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:c.line}}><Icon name="grid" size={16} color={c.muted}/><Text style={{color:c.muted,fontSize:13}}>Organizar</Text></Pressable></View>}<View ref={heroRef} style={wideHome&&introCss?introCss.move:undefined}>{/* 04/11/2026 (Pedro: "degrade no fundo do Inicio que sobe junto com as informacoes"): brilho suave atras da saudacao, preso a ela - na abertura fica no centro e sobe junto */}{wideHome?<><View pointerEvents="none" style={[{position:'absolute',left:0,right:0,top:-420,height:1100,opacity:introCss?undefined:0,backgroundImage:'linear-gradient(to bottom, '+c.accent+'00 22%, '+c.accent+'12 50%, '+c.accent+'00 78%)'} as any,introCss?introCss.band:null]}/><Animated.View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:-420,height:1100,opacity:glowBack}}><View style={[{position:'absolute',left:0,right:0,top:0,bottom:0,backgroundImage:'radial-gradient(ellipse 58% 42% at 50% 50%, '+c.accent+'22 0%, '+c.accent+'0f 38%, '+c.accent+'00 72%)' /* 05/11/2026 (Pedro): oval menos opaco */} as any,introCss?introCss.oval:null]}/></Animated.View></>:null}<View style={{position:'relative',zIndex:1}}><HomeHero api={api} first={first} wide minimal={wideHome} reveal={introT?{at:introT,big:INTRO_SCALE,done:introDone}:null} subtitle={wideHome?(deskShown||(tasksReady&&calendar.loadedAt&&seriesReady&&brief.ready)?briefLine({today:calendarRecords.filter(r=>localDateKey(r.date)===localDateKey(new Date())),tasks,series,packs:brief.packs}):'\u00a0'):tasksReady&&calendar.loadedAt?daySentence(todayItems,todo):'\u00a0'} onContinue={()=>navigate('chat')}/></View></View></View>:<><View style={{flexDirection:'row',justifyContent:'flex-end',paddingHorizontal:20,paddingTop:10}}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><NotificationBell onViewAll={()=>navigate('notifications')}/><Pressable accessibilityLabel="Abrir configurações" onPress={()=>navigate('profile')}><ProfileAvatar scope={bootstrap.profile.email} name={bootstrap.profile.name}/></Pressable></View></View><HomeHero api={api} first={first} wide={false} minimal={!desktop} subtitle={tasksReady&&calendar.loadedAt?daySentence(todayItems,todo):'\u00a0'} onContinue={()=>navigate('chat')}/></>}{error||calendar.error?<View nativeID={!tasksReady||!calendar.loadedAt?'sofia-launch-error':undefined} collapsable={false}><ErrorBanner text={error||(calendar.error?errorText(calendar.error):'')} onRetry={()=>{setRefreshing(true);setRefreshEpoch(x=>x+1);}}/></View>:null}<View onLayout={e=>{const w=e.nativeEvent.layout.width;if(w>0&&Math.abs(w-homeWidth)>4)setHomeWidth(w);}} /* 0.3.291: escondido (outra pagina aberta) mede 0; ignorar evita voltar com o layout de celular por 2 quadros */ style={{paddingHorizontal:22,gap:18}}>{tasksReady&&calendar.loadedAt>0?<View nativeID="sofia-home-data-ready" collapsable={false} style={{position:'absolute',width:1,height:1}}/>:null}{/* 0.3.264 (Inicio no computador): duas colunas EQUILIBRADAS - a Agenda abre a primeira e cada widget vai para a coluna mais curta, sem vazio embaixo de nenhuma. */}{wideHome?<View style={introCss?introCss.move:undefined} /* os blocos sobem junto com a saudacao (ela "puxa" tudo): uma fileira que entra durante a subida nunca cobre o texto */><View style={{position:'relative'}}>{deskShown?<HomeBrief revealAt={introDone?undefined:swapAt||revealAt||undefined} goal={goal} masked={valuesHidden} onToggleMask={()=>setValuesHidden(!valuesHidden)} onMute={(t,scope,on)=>void muteFromTimeline(t,scope,on)} onMarkAction={m=>void markAction(m)} onMove={moves=>void moveFromTimeline(moves)} onAddAt={addAt} onQuickEdit={desktop?quickEdit:undefined} onRemove={desktop?removeFromTimeline:undefined} onEditItem={desktop?(item:DayRecord)=>itemDetails(item,true):undefined} sofia={desktop?sofiaBridge:undefined} data={brief} all={futureRecords} today={calendarRecords.filter(r=>localDateKey(r.date)===localDateKey(new Date()))} tasks={tasks} series={series} onOpenItem={item=>itemDetails(item)} onOpenTasks={()=>onOpenTasks?onOpenTasks():navigate('apps')} onOpenTask={id=>{focusTask(id);onOpenTasks?onOpenTasks():navigate('apps');}} onToggleTask={t=>toggle(t)} onOpenModule={id=>id==='capsules'&&onOpenCapsules?onOpenCapsules():onOpenModule?onOpenModule(id):navigate('apps')} onOpenMonitoring={()=>onOpenMonitoring?onOpenMonitoring():navigate('apps')} onOpenAgenda={()=>openAgenda(localDateKey(new Date()))}/>:null}{/* 04/11/2026 (Pedro: "tira o esqueleto e o shimmer, ja entram direto os tres blocos intercalados"): sem esqueleto visivel no computador;
 o lugar dos blocos fica reservado (invisivel, parado) para a saudacao nao descer nem pular enquanto os dados chegam */}{!deskShown?<View pointerEvents="none" style={{opacity:0}} aria-hidden><HomeBriefSkeleton paused/></View>:null}</View></View>:null}{wideHome&&deskShown?<View testID="home-desk" style={{gap:18,display:'none'}}><View style={{flexDirection:'row',gap:18,alignItems:'stretch',minHeight:dpx(393)} as any}><View style={{flex:0.62,minWidth:0,display:'flex'}}><DaySummaryCard items={todayItems} todo={todo} notices={notices?.items||[]} onNotice={n=>notices?.open(n)} onTalk={()=>navigate('chat')}/></View><View style={{flex:1.38,minWidth:0,display:'flex'}}><MiniAgenda onCreate={day=>void createHomeCommitment(day)} loading={calendar.loading} pending={calendar.pending} onMonthChange={calendarMonth} active={active} viewOwner={api} onGestureLock={onGestureLock} items={calendarRecords} onOpen={openAgenda} onItem={itemDetails} onToggleTask={toggleAgendaTask}/></View></View><View style={{flexDirection:'row',gap:18,alignItems:'stretch'}}>{deskOrder.includes('tasks')?<View style={{flex:1.5,minWidth:0,display:'flex'}}><DeskTasksCard todo={todo} ready={tasksReady} busy={!!saving} areaLabel={areaFilter||'Áreas'} priorityLabel={TASK_PRIORITIES.find(p=>p.value===priority)?.label||'Todas'} onArea={()=>setAreaFilterOpen(true)} onPriority={()=>setFilterOpen(true)} query={taskQuery} onQuery={setTaskQuery} onToggle={t=>void toggle(t)} onOpen={openTask} onSeeAll={()=>onOpenTasks?onOpenTasks():navigate('apps')}/></View>:null}<View style={{flex:1,minWidth:0,gap:18}}>{deskOrder.filter(id=>id!=='tasks').map(id=>id==='capsules'?<DeskCapsulesCard key={id} api={api} active={active} onOpen={()=>onOpenCapsules?onOpenCapsules():navigate('apps')}/>:<View key={id}>{homeItems.find(x=>x.id===id)?.content}</View>)}</View></View><SortableWidgets sheetOnly fixed={HOME_FIXED_WIDGETS} items={homeItems} order={withFixedWidgets(widgets,goalHidden)} onSave={saveHomeOrder} onLock={lockWidgets} openKey={organizeKey}/></View>:!wideHome&&desktop?<><MiniAgenda onCreate={day=>void createHomeCommitment(day)} loading={calendar.loading} pending={calendar.pending} onMonthChange={calendarMonth} active={active} viewOwner={api} onGestureLock={onGestureLock} items={calendarRecords} onOpen={openAgenda} onItem={itemDetails} onToggleTask={toggleAgendaTask}/><SortableWidgets fixed={HOME_FIXED_WIDGETS} items={homeItems} order={withFixedWidgets(widgets,goalHidden)} onSave={saveHomeOrder} onLock={lockWidgets} columns={columns} openKey={organizeKey}/></>:!wideHome?(deskShown?<HomeBrief compact onAskAt={at=>{sendDraft('chatCreate',at.toISOString());navigate('chat');}} goal={goal} masked={valuesHidden} onToggleMask={()=>setValuesHidden(!valuesHidden)} onMute={(t,scope,on)=>void muteFromTimeline(t,scope,on)} onMarkAction={m=>void markAction(m)} onMove={moves=>void moveFromTimeline(moves)} onAddAt={addAt} data={brief} all={futureRecords} today={calendarRecords.filter(r=>localDateKey(r.date)===localDateKey(new Date()))} tasks={tasks} series={series} onOpenItem={item=>itemDetails(item)} onOpenTasks={()=>onOpenTasks?onOpenTasks():navigate('apps')} onOpenTask={id=>{focusTask(id);onOpenTasks?onOpenTasks():navigate('apps');}} onToggleTask={t=>toggle(t)} onOpenModule={id=>id==='capsules'&&onOpenCapsules?onOpenCapsules():onOpenModule?onOpenModule(id):navigate('apps')} onOpenMonitoring={()=>onOpenMonitoring?onOpenMonitoring():navigate('apps')} onOpenAgenda={()=>openAgenda(localDateKey(new Date()))}/>:<HomeBriefSkeleton compact paused={!active}/>):null}{wideHome?null:<Pressable accessibilityLabel="Abrir apps" onPress={()=>navigate('apps')} style={{flexDirection:'row',alignItems:'center',gap:10,padding:14}}><Icon name="grid" color={c.accent}/><Text style={{color:c.accent,fontSize:14}}>Todos os seus espaços</Text></Pressable>}{!bootstrap.ai.ready?<Text style={{fontSize:12,color:c.danger}}>{bootstrap.ai.reason}</Text>:null}</View><Sheet visible={filterOpen} onClose={()=>setFilterOpen(false)} label="Fechar filtro de tarefas"><Text style={{fontSize:20,color:c.text,fontWeight:'500'}}>Nível das tarefas</Text>{[{value:'',label:'Todas'},...TASK_PRIORITIES].map(p=><Pressable key={p.value} accessibilityRole="radio" accessibilityState={{checked:priority===p.value}} accessibilityLabel={p.label} onPress={()=>{setPriority(p.value);setFilterOpen(false);}} style={{paddingVertical:16,borderBottomWidth:1,borderColor:c.line}}><Text style={{color:priority===p.value?c.accent:c.text}}>{p.label}</Text></Pressable>)}</Sheet><Sheet visible={areaFilterOpen} onClose={()=>setAreaFilterOpen(false)} label="Fechar filtro por área"><Text style={{fontSize:20,color:c.text,fontWeight:'500'}}>Áreas das tarefas</Text>{[{value:'',label:'Todas as áreas'},...areaOptions.map(value=>({value,label:value}))].map(area=><Pressable key={area.value} accessibilityRole="radio" accessibilityState={{checked:areaFilter===area.value}} onPress={()=>{setAreaFilter(area.value);setAreaFilterOpen(false);}} style={{paddingVertical:16,borderBottomWidth:1,borderColor:c.line}}><Text style={{color:areaFilter===area.value?c.accent:c.text}}>{area.label}</Text></Pressable>)}</Sheet>{detail&&detailOpen?<DeferredScreen key={detail.id+(detailEdit?':editar':'')} load={loadHomeTaskDetails} screenProps={{areas:areaOptions,onDiscuss:onDiscussTask,onEdit:(t:Task)=>setQuick(t),startEditing:detailEdit,task:detail,visible:detailOpen,api,onClose:()=>setDetailOpen(false),onSaved:(item:Task)=>{setTasks(previous=>previous.map(t=>t.id===item.id?item:t));setDetail(item);}}}/>:null}</View></ScrollView><Presence>{eventEdit&&agendaCatalog&&agendaCatalog.catalog[eventEdit.kind!]?<DeferredScreen load={loadEntityEditor} screenProps={{api,item:eventEdit,definition:agendaCatalog.catalog[eventEdit.kind!],areas:agendaCatalog.areas,onClose:()=>setEventEdit(null),onSaved:()=>{setEventEdit(null);void calendar.refresh();}}}/>:null}</Presence><Presence>{agendaDraft?<DeferredScreen load={loadHomeCommitmentEditor} screenProps={{api,day:String(agendaDraft.data?.home_day||''),areas:areaOptions,onClose:()=>setAgendaDraft(null),onSaved:()=>{setAgendaDraft(null);void calendar.refresh();void api.catalog().then(setAgendaCatalog).catch(()=>{});}}}/>:null}</Presence><Presence>{quick?<TaskQuickSchedule api={api} task={quick} onClose={()=>setQuick(null)} onSaved={t=>{setTasks(prev=>prev.map(x=>x.id===t.id?t:x));setQuick(null);}} onDetails={()=>{const t=quick;setQuick(null);openTaskEditing(t);}} detailsLabel="Editar título e descrição" onRemoved={id=>{setTasks(prev=>prev.filter(x=>x.id!==id));setQuick(null);}}/>:null}</Presence></>;
}
