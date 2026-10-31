import React,{useEffect,useRef,useState} from 'react';
import {Alert,Modal,Pressable,Text,View} from 'react-native';
import {useTheme} from './theme';

// 0.3.154: confirmacoes no visual da Sofia. Com 1 ou 2 botoes curtos ficam lado a lado, do mesmo
// tamanho; com 3 ou mais (ex.: foto do perfil) viram uma lista de acoes, uma por linha, com
// "Cancelar" separado no fim. Mesma assinatura do Alert.alert; sem a janela montada, cai no nativo.
export type AppAlertButton={text?:string;style?:'default'|'cancel'|'destructive';onPress?:()=>void};
type Pending={title:string;message?:string;buttons:AppAlertButton[]};
let show:((a:Pending)=>void)|null=null;
const queue:Pending[]=[];
export function appAlert(title:string,message?:string,buttons?:AppAlertButton[],_options?:unknown){
 const item={title,message,buttons:buttons&&buttons.length?buttons:[{text:'OK'}]};
 if(show)show(item);else Alert.alert(title,message,item.buttons as any);
}
export function AppAlertHost(){
 const c=useTheme(),[open,setCurrent]=useState<Pending|null>(null);
 // 0.3.268: durante a saida (fade) a janela mantem o ultimo texto e botoes; antes esvaziava e piscava vazia
 const lastShown=useRef<Pending|null>(null);if(open)lastShown.current=open;const current=open||lastShown.current;
 useEffect(()=>{show=item=>{setCurrent(cur=>{if(cur){queue.push(item);return cur;}return item;});};return()=>{show=null;};},[]);
 function close(btn?:AppAlertButton){if(!open)return;setCurrent(queue.shift()||null);if(btn?.onPress)setTimeout(btn.onPress,0);}
 const buttons=current?.buttons||[],cancel=buttons.find(b=>b.style==='cancel')||(buttons.length>1?buttons[0]:undefined);
 const others=buttons.filter(b=>b!==cancel),stacked=buttons.length>2||buttons.some(b=>(b.text||'').length>14);
 const label=(b:AppAlertButton,color:string)=><Text numberOfLines={2} style={{color,fontWeight:'600',fontSize:16,textAlign:'center'}}>{b.text||'OK'}</Text>;
 const action=(b:AppAlertButton,i:number,fill:boolean,grow:boolean)=>{const danger=b.style==='destructive';
  return <Pressable key={'a'+i} accessibilityRole="button" onPress={()=>close(b)} style={({pressed})=>({flex:grow?1:undefined,minHeight:48,paddingHorizontal:14,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:fill?(danger?c.danger:c.accent):c.accentSoft,opacity:pressed?0.8:1})}>{label(b,fill?'#fff':danger?c.danger:c.accent)}</Pressable>;};
 return <Modal visible={!!open} transparent animationType="fade" statusBarTranslucent onRequestClose={()=>close(cancel)}>
  <Pressable accessibilityLabel="Fechar" onPress={()=>close(cancel)} style={{flex:1,backgroundColor:'#0008',alignItems:'center',justifyContent:'center',padding:24}}>
   <Pressable accessibilityRole="alert" onPress={()=>undefined} style={{width:'100%',maxWidth:400,backgroundColor:c.surface,borderRadius:26,paddingHorizontal:22,paddingTop:22,paddingBottom:18,gap:8,borderWidth:1,borderColor:c.line,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
    <Text style={{color:c.text,fontSize:20,fontWeight:'700'}}>{current?.title}</Text>
    {current?.message?<Text style={{color:c.muted,fontSize:14,lineHeight:21}}>{current.message}</Text>:null}
    {stacked
     ?<View style={{gap:8,marginTop:14}}>
       {others.map((b,i)=>action(b,i,false,false))}
       {cancel?<Pressable accessibilityRole="button" onPress={()=>close(cancel)} style={({pressed})=>({minHeight:48,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:c.line,marginTop:4,opacity:pressed?0.8:1})}>{label(cancel,c.muted)}</Pressable>:null}
      </View>
     :<View style={{flexDirection:'row',gap:10,marginTop:16}}>
       {cancel?<Pressable accessibilityRole="button" onPress={()=>close(cancel)} style={({pressed})=>({flex:1,minHeight:48,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:c.line,opacity:pressed?0.8:1})}>{label(cancel,c.muted)}</Pressable>:null}
       {others.map((b,i)=>action(b,i,true,true))}
      </View>}
   </Pressable>
  </Pressable>
 </Modal>;
}
