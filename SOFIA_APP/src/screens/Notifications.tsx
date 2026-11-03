import React from 'react';
import {ScrollView,View,RefreshControl} from 'react-native';
import {SofiaApi} from '../lib/api';
import {ScreenTitle,IconButton} from '../components/UI';
import {NotificationList,useNotifications,DeskNotificationsPage} from '../components/NotificationCenter';
import {useDesktop} from '../lib/desktop';
import {dpx} from '../lib/content-width';
export function Notifications({api,onBack}:{api:SofiaApi;onBack?:()=>void}){const n=useNotifications(),desktop=useDesktop();return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:28}} refreshControl={<RefreshControl refreshing={n.loading} onRefresh={()=>void n.refresh()}/>}><ScreenTitle eyebrow="ATIVIDADES · AVISOS" title="Todas as notificações" right={<View style={{flexDirection:'row'}}>{n.unread>0&&!desktop?<IconButton name="check" label="Marcar tudo como lido" onPress={()=>void n.readAll()}/>:null}{onBack?<IconButton name="back" label="Voltar" onPress={onBack}/>:null}</View>}/>{desktop?<View style={{paddingLeft:dpx(40),paddingRight:dpx(40),paddingTop:8} as any}><DeskNotificationsPage/></View>:<View style={{paddingHorizontal:22}}><NotificationList grouped/></View>}</ScrollView>;}
