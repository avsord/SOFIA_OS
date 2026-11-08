import React,{useContext} from 'react';
import {Text,View,useWindowDimensions} from 'react-native';
import {useTheme} from '../lib/theme';
import {EMBED} from '../lib/embed';
import {useDesktop,contentMaxWidth} from '../lib/desktop';
import {ContentWidth,DESK_LEFT,dpx,edgePadding} from '../lib/content-width';
import {LoadingLines,useSkeletonDelay,LoadingCaption,ShimmerBlock,ShimmerGroup} from './Loading';
import {Brand,IconButton,ScreenTitle} from './UI';
import {Icon} from './Icon';
import {AppGridSkeleton} from './AppGrid';
import {AgendaDesk} from '../desktop/AgendaDesk';

/** O que a aba mostra enquanto a tela de verdade ainda nao chegou (arquivo da tela baixando ou primeira montagem).
 * 07/11/2026 (Pedro: "esqueleto safado igual dos dois, sem respeitar a estrutura real da pagina"): cada aba desenha
 * a PROPRIA estrutura - mesmo titulo, mesmos botoes, mesma grade, mesmas medidas da tela real - e so o que depende
 * dos dados vira bloco com brilho. Medidas copiadas das telas (Agenda.tsx, Chat.tsx, Composer.tsx, Pages.tsx,
 * PageTreeList.tsx, Workspace.tsx, Profile.tsx); se a tela mudar, mude aqui junto. Nada aqui e clicavel. */
const TITLES:Record<string,string>={home:'Início',chat:'Conversa',pages:'Páginas',agenda:'Agenda',apps:'Apps',profile:'Perfil'};
const noop=()=>{};
const APP_COUNT=11;

export function ScreenSkeleton({tab}:{tab:string}){
 const c=useTheme(),show=useSkeletonDelay();
 if(!show||EMBED)return <View testID={'screen-wait-'+tab} style={{flex:1,backgroundColor:c.bg}}/>; // 08/11/2026 (Pedro): dentro do cartao do Quadro, nunca esqueleto com brilho
 const body=tab==='agenda'?<AgendaSkeleton/>:tab==='chat'?<ChatSkeleton/>:tab==='pages'?<PagesSkeleton/>:tab==='apps'?<AppsSkeleton/>:tab==='profile'?<ProfileSkeleton/>:null;
 if(body)return <View testID={'screen-skeleton-'+tab} pointerEvents="none" accessibilityLabel={'Abrindo '+(TITLES[tab]||'')} style={{flex:1,backgroundColor:c.bg}}><ShimmerGroup>{body}</ShimmerGroup></View>;
 return <View testID={'screen-skeleton-'+tab} style={{flex:1,backgroundColor:c.bg,paddingHorizontal:20,paddingTop:48,gap:14}}>
  <Text style={{color:c.text,fontSize:28,fontWeight:'600'}}>{TITLES[tab]||''}</Text>
  <LoadingCaption label="Carregando" />
  <LoadingLines rows={4}/>
 </View>;
}

/** Agenda: a propria grade do mes (AgendaDesk) no estado "carregando" - a mesma que aparece depois, com as pilulas
 * de brilho nos dias. Quando a tela real chega, nada muda de lugar. */
function AgendaSkeleton(){
 const desktop=useDesktop(),now=new Date(),month=new Date(now.getFullYear(),now.getMonth(),1);
 const desk=<AgendaDesk compact={!desktop} api={null as any} active={false} loading items={[]} month={month} setMonth={noop} selected={now} setSelected={noop} start={()=>''} onOpen={noop} onToggle={noop} onCreate={noop}/>;
 const plus=<IconButton name="plus" label="Novo compromisso" disabled onPress={noop}/>;
 if(desktop)return <View style={{flex:1}}><ScreenTitle title="Agenda" subtitle=" " right={plus}/>
  <View style={{flex:1,width:'100%',maxWidth:contentMaxWidth('agenda'),alignSelf:'center',paddingLeft:dpx(40),paddingRight:dpx(40),paddingBottom:dpx(32)} as any}>{desk}</View></View>;
 return <View style={{flex:1}}><ScreenTitle title="Agenda" right={plus}/><View testID="agenda-compact" style={{paddingHorizontal:16}}>{desk}</View></View>;
}

/** Conversa: topo com a Sofia, baloes no lugar das mensagens (os mesmos da tela quando os dados demoram) e a caixa
 * de escrever. */
function ChatSkeleton(){
 const c=useTheme(),desktop=useDesktop(),readingWidth=useContext(ContentWidth),colPad=desktop&&readingWidth?edgePadding():null;
 return <View style={{flex:1}}>
  <View style={{paddingHorizontal:16,...(colPad?{paddingLeft:colPad.left,paddingRight:colPad.right}:null),paddingVertical:12,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1,borderColor:c.line,backgroundColor:c.surface} as any}>
   <View><Brand/><View style={{position:'absolute',right:-2,bottom:-2,width:11,height:11,borderRadius:6,backgroundColor:c.good,borderWidth:2,borderColor:c.surface}}/></View>
   <View style={{flex:1}}><Text style={{color:c.text,fontSize:18,fontWeight:'600'}}>Sofia</Text><Text numberOfLines={1} style={{color:c.muted,fontSize:11,marginTop:2}}>{desktop?'online · lembra de tudo que vocês já conversaram':'online'}</Text></View>
   <IconButton name="history" label="Histórico de conversas" onPress={noop}/><IconButton name="plus" label="Nova conversa" onPress={noop}/>
  </View>
  <View style={{flex:1,justifyContent:'flex-end',paddingHorizontal:16,paddingBottom:16,gap:14,width:'100%',maxWidth:760,alignSelf:'center'}}>
   {([['62%',54,'flex-start'],['44%',38,'flex-end'],['70%',72,'flex-start'],['36%',38,'flex-end'],['55%',54,'flex-start']] as const).map(([w,h,side],i)=><View key={i} style={{alignSelf:side,width:w}}><ShimmerBlock width="100%" height={h} radius={16}/></View>)}
  </View>
  <View style={{padding:12,...(colPad?{paddingLeft:colPad.left,paddingRight:colPad.right}:null),paddingTop:10,borderTopWidth:1,borderColor:c.line,backgroundColor:c.surface} as any}>
   <View style={{flexDirection:'row',alignItems:'flex-end',gap:9}}>
    <View style={{flex:1,borderRadius:24,paddingLeft:14,paddingRight:4,paddingVertical:5,flexDirection:'row',alignItems:'center',backgroundColor:c.input,minHeight:48}}>
     <Text style={{flex:1,color:c.muted,fontSize:16,lineHeight:22}}>Fale com a Sofia…</Text>
     <IconButton name="clip" label="Anexar arquivo" size={36} disabled onPress={noop}/><IconButton name="camera" label="Tirar foto" size={36} disabled onPress={noop}/>
    </View>
    <IconButton name="mic" label="Gravar mensagem de voz" filled size={48} disabled onPress={noop}/>
   </View>
  </View>
 </View>;
}

/** Paginas: titulo e +, os cartoezinhos de Recentes e a lista de paginas, nas mesmas medidas. O corpo (sem o titulo)
 * tambem e o que a tela Paginas mostra enquanto a lista chega (Pages.tsx, pages-loading-placeholder). */
export function PagesLoadingBody(){
 const c=useTheme(),desktop=useDesktop();
 const rows=[62,48,70,40,56,66,44,52,60,38,58,46];
 const list=<View style={{paddingHorizontal:10}}>{rows.map((w,i)=><View key={i} style={{flexDirection:'row',alignItems:'center',height:46}}>
  <View style={{width:28}}/><View style={{flexDirection:'row',alignItems:'center',gap:12,flex:1,paddingHorizontal:8}}><ShimmerBlock width={18} height={18} radius={5}/><ShimmerBlock width={desktop?w*3.2:w*2.4} height={13} radius={6}/></View>
 </View>)}</View>;
 if(desktop)return <ShimmerGroup><View style={{paddingHorizontal:dpx(DESK_LEFT),paddingBottom:18,gap:10} as any}>
   <Text style={{color:c.muted,fontSize:12,fontWeight:'600'}}>Recentes</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[0,1,2,3,4,5].map(i=><View key={i} style={{width:228,minHeight:58,paddingHorizontal:12,paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,gap:10,flexDirection:'row',alignItems:'center'}}>
    <ShimmerBlock width={20} height={20} radius={5}/><View style={{gap:6,flex:1}}><ShimmerBlock width={[120,96,70,130,104,112][i]} height={12}/><ShimmerBlock width={84} height={9}/></View>
   </View>)}</View>
   <Text style={{color:c.muted,fontSize:12,fontWeight:'600',marginTop:10}}>Todas as páginas</Text>
  </View>{list}</ShimmerGroup>;
 return <ShimmerGroup><View style={{paddingBottom:6}}><Text style={{paddingHorizontal:16,color:c.muted,fontSize:11,fontWeight:'600',letterSpacing:0.5,paddingBottom:8}}>RECENTES</Text>
   <View style={{flexDirection:'row',paddingHorizontal:16,gap:10,overflow:'hidden'}}>{[0,1,2,3].map(i=><View key={i} style={{width:120,padding:12,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,gap:8}}><ShimmerBlock width={20} height={20} radius={5}/><ShimmerBlock width={'85%'} height={12}/><ShimmerBlock width={'55%'} height={12}/></View>)}</View>
  <Text style={{paddingHorizontal:16,color:c.muted,fontSize:11,fontWeight:'600',letterSpacing:0.5,paddingTop:16,paddingBottom:4}}>TODAS AS PÁGINAS</Text></View>
  {list}</ShimmerGroup>;
}
function PagesSkeleton(){
 const desktop=useDesktop();
 const title=<ScreenTitle title="Páginas" right={<IconButton name="plus" label="Criar página" onPress={noop}/>}/>;
 if(desktop)return <ContentWidth.Provider value={980}><View style={{flex:1,width:'100%',maxWidth:980,alignSelf:'center'}}>{title}<PagesLoadingBody/></View></ContentWidth.Provider>;
 return <View style={{flex:1}}>{title}<PagesLoadingBody/></View>;
}

/** Apps: titulo, sino e a grade de cartoes com o mesmo numero de colunas da tela real. */
function AppsSkeleton(){
 const desktop=useDesktop();
 return <View style={{flex:1}}><ScreenTitle title="Apps" right={<IconButton name="bell" label="Notificações" onPress={noop}/>}/>
  <View style={{paddingHorizontal:(desktop?dpx(DESK_LEFT):22) as any,paddingBottom:24}}><AppGridSkeleton count={APP_COUNT}/></View>
 </View>;
}

/** Perfil: titulo, cartao da foto, a lista de secoes (computador) e o cartao Conta com os rotulos de verdade. */
const SECTIONS=[['Conta','user'],['Aparência','eye'],['Conversa','chat'],['Conexões','link'],['Armazenamento','box'],['Notificações','bell'],['Segurança','shield'],['Sobre','info']] as const;
function ProfileSkeleton(){
 const c=useTheme(),desktop=useDesktop(),narrow=useWindowDimensions().width<640;
 const card={backgroundColor:c.surface,borderRadius:16,borderWidth:1,borderColor:c.line,paddingHorizontal:20,paddingBottom:6,boxShadow:'0 1px 2px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.12)'} as any;
 const row=(title:string,desc:React.ReactNode,value:React.ReactNode)=><View style={{flexDirection:narrow?'column':'row',alignItems:narrow?'stretch':'center',gap:narrow?10:16,paddingVertical:14,borderTopWidth:1,borderColor:c.line}}>
  <View style={{flex:narrow?undefined:1,minWidth:0,gap:3}}><Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>{title}</Text>{typeof desc==='string'?(desc?<Text style={{color:c.muted,fontSize:13,lineHeight:18}}>{desc}</Text>:null):desc}</View>{value}</View>;
 return <View style={{flex:1}}><ScreenTitle title="Perfil" subtitle="Sua conta, a aparência e as configurações do app."/>
  <View style={(desktop?{flexDirection:'row',alignItems:'flex-start',gap:28,paddingLeft:dpx(40),paddingRight:dpx(40),width:'100%',maxWidth:1180,alignSelf:'center'}:{gap:16,paddingHorizontal:16}) as any}>
   <View style={desktop?{width:260,gap:16}:{gap:16}}>
    <View style={[card,{paddingVertical:22,paddingBottom:22,alignItems:'center',gap:10}]}><ShimmerBlock width={84} height={84} radius={42}/><View style={{alignItems:'center',gap:7,paddingTop:4}}><ShimmerBlock width={110} height={16}/><Text style={{color:c.accent,fontSize:12,fontWeight:'600'}}>Proprietário</Text><ShimmerBlock width={120} height={11}/></View></View>
    {desktop?<View style={{gap:2}}>{SECTIONS.map(([label,icon],i)=><View key={label} style={{flexDirection:'row',alignItems:'center',gap:10,height:36,paddingHorizontal:12,borderRadius:9,backgroundColor:i===0?c.accentSoft:'transparent'}}><Icon name={icon} size={15} color={i===0?c.accent:c.muted}/><Text style={{fontSize:13,color:i===0?c.text:c.muted,fontWeight:i===0?'600':'500'}}>{label}</Text></View>)}</View>:null}
   </View>
   <View style={desktop?{flex:1,minWidth:0,gap:16}:{gap:16}}>
    <View style={card}><View style={{paddingTop:16,paddingBottom:10,gap:3}}><Text style={{color:c.text,fontSize:16,fontWeight:'700'}}>Conta</Text><Text style={{color:c.muted,fontSize:13,lineHeight:18}}>Seus dados de acesso à Sofia.</Text></View>
     {row('Nome','Aparece na saudação do Início.',<View style={{flexDirection:'row',alignItems:'center',gap:8}}><ShimmerBlock width={narrow?'78%':240} height={34} radius={9}/><ShimmerBlock width={58} height={30} radius={8}/></View>)}
     {row('E-mail de login',<ShimmerBlock width={150} height={12} style={{marginTop:3}}/>,null)}
     {row('Foto do perfil',desktop?'Clique na foto à esquerda para escolher, enquadrar ou remover.':'Toque na foto lá em cima para escolher, enquadrar ou remover.',null)}
    </View>
    {desktop?null:<View style={card}><View style={{paddingTop:16,paddingBottom:10,gap:3}}><Text style={{color:c.text,fontSize:16,fontWeight:'700'}}>Aparência</Text><Text style={{color:c.muted,fontSize:13,lineHeight:18}}>Vale para este aparelho.</Text></View>
     {row('Tema','Pelo horário, igual ao sistema, claro ou escuro.',<ShimmerBlock width={'100%'} height={34} radius={9}/>)}</View>}
   </View>
  </View>
 </View>;
}
