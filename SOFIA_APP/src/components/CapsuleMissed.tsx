import React,{useEffect,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTheme} from '../lib/theme';
import {capsuleDay,capsuleDayLabel,capsuleMissed} from '../lib/capsule-model';
import type {CapsuleDose} from '../lib/capsule-model';
import type {Entity} from '../lib/types';
import {Icon} from './Icon';

/** 0.3.223: doses atrasadas (de dias anteriores) ficam ate a pessoa marcar. Comecam a contar no dia em que esta versao
 * anterior ao que esta versao entrou no aparelho (ontem ja aparece), sem trazer de uma vez as de semanas atras. */
const SINCE_KEY='sofia-capsule-missed-since-v1';
const yesterday=()=>{const d=new Date();return capsuleDay(new Date(d.getFullYear(),d.getMonth(),d.getDate()-1));};
let since:string|null=null;
export function useMissedSince():string{
 const [value,setValue]=useState(since||yesterday());
 useEffect(()=>{if(since)return;void AsyncStorage.getItem(SINCE_KEY).then(v=>{if(v&&/^\d{4}-\d{2}-\d{2}$/.test(v)){since=v;}else{since=yesterday();void AsyncStorage.setItem(SINCE_KEY,since).catch(()=>{});}setValue(since);}).catch(()=>{});},[]);
 return value;
}
type Take=(planId:string,day:string,time:string)=>Promise<void>;
export function CapsuleMissedList({plans,history,saving,take,compact=false}:{plans:Entity[];history:Entity[];saving:string;take:Take;compact?:boolean}){
 const c=useTheme(),from=useMissedSince(),missed=capsuleMissed(plans,history,from),[busy,setBusy]=useState('');
 if(!missed.length)return null;
 const groups=new Map<string,CapsuleDose[]>();for(const d of missed)groups.set(d.plan.id,[...(groups.get(d.plan.id)||[]),d]);
 async function takeAll(list:CapsuleDose[]){setBusy(list[0].plan.id);try{for(const d of list)await take(d.plan.id,d.day,d.time);}catch{/* o erro aparece no app */}finally{setBusy('');}}
 return <View style={{gap:10}}>
  {[...groups.values()].map(list=>{const plan=list[0].plan;return <View key={plan.id} style={{padding:compact?12:14,gap:8,borderRadius:18,backgroundColor:c.danger+'12',borderWidth:1,borderColor:c.danger+'55'}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
    <View style={{flex:1,gap:2}}>
     <Text style={{color:c.text,fontSize:compact?15:16,fontWeight:'500'}}>{plan.title}</Text>
     <Text style={{color:c.danger,fontSize:12,fontWeight:'600'}}>{list.length===1?'1 dose atrasada':list.length+' doses atrasadas'}</Text>
    </View>
    {list.length>1?<Pressable accessibilityRole="button" accessibilityLabel={'Tomei todas as doses atrasadas de '+plan.title} disabled={!!saving||!!busy} onPress={()=>void takeAll(list)} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:99,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontWeight:'600',fontSize:12}}>{busy===plan.id?'Marcando…':'Tomei todas'}</Text></Pressable>:null}
   </View>
   {list.map(d=><View key={d.key} style={{flexDirection:'row',alignItems:'center',gap:10}}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={'Tomei '+plan.title+' de '+capsuleDayLabel(d.day)+' às '+d.time} accessibilityState={{checked:false}} disabled={!!saving||!!busy} onPress={()=>void take(d.plan.id,d.day,d.time).catch(()=>{})} style={{padding:6}}><Icon name="check" color={c.muted}/></Pressable>
    <Text style={{flex:1,color:c.muted,fontSize:13}}>{capsuleDayLabel(d.day)}, {d.time} · atrasada</Text>
    <Pressable accessibilityRole="button" disabled={!!saving||!!busy} onPress={()=>void take(d.plan.id,d.day,d.time).catch(()=>{})} style={{paddingHorizontal:10,paddingVertical:6,borderRadius:99,backgroundColor:c.accent+'22'}}><Text style={{color:c.accent,fontWeight:'600',fontSize:12}}>Tomei</Text></Pressable>
   </View>)}
  </View>;})}
 </View>;
}
