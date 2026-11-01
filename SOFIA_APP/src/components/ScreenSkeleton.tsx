import React from 'react';
import {Platform,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Spinner,LoadingLines,useSkeletonDelay,LoadingCaption,DeskPageSkeleton} from './Loading';
/** What a tab shows the instant it is tapped for the first time, while its screen renders in a transition.
 * Principle: the gesture always gets a frame now; content follows. Deliberately tiny (a few views, no data). */
const TITLES:Record<string,string>={home:'Início',chat:'Conversa',pages:'Páginas',agenda:'Agenda',apps:'Apps',profile:'Perfil'};
export function ScreenSkeleton({tab}:{tab:string}){
 const c=useTheme(),show=useSkeletonDelay();
 if(Platform.OS==='web'&&typeof window!=='undefined'&&window.innerWidth>=900&&tab!=='home')return <DeskPageSkeleton title={TITLES[tab]} testID={'screen-skeleton-'+tab}/>;
 if(!show)return <View testID={'screen-wait-'+tab} style={{flex:1,backgroundColor:c.bg}}/>;
 return <View testID={'screen-skeleton-'+tab} style={{flex:1,backgroundColor:c.bg,paddingHorizontal:20,paddingTop:48,gap:14}}>
  <Text style={{color:c.text,fontSize:28,fontWeight:'600'}}>{TITLES[tab]||''}</Text>
  <LoadingCaption label="Carregando" />
  <LoadingLines rows={4}/>
 </View>;
}
