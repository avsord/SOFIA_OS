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
export const states:Record<string,string>={active:'Ativo',archived:'Arquivado',idea:'Ideia',paused:'Pausado',completed:'Concluído',planned:'Planejado',confirmed:'Confirmado',pending:'Pendente',done:'Concluído',todo:'A fazer',cancelled:'Cancelado',draft:'Rascunho',interest:'Interesse',purchased:'Comprado',needed:'Necessário',unavailable:'Indisponível',learning:'Estudando',acquired:'Adquirido',saved:'Salvo',to_watch:'Para assistir',watched:'Assistido',reading:'Lendo',ready:'Pronto',collecting:'Reunindo',questions:'Dúvidas',new:'Novo',waiting:'Aguardando',local:'Somente local',private:'Privado',shared:'Compartilhado',public:'Público',list:'Lista',board:'Quadro',gallery:'Galeria',notes:'Notas',manual:'Manual',json:'Feed autorizado',product:'Link do produto'};
export const translated=(v:string)=>states[v]||v;
export const modules:{id:string;title:string;caption:string;icon:IconName;kinds?:string[];group?:string}[]=[
 {id:'capsules',title:'Rotina',caption:'Cápsulas, cuidados, hábitos e treino',icon:'cycle'},
 {id:'reminders',title:'Lembretes',caption:'Avisos na hora certa',icon:'bell'},
 {id:'packages',title:'Encomendas',caption:'Rastreio que avisa quando muda',icon:'box'},
 {id:'tasks',title:'Tarefas',caption:'A fazer e prioridades',icon:'checklist'},
 {id:'lists',title:'Listas',caption:'Pessoais, mercado e compras',icon:'cart',kinds:['list_collection','list_item','shopping_item','purchase_group','purchase']},
 {id:'library',title:'Biblioteca',caption:'Filmes, livros e receitas',icon:'book',group:'library'},
 {id:'monitor',title:'Price Tracker',caption:'Preços que você acompanha',icon:'tag'},
 {id:'finance',title:'Finanças',caption:'Contas, cartões e orçamentos',icon:'wallet'},
 {id:'mail',title:'E-mails',caption:'A Sofia de olho no que importa',icon:'mail'},
 {id:'drive',title:'Drive',caption:'Seus arquivos e pastas',icon:'drive'},
 {id:'knowledge',title:'Notas',caption:'Conhecimento da sua Sofia',icon:'edit',group:'knowledge'},
 {id:'all',title:'Todos os registros',caption:'Tudo o que você já registrou',icon:'grid'}
];
export function Input({label,value,onChange,multiline=false,placeholder='',keyboardType='default',maxLength}:{label:string;value:string;onChange:(v:string)=>void;multiline?:boolean;placeholder?:string;keyboardType?:'default'|'numeric'|'email-address'|'url';maxLength?:number}){
 const c=useTheme();return <View><Text style={[forms.label,{color:c.muted}]}>{label}</Text><TextInput accessibilityLabel={label} value={value} maxLength={maxLength} onChangeText={onChange} multiline={multiline} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={c.muted} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input,minHeight:multiline?100:52,paddingVertical:12,textAlignVertical:multiline?'top':'center'}]}/></View>;
}
export function Blocks({value,onChange}:{value:string;onChange:(v:string)=>void}){
 const c=useTheme();let blocks:any[]=[];let invalid=false;try{const p=JSON.parse(value||'[]');if(!Array.isArray(p))throw Error();blocks=p;}catch{invalid=true;}
 function change(i:number,patch:object){const n=blocks.map((b,j)=>j===i?{...b,...patch}:b);onChange(JSON.stringify(n));}
 function move(i:number,d:number){const n=[...blocks];if(i+d<0||i+d>=n.length)return;[n[i],n[i+d]]=[n[i+d],n[i]];onChange(JSON.stringify(n));}
 if(invalid)return <ErrorBanner text="O conteúdo em blocos está em um formato diferente. Ele será preservado sem alterações."/>;
 return <View style={{gap:12}}><Text style={{fontWeight:'600',fontSize:16,color:c.text}}>Conteúdo da página</Text>{blocks.map((b,i)=><View key={b.id||i} style={{borderWidth:1,borderColor:c.line,padding:12,borderRadius:16,gap:8,backgroundColor:c.surface,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><Text style={{flex:1,color:c.muted,fontSize:11}}>{b.type||'text'}</Text><Pressable onPress={()=>move(i,-1)} style={{padding:8}} accessibilityLabel="Mover bloco para cima"><Text style={{color:c.accent}}>↑</Text></Pressable><Pressable onPress={()=>move(i,1)} style={{padding:8}} accessibilityLabel="Mover bloco para baixo"><Text style={{color:c.accent}}>↓</Text></Pressable><IconButton name="trash" label="Remover bloco" size={36} onPress={()=>appAlert('Remover bloco?','A remoção só será aplicada ao salvar a página.',[{text:'Cancelar',style:'cancel'},{text:'Remover',style:'destructive',onPress:()=>onChange(JSON.stringify(blocks.filter((_,j)=>j!==i)))}])}/></View>{b.type==='divider'?<View style={{height:1,backgroundColor:c.line}}/>:null}{b.type==='todo'?<View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text}}>Concluído</Text><Switch value={!!b.checked} onValueChange={v=>change(i,{checked:v})}/></View>:null}{b.type!=='divider'?<TextInput value={String(b.text||'')} onChangeText={t=>change(i,{text:t,html:''})} placeholder="Texto do bloco" placeholderTextColor={c.muted} multiline style={{color:c.text,fontSize:b.type?.startsWith('heading')?21:15,lineHeight:24,minHeight:48,textAlignVertical:'top'}}/>:null}{b.data&&Object.keys(b.data).length?<Text style={{fontSize:11,color:c.muted}}>Links, tabelas e dados adicionais deste bloco são preservados.</Text>:null}</View>)}<Choice label="Adicionar bloco" value="" options={[{value:'text',label:'Parágrafo'},{value:'heading1',label:'Título'},{value:'bullet',label:'Item com marcador'},{value:'todo',label:'Tarefa'},{value:'quote',label:'Citação'},{value:'divider',label:'Divisor'}]} onChange={type=>onChange(JSON.stringify([...blocks,{id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),type,text:''}]))}/></View>;
}
export function localDate(value:string){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return value;return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
export function FieldInput({field,value,onChange,api}:{field:Field;value:any;onChange:(v:any)=>void;api:SofiaApi}){
 const c=useTheme(),[choices,setChoices]=useState<{value:string;label:string}[]>([]);const relations:Record<string,string[]>={collection_id:['list_collection'],course_id:['course'],target_id:['purchase','course'],parent_id:['user_page']};
 useEffect(()=>{let live=true;const kinds=relations[field.key];if(!kinds)return;Promise.all(kinds.map(k=>api.entities(k))).then(rs=>{if(live)setChoices(rs.flatMap(r=>r.items.map(e=>({value:e.id,label:e.title}))));}).catch(()=>{});return()=>{live=false;};},[field.key,api]);
 if(field.type==='date'||field.type==='datetime')return <DateTimeField label={field.label} value={String(value||'')} onChange={onChange} dateOnly={field.type==='date'}/>;
 // 0.3.172: hora tambem pelo seletor, nao digitada
 if(field.type==='time')return <DateTimeField label={field.label} value={String(value||'')} onChange={onChange} timeOnly/>;
 if(field.key==='blocks_json')return <Blocks value={value||''} onChange={onChange}/>;
 if(field.key==='line_color')return <View style={{gap:8}}><Text style={{color:c.muted,fontSize:12}}>Cor da linha do gráfico</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{[PALETTE.brandLight,PALETTE.blue2,PALETTE.green2,PALETTE.orange4,PALETTE.red3,PALETTE.pink1].map(color=><Pressable key={color} accessibilityRole="radio" accessibilityState={{checked:value===color}} accessibilityLabel={'Cor '+color} onPress={()=>onChange(color)} style={{width:36,height:36,borderRadius:18,backgroundColor:color,borderWidth:value===color?3:0,borderColor:c.text}}/>)}</View></View>;
 if(field.type==='checkbox')return <View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={{flex:1,color:c.text,fontSize:14,lineHeight:21}}>{field.label}</Text><Switch value={!!value} onValueChange={onChange}/></View>;
 if(field.type==='select'||relations[field.key])return <View><Text style={[forms.label,{color:c.muted}]}>{field.label}</Text><Choice label={field.label} value={String(value||'')} options={[{value:'',label:'Não definido'},...(field.type==='select'?(field.options||[]).map(v=>({value:v,label:(field.key==='provider'?libraryPresentation('file').labels?.[v]:field.key==='type'?libraryPresentation('asset').labels?.[v]:null)||translated(v)})):choices)]} onChange={onChange}/></View>;
 return <Input label={field.label} value={String(value??'')} onChange={onChange} multiline={field.type==='textarea'} keyboardType={field.type==='number'?'numeric':field.type==='url'?'url':'default'} placeholder={field.type==='date'?'AAAA-MM-DD':field.type==='datetime'?'AAAA-MM-DD HH:MM':field.type==='time'?'HH:MM':''}/>;
}