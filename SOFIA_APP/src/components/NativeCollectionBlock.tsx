import {KanbanBoard} from './KanbanBoard';
import {moveKanbanRow} from '../lib/kanban';
import {Choice} from './Choice';
import React,{useMemo,useRef,useState} from 'react';
import {Alert,Switch,Pressable,Text,TextInput,View} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from './RevealScroll';
import type {PageBlock} from '../lib/page-editor';
import {STATUS_COLORS,statusColorHex} from '../lib/page-templates';
import {useTheme} from '../lib/theme';
import {Button,IconButton} from './UI';
import {Sheet} from './Sheet';
import {NotebookBlock} from './NotebookBlock';
import {DateTimeField} from './DateTimeField';
import {appAlert} from '../lib/app-alert';

type Prop={key:string;label:string;type:string;placeholder?:string;options?:string[];option_colors?:Record<string,string>};
type Row={id:string;values:Record<string,any>;page_content?:string};
type ViewDef={id:string;label:string;type:string;group_by?:string;filter_key?:string;filter_value?:any;sort_by?:string;sort_dir?:string};
type Data={title:string;show_title:boolean;properties:Prop[];views:ViewDef[];active_view:string;rows:Row[];[key:string]:any};
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
const makeId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function normalized(block:PageBlock):Data{
 const d=block.data&&typeof block.data==='object'?clone(block.data):{};
 const properties=Array.isArray(d.properties)&&d.properties.length?d.properties:[{key:'name',label:'Nome',type:'text',options:[]}];
 const views=Array.isArray(d.views)&&d.views.length?d.views:[{id:'list',label:'Lista',type:'list'}];
 return {...d,title:String(d.title||''),show_title:d.show_title!==false,
  properties:properties.map((p:any,i:number)=>({key:String(p.key||'field'+i),label:String(p.label||p.key||'Campo'),type:String(p.type||'text'),placeholder:String(p.placeholder||'Adicionar…'),options:Array.isArray(p.options)?p.options.map(String):[],option_colors:p.option_colors&&typeof p.option_colors==='object'?{...p.option_colors}:{}})),
  views:views.map((v:any,i:number)=>({id:String(v.id||'view'+i),label:String(v.label||'Visualização'),type:String(v.type||'list'),group_by:String(v.group_by||''),filter_key:String(v.filter_key||''),filter_value:v.filter_value??'',sort_by:String(v.sort_by||''),sort_dir:String(v.sort_dir||'desc')})),
  active_view:String(d.active_view||views[0]?.id||'list'),
  rows:Array.isArray(d.rows)?d.rows.map((r:any)=>({id:String(r?.id||makeId()),values:r?.values&&typeof r.values==='object'?{...r.values}:{},page_content:String(r?.page_content||'')})):[]
 };
}
function uniqueName(base:string,options:string[]){const clean=(base.trim()||'Nova coluna').slice(0,60);if(!options.includes(clean))return clean;let n=2;while(options.includes(clean+' '+n))n++;return clean+' '+n;}
const alpha=(hex:string,a='22')=>hex.length===7?hex+a:hex;

function BlockTitle({value,onCommit}:{value:string;onCommit:(v:string)=>void}){
 const c=useTheme(),[text,setText]=useState(value),last=useRef(value);
 if(value!==last.current){last.current=value;if(text!==value)setText(value);}
 const done=()=>{const t=text.trim();if(t!==value.trim())onCommit(t||value);else if(!t)setText(value);};
 return <TextInput accessibilityLabel="Título do bloco" value={text} onChangeText={setText} onEndEditing={done} onBlur={done} returnKeyType="done" blurOnSubmit placeholder="Sem título" placeholderTextColor={c.muted}
  style={{fontSize:16,fontWeight:'600',color:c.text,marginBottom:7,paddingVertical:2}}/>;
}
export function NativeCollectionBlock({block,onChange,onDelete,onInteractionChange,pageId}:{pageId?:string;onDelete?:()=>void;onInteractionChange?:(active:boolean)=>void;block:PageBlock;onChange:(data:Record<string,any>,group?:string)=>void}){
 const c=useTheme(),d=useMemo(()=>normalized(block),[block]),active=d.views.find(v=>v.id===d.active_view)||d.views[0];
 const [statusEdit,setStatusEdit]=useState<{propKey:string;value:string|null;title:string;color:string}|null>(null);
 const [config,setConfig]=useState(false),[choose,setChoose]=useState<{row:Row;prop:Prop}|null>(null),[rowEdit,setRowEdit]=useState<string|null>(null);
 const commit=(next:Data,group='collection:'+block.id)=>onChange(next,group);
 const nameProp=d.properties.find(p=>p.key==='name')||d.properties[0];
 const addRow=(seed:Record<string,any>={})=>{const next=clone(d),values:Record<string,any>={};for(const p of next.properties)values[p.key]=p.type==='checkbox'?false:'';Object.assign(values,seed);const id=makeId();next.rows.push({id,values,page_content:''});commit(next);if(active?.type==='board')setRowEdit(id);};
 const updateRow=(id:string,key:string,value:any)=>{const next=clone(d),row=next.rows.find(r=>r.id===id);if(!row)return;row.values[key]=value;commit(next,'collection-row:'+id+':'+key);};
 // Existing page_content is the description; no migration or property deletion is needed.
 const updateDescription=(id:string,value:string)=>{const next=clone(d),row=next.rows.find(r=>r.id===id);if(!row)return;const prop=next.properties.find(p=>p.key==='description');if(prop)row.values[prop.key]=value;else row.page_content=value;commit(next,'collection-row:'+id+':description');};
 const descriptionInput=(row:Row)=><View style={{gap:4,marginTop:8}}><Text style={{color:c.muted,fontSize:11}}>Descrição</Text><TextInput accessibilityLabel={'Descrição de '+String(row.values[nameProp.key]||'nova tarefa')} multiline value={String(d.properties.some(p=>p.key==='description')?row.values.description||'':row.page_content||'')} onChangeText={v=>updateDescription(row.id,v)} placeholder="Adicionar descrição…" placeholderTextColor={c.muted} style={{minHeight:42,padding:0,color:c.text,fontSize:13,lineHeight:19,textAlignVertical:'top'}}/></View>;
 const removeRow=(id:string)=>appAlert('Excluir item?','Somente este item será removido deste bloco.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>{const next=clone(d);next.rows=next.rows.filter(r=>r.id!==id);commit(next);}}]);
 const editStatus=(prop:Prop,value:string|null)=>setStatusEdit({propKey:prop.key,value,title:value||'',color:value?(prop.option_colors?.[value]||'gray'):'gray'});
 const saveStatus=()=>{if(!statusEdit)return;const next=clone(d),prop=next.properties.find(p=>p.key===statusEdit.propKey);if(!prop)return;prop.options=prop.options||[];prop.option_colors=prop.option_colors||{};
   if(statusEdit.value===null){const name=uniqueName(statusEdit.title,prop.options);prop.options.push(name);prop.option_colors[name]=statusEdit.color;}
   else{const old=statusEdit.value,name=uniqueName(statusEdit.title,prop.options.filter(x=>x!==old));prop.options=prop.options.map(x=>x===old?name:x);for(const row of next.rows)if(String(row.values[prop.key]||'')===old)row.values[prop.key]=name;delete prop.option_colors[old];prop.option_colors[name]=statusEdit.color;}
   setStatusEdit(null);commit(next);
 };
 const duplicateStatus=()=>{if(!statusEdit?.value)return;const next=clone(d),prop=next.properties.find(p=>p.key===statusEdit.propKey);if(!prop)return;prop.options=prop.options||[];prop.option_colors=prop.option_colors||{};const name=uniqueName(statusEdit.title+' cópia',prop.options);prop.options.push(name);prop.option_colors[name]=statusEdit.color;setStatusEdit(null);commit(next);};
 const deleteStatus=()=>{if(!statusEdit?.value)return;const next=clone(d),prop=next.properties.find(p=>p.key===statusEdit.propKey);if(!prop)return;const old=statusEdit.value;prop.options=(prop.options||[]).filter(x=>x!==old);if(prop.option_colors)delete prop.option_colors[old];for(const row of next.rows)if(String(row.values[prop.key]||'')===old)row.values[prop.key]='';setStatusEdit(null);commit(next);};

 const fieldChange=(key:string,patch:Partial<Prop>)=>{const next=clone(d);Object.assign(next.properties.find(p=>p.key===key)!,patch);commit(next,'field:'+key);};
 const fieldMove=(index:number,delta:number)=>{if(index+delta<0||index+delta>=d.properties.length)return;const next=clone(d);[next.properties[index],next.properties[index+delta]]=[next.properties[index+delta],next.properties[index]];commit(next);};
 const fieldRemove=(p:Prop)=>{const remove=()=>{const next=clone(d);next.properties=next.properties.filter(x=>x.key!==p.key);for(const row of next.rows)delete row.values[p.key];commit(next);};if(d.properties.length<2)return;const populated=d.rows.some(r=>r.values[p.key]!==''&&r.values[p.key]!=null);if(populated)appAlert('Excluir campo '+p.label+'?','Os valores deste campo também serão apagados.',[{text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:remove}]);else remove();};
 const board=()=>{
  const group=d.properties.find(p=>p.key===active?.group_by)||d.properties.find(p=>p.type==='select'||p.type==='status');if(!group)return <Text style={{color:c.muted}}>Adicione uma coluna de status.</Text>;
  const selected=d.rows.find(row=>row.id===rowEdit);
  return <><KanbanBoard rows={d.rows} columns={[...new Set([...(group.options||[]),...d.rows.map(row=>String(row.values[group.key]||''))])]} colors={group.option_colors} groupKey={group.key} nameKey={nameProp.key}
   onInteractionChange={onInteractionChange} onColumn={option=>editStatus(group,option)} onEdit={setRowEdit}
   onAdd={column=>addRow({[group.key]:column})}
   onMove={(id,column,before)=>{const next=clone(d);next.rows=moveKanbanRow(next.rows,id,group.key,column,before);commit(next,'kanban-move:'+id+':'+Date.now());}}/>
   <Sheet visible={!!selected} onClose={()=>setRowEdit(null)} label="Fechar cartão">
    <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text,fontSize:20,fontWeight:'500'}}>Cartão</Text><IconButton name="close" label="Fechar cartão" onPress={()=>setRowEdit(null)}/></View>
    {selected?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:18,paddingVertical:16}}>
     <TextInput accessibilityLabel="Título do cartão" value={String(selected.values[nameProp.key]||'')} onChangeText={text=>updateRow(selected.id,nameProp.key,text)} placeholder="Título" placeholderTextColor={c.muted} style={{color:c.text,fontSize:20,padding:10,borderWidth:1,borderColor:c.line,borderRadius:8}}/>
     {descriptionInput(selected)}
     <Choice label="Coluna" value={String(selected.values[group.key]||'')} options={(group.options||[]).map(value=>({value,label:value}))} onChange={value=>updateRow(selected.id,group.key,value)}/>
     <Button title="Excluir cartão" secondary onPress={()=>{removeRow(selected.id);}}/>
    </ScrollView>:null}
   </Sheet></>;
 };
 const list=()=>{
  return <View style={{gap:3}}>{d.rows.map(row=><View key={row.id} style={{flexDirection:'row',alignItems:'center',gap:7,minHeight:42,paddingHorizontal:6,borderRadius:8}}>
   <Text style={{fontSize:20}}>▧</Text><TextInput value={String(row.values[nameProp.key]||'')} onChangeText={v=>updateRow(row.id,nameProp.key,v)} placeholder="Nova página" placeholderTextColor={c.muted} style={{flex:1,color:c.text,fontSize:14,paddingVertical:7}}/><Pressable onPress={()=>removeRow(row.id)}><Text style={{color:c.muted}}>×</Text></Pressable>
  </View>)}<Pressable onPress={()=>addRow()} style={{padding:8}}><Text style={{color:c.muted,fontSize:12}}>＋ Nova página</Text></Pressable></View>;
 };
 const table=()=>{
  const props=d.properties;
  return <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}><View style={{minWidth:Math.max(520,props.length*150+48)}}>
   <View style={{flexDirection:'row',borderBottomWidth:1,borderColor:c.line}}>{props.map(p=><Text key={p.key} style={{width:150,padding:8,color:c.muted,fontSize:11,fontWeight:'500'}}>{p.label}</Text>)}<IconButton name="settings" label="Configurar campos" size={40} onPress={()=>setConfig(true)}/></View>
   {d.rows.map(row=><View key={row.id} style={{flexDirection:'row',borderBottomWidth:1,borderColor:c.line}}>{props.map(p=><View key={p.key} style={{width:150,minHeight:42,justifyContent:'center'}}>{p.type==='date'?<DateTimeField label={p.label} value={String(row.values[p.key]||'')} dateOnly onChange={v=>updateRow(row.id,p.key,v)}/>:p.type==='checkbox'?<Switch value={!!row.values[p.key]} onValueChange={v=>updateRow(row.id,p.key,v)}/>:p.type==='select'||p.type==='status'?<Pressable accessibilityLabel={p.label} onPress={()=>setChoose({row,prop:p})} style={{padding:8}}><Text style={{color:c.text}}>{String(row.values[p.key]||p.placeholder||'Selecionar')}</Text></Pressable>:<TextInput value={String(row.values[p.key]??'')} onChangeText={v=>updateRow(row.id,p.key,v)} placeholder={p.placeholder||'Adicionar…'} keyboardType={p.type==='number'?'numeric':p.type==='url'?'url':'default'} placeholderTextColor={c.muted} style={{minHeight:42,padding:8,color:c.text,fontSize:12}}/>}</View>)}<Pressable onPress={()=>removeRow(row.id)} style={{width:34,justifyContent:'center'}}><Text style={{color:c.muted}}>×</Text></Pressable></View>)}
   <Pressable onPress={()=>addRow()} style={{padding:9}}><Text style={{color:c.muted,fontSize:12}}>＋ Nova página</Text></Pressable>
  </View></ScrollView>;
 };
 if(d.mode==='notebooks'||active?.type==='pages')return <NotebookBlock data={d} pageId={pageId} onChange={onChange} onDelete={onDelete} onInteractionChange={onInteractionChange}/>;
 return <View style={{marginVertical:5}}>
  {/* 0.3.201: o titulo do bloco que veio do template (Kanban, Formulario...) agora se edita com um toque */}
  {d.show_title?<BlockTitle value={d.title||''} onCommit={(title:string)=>{const next=clone(d);next.title=title;commit(next,'collection-title:'+block.id);}}/>:null}
  <View style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:8}}>
   {d.views.map(v=><Pressable key={v.id} onPress={()=>{const next=clone(d);next.active_view=v.id;commit(next);}} style={{paddingVertical:6,paddingHorizontal:10,borderRadius:8,backgroundColor:v.id===active?.id?c.input:'transparent'}}><Text style={{fontSize:11,color:v.id===active?.id?c.text:c.muted}}>{v.type==='table'&&v.id==='links'&&v.label==='Coleção'?'Formulário':v.label}</Text></Pressable>)}
   <View style={{flex:1}}/>{onDelete?<IconButton name="trash" label="Excluir bloco" size={32} onPress={onDelete}/>:null}
  </View>
  {active?.type==='board'?board():active?.type==='table'?table():list()}
  <Sheet visible={config} onClose={()=>setConfig(false)}><View style={{flexDirection:'row',alignItems:'center'}}><Text style={{color:c.text,fontSize:20,fontWeight:'600',flex:1}}>Configurar campos</Text><IconButton name="close" label="Fechar configuração" onPress={()=>setConfig(false)}/></View><ScrollView keyboardShouldPersistTaps="handled">{d.properties.map((p,i)=><View key={p.key} style={{borderBottomWidth:1,borderColor:c.line,paddingVertical:14,gap:8}}><TextInput accessibilityLabel={'Nome do campo '+(i+1)} value={p.label} onChangeText={label=>fieldChange(p.key,{label})} style={{color:c.text,fontSize:16,backgroundColor:c.input,padding:12,borderRadius:8}}/><ScrollView keyboardShouldPersistTaps="handled" horizontal contentContainerStyle={{gap:6}}>{['text','number','date','url','select','checkbox'].map(type=><Pressable key={type} onPress={()=>fieldChange(p.key,{type})} style={{padding:8,borderRadius:8,backgroundColor:p.type===type?c.accentSoft:c.input}}><Text style={{color:c.text}}>{{text:'Texto',number:'Número',date:'Data',url:'URL',select:'Seleção',checkbox:'Checkbox'}[type]}</Text></Pressable>)}</ScrollView><TextInput accessibilityLabel={'Dica do campo '+(i+1)} value={p.placeholder||''} onChangeText={placeholder=>fieldChange(p.key,{placeholder})} placeholder="Adicionar…" placeholderTextColor={c.muted} style={{color:c.text,padding:10}}/>{p.type==='select'?<TextInput accessibilityLabel={'Opções do campo '+(i+1)} defaultValue={(p.options||[]).join(', ')} onEndEditing={e=>fieldChange(p.key,{options:[...new Set(e.nativeEvent.text.split(',').map(x=>x.trim()).filter(Boolean))]})} placeholder="Opções separadas por vírgula" placeholderTextColor={c.muted} style={{color:c.text,padding:10}}/>:null}<View style={{flexDirection:'row',gap:10}}><Button title="↑" secondary disabled={i===0} onPress={()=>fieldMove(i,-1)}/><Button title="↓" secondary disabled={i===d.properties.length-1} onPress={()=>fieldMove(i,1)}/><Button title="Excluir campo" secondary disabled={d.properties.length<2} onPress={()=>fieldRemove(p)}/></View></View>)}<View style={{marginVertical:16}}><Button title="Adicionar campo" onPress={()=>{const next=clone(d);next.properties.push({key:'field_'+makeId(),label:'Novo campo',type:'text',placeholder:'Adicionar…'});commit(next);}}/></View></ScrollView></Sheet>
  <Sheet visible={!!choose} onClose={()=>setChoose(null)}>{['',...(choose?.prop.options||[])].map(option=><Pressable key={option} onPress={()=>{if(choose)updateRow(choose.row.id,choose.prop.key,option);setChoose(null);}} style={{padding:16}}><Text style={{color:c.text}}>{option||'Limpar seleção'}</Text></Pressable>)}</Sheet>
  <Sheet visible={!!statusEdit} onClose={()=>setStatusEdit(null)}>
     <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,fontSize:20,fontWeight:'600',color:c.text}}>{statusEdit?.value?'Configurar coluna':'Nova coluna'}</Text><IconButton name="close" label="Fechar" onPress={()=>setStatusEdit(null)}/></View>
     <TextInput value={statusEdit?.title||''} onChangeText={title=>setStatusEdit(v=>v?{...v,title}:v)} placeholder="Nome da coluna" placeholderTextColor={c.muted} style={{marginTop:14,minHeight:48,borderRadius:12,backgroundColor:c.input,color:c.text,paddingHorizontal:12}}/>
     <Text style={{marginTop:16,marginBottom:8,color:c.muted,fontSize:12}}>Cor</Text>
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{STATUS_COLORS.map(color=><Pressable key={color.id} accessibilityLabel={'Cor '+color.label} onPress={()=>setStatusEdit(v=>v?{...v,color:color.id}:v)} style={{width:36,height:36,borderRadius:18,backgroundColor:color.hex,borderWidth:statusEdit?.color===color.id?3:0,borderColor:c.text}}/>)}</View>
     <View style={{gap:9,marginTop:18}}><Button title="Salvar" disabled={!statusEdit?.title.trim()} onPress={saveStatus}/>{statusEdit?.value?<Button title="Duplicar coluna" secondary onPress={duplicateStatus}/>:null}{statusEdit?.value?<Button title="Excluir coluna" secondary onPress={deleteStatus}/>:null}</View>
  </Sheet>
 </View>;
}
