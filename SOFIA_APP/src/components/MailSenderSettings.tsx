import * as WebBrowser from 'expo-web-browser';
import React,{useEffect,useState} from 'react';
import {View,Text} from 'react-native';
import {SofiaApi} from '../lib/api';
import {useTheme} from '../lib/theme';
import {errorText} from '../lib/chat-model';
import {Button,ErrorBanner,forms} from './UI';
/** 06/11/2026 (Pedro: "EMAIL DA SOFIA ENVIA PARA O USUARIO, NAO O MEU EMAIL"): o e-mail da propria Sofia manda o link de
 * "Esqueceu a senha?" e o codigo do login para o e-mail do usuario. O servidor (Railway) nao manda e-mail sozinho, entao o
 * e-mail da Sofia e ligado uma vez, so para ENVIAR (nao le nada), e so aceita a conta da Sofia. */
export function MailSenderSettings({api}:{api:SofiaApi}){
 const c=useTheme(),[s,setS]=useState<{configured:boolean;connected:boolean;email:string;address:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{try{setS(await api.mailSenderStatus());}catch{setS(null);}};
 useEffect(()=>{void load();},[]);
 async function connect(){setBusy(true);setError('');try{const r=await api.mailSenderConnect();const url=new URL(r.url);if(url.protocol!=='https:')throw Error('Endereço de autorização inválido.');
   const session=await WebBrowser.openAuthSessionAsync(url.toString(),'sofiaapp://google');
   if(session.type==='success'){const back=new URL(session.url.replace('sofiaapp://','https://x/'));if(back.searchParams.get('ok')!=='1')throw Error(back.searchParams.get('message')||'O Google não concluiu a conexão.');}
   await load();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 if(!s||!s.configured)return null;
 const who=s.email||s.address||'o e-mail da Sofia';
 return <View testID="mail-sender-card" style={[forms.card,{backgroundColor:c.surface,borderWidth:1,borderColor:c.line}]}>
  <Text style={{fontSize:18,fontWeight:'500',color:c.text}}>E-mail da Sofia</Text>
  {s.connected?<Text style={{color:c.text,fontSize:14,lineHeight:20}}>A Sofia manda os e-mails dela de <Text style={{fontWeight:'600'}}>{who}</Text>: o link do “Esqueceu a senha?” e o código para entrar num computador novo chegam no e-mail do usuário.</Text>
   :<><Text style={{color:c.text,fontSize:14,lineHeight:20}}>Para o “Esqueceu a senha?” mandar o link por e-mail, ligue o e-mail da Sofia{s.address?<> (<Text style={{fontWeight:'600'}}>{s.address}</Text>)</>:null}. É uma vez só: na tela do Google, entre com <Text style={{fontWeight:'600'}}>o e-mail da Sofia</Text> (não o seu) e clique em Permitir. A Sofia só ganha permissão para enviar; não lê nada.</Text>
    <Button title="Ligar o e-mail da Sofia" loading={busy} onPress={()=>void connect()}/></>}
  {error?<ErrorBanner text={error}/>:null}
 </View>;
}
