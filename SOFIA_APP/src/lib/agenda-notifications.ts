import {queueOptional} from './fluency';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {reminderLabel,reminderOffsets} from './agenda-reminders';
import {enqueueNotifications,reconcileNotificationRequests,NOTIFICATION_CHANNEL_LIMIT,NOTIFICATION_SIGNATURE_VERSION,notificationFailure} from './notification-scheduler';
import {ensureSystemNotificationPermission} from './system-notification-permission';
import {useEffect,useRef} from 'react';
import {AppState} from 'react-native';
import * as Notifications from 'expo-notifications';
import {occurrences,eventStart,readRepeat} from './agenda-recurrence';
import {subscribeAgenda} from './agenda-events';
import {localDateKey} from './dashboard';
import type {SofiaApi} from './api';
import type {AgendaItem} from './types';
const CHANNEL='sofia-agenda',PREFIX='sofia-agenda:';
const permissionListeners=new Set<()=>void>();
let generation=0;
export let notificationWarning='';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
export async function requestAgendaPermission(){
 await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Agenda da Sofia',importance:Notifications.AndroidImportance.HIGH,sound:'default',vibrationPattern:[0,250,120,250]});
 const granted=await ensureSystemNotificationPermission();permissionListeners.forEach(f=>f());return granted;
}
export function notificationPlan(items:AgendaItem[],now=new Date()){
 const end=new Date(now.getFullYear()+2,now.getMonth(),now.getDate()),planned:{id:string;title:string;body:string;date:Date;day:string;entityId:string;alarm?:string}[]=[];
 for(const item of items){
  if(item.tags?.includes('sofia-notify-v1:off'))continue;
  // 0.3.146: feriado do calendario de feriados (Google) aparece na Agenda, mas nao avisa.
  if(/holiday@group\.v\.calendar/i.test(String((item.data as {calendar_id?:string})?.calendar_id||'')))continue;
  // 0.3.201: um aviso para cada antecedencia escolhida (como no Google Agenda); sem nenhuma, avisa no horario
  const offsets=item.kind==='commitment'?reminderOffsets(item.data as Record<string,unknown>):[Math.max(0,Math.min(525600,Number(item.data.remind_minutes)||0))];
  for(const minutes of (offsets.length?offsets:[0])){
   const ahead=minutes*60000,from=new Date(now.getTime()+ahead),to=readRepeat(item).frequency==='none'?new Date(8640000000000000):new Date(end.getTime()+ahead);
   for(const event of occurrences(item,from,to)){const start=eventStart(event),date=new Date((start.length===10?new Date(start+'T09:00:00').getTime():Date.parse(start))-ahead);if(date<=now)continue;
    // 0.3.312: aviso desligado so desta vez (marca sofia-skip-v1:<inicio da ocorrencia>)
    if(item.tags?.includes('sofia-skip-v1:'+new Date(start.length===10?start+'T09:00:00':start).toISOString()))continue;
    planned.push({id:item.id+':'+date.getTime(),entityId:item.id,alarm:['once','ring'].includes(String((item.data as {alarm_mode?:string}).alarm_mode))?String((item.data as {alarm_mode?:string}).alarm_mode):'',title:item.title,body:minutes?'Começa em '+reminderLabel(minutes).replace(' antes','')+(event.data.location?' · '+event.data.location:''):(event.data.location||'Seu compromisso na agenda da Sofia.'),date,day:localDateKey(start)});}
  }
 }
 return planned.sort((a,b)=>a.date.getTime()-b.date.getTime());
}
function scopeId(scope:string){let hash=2166136261;for(const c of scope)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0).toString(36);}
const ALARM_CHANNEL='sofia-alarme-v1',ALARM_CATEGORY='sofia-alarme',ALARM_SOUND='sofia_alarm.wav',ALARM_REPEATS=10,DISMISSED_KEY='sofia.alarm.dismissed.v1';
async function prepareAlarms(){
 await Notifications.setNotificationChannelAsync(ALARM_CHANNEL,{name:'Alarmes da Sofia',importance:Notifications.AndroidImportance.MAX,sound:ALARM_SOUND,bypassDnd:true,vibrationPattern:[0,800,400,800,400,800],lockscreenVisibility:Notifications.AndroidNotificationVisibility.PUBLIC,
  audioAttributes:{usage:Notifications.AndroidAudioUsage.ALARM,contentType:Notifications.AndroidAudioContentType.SONIFICATION}});
 await Notifications.setNotificationCategoryAsync(ALARM_CATEGORY,[{identifier:'desligar',buttonTitle:'Desligar',options:{opensAppToForeground:true}},{identifier:'adiar',buttonTitle:'Adiar 5 min',options:{opensAppToForeground:true}}]);
}
async function dismissedAlarms():Promise<Set<string>>{try{const a=JSON.parse((await AsyncStorage.getItem(DISMISSED_KEY))||'[]');return new Set(Array.isArray(a)?a.map(String):[]);}catch{return new Set();}}
/** Desligar (ou adiar) um alarme: para as repeticoes que ainda iam tocar e nao deixa a Sofia reagendar. */
export async function stopAlarm(group:string,snoozeMinutes=0,content?:Notifications.NotificationContent){
 const set=await dismissedAlarms();set.add(group);await AsyncStorage.setItem(DISMISSED_KEY,JSON.stringify([...set].slice(-300))).catch(()=>{});
 for(const n of await Notifications.getAllScheduledNotificationsAsync())if((n.content.data as {sofiaAlarm?:string}|undefined)?.sofiaAlarm===group)await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(()=>{});
 for(const n of await Notifications.getPresentedNotificationsAsync().catch(()=>[]))if((n.request.content.data as {sofiaAlarm?:string}|undefined)?.sofiaAlarm===group)await Notifications.dismissNotificationAsync(n.request.identifier).catch(()=>{});
 if(snoozeMinutes>0&&content){await prepareAlarms();await Notifications.scheduleNotificationAsync({content:{title:content.title||'⏰ Alarme',body:(content.body||'')+' · adiado',sound:ALARM_SOUND,priority:Notifications.AndroidNotificationPriority.MAX,categoryIdentifier:ALARM_CATEGORY,data:{...(content.data||{}),sofiaAlarm:group+'#adiado'+Date.now()}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(Date.now()+snoozeMinutes*60000),channelId:ALARM_CHANNEL}});}
}
async function reconcile(items:AgendaItem[],scope:string,epoch:number){
 if(epoch!==generation)return;
 await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Agenda da Sofia',importance:Notifications.AndroidImportance.HIGH,sound:'default',vibrationPattern:[0,250,120,250]});
 const all=notificationPlan(items),plan=all.slice(0,NOTIFICATION_CHANNEL_LIMIT);
 if(all.length&&!(await ensureSystemNotificationPermission())){notificationWarning='Notificações desativadas neste celular. Ative-as para receber os lembretes da Agenda.';return;}
 const desired:Notifications.NotificationRequestInput[]=[];
 if(plan.some(e=>e.alarm))await prepareAlarms();
 const dismissed=await dismissedAlarms();
 for(const event of plan){
  if(epoch!==generation)return;
  const id=PREFIX+scopeId(scope)+':'+event.id,signature=JSON.stringify([NOTIFICATION_SIGNATURE_VERSION,event.title,event.body,event.day]);
  if(event.alarm){
   // 0.3.201: alarme - canal proprio (volume de alarme, passa pelo Nao perturbe) e, no modo "ate desligar",
   // repete a cada minuto por ate 10 minutos, ate a pessoa tocar em Desligar ou Adiar.
   const group=event.entityId+'@'+event.date.getTime();if(dismissed.has(group))continue;
   const times=event.alarm==='ring'?ALARM_REPEATS:1;
   for(let k=0;k<times;k++){const at=new Date(event.date.getTime()+k*60000);if(at.getTime()<=Date.now())continue;
    desired.push({identifier:id+':a'+k,content:{title:'⏰ '+event.title,body:k?event.body+' · tocando de novo':event.body,sound:ALARM_SOUND,priority:Notifications.AndroidNotificationPriority.MAX,categoryIdentifier:ALARM_CATEGORY,sticky:event.alarm==='ring',data:{sofiaAgenda:true,sofiaAlarm:group,scope:scopeId(scope),entityId:event.entityId,day:event.day,signature:signature+':'+event.alarm+':'+k}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:at,channelId:ALARM_CHANNEL}});}
   continue;
  }
  desired.push({identifier:id,content:{title:event.title,body:event.body,sound:'default',priority:Notifications.AndroidNotificationPriority.HIGH,data:{sofiaAgenda:true,scope:scopeId(scope),entityId:event.entityId,day:event.day,signature}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:event.date,channelId:CHANNEL}});
 }
 if(epoch!==generation)return;
 await reconcileNotificationRequests(Notifications,PREFIX,desired,()=>epoch===generation);
 notificationWarning=all.length>NOTIFICATION_CHANNEL_LIMIT?'Há mais de 128 lembretes futuros. Os próximos estão agendados; a Sofia atualiza a lista ao abrir.':'';
}
export function useAgendaNotifications(api:SofiaApi,scope:string,enabled:boolean|null,onOpen:(day:string,id?:string)=>void){
 const latest=useRef(onOpen);latest.current=onOpen;
 useEffect(()=>{
  if(enabled===null)return;
  const epoch=++generation;let stopped=false,inFlight=false,rerun=false;
  const refresh=async()=>{if(stopped||!enabled)return;if(inFlight){rerun=true;return;}inFlight=true;try{const result=await api.agenda();if(stopped)return;await enqueueNotifications(()=>reconcile(result.items,scope,epoch));}catch(error){if(!stopped)notificationWarning=notificationFailure(error);}finally{inFlight=false;if(rerun&&!stopped){rerun=false;void refresh();}}};
  const open=(response:Notifications.NotificationResponse)=>{const d=response.notification.request.content.data;
   // 0.3.201: botoes do alarme (e tocar no proprio alarme) param as repeticoes
   if(typeof d?.sofiaAlarm==='string'){void stopAlarm(d.sofiaAlarm,response.actionIdentifier==='adiar'?5:0,response.notification.request.content);if(response.actionIdentifier==='adiar'||response.actionIdentifier==='desligar'){void Notifications.clearLastNotificationResponseAsync();return;}}if(enabled&&d?.sofiaAgenda&&d.scope===scopeId(scope)&&typeof d.day==='string'&&typeof d.entityId==='string'){latest.current(d.day,d.entityId);void Notifications.clearLastNotificationResponseAsync();}};
  const response=Notifications.addNotificationResponseReceivedListener(open),state=AppState.addEventListener('change',s=>{if(s==='active')void refresh();}),unsub=subscribeAgenda(owner=>{if(owner===api)void refresh();}),permission=()=>void refresh();permissionListeners.add(permission);
  const cancelInitial=enabled?queueOptional('agenda:inventory',()=>{void refresh();},7,8000):()=>{};
  if(enabled){void Notifications.getLastNotificationResponseAsync().then(r=>{if(r&&!stopped)open(r);});}
  else void enqueueNotifications(async()=>{for(const n of await Notifications.getAllScheduledNotificationsAsync())if(n.identifier.startsWith(PREFIX))await Notifications.cancelScheduledNotificationAsync(n.identifier);}).catch(()=>{});
  const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},60000);
  return()=>{cancelInitial();stopped=true;generation++;clearInterval(timer);response.remove();state.remove();unsub();permissionListeners.delete(permission);};
 },[api,scope,enabled]);
}
