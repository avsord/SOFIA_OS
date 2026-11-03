import React from 'react';
import {ScrollView,View,RefreshControl,Pressable,Text} from 'react-native';
import {SofiaApi} from '../lib/api';
import {ScreenTitle,IconButton} from '../components/UI';
import {NotificationList,useNotifications,DeskNotificationsPage} from '../components/NotificationCenter';
import {useDesktop} from '../lib/desktop';
import {dpx} from '../lib/content-width';
import {useTheme} from '../lib/theme';
export function Notifications({api,onBack}:{api:SofiaApi;onBack?:()=>void}){const n=useNotifications(),desktop=useDesktop(),c=useTheme();return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:28}} refreshControl={<RefreshControl refreshing={n.loading} onRefresh={()=>void n.refresh()}/>}><ScreenTitle title="Notificações" onBack={onBack} right={n.unread>0&&!desktop?<Pressable accessibilityRole="button" accessibilityLabel="Marcar tudo como lido" hitSlop={8} onPress={()=>void n.readAll()} style={({pressed}:any)=>({paddingHorizontal:4,paddingVertical:6,opacity:pressed?0.6:1})}><Text style={{color:c.accent,fontSize:13,fontWeight:'600'}}>Ler todas</Text></Pressable>:null}/>{desktop?<View style={{paddingLeft:dpx(40),paddingRight:dpx(40),paddingTop:8} as any}><DeskNotificationsPage/></View>:<View style={{paddingHorizontal:22}}><NotificationList grouped/></View>}</ScrollView>;}
