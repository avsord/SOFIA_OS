// 14/11/2026 (Pedro: "Modelo de tabela igual ao Notion" e "Kanban avançado", itens 13 e 14 de 13/11; clone medido em
// Atlas mimic-kaizen/clones/notion-kanban-conteudo): regras puras da base de dados (bloco 'collection') usadas pela tela do
// site. Os dados continuam no mesmo formato (properties/views/rows); o que é novo é opcional e o app do celular ignora.
export type DbProp={key:string;label:string;type:string;options?:string[];option_colors?:Record<string,string>;placeholder?:string;width?:number;number_format?:string};
export type DbFilter={key:string;op:string;value?:any};
export type DbSort={key:string;dir:'asc'|'desc'};
export type DbView={id:string;label:string;type:string;group_by?:string;filters?:DbFilter[];sorts?:DbSort[];hidden?:string[];
 color_columns?:boolean;show_count?:boolean;date_key?:string;hidden_groups?:string[];widths?:Record<string,number>;
 filter_key?:string;filter_value?:any;sort_by?:string;sort_dir?:string};
export type DbRow={id:string;values:Record<string,any>;page_content?:string;icon?:string;created_at?:string};
export type DbData={title:string;show_title:boolean;properties:DbProp[];views:DbView[];active_view:string;rows:DbRow[];[k:string]:any};

export const PROP_TYPES:{type:string;label:string;glyph:string}[]=[
 {type:'text',label:'Texto',glyph:'≡'},{type:'number',label:'Número',glyph:'#'},{type:'select',label:'Seleção',glyph:'◉'},
 {type:'multi_select',label:'Seleção múltipla',glyph:'☰'},{type:'status',label:'Status',glyph:'◐'},{type:'date',label:'Data',glyph:'▦'},
 {type:'person',label:'Pessoa',glyph:'☺'},{type:'checkbox',label:'Caixa de seleção',glyph:'☑'},{type:'url',label:'URL',glyph:'↗'},
 {type:'created',label:'Criado em',glyph:'◷'}
];
export const VIEW_TYPES:{type:string;label:string;glyph:string}[]=[
 {type:'table',label:'Tabela',glyph:'▤'},{type:'board',label:'Quadro',glyph:'▥'},{type:'calendar',label:'Calendário',glyph:'▦'},{type:'list',label:'Lista',glyph:'☰'}
];
export const propGlyph=(type:string)=>PROP_TYPES.find(t=>t.type===type)?.glyph||'≡';
export const viewGlyph=(type:string)=>VIEW_TYPES.find(t=>t.type===type)?.glyph||'▤';
export const isChoice=(type:string)=>type==='select'||type==='status'||type==='multi_select';
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
export const makeId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/** Lê o bloco do jeito que estiver salvo (inclusive o formato antigo de filtro/ordem) e devolve completo. */
export function normalizeDb(raw:any):DbData{
 const d=raw&&typeof raw==='object'?clone(raw):{};
 const properties:DbProp[]=(Array.isArray(d.properties)&&d.properties.length?d.properties:[{key:'name',label:'Nome',type:'text'}]).map((p:any,i:number)=>({
  ...p,key:String(p?.key||'field'+i),label:String(p?.label||p?.key||'Propriedade'),type:String(p?.type||'text'),
  options:Array.isArray(p?.options)?p.options.map(String):[],option_colors:p?.option_colors&&typeof p.option_colors==='object'?{...p.option_colors}:{}}));
 const views:DbView[]=(Array.isArray(d.views)&&d.views.length?d.views:[{id:'table',label:'Tabela',type:'table'}]).map((v:any,i:number)=>{
  const filters:DbFilter[]=Array.isArray(v?.filters)?v.filters.filter((f:any)=>f&&f.key).map((f:any)=>({key:String(f.key),op:String(f.op||'is'),value:f.value})):
   v?.filter_key&&v?.filter_value!==''&&v?.filter_value!=null?[{key:String(v.filter_key),op:'is',value:[String(v.filter_value)]}]:[];
  const sorts:DbSort[]=Array.isArray(v?.sorts)?v.sorts.filter((s:any)=>s&&s.key).map((s:any)=>({key:String(s.key),dir:s.dir==='desc'?'desc':'asc'})):
   v?.sort_by?[{key:String(v.sort_by),dir:v.sort_dir==='asc'?'asc':'desc'}]:[];
  return {...v,id:String(v?.id||'view'+i),label:String(v?.label||'Visualização'),type:String(v?.type||'table'),group_by:v?.group_by?String(v.group_by):'',
   filters,sorts,hidden:Array.isArray(v?.hidden)?v.hidden.map(String):[],hidden_groups:Array.isArray(v?.hidden_groups)?v.hidden_groups.map(String):[],
   color_columns:v?.color_columns!==false,show_count:v?.show_count!==false,widths:v?.widths&&typeof v.widths==='object'?{...v.widths}:{}};
 });
 const rows:DbRow[]=(Array.isArray(d.rows)?d.rows:[]).map((r:any)=>({...r,id:String(r?.id||makeId()),values:r?.values&&typeof r.values==='object'?{...r.values}:{},
  page_content:String(r?.page_content||'')}));
 const active=views.some(v=>v.id===d.active_view)?String(d.active_view):views[0].id;
 return {...d,title:String(d.title||''),show_title:d.show_title!==false,properties,views,active_view:active,rows};
}

export const nameKeyOf=(d:DbData)=>(d.properties.find(p=>p.key==='name')||d.properties[0]).key;
/** Valores de uma propriedade de escolha sempre como lista (seleção simples vira lista de 0 ou 1). */
export function choiceValues(row:DbRow,prop:DbProp):string[]{
 const v=row.values[prop.key];
 if(Array.isArray(v))return v.map(String).filter(Boolean);
 if(v==null||v==='')return [];
 if(prop.type==='multi_select')return String(v).split(',').map(x=>x.trim()).filter(Boolean);
 return [String(v)];
}
export const isEmptyValue=(row:DbRow,prop:DbProp)=>{const v=row.values[prop.key];if(prop.type==='checkbox')return !v;if(prop.type==='created')return false;return v==null||v===''||(Array.isArray(v)&&!v.length);};
export const dayKey=(d:Date)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
export const createdOf=(row:DbRow,prop?:DbProp)=>String(row.created_at||(prop?row.values[prop.key]:'')||'');

export function textOf(row:DbRow,prop:DbProp):string{
 if(isChoice(prop.type))return choiceValues(row,prop).join(', ');
 if(prop.type==='checkbox')return row.values[prop.key]?'sim':'';
 if(prop.type==='created')return createdOf(row,prop);
 return String(row.values[prop.key]??'');
}

export function matchFilter(row:DbRow,prop:DbProp|undefined,f:DbFilter,today=dayKey(new Date())):boolean{
 if(!prop)return true;
 if(f.op==='empty')return isEmptyValue(row,prop);
 if(f.op==='not_empty')return !isEmptyValue(row,prop);
 if(prop.type==='checkbox'&&f.op==='is')return !!row.values[prop.key]===!!f.value;
 if(isChoice(prop.type)){const want=(Array.isArray(f.value)?f.value:f.value==null||f.value===''?[]:[f.value]).map(String);if(!want.length)return true;const has=choiceValues(row,prop);return want.some(w=>w===''?!has.length:has.includes(w));}
 if(prop.type==='date'||prop.type==='created'){const v=(prop.type==='created'?createdOf(row,prop):String(row.values[prop.key]||'')).slice(0,10);
  if(f.op==='future')return !!v&&v>=today;if(f.op==='past')return !!v&&v<today;if(!f.value)return true;return v===String(f.value).slice(0,10);}
 const q=String(f.value??'').trim().toLowerCase();if(!q)return true;return textOf(row,prop).toLowerCase().includes(q);
}

export function compareRows(a:DbRow,b:DbRow,prop:DbProp):number{
 if(prop.type==='number'){const x=Number(a.values[prop.key]),y=Number(b.values[prop.key]);const xa=Number.isFinite(x)&&a.values[prop.key]!=='',ya=Number.isFinite(y)&&b.values[prop.key]!=='';if(xa!==ya)return xa?-1:1;return (xa?x:0)-(ya?y:0);}
 if(prop.type==='checkbox')return (a.values[prop.key]?1:0)-(b.values[prop.key]?1:0);
 if(isChoice(prop.type)){const o=prop.options||[],ia=o.indexOf(choiceValues(a,prop)[0]),ib=o.indexOf(choiceValues(b,prop)[0]);return (ia<0?1e6:ia)-(ib<0?1e6:ib);}
 const x=textOf(a,prop),y=textOf(b,prop);if(!x!==!y)return x?-1:1;return x.localeCompare(y,'pt-BR',{numeric:true,sensitivity:'base'});
}

/** Linhas que a visão mostra, na ordem: filtros, busca e ordenação (sem ordenação fica a ordem manual). */
export function viewRows(d:DbData,view:DbView,search=''):DbRow[]{
 const byKey=new Map(d.properties.map(p=>[p.key,p]));
 let rows=d.rows.filter(r=>(view.filters||[]).every(f=>matchFilter(r,byKey.get(f.key),f)));
 const q=search.trim().toLowerCase();
 if(q)rows=rows.filter(r=>d.properties.some(p=>textOf(r,p).toLowerCase().includes(q))||String(r.page_content||'').toLowerCase().includes(q));
 const sorts=(view.sorts||[]).filter(s=>byKey.has(s.key));
 if(sorts.length)rows=rows.map((r,i)=>({r,i})).sort((A,B)=>{for(const s of sorts){const c=compareRows(A.r,B.r,byKey.get(s.key)!);if(c)return s.dir==='desc'?-c:c;}return A.i-B.i;}).map(x=>x.r);
 return rows;
}

export type DbGroup={value:string;label:string;color:string};
/** Colunas do quadro: uma por opção, mais "Sem <campo>" no fim quando algum item está vazio ou a visão já mostrava. */
export function boardGroups(d:DbData,view:DbView,rows:readonly DbRow[]):DbGroup[]{
 const prop=groupProp(d,view);if(!prop)return [];
 const extra=new Set<string>();for(const r of rows)for(const v of choiceValues(r,prop))if(!(prop.options||[]).includes(v))extra.add(v);
 const values=[...(prop.options||[]),...extra];
 const groups:DbGroup[]=values.map(v=>({value:v,label:v,color:prop.option_colors?.[v]||'gray'}));
 groups.push({value:'',label:'Sem '+prop.label,color:'none'});
 const hidden=new Set(view.hidden_groups||[]);
 return groups.filter(g=>!hidden.has(g.value)&&(g.value!==''||rows.some(r=>!choiceValues(r,prop).length)));
}
export const groupProp=(d:DbData,view:DbView)=>d.properties.find(p=>p.key===view.group_by&&isChoice(p.type))||d.properties.find(p=>isChoice(p.type));
export const rowsInGroup=(rows:readonly DbRow[],prop:DbProp,value:string)=>rows.filter(r=>{const v=choiceValues(r,prop);return value===''?!v.length:v.includes(value);});

/** Arrasta um cartão de uma coluna para outra. Seleção múltipla troca só a etiqueta da coluna de origem. */
export function moveToGroup(d:DbData,rowId:string,prop:DbProp,from:string,to:string,beforeId?:string):DbData{
 const next=clone(d),row=next.rows.find(r=>r.id===rowId);if(!row)return next;
 if(prop.type==='multi_select'){const cur=choiceValues(row,prop).filter(v=>v!==from);if(to&&!cur.includes(to))cur.push(to);row.values[prop.key]=cur;}
 else row.values[prop.key]=to;
 if(beforeId!==undefined){const without=next.rows.filter(r=>r.id!==rowId);let at=beforeId?without.findIndex(r=>r.id===beforeId):-1;
  if(at<0){const last=without.reduce((n,r,i)=>(to===''?!choiceValues(r,prop).length:choiceValues(r,prop).includes(to))?i:n,-1);at=last<0?without.length:last+1;}
  without.splice(at,0,row);next.rows=without;}
 return next;
}
export function moveRowBefore(d:DbData,rowId:string,beforeId:string|null):DbData{
 const next=clone(d),row=next.rows.find(r=>r.id===rowId);if(!row||rowId===beforeId)return next;
 const rest=next.rows.filter(r=>r.id!==rowId),at=beforeId?rest.findIndex(r=>r.id===beforeId):-1;rest.splice(at<0?rest.length:at,0,row);next.rows=rest;return next;
}

export function shortUrl(u:string):string{
 const s=String(u||'').trim();if(!s)return '';
 try{const x=new URL(/^[a-z]+:\/\//i.test(s)?s:'https://'+s);const path=(x.pathname+x.search).replace(/\/$/,'');return x.hostname.replace(/^www\./,'')+(path.length>18?path.slice(0,16)+'…':path);}catch{return s.length>34?s.slice(0,32)+'…':s;}
}
export const hrefOf=(u:string)=>/^[a-z]+:\/\//i.test(String(u||'').trim())?String(u).trim():'https://'+String(u||'').trim();
export function sumOf(rows:readonly DbRow[],key:string):number{let t=0;for(const r of rows){const n=Number(r.values[key]);if(r.values[key]!==''&&r.values[key]!=null&&Number.isFinite(n))t+=n;}return Math.round(t*100)/100;}
export function maxOf(rows:readonly DbRow[],key:string):number{let m=0;for(const r of rows){const n=Number(r.values[key]);if(Number.isFinite(n)&&n>m)m=n;}return m;}

export function newRow(d:DbData,seed:Record<string,any>={},now=new Date()):DbRow{
 const values:Record<string,any>={};
 for(const p of d.properties){if(p.type==='checkbox')values[p.key]=false;else if(p.type==='multi_select')values[p.key]=[];else if(p.type==='created')values[p.key]=now.toISOString();else values[p.key]='';}
 return {id:makeId(),values:{...values,...seed},page_content:'',created_at:now.toISOString()};
}
export function uniqueLabel(base:string,taken:readonly string[]){const b=(base.trim()||'Propriedade').slice(0,60);if(!taken.includes(b))return b;let n=2;while(taken.includes(b+' '+n))n++;return b+' '+n;}
export function uniqueKeyFor(d:DbData,label:string){const base=label.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'campo';let k=base,n=2;while(d.properties.some(p=>p.key===k))k=base+'_'+n++;return k;}

/** Troca o tipo de uma propriedade convertendo os valores que já existem (nada se perde em texto). */
export function changePropType(d:DbData,key:string,type:string):DbData{
 const next=clone(d),prop=next.properties.find(p=>p.key===key);if(!prop||prop.type===type)return next;
 const from=prop.type;prop.type=type;
 if(isChoice(type)){const seen=new Set(prop.options||[]);for(const r of next.rows){const vals=isChoice(from)?choiceValues(r,{...prop,type:from}):String(r.values[key]??'').split(type==='multi_select'?',':'\u0000').map(x=>x.trim()).filter(Boolean);
  for(const v of vals)if(!seen.has(v)){seen.add(v);(prop.options=prop.options||[]).push(v);}r.values[key]=type==='multi_select'?vals:(vals[0]||'');}}
 else if(type==='checkbox')for(const r of next.rows)r.values[key]=!!r.values[key]&&r.values[key]!=='false'&&!(Array.isArray(r.values[key])&&!r.values[key].length);
 else if(type==='number')for(const r of next.rows){const n=Number(String(isChoice(from)?choiceValues(r,{...prop,type:from})[0]||'':r.values[key]??'').replace(',','.'));r.values[key]=Number.isFinite(n)&&String(r.values[key]??'')!==''?n:'';}
 else for(const r of next.rows)r.values[key]=isChoice(from)?choiceValues(r,{...prop,type:from}).join(', '):from==='checkbox'?(r.values[key]?'sim':''):String(r.values[key]??'');
 return next;
}

/** 6 semanas de domingo a sábado em volta do mês. */
export function monthGrid(year:number,month:number):Date[]{const first=new Date(year,month,1),start=new Date(year,month,1-first.getDay());return Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));}
export const MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export function longDate(v:string):string{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||''));if(!m)return String(v||'');return Number(m[3])+' de '+MONTHS[Number(m[2])-1]+' de '+m[1];}
export const dateKeyProp=(d:DbData,view:DbView)=>d.properties.find(p=>p.key===view.date_key&&(p.type==='date'||p.type==='created'))||d.properties.find(p=>p.type==='date')||d.properties.find(p=>p.type==='created');
