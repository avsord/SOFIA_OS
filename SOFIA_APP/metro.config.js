const path=require('path');
const {getDefaultConfig}=require('expo/metro-config');
const config=getDefaultConfig(__dirname);
config.transformer.getTransformOptions=async()=>({transform:{experimentalImportSupport:false,inlineRequires:true}});
// Web: modulos que so existem no celular ganham substitutos de navegador (as telas nao mudam).
const WEB_SHIMS={
 'expo-notifications':'expo-notifications.ts',
 'expo-secure-store':'expo-secure-store.ts',
 'react-native-webview':'react-native-webview.tsx',
 'expo-task-manager':'expo-task-manager.ts',
 'expo-background-task':'expo-background-task.ts',
};
const original=config.resolver.resolveRequest;
// 0.3.253: no site, as telas do app usam a camada de computador do react-native (escala e rolagem de
// computador com a tela larga). Ficam de fora: node_modules, a propria camada e a moldura do computador.
const SRC=path.join(__dirname,'src')+path.sep,APP=path.join(__dirname,'App.tsx');
const RAW=new Set(['rn-desktop.tsx','desktop-scale.ts','DesktopShell.tsx','DesktopPages.tsx','rn-fluid.tsx']);
const FLUID=new Set(['DesktopShell.tsx','DesktopPages.tsx']);
// O babel do site troca `import {View} from 'react-native'` por `react-native-web/dist/exports/View`;
// os componentes com escala sao entregues por src/web/rnd/<Nome>.ts.
const WRAPPED=['View','Text','TextInput','Image','Pressable','TouchableOpacity','KeyboardAvoidingView','SafeAreaView','ScrollView','FlatList','SectionList','Animated'];
const RNW_EXPORT=new RegExp('^react-native-web/dist/(?:cjs/)?exports/('+WRAPPED.join('|')+')(?:/index(?:\\.js)?)?$');
function usesDesktopLayer(origin){
 if(!origin||origin.includes(path.sep+'node_modules'+path.sep))return false;
 if(RAW.has(path.basename(origin)))return false;
 return origin.startsWith(SRC)||origin===APP;
}
config.resolver.resolveRequest=(context,moduleName,platform)=>{
 if(platform==='web'&&WEB_SHIMS[moduleName])return {type:'sourceFile',filePath:path.join(__dirname,'src/web/shims',WEB_SHIMS[moduleName])};
 if(platform==='web'&&moduleName==='react-native'&&usesDesktopLayer(context.originModulePath))return {type:'sourceFile',filePath:path.join(__dirname,'src/web/rn-desktop.tsx')};
 // 0.3.278: a moldura do site (lateral, barra de cima) recebe so o fator da tela
 if(platform==='web'&&moduleName==='react-native'&&context.originModulePath&&FLUID.has(path.basename(context.originModulePath)))return {type:'sourceFile',filePath:path.join(__dirname,'src/web/rn-fluid.tsx')};
 const m=platform==='web'?RNW_EXPORT.exec(moduleName):null;
 if(m&&usesDesktopLayer(context.originModulePath))return {type:'sourceFile',filePath:path.join(__dirname,'src/web/rnd',m[1]+'.ts')};
 if(m&&context.originModulePath&&FLUID.has(path.basename(context.originModulePath))&&['View','Text','TextInput','Pressable','ScrollView','Image'].includes(m[1]))return {type:'sourceFile',filePath:path.join(__dirname,'src/web/rnf',m[1]+'.ts')};
 return original?original(context,moduleName,platform):context.resolveRequest(context,moduleName,platform);
};
module.exports=config;
