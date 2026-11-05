// 0.3.250: troca de menu no computador (ver lib/desktop.ts). Arquivo leve: o TabPager do celular importa isto.
import React,{Activity,useRef} from 'react';
import {View,useWindowDimensions} from 'react-native';
import {contentMaxWidth,isDesktopWidth} from '../lib/desktop';
import {TAB_ORDER} from '../lib/tab-navigation';
import {ContentWidth} from '../lib/content-width';
import type {Tab} from '../lib/types';

/** Troca de menu no computador: sem deslizar entre abas. Cada menu ja visitado continua montado (igual ao
 * celular) e so o atual aparece; a largura maxima so vale onde a leitura pede. */
export function DesktopPages({activeTab,maxWidth,children}:{activeTab:Tab;maxWidth:(tab:Tab)=>number|undefined;children:React.ReactNode}){
 const seen=useRef(new Set<Tab>(['home']));seen.current.add(activeTab);
 return <View testID="desktop-pages" style={{flex:1,position:'relative'}}>
  {React.Children.map(children,(child,index)=>{const id=TAB_ORDER[index],on=id===activeTab,max=maxWidth(id),shown=seen.current.has(id);
   // 0.3.253: a tela ocupa a regiao inteira (a rolagem e a barra ficam na borda); so o conteudo se centraliza na largura de leitura
   const body=<ContentWidth.Provider value={max}><View style={{flex:1,width:'100%'}}>{child}</View></ContentWidth.Provider>;
   // 05/11/2026 (Pedro: "pela milesima vez volto pro Inicio e o conteudo da uma achatada e volta"): RAIZ - a tela que sai
   // era escondida com display:none e o navegador passa a medir TUDO dentro dela como 0. Cada medida guardada (altura do
   // Inicio, listas dos blocos, encaixe...) voltava achatada e so se corrigia no quadro seguinte. Remendado peca por peca
   // (0.3.291, briefH, homeViewH). Agora a tela de fora fica invisivel MAS com o tamanho real (visibility hidden): nada mede
   // 0, nada recalcula ao voltar. Sem clique/foco (pointerEvents none, aria-hidden) e atras da tela atual.
   const hidden=!on;
   return <View key={id} testID={'desktop-page-'+id} pointerEvents={hidden?'none':'auto'} style={{position:'absolute',top:0,left:0,right:0,bottom:0,display:shown?'flex':'none',...(hidden?{visibility:'hidden',zIndex:0}:{zIndex:1}) as any}} accessibilityElementsHidden={hidden} importantForAccessibility={on?'auto':'no-hide-descendants'} {...({'aria-hidden':hidden?true:undefined,'data-active':on?'1':'0'} as any)}>
    <Activity mode={shown?'visible':'hidden'}>{body}</Activity>
   </View>;})}
 </View>;
}

/** So na web: no computador troca direto (DesktopPages); em tela estreita usa o mesmo pager do celular. */
const DesktopPagerHandle=React.forwardRef<{goTo:(tab:Tab)=>void},{activeTab:Tab;maxWidth:(tab:Tab)=>number|undefined;children:React.ReactNode}>(function DesktopPagerHandle(props,ref){
 React.useImperativeHandle(ref,()=>({goTo:()=>{}}),[]);
 return <DesktopPages {...props}/>;
});
export function makeResponsivePager(NativePager:React.ComponentType<any>){
 return React.forwardRef<any,any>(function ResponsivePager(props,ref){
  const desktop=isDesktopWidth(useWindowDimensions().width);
  if(!desktop)return <NativePager {...props} ref={ref}/>;
  return <DesktopPagerHandle ref={ref} activeTab={props.activeTab} maxWidth={contentMaxWidth}>{props.children}</DesktopPagerHandle>;
 });
}
