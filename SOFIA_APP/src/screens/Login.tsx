import React, { useState } from 'react';
import {PALETTE} from '../lib/palette';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Pressable, Linking } from 'react-native';
import { SofiaApi, SITE } from '../lib/api';
import { useTheme } from '../lib/theme';
import { errorText } from '../lib/chat-model';
import type { Auth } from '../lib/types';
import { Brand, Button, ErrorBanner, IconButton, forms } from '../components/UI';
import { DialogContext, useDesktop } from '../lib/desktop';
import { CAPS_MESSAGE, useCapsLock } from '../lib/caps-lock';
export function Login({ onLogin }: { onLogin: (a: Auth) => Promise<void> }) {
 const c=useTheme(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 // 0.3.258: segundo passo do site - codigo no e-mail em navegador novo
 const [challenge,setChallenge]=useState(''),[sentTo,setSentTo]=useState(''),[code,setCode]=useState('');
 async function enter(withCode=false) { if(loading||!email.trim()||!password)return;if(withCode&&code.replace(/\D/g,'').length!==6){setError('Digite os 6 números do código.');return;}setLoading(true);setError('');try{const r=await new SofiaApi().login(email,password,`Sofia App · ${Platform.OS}`,withCode?{code,challenge}:{});if('need_code' in r){setChallenge(r.challenge);setSentTo(r.sent_to);setCode('');return;}await onLogin(r);setPassword('');setChallenge('');setCode('');}catch(e){setError(errorText(e));if(withCode&&/expirou|Muitas tentativas/.test(errorText(e)))setChallenge('');}finally{setLoading(false);} }
 // 0.3.261 (rodada premium, fase 3 — login): no computador a tela e dividida. A esquerda e a marca (o primeiro contato com
 // a Sofia); a direita, uma coluna estreita centralizada com o formulario, num eixo so: rotulos, campos, "Esqueceu a senha?"
 // logo abaixo da senha, botao na largura do formulario e Privacidade/Termos no pe da coluna. No celular continua como era.
 const desktop=useDesktop();
 const [pwFocus,setPwFocus]=useState(false),caps=useCapsLock(pwFocus);
 const fields=<>
 <View><Text style={[forms.label,{color:c.muted}]}>E-mail</Text><TextInput accessibilityLabel="E-mail de login" value={email} onChangeText={setEmail} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input}]} placeholder="Seu e-mail cadastrado" placeholderTextColor={c.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={160}/></View>
 <View><Text style={[forms.label,{color:c.muted}]}>Senha</Text><View style={[forms.input,{flexDirection:'row',alignItems:'center',paddingRight:4,borderColor:c.line,backgroundColor:c.input}]}><TextInput accessibilityLabel="Senha da Sofia" value={password} onChangeText={setPassword} style={{flex:1,color:c.text,fontSize:16,minHeight:50}} placeholder="Senha da sua conta" placeholderTextColor={c.muted} secureTextEntry={!visible} autoComplete="current-password" textContentType="password" maxLength={200} onFocus={()=>setPwFocus(true)} onBlur={()=>setPwFocus(false)} onSubmitEditing={()=>void enter()} returnKeyType="go"/><IconButton name={visible?'eyeOff':'eye'} label={visible?'Ocultar senha':'Mostrar senha'} onPress={()=>setVisible(!visible)}/></View>{caps?<Text testID="caps-lock-warning" style={{color:c.danger,fontSize:12,marginTop:4}}>⇪ {CAPS_MESSAGE}</Text>:null}</View>
 <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(SITE+'/forgot-password')} style={{alignSelf:'flex-end',minHeight:32,justifyContent:'center'}}><Text style={{color:c.accent,fontSize:13,fontWeight:'500'}}>Esqueceu a senha?</Text></Pressable>
 {challenge?<View testID="login-code-step" style={{gap:10}}><Text style={{color:c.text,fontWeight:'600'}}>Confirme que é você</Text><Text style={{color:c.muted,lineHeight:20}}>Enviamos um código de 6 números para {sentTo||'o seu e-mail cadastrado'}. É só neste navegador novo; depois ele lembra de você por 90 dias.</Text><TextInput testID="login-code" accessibilityLabel="Código de acesso" value={code} onChangeText={v=>setCode(v.replace(/\D/g,'').slice(0,6))} onSubmitEditing={()=>void enter(true)} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input,letterSpacing:6,fontSize:20}]} placeholder="000000" placeholderTextColor={c.muted} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} autoFocus/><Button title="Confirmar e entrar" onPress={()=>void enter(true)} loading={loading} disabled={code.length!==6}/><Pressable accessibilityRole="button" onPress={()=>void enter(false)} style={{alignSelf:'flex-start',minHeight:32,justifyContent:'center'}}><Text style={{color:c.accent,fontWeight:'500',fontSize:13}}>Enviar outro código</Text></Pressable></View>:<Button title="Entrar" onPress={()=>void enter()} loading={loading} disabled={!email.trim()||!password}/>}
 </>;
 const legal=<View style={{flexDirection:'row',justifyContent:'center',gap:24}}>{[['Privacidade','privacy'],['Termos','terms']].map(([label,path])=><Pressable key={path} accessibilityRole="link" onPress={()=>void Linking.openURL(SITE+'/'+path)} style={{minHeight:40,justifyContent:'center'}}><Text style={{fontSize:12,color:c.muted}}>{label}</Text></Pressable>)}</View>;
 if(desktop)return <View testID="login-desktop" style={{flex:1,flexDirection:'row',backgroundColor:c.bg}}>
  <View style={{flex:1.15,backgroundColor:PALETTE.violetDark1,padding:56,justifyContent:'space-between',overflow:'hidden'}}>
   <View pointerEvents="none" style={{position:'absolute',width:620,height:620,borderRadius:310,backgroundColor:PALETTE.brand,opacity:0.28,right:-180,top:-160}}/>
   <View pointerEvents="none" style={{position:'absolute',width:420,height:420,borderRadius:210,backgroundColor:PALETTE.violetLight3,opacity:0.12,left:-140,bottom:-120}}/>
   <View style={{flexDirection:'row',gap:12,alignItems:'center'}}><Brand size={40}/><Text style={{color:PALETTE.lavender,fontWeight:'600',fontSize:18}}>Sofia OS</Text></View>
   <View style={{maxWidth:560,gap:18}}><Text style={{fontSize:56,lineHeight:64,letterSpacing:-2,fontWeight:'700',color:PALETTE.lavender}}>Seu dia.{'\n'}Sua Sofia.</Text><Text style={{color:PALETTE.violetLight4,lineHeight:28,fontSize:18}}>Um lugar para conversar, lembrar e organizar o que importa.</Text></View>
   <Text style={{color:PALETTE.gray3,fontSize:12}}>Agenda, finanças, páginas e e-mails no mesmo lugar, no celular e no computador.</Text>
  </View>
  <ScrollView nativeID="sofia-login-ready" keyboardShouldPersistTaps="handled" style={{flex:1,maxWidth:560}} contentContainerStyle={{flexGrow:1,justifyContent:'center',paddingHorizontal:64,paddingVertical:48}}>
   <DialogContext.Provider value={true}><View style={{width:'100%',maxWidth:400,alignSelf:'center',gap:18}}>
    <View style={{gap:6,marginBottom:6}}><Text style={{fontSize:28,lineHeight:34,fontWeight:'600',color:c.text}}>Entrar</Text><Text style={{color:c.muted,fontSize:14}}>Use o e-mail e a senha da sua conta.</Text></View>
    {fields}
    {error?<ErrorBanner text={error}/>:null}
   </View></DialogContext.Provider>
   <View style={{marginTop:40,alignSelf:'center'}}>{legal}</View>
  </ScrollView>
 </View>;
 return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView nativeID="sofia-login-ready" keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,padding:28,justifyContent:'center'}}>
 <View style={{gap:24}}><View style={{flexDirection:'row',gap:12,alignItems:'center'}}><Brand/><Text style={{color:c.text,fontWeight:'600',fontSize:18}}>Sofia OS</Text></View>
 <View><Text style={{fontSize:40,lineHeight:48,letterSpacing:-1.7,fontWeight:'600',color:c.text}}>Seu dia.{'\n'}Sua Sofia.</Text><Text style={{color:c.muted,lineHeight:23,marginTop:14,fontSize:16}}>Um lugar para conversar, lembrar e organizar o que importa.</Text></View>
 <View style={[forms.card,{backgroundColor:c.surface,borderWidth:1,borderColor:c.line,padding:20,gap:18}]}>
 {fields}</View>{error?<ErrorBanner text={error}/>:null}
 <Text style={{fontSize:12,lineHeight:19,color:c.muted,textAlign:'center'}}>A mesma conta e os mesmos dados do site.{'\n'}A conversa no app não depende do WhatsApp.</Text>
 <View style={{flexDirection:'row',justifyContent:'center',gap:24}}>{[['Privacidade','privacy'],['Termos','terms']].map(([label,path])=><Pressable key={path} accessibilityRole="link" onPress={()=>void Linking.openURL(SITE+'/'+path)} style={{minHeight:40,justifyContent:'center'}}><Text style={{fontSize:12,color:c.muted}}>{label}</Text></Pressable>)}</View>
 </View></ScrollView></KeyboardAvoidingView>;
}
