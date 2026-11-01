import {queueOptional} from './fluency';
import {useEffect,useRef} from 'react';
import {AppState,NativeModules,Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {capsuleStore} from './capsule-store';
import {capsuleDay,capsuleNotificationPlan,capsuleNotificationLimit} from './capsule-model';
import {enqueueNotifications,reconcileNotificationRequests,NOTIFICATION_CHANNEL_LIMIT,NOTIFICATION_SIGNATURE_VERSION,notificationFailure} from './notification-scheduler';
import {ensureSystemNotificationPermission} from './system-notification-permission';
import type {SofiaApi} from './api';
const PREFIX='sofia-capsule:',CHANNEL='sofia-capsules';
let generation=0;
let retry:(()=>Promise<void>)|undefined;
export async function retryCapsuleNotifications(){await retry?.();}
export async function capsuleExactPermission(){return Platform.OS!=='android'||!!(await NativeModules.SofiaAlarms?.canScheduleExact());}
export async function openCapsuleAlarmSettings(){if(Platform.OS==='android')await NativeModules.SofiaAlarms?.openExactSettings();}
export let capsuleNotificationWarning='';
function scopeId(scope:string){let hash=2166136261;for(const c of scope)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0).toString(36);}
export async function requestCapsulePermission(){
 await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Cápsulas da Sofia',importance:Notifications.AndroidImportance.HIGH,sound:'default',vibrationPattern:[0,250,120,250]});
 return ensureSystemNotificationPermission();
}
export function useCapsuleNotifications(api:SofiaApi,scope:string,enabled:boolean|null,onOpen:()=>void){
 const latest=useRef(onOpen);latest.current=onOpen;
 useEffect(()=>{
  if(enabled===null)return;
  const store=capsuleStore(api),epoch=++generation;let stopped=false;
  const reconcile=async()=>{
   if(stopped||epoch!==generation)return;
   const requests=await Notifications.getAllScheduledNotificationsAsync(),old=new Map(requests.filter(n=>n.identifier.startsWith(PREFIX)).map(n=>[n.identifier,n]));
   if(!enabled){for(const id of old.keys())await Notifications.cancelScheduledNotificationAsync(id);return;}
   if(!store.snapshot.loaded)return;
   await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Cápsulas da Sofia',importance:Notifications.AndroidImportance.HIGH,sound:'default',vibrationPattern:[0,250,120,250]});
   const exact=await capsuleExactPermission(),all=capsuleNotificationPlan(store.snapshot.plans,store.snapshot.history),plan=capsuleNotificationLimit(all,NOTIFICATION_CHANNEL_LIMIT);
   if(all.length&&!(await ensureSystemNotificationPermission())){capsuleNotificationWarning='Notificações desativadas neste celular. Ative-as para receber os lembretes da Rotina.';return;}
   const desired:Notifications.NotificationRequestInput[]=[];
   for(const notice of plan){
    if(stopped||epoch!==generation)return;
    const id=PREFIX+scopeId(scope)+':'+notice.id,signature=JSON.stringify([NOTIFICATION_SIGNATURE_VERSION,notice.title,notice.body,notice.date.getTime(),exact]);
    desired.push({identifier:id,content:{title:notice.title,body:notice.body,sound:'default',priority:Notifications.AndroidNotificationPriority.HIGH,data:{sofiaCapsule:true,scope:scopeId(scope),signature,early:notice.early,planId:notice.planId,day:notice.day,time:notice.time}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:notice.date,channelId:CHANNEL}});
   }
   if(stopped||epoch!==generation)return;
   await reconcileNotificationRequests(Notifications,PREFIX,desired,()=>!stopped&&epoch===generation);
   const delivered=await Notifications.getPresentedNotificationsAsync().catch(()=>[]);
   // 0.3.189: sai da bandeja a dose ja tomada E a de um dia que ja passou (antes ficava ate a pessoa tirar)
   const today=capsuleDay(new Date());
   for(const n of delivered){
    if(!n.request.identifier.startsWith(PREFIX))continue;
    const data=n.request.content.data||{},past=String(data.day||'')<today;
    const taken=store.snapshot.history.some(h=>h.data.capsule_id===data.planId&&h.data.day===data.day&&h.data.time===data.time);
    if(past||taken)await Notifications.dismissNotificationAsync(n.request.identifier).catch(()=>{});
   }
   if(!stopped&&epoch===generation)capsuleNotificationWarning='';
  };
  const changed=()=>enqueueNotifications(reconcile).catch(error=>{if(!stopped&&epoch===generation)capsuleNotificationWarning=notificationFailure(error);});
  retry=changed;store.listeners.add(changed);const cancelInitial=enabled?queueOptional('capsules:inventory',()=>{void store.load().then(changed);},7,8000):(()=>{changed();return()=>{};})();
  const open=(r:Notifications.NotificationResponse)=>{const d=r.notification.request.content.data;if(enabled&&d?.sofiaCapsule&&d.scope===scopeId(scope)){latest.current();void Notifications.clearLastNotificationResponseAsync();}};
  const response=Notifications.addNotificationResponseReceivedListener(open);if(enabled)void Notifications.getLastNotificationResponseAsync().then(r=>{if(r&&!stopped)open(r);});
  const state=AppState.addEventListener('change',s=>{if(s==='active'&&enabled)void store.load().then(changed);});
  const timer=setInterval(()=>{if(enabled&&AppState.currentState==='active')void store.load().then(changed);},60000);
  return()=>{cancelInitial();stopped=true;if(retry===changed)retry=undefined;generation++;store.listeners.delete(changed);response.remove();state.remove();clearInterval(timer);};
 },[api,scope,enabled]);
}
