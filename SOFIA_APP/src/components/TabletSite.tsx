// 06/11/2026 (Pedro: "versao tablet apk exatamente igual o site, sem retrabalho"): no tablet Android o app mostra o proprio
// site da Sofia em tela cheia (mesmas telas, mesmas correcoes, atualiza junto com o site). O login do app e entregue ao
// site antes de ele abrir (mesmo formato que o site guarda), entao nao pede senha de novo. Os avisos continuam com o app
// (servicos de fundo e notificacoes ficam montados por baixo). Links de fora abrem no navegador; o voltar do Android volta
// dentro do site.
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,BackHandler,Linking,Pressable,Text,View} from 'react-native';
import type {Auth} from '../lib/types';
import {useTheme} from '../lib/theme';

export const SITE_BASE=String(process.env.EXPO_PUBLIC_API_URL||'https://sofiaos.up.railway.app').replace(/\/$/,'');
const SESSION_KEY='sofia.secure.sofia.native.session.v1';
/** Tablet = lado menor da tela com 600 dp ou mais (padrao do Android). */
export function isTabletSize(w:number,h:number){return Math.min(w,h)>=600;}
/** Script que roda antes do site: entrega a sessao do app se o site ainda nao tiver uma. */
export function sessionScript(auth:Auth){const value=JSON.stringify(JSON.stringify(auth));return `(function(){try{var k=${JSON.stringify(SESSION_KEY)};if(!localStorage.getItem(k))localStorage.setItem(k,${value});}catch(e){}})();true;`;}
const sameSite=(url:string)=>url===SITE_BASE||url.startsWith(SITE_BASE+'/')||url.startsWith('about:')||url.startsWith('blob:')||url.startsWith('data:');

export function TabletSite({auth}:{auth:Auth}){
 const c=useTheme(),web=useRef<any>(null),canBack=useRef(false),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[key,setKey]=useState(0);
 useEffect(()=>{const s=BackHandler.addEventListener('hardwareBackPress',()=>{if(canBack.current&&web.current){web.current.goBack();return true;}return false;});return()=>s.remove();},[]);
 const WebView=require('react-native-webview').default;
 if(failed)return <View style={{flex:1,alignItems:'center',justifyContent:'center',gap:12,padding:24,backgroundColor:c.bg}}>
  <Text style={{color:c.text,fontSize:18,fontWeight:'600'}}>Sem conexão com a Sofia</Text>
  <Text style={{color:c.muted,fontSize:14,textAlign:'center'}}>No tablet a Sofia abre pela internet. Confira a conexão e tente de novo.</Text>
  <Pressable accessibilityRole="button" onPress={()=>{setFailed(false);setLoaded(false);setKey(k=>k+1);}} style={{paddingHorizontal:18,paddingVertical:10,borderRadius:10,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontWeight:'600'}}>Tentar de novo</Text></Pressable>
 </View>;
 return <View style={{flex:1,backgroundColor:c.bg}}>
  <WebView key={key} ref={web} testID="tablet-site" source={{uri:SITE_BASE+'/inicio'}} style={{flex:1,backgroundColor:c.bg}}
   injectedJavaScriptBeforeContentLoaded={sessionScript(auth)} originWhitelist={['https://*','about:*','blob:*','data:*']}
   javaScriptEnabled domStorageEnabled allowFileAccess={false} allowsBackForwardNavigationGestures setSupportMultipleWindows={false}
   mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback
   onNavigationStateChange={(s:any)=>{canBack.current=!!s.canGoBack;}}
   onShouldStartLoadWithRequest={(r:any)=>{const url=String(r?.url||'');if(sameSite(url))return true;if(/^(https?|mailto|tel):/i.test(url))void Linking.openURL(url).catch(()=>{});return false;}}
   onLoadEnd={()=>setLoaded(true)} onError={()=>setFailed(true)} onHttpError={(e:any)=>{if(Number(e?.nativeEvent?.statusCode)>=500&&!loaded)setFailed(true);}}/>
  {loaded?null:<View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center',backgroundColor:c.bg}}><ActivityIndicator color={c.accent}/></View>}
 </View>;
}
