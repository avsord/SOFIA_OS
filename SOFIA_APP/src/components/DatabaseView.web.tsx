// 14/11/2026 (Pedro: "Modelo de tabela igual ao Notion" e "Kanban avançado", itens 13 e 14 de 13/11): base de dados do site
// no padrão do clone medido do Notion (Atlas mimic-kaizen/clones/notion-kanban-conteudo). Mesmo bloco 'collection' de antes:
// - Abas de visão (Tabela, Quadro, Calendário, Lista) com "+" para criar; Filtrar, Ordenar, Buscar, Configurações e "Nova".
// - Quadro: coluna 276 px tingida pela cor da opção, pílula colorida com contador, ⋯ e + ao passar o mouse; cartão 260 px com
//   as propriedades preenchidas; arrastar entre colunas; seleção múltipla mostra o cartão em cada coluna dele.
// - Tabela: tipo por coluna, menu da coluna, largura e ordem arrastando, "+" coluna, edição direto na célula, rodapé com
//   contagem e soma; cada linha abre no painel lateral (entra pela direita em 0,2 s, setas anterior/próximo, ESC fecha).
// - Nada pergunta o óbvio: excluir faz na hora e oferece Desfazer.
import {fitTextarea} from '../lib/fit-textarea';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {PageBlock} from '../lib/page-editor';
import {useTheme} from '../lib/theme';
import {STATUS_COLORS,statusColorHex} from '../lib/page-templates';
import {
 type DbData,type DbProp,type DbRow,type DbView,PROP_TYPES,VIEW_TYPES,MONTHS,boardGroups,changePropType,choiceValues,createdOf,dateKeyProp,dayKey,
 groupProp,hrefOf,isChoice,longDate,makeId,maxOf,monthGrid,moveRowBefore,moveToGroup,nameKeyOf,newRow,normalizeDb,propGlyph,rowsInGroup,shortUrl,
 sumOf,uniqueKeyFor,uniqueLabel,viewGlyph,viewRows
} from '../lib/database';

type Props={block:PageBlock;pageId?:string;onChange:(data:any,group?:string)=>void;onDelete?:()=>void;onInteractionChange?:(active:boolean)=>void};
type Menu={x:number;y:number;w?:number;kind:string;payload?:any};
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
const hexA=(hex:string,a:number)=>{const h=hex.replace('#','');if(h.length!==6)return hex;const n=parseInt(h,16);return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')';};
const colorHex=(id:string)=>id==='none'?'#8e8e93':statusColorHex(id);
const EMOJIS=['📄','📝','📌','⭐','🔥','✅','💡','🎯','📅','📷','🎬','🎵','📚','🔗','💬','🧠','🚀','🛒','💰','🏠','❤️','⚡','🌱','🎨','🧩','📦','🗂️','🔒','🧪','🏁'];

function useCss(){
 const c=useTheme();
 return useMemo(()=>`
.sdb{--t:${c.text};--m:${c.muted};--l:${c.line};--s:${c.surface};--e:${c.elevated||c.surface};--i:${c.input};--a:${c.accent};--as:${c.accentSoft};color:var(--t);font-size:14px;position:relative}
.sdb button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.sdb-tabs::-webkit-scrollbar{display:none}
.sdb-tab{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border-radius:7px;color:var(--m);font-size:13px;white-space:nowrap}
.sdb-tab:hover{background:var(--i)} .sdb-tab.on{color:var(--t);background:var(--i);font-weight:500}
.sdb-ib{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border-radius:6px;color:var(--m);padding:0 6px;gap:5px;font-size:13px}
.sdb-ib:hover{background:var(--i);color:var(--t)} .sdb-ib.on{color:var(--a)}
.sdb-new{display:inline-flex;height:28px;border-radius:7px;overflow:hidden;background:var(--a);color:${c.onAccent}}
.sdb-new button{color:${c.onAccent}!important;padding:0 10px;font-weight:600;font-size:13px} .sdb-new button:hover{filter:brightness(1.08)}
.sdb-new .arr{padding:0 7px;border-left:1px solid rgba(0,0,0,.18)}
.sdb-menu{position:fixed;z-index:4000;background:var(--e);border:1px solid var(--l);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.28);padding:5px;max-height:72vh;overflow:auto;animation:sdbIn .12s ease-out}
@keyframes sdbIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.sdb-mi{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:6px 9px;border-radius:6px;font-size:13.5px;min-height:30px}
.sdb-mi:hover,.sdb-mi:focus-visible{background:var(--i);outline:none} .sdb-mi.danger{color:${c.danger}} .sdb-mi .k{margin-left:auto;color:var(--m);font-size:12px}
.sdb-mi .g{width:18px;text-align:center;color:var(--m)}
.sdb-sep{height:1px;background:var(--l);margin:5px 4px} .sdb-cap{padding:6px 9px 3px;color:var(--m);font-size:11.5px;font-weight:500}
.sdb-inp{width:100%;box-sizing:border-box;background:var(--i);border:1px solid var(--l);border-radius:6px;color:var(--t);padding:6px 8px;font:inherit;font-size:13.5px;outline:none}
.sdb-inp:focus{border-color:var(--a)}
.sdb-tag{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:4px;font-size:12px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;color:var(--t)}
.sdb-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:10px;align-items:flex-start}
.sdb-col{width:276px;flex:0 0 276px;border-radius:10px;padding:6px 8px 8px;box-sizing:border-box}
.sdb-colh{display:flex;align-items:center;gap:6px;height:30px;padding:0 2px}
.sdb-colh .tools{margin-left:auto;display:flex;opacity:0;transition:opacity .1s} .sdb-col:hover .sdb-colh .tools{opacity:1}
.sdb-card{position:relative;width:260px;box-sizing:border-box;border-radius:10px;padding:9px 10px;margin-top:8px;cursor:pointer;transition:background .1s ease-out;box-shadow:0 2px 4px rgba(25,25,25,.08)}
.sdb-card .more{position:absolute;top:6px;right:6px;opacity:0;background:var(--e);border:1px solid var(--l);border-radius:6px;height:24px;width:24px}
.sdb-card:hover .more{opacity:1} .sdb-card.drag{opacity:.4} .sdb-card.open{outline:2px solid var(--a)}
.sdb-drop{height:3px;border-radius:2px;background:var(--a);margin-top:6px}
.sdb-add{display:flex;align-items:center;gap:6px;width:100%;height:30px;padding:0 8px;border-radius:7px;color:var(--m);font-size:13px;margin-top:6px}
.sdb-add:hover{background:var(--i);color:var(--t)}
.sdb-tbl{border-collapse:separate;border-spacing:0;table-layout:fixed}
.sdb-tbl th{position:relative;height:34px;padding:0 8px;text-align:left;font-weight:400;color:var(--m);font-size:13px;border-bottom:1px solid var(--l);border-right:1px solid var(--l);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;user-select:none}
.sdb-tbl th:hover{background:var(--i)} .sdb-tbl th.dropl{box-shadow:inset 3px 0 0 var(--a)}
.sdb-tbl td{height:36px;padding:0;border-bottom:1px solid var(--l);border-right:1px solid var(--l);vertical-align:middle;overflow:hidden}
.sdb-tbl td:last-child,.sdb-tbl th:last-child{border-right:0}
.sdb-tbl tr.r:hover td{background:${hexA(c.text.length===7?c.text:'#888888',0.025)}} .sdb-tbl tr.dropt td{box-shadow:inset 0 2px 0 var(--a)}
.sdb-rz{position:absolute;right:-3px;top:0;bottom:0;width:7px;cursor:col-resize;z-index:2} .sdb-rz:hover{background:var(--a);opacity:.5}
.sdb-cell{display:flex;align-items:center;gap:5px;min-height:36px;padding:0 8px;box-sizing:border-box;cursor:text;overflow:hidden}
.sdb-cell input.bare,.sdb-bare{background:transparent;border:0;outline:none;color:var(--t);font:inherit;font-size:14px;width:100%;padding:0}
.sdb-name{display:flex;align-items:center;gap:6px;min-height:36px;padding:0 6px 0 4px}
.sdb-name .open{opacity:0;margin-left:auto;font-size:11.5px;color:var(--m);border:1px solid var(--l);border-radius:5px;padding:2px 6px;background:var(--e);font-weight:500;letter-spacing:.3px}
.sdb-tbl tr.r:hover .sdb-name .open{opacity:1}
.sdb-gutter{width:44px;opacity:0;display:flex;align-items:center;justify-content:flex-end;gap:1px;color:var(--m)} .sdb-tbl tr.r:hover .sdb-gutter{opacity:1}
.sdb-gutter span{cursor:grab;padding:2px 2px;border-radius:4px} .sdb-gutter span:hover{background:var(--i)}
.sdb-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:13px;border:1px solid var(--l);color:var(--t);font-size:12.5px;background:var(--as)}
.sdb-chip:hover{border-color:var(--a)}
.sdb-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--l);border-left:1px solid var(--l)}
.sdb-day{min-height:112px;border-right:1px solid var(--l);border-bottom:1px solid var(--l);padding:5px;position:relative;box-sizing:border-box}
.sdb-day .plus{position:absolute;left:5px;top:4px;opacity:0;height:22px;width:22px;border-radius:5px;color:var(--m)} .sdb-day:hover .plus{opacity:1} .sdb-day .plus:hover{background:var(--i)}
.sdb-day.drop{background:var(--as)}
.sdb-ev{display:block;width:100%;text-align:left;margin-top:4px;padding:4px 6px;border-radius:6px;background:var(--e);border:1px solid var(--l)!important;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.sdb-ev:hover{border-color:var(--a)!important}
.sdb-li{display:flex;align-items:center;gap:8px;min-height:38px;padding:0 8px;border-radius:7px;cursor:pointer;border-bottom:1px solid var(--l)} .sdb-li:hover{background:var(--i)}
.sdb-peek{position:fixed;top:0;bottom:0;right:0;z-index:3000;background:var(--e);border-left:1px solid var(--l);box-shadow:0 4px 24px -2px rgba(0,0,0,.35);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .2s cubic-bezier(.2,.8,.2,1)}
.sdb-peek.in{transform:none} .sdb-peek.center{top:6vh;bottom:6vh;left:50%;right:auto;border:1px solid var(--l);border-radius:12px;transform:translate(-50%,8px);opacity:0;transition:transform .18s ease-out,opacity .18s ease-out}
.sdb-peek.center.in{transform:translate(-50%,0);opacity:1} .sdb-peek.full{left:0;border-left:0}
.sdb-veil{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2999}
.sdb-pbar{display:flex;align-items:center;gap:2px;height:44px;padding:0 10px;border-bottom:1px solid var(--l);flex:0 0 auto}
.sdb-pbody{flex:1;overflow:auto;padding:28px 0 60px}
.sdb-pin{max-width:760px;margin:0 auto;padding:0 44px}
.sdb-ptitle{width:100%;background:transparent;border:0;outline:none;color:var(--t);font:inherit;font-size:32px;font-weight:700;line-height:1.2;resize:none;padding:0;overflow:hidden}
.sdb-prow{display:flex;align-items:flex-start;min-height:34px;border-radius:6px}
.sdb-prow .lab{width:170px;flex:0 0 170px;display:flex;align-items:center;gap:7px;color:var(--m);font-size:13.5px;min-height:34px;padding:0 6px;border-radius:6px;cursor:pointer}
.sdb-prow .lab:hover{background:var(--i)} .sdb-prow .val{flex:1;min-width:0;border-radius:6px} .sdb-prow .val:hover{background:var(--i)}
.sdb-notes{width:100%;min-height:180px;background:transparent;border:0;outline:none;color:var(--t);font:inherit;font-size:15px;line-height:1.6;resize:none;padding:0}
.sdb-rzl{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize} .sdb-rzl:hover{background:var(--a);opacity:.4}
.sdb-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:5000;display:flex;align-items:center;gap:14px;background:${c.text};color:${c.bg};border-radius:10px;padding:9px 10px 9px 14px;font-size:13.5px;box-shadow:0 10px 30px rgba(0,0,0,.35);animation:sdbIn .15s ease-out}
.sdb-toast button{color:${c.bg}!important;font-weight:600;padding:4px 8px;border-radius:6px} .sdb-toast button:hover{background:rgba(127,127,127,.25)}
.sdb-sw{width:20px;height:20px;border-radius:5px;border:2px solid transparent} .sdb-sw.on{border-color:var(--t)}
.sdb-bar{height:4px;border-radius:2px;background:var(--l);overflow:hidden;flex:1;min-width:30px} .sdb-bar i{display:block;height:100%;background:var(--a)}
.sdb-cbx{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--m);display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:${c.onAccent}} .sdb-cbx.on{background:var(--a);border-color:var(--a)}
.sdb-av{width:20px;height:20px;border-radius:10px;background:var(--as);color:var(--a);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex:0 0 auto}
`,[c]);
}

function MI({g,label,k,danger,onClick,sub}:{g?:string;label:string;k?:string;danger?:boolean;onClick:(e:React.MouseEvent<HTMLButtonElement>)=>void;sub?:boolean}){
 return <button className={'sdb-mi'+(danger?' danger':'')} onClick={onClick}><span className="g">{g||''}</span><span>{label}</span>{k?<span className="k">{k}</span>:sub?<span className="k">›</span>:null}</button>;
}
function Tag({value,color}:{value:string;color:string}){return <span className="sdb-tag" style={{background:hexA(colorHex(color),0.32)}}>{value}</span>;}
function Avatar({name}:{name:string}){return <span className="sdb-av">{(name.trim()[0]||'?').toUpperCase()}</span>;}

export function DatabaseView({block,onChange,onDelete,onInteractionChange}:Props){
 const c=useTheme(),css=useCss();
 const d=useMemo(()=>normalizeDb(block.data),[block.data]);
 const latest=useRef(d);latest.current=d;
 const view=d.views.find(v=>v.id===d.active_view)||d.views[0];
 const [search,setSearch]=useState<string|null>(null);
 const [menu,setMenuRaw]=useState<Menu|null>(null),[menuQ,setMenuQ]=useState('');
 const setMenu=(m:Menu|null)=>{setMenuQ('');setMenuRaw(m);};
 const [peek,setPeek]=useState<{id:string;mode:'side'|'center'|'full'}|null>(null);
 const [toast,setToast]=useState<{text:string;undo?:()=>void}|null>(null);
 const toastTimer=useRef<any>(null);
 const nameKey=nameKeyOf(d),nameProp=d.properties.find(p=>p.key===nameKey)!;
 const rows=useMemo(()=>viewRows(d,view,search||''),[d,view,search]);
 const visibleProps=d.properties.filter(p=>!(view.hidden||[]).includes(p.key));

 const commit=(next:DbData,group?:string)=>{latest.current=next;onChange(next,group||'collection:'+block.id+':'+Date.now());};
 const mutate=(fn:(x:DbData)=>void,group?:string)=>{const next=clone(latest.current);fn(next);commit(next,group);};
 const mutView=(fn:(v:DbView)=>void)=>mutate(x=>{const v=x.views.find(y=>y.id===view.id);if(v)fn(v);});
 const say=(text:string,undo?:()=>void)=>{clearTimeout(toastTimer.current);setToast({text,undo});toastTimer.current=setTimeout(()=>setToast(null),5500);};
 const setValue=(rowId:string,key:string,value:any,typing=false)=>mutate(x=>{const r=x.rows.find(y=>y.id===rowId);if(r)r.values[key]=value;},typing?'cell:'+rowId+':'+key:undefined);
 const setRow=(rowId:string,patch:Partial<DbRow>,group?:string)=>mutate(x=>{const r=x.rows.find(y=>y.id===rowId);if(r)Object.assign(r,patch);},group);
 const addRow=(seed:Record<string,any>={},open:'side'|'center'|null='side',at?:number)=>{const r=newRow(latest.current,seed);mutate(x=>{if(at!=null&&at>=0)x.rows.splice(at,0,r);else x.rows.push(r);});if(open)setPeek({id:r.id,mode:open});return r;};
 const removeRows=(ids:string[])=>{const before=latest.current;const gone=new Set(ids);mutate(x=>{x.rows=x.rows.filter(r=>!gone.has(r.id));});if(peek&&gone.has(peek.id))setPeek(null);
  say(ids.length>1?ids.length+' itens excluídos':'Item excluído',()=>commit(clone(before)));};
 const duplicateRow=(id:string)=>{const at=latest.current.rows.findIndex(r=>r.id===id);if(at<0)return;const src=latest.current.rows[at];const copy={...clone(src),id:makeId(),created_at:new Date().toISOString()};
  if(copy.values[nameKey])copy.values[nameKey]=String(copy.values[nameKey])+' (cópia)';mutate(x=>{x.rows.splice(at+1,0,copy);});say('Item duplicado');};
 const openMenu=(e:{clientX:number;clientY:number}|null,el:Element|null,kind:string,payload?:any,w=260)=>{
  let x=0,y=0;if(el){const b=el.getBoundingClientRect();x=b.left;y=b.bottom+4;}else if(e){x=e.clientX;y=e.clientY;}
  x=Math.max(8,Math.min(x,window.innerWidth-w-12));y=Math.max(8,Math.min(y,window.innerHeight-120));setMenu({x,y,w,kind,payload});};

 // ESC: fecha um nível por vez (menu, depois painel)
 // (lido por referência e registrado uma vez só: o Esc nunca usa um estado velho)
 const escState=useRef({menu:false,peek:false});escState.current={menu:!!menu,peek:!!peek};
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;const st=escState.current;if(st.menu){e.stopPropagation();e.preventDefault();setMenuRaw(null);return;}if(st.peek){e.stopPropagation();e.preventDefault();setPeek(null);}};
  window.addEventListener('keydown',k,true);return()=>window.removeEventListener('keydown',k,true);},[]);
 useEffect(()=>()=>clearTimeout(toastTimer.current),[]);

 // ---------- editores de valor (célula da tabela e linha do painel são o mesmo) ----------
 const valueView=(row:DbRow,p:DbProp,compact=false):React.ReactNode=>{
  const v=row.values[p.key];
  if(isChoice(p.type)){const vals=choiceValues(row,p);return vals.length?<span style={{display:'flex',gap:4,flexWrap:compact?'nowrap':'wrap',overflow:'hidden'}}>{vals.map(x=><Tag key={x} value={x} color={p.option_colors?.[x]||'gray'}/>)}</span>:null;}
  if(p.type==='checkbox')return <span className={'sdb-cbx'+(v?' on':'')}>{v?'✓':''}</span>;
  if(p.type==='date')return v?<span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{longDate(String(v))}</span>:null;
  if(p.type==='created'){const t=createdOf(row,p);return t?<span style={{color:'var(--m)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{longDate(t)}</span>:null;}
  if(p.type==='url')return v?<a href={hrefOf(String(v))} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{color:'var(--t)',textDecoration:'underline',textDecorationColor:'var(--m)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{shortUrl(String(v))}</a>:null;
  if(p.type==='number'){if(v===''||v==null)return null;if(p.number_format==='bar'){const m=Math.max(1,maxOf(d.rows,p.key));return <span style={{display:'flex',alignItems:'center',gap:8,width:'100%'}}><span>{String(v)}</span><span className="sdb-bar"><i style={{width:Math.min(100,Number(v)/m*100)+'%'}}/></span></span>;}return <span style={{marginLeft:'auto'}}>{String(v)}</span>;}
  if(p.type==='person')return v?<span style={{display:'inline-flex',alignItems:'center',gap:6}}><Avatar name={String(v)}/>{String(v)}</span>:null;
  return v?<span style={{whiteSpace:compact?'nowrap':'pre-wrap',overflow:'hidden',textOverflow:'ellipsis'}}>{String(v)}</span>:null;
 };
 /** Clique num valor: abre o editor certo para o tipo. */
 const editValue=(row:DbRow,p:DbProp,el:Element)=>{
  if(p.type==='created')return;
  if(p.type==='checkbox'){setValue(row.id,p.key,!row.values[p.key]);return;}
  if(isChoice(p.type)){openMenu(null,el,'choice',{rowId:row.id,key:p.key},280);return;}
  openMenu(null,el,'edit',{rowId:row.id,key:p.key},Math.max(260,Math.min(420,(el as HTMLElement).offsetWidth+40)));
 };
 const cell=(row:DbRow,p:DbProp)=>{
  if(p.type==='checkbox')return <div className="sdb-cell" style={{cursor:'pointer'}} onClick={()=>setValue(row.id,p.key,!row.values[p.key])}>{valueView(row,p,true)}</div>;
  if(p.type==='text'||p.type==='person'||p.type==='number')return <div className="sdb-cell">{p.type==='person'&&row.values[p.key]?<Avatar name={String(row.values[p.key])}/>:null}
   <input className="bare" aria-label={p.label} value={String(row.values[p.key]??'')} inputMode={p.type==='number'?'decimal':undefined} style={p.type==='number'?{textAlign:'right'}:undefined}
    onChange={e=>{const t=e.target.value;setValue(row.id,p.key,p.type==='number'?(t.trim()===''?'':(Number.isFinite(Number(t.replace(',','.')))?Number(t.replace(',','.')):t)):t,true);}}/>
   {p.type==='number'&&p.number_format==='bar'&&row.values[p.key]!==''?<span className="sdb-bar" style={{maxWidth:60}}><i style={{width:Math.min(100,Number(row.values[p.key])/Math.max(1,maxOf(d.rows,p.key))*100)+'%'}}/></span>:null}</div>;
  return <div className="sdb-cell" style={{cursor:p.type==='created'?'default':'pointer'}} onClick={e=>editValue(row,p,e.currentTarget)}>{valueView(row,p,true)}</div>;
 };

 // ---------- menus ----------
 const close=()=>setMenu(null);
 const rowMenu=(row:DbRow)=><>
  <MI g="↗" label="Abrir" onClick={()=>{close();setPeek({id:row.id,mode:'side'});}}/>
  <MI g="⤢" label="Abrir em página inteira" onClick={()=>{close();setPeek({id:row.id,mode:'full'});}}/>
  <MI g="☺" label="Editar ícone" onClick={(e)=>openMenu(e,null,'icon',{rowId:row.id},252)}/>
  <div className="sdb-sep"/>
  <MI g="⧉" label="Duplicar" onClick={()=>{close();duplicateRow(row.id);}}/>
  <MI g="🗑" label="Excluir" danger onClick={()=>{close();removeRows([row.id]);}}/>
 </>;
 const optionMenu=(p:DbProp,opt:string)=>{const name=opt;return <>
  <div style={{padding:'4px 5px 6px'}}><input className="sdb-inp" autoFocus defaultValue={name} aria-label="Nome da opção"
   onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}
   onBlur={e=>{const t=e.target.value.trim();if(!t||t===opt)return;renameOption(p.key,opt,uniqueLabel(t,(p.options||[]).filter(x=>x!==opt)));}}/></div>
  <div className="sdb-cap">Cor</div>
  <div style={{display:'flex',flexWrap:'wrap',gap:6,padding:'4px 9px 8px'}}>{STATUS_COLORS.map(s=><button key={s.id} aria-label={'Cor '+s.label} className={'sdb-sw'+((p.option_colors?.[opt]||'gray')===s.id?' on':'')} style={{background:s.hex}}
   onClick={()=>mutate(x=>{const q=x.properties.find(y=>y.key===p.key)!;q.option_colors={...(q.option_colors||{}),[opt]:s.id};})}/>)}</div>
  <div className="sdb-sep"/>
  <MI g="🗑" label="Excluir opção" danger onClick={()=>{close();deleteOption(p.key,opt);}}/>
 </>;};
 const renameOption=(key:string,from:string,to:string)=>mutate(x=>{const p=x.properties.find(y=>y.key===key)!;p.options=(p.options||[]).map(o=>o===from?to:o);
  if(p.option_colors){p.option_colors[to]=p.option_colors[from];delete p.option_colors[from];}
  for(const r of x.rows){const v=r.values[key];if(Array.isArray(v))r.values[key]=v.map((o:any)=>o===from?to:o);else if(v===from)r.values[key]=to;}
  for(const v of x.views)v.hidden_groups=(v.hidden_groups||[]).map(g=>g===from?to:g);});
 const deleteOption=(key:string,opt:string)=>{const before=latest.current;mutate(x=>{const p=x.properties.find(y=>y.key===key)!;p.options=(p.options||[]).filter(o=>o!==opt);if(p.option_colors)delete p.option_colors[opt];
  for(const r of x.rows){const v=r.values[key];if(Array.isArray(v))r.values[key]=v.filter((o:any)=>o!==opt);else if(v===opt)r.values[key]='';}});say('Opção "'+opt+'" excluída',()=>commit(clone(before)));};

 const choiceMenu=(rowId:string,keyName:string)=>{
  const p=d.properties.find(x=>x.key===keyName);const row=d.rows.find(r=>r.id===rowId);const q=menuQ,setQ=setMenuQ;
  if(!p||!row)return null;const vals=choiceValues(row,p),multi=p.type==='multi_select';
  const opts=(p.options||[]).filter(o=>o.toLowerCase().includes(q.trim().toLowerCase()));const exact=(p.options||[]).some(o=>o.toLowerCase()===q.trim().toLowerCase());
  const pick=(o:string)=>{if(multi)setValue(rowId,p.key,vals.includes(o)?vals.filter(x=>x!==o):[...vals,o]);else{setValue(rowId,p.key,vals[0]===o?'':o);close();}};
  const create=()=>{const t=q.trim();if(!t)return;const color=STATUS_COLORS[(p.options||[]).length%STATUS_COLORS.length].id;
   mutate(x=>{const pp=x.properties.find(y=>y.key===p.key)!;pp.options=[...(pp.options||[]),t];pp.option_colors={...(pp.option_colors||{}),[t]:color};const r=x.rows.find(y=>y.id===rowId)!;r.values[p.key]=multi?[...vals,t]:t;});
   setQ('');if(!multi)close();};
  return <>
   <div style={{display:'flex',flexWrap:'wrap',gap:4,padding:'5px 6px',borderBottom:'1px solid var(--l)',marginBottom:4,alignItems:'center'}}>
    {vals.map(v=><span key={v} className="sdb-tag" style={{background:hexA(colorHex(p.option_colors?.[v]||'gray'),.32)}}>{v}<button aria-label={'Tirar '+v} onClick={()=>pick(v)} style={{marginLeft:4,opacity:.7}}>×</button></span>)}
    <input className="sdb-bare" autoFocus placeholder={vals.length?'':'Buscar ou criar opção'} value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:90,fontSize:13.5}}
     onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(opts[0]){pick(opts[0]);setQ('');}else create();}if(e.key==='Backspace'&&!q&&vals.length)pick(vals[vals.length-1]);}}/>
   </div>
   <div className="sdb-cap">{multi?'Selecione uma ou mais opções':'Selecione uma opção ou crie outra'}</div>
   {opts.map(o=><div key={o} style={{display:'flex',alignItems:'center'}}><button className="sdb-mi" style={{flex:1}} onClick={()=>pick(o)}><Tag value={o} color={p.option_colors?.[o]||'gray'}/>{vals.includes(o)?<span className="k">✓</span>:null}</button>
    <button className="sdb-ib" aria-label={'Editar opção '+o} onClick={e=>openMenu(null,e.currentTarget,'option',{key:p.key,opt:o},230)}>⋯</button></div>)}
   {q.trim()&&!exact?<button className="sdb-mi" onClick={create}><span className="g">＋</span>Criar <Tag value={q.trim()} color={STATUS_COLORS[(p.options||[]).length%STATUS_COLORS.length].id}/></button>:null}
  </>;
 };
 const editMenu=(rowId:string,keyName:string)=>{
  const p=d.properties.find(x=>x.key===keyName),row=d.rows.find(r=>r.id===rowId);if(!p||!row)return null;
  const v=row.values[p.key];
  if(p.type==='date')return <div style={{padding:6,display:'grid',gap:6}}>
   <input className="sdb-inp" type="date" autoFocus value={String(v||'').slice(0,10)} style={{colorScheme:c.bg.toLowerCase()<'#888888'?'dark':'light'}} onChange={e=>setValue(rowId,p.key,e.target.value)}/>
   <div style={{display:'flex',gap:4}}><button className="sdb-mi" onClick={()=>{setValue(rowId,p.key,dayKey(new Date()));close();}}>Hoje</button>{v?<button className="sdb-mi danger" onClick={()=>{setValue(rowId,p.key,'');close();}}>Limpar</button>:null}</div></div>;
  return <div style={{padding:6,display:'grid',gap:6}}>
   <input className="sdb-inp" autoFocus defaultValue={String(v??'')} placeholder={p.type==='url'?'Cole um link':'Escreva…'} aria-label={p.label}
    onChange={e=>setValue(rowId,p.key,e.target.value,true)} onKeyDown={e=>{if(e.key==='Enter')close();}}/>
   {p.type==='url'&&v?<a className="sdb-mi" href={hrefOf(String(v))} target="_blank" rel="noopener noreferrer" style={{color:'var(--t)',textDecoration:'none'}}><span className="g">↗</span>Abrir link</a>:null}
  </div>;
 };
 const propMenu=(p:DbProp)=>{const i=d.properties.findIndex(x=>x.key===p.key);const sorted=(view.sorts||[]).find(s=>s.key===p.key);return <>
  <div style={{padding:'4px 5px 6px'}}><input className="sdb-inp" autoFocus defaultValue={p.label} aria-label="Nome da propriedade" onKeyDown={e=>{if(e.key==='Enter'){(e.target as HTMLInputElement).blur();close();}}}
   onBlur={e=>{const t=e.target.value.trim();if(t&&t!==p.label)mutate(x=>{x.properties.find(y=>y.key===p.key)!.label=t;});}}/></div>
  {p.key!==nameKey?<MI g={propGlyph(p.type)} label={'Tipo: '+(PROP_TYPES.find(t=>t.type===p.type)?.label||p.type)} sub onClick={e=>openMenu(null,e.currentTarget,'ptype',{key:p.key},230)}/>:null}
  {isChoice(p.type)?<MI g="◉" label="Editar opções" sub onClick={e=>openMenu(null,e.currentTarget,'popts',{key:p.key},260)}/>:null}
  {p.type==='number'?<MI g="▬" label={p.number_format==='bar'?'Mostrar só o número':'Mostrar como barra'} onClick={()=>{close();mutate(x=>{const q=x.properties.find(y=>y.key===p.key)!;q.number_format=q.number_format==='bar'?'':'bar';});}}/>:null}
  <div className="sdb-sep"/>
  <MI g="↑" label="Ordenar crescente" k={sorted?.dir==='asc'?'✓':undefined} onClick={()=>{close();mutView(v=>{v.sorts=[{key:p.key,dir:'asc'}];v.sort_by='';});}}/>
  <MI g="↓" label="Ordenar decrescente" k={sorted?.dir==='desc'?'✓':undefined} onClick={()=>{close();mutView(v=>{v.sorts=[{key:p.key,dir:'desc'}];v.sort_by='';});}}/>
  <MI g="⏷" label="Filtrar" onClick={()=>{close();addFilter(p.key);}}/>
  {p.key!==nameKey?<MI g="◌" label="Ocultar nesta visão" onClick={()=>{close();mutView(v=>{v.hidden=[...(v.hidden||[]),p.key];});}}/>:null}
  <div className="sdb-sep"/>
  {i>0?<MI g="←" label="Mover para a esquerda" onClick={()=>{close();mutate(x=>{const a=x.properties;[a[i-1],a[i]]=[a[i],a[i-1]];});}}/>:null}
  {i<d.properties.length-1?<MI g="→" label="Mover para a direita" onClick={()=>{close();mutate(x=>{const a=x.properties;[a[i+1],a[i]]=[a[i],a[i+1]];});}}/>:null}
  {p.key!==nameKey?<MI g="⧉" label="Duplicar propriedade" onClick={()=>{close();mutate(x=>{const label=uniqueLabel(p.label,x.properties.map(y=>y.label)),key=uniqueKeyFor(x,label);x.properties.splice(i+1,0,{...clone(p),key,label});for(const r of x.rows)r.values[key]=clone(r.values[p.key]??'');});}}/>:null}
  {p.key!==nameKey?<MI g="🗑" label="Excluir propriedade" danger onClick={()=>{close();const before=latest.current;mutate(x=>{x.properties=x.properties.filter(y=>y.key!==p.key);for(const r of x.rows)delete r.values[p.key];for(const v of x.views){v.filters=(v.filters||[]).filter(f=>f.key!==p.key);v.sorts=(v.sorts||[]).filter(s=>s.key!==p.key);if(v.group_by===p.key)v.group_by='';}});say('Propriedade "'+p.label+'" excluída',()=>commit(clone(before)));}}/>:null}
 </>;};
 const addProp=(type:string,afterKey?:string)=>{let created='';mutate(x=>{const label=uniqueLabel(PROP_TYPES.find(t=>t.type===type)?.label||'Propriedade',x.properties.map(y=>y.label)),key=uniqueKeyFor(x,label);created=key;
  const p:DbProp={key,label,type,options:type==='status'?['Não iniciada','Em andamento','Concluída']:[],option_colors:type==='status'?{'Não iniciada':'gray','Em andamento':'blue','Concluída':'green'}:{}};
  const at=afterKey?x.properties.findIndex(y=>y.key===afterKey)+1:x.properties.length;x.properties.splice(at,0,p);
  for(const r of x.rows)r.values[key]=type==='checkbox'?false:type==='multi_select'?[]:type==='created'?(r.created_at||''):'';});return created;};
 const addFilter=(key:string)=>{const p=d.properties.find(x=>x.key===key);if(!p)return;const op=p.type==='checkbox'?'is':isChoice(p.type)?'is':p.type==='date'||p.type==='created'?'future':'contains';
  mutView(v=>{v.filters=[...(v.filters||[]).filter(f=>f.key!==key),{key,op,value:p.type==='checkbox'?true:isChoice(p.type)?[]:''}];v.filter_key='';});
  setTimeout(()=>{const el=document.querySelector('[data-sdb-filter="'+block.id+':'+key+'"]');if(el)openMenu(null,el,'filter',{key},280);},30);};

 const menuBody=():React.ReactNode=>{
  if(!menu)return null;const P=menu.payload||{};
  switch(menu.kind){
   case 'row':{const r=d.rows.find(x=>x.id===P.rowId);return r?rowMenu(r):null;}
   case 'choice':return choiceMenu(P.rowId,P.key);
   case 'edit':return editMenu(P.rowId,P.key);
   case 'option':{const p=d.properties.find(x=>x.key===P.key);return p?optionMenu(p,P.opt):null;}
   case 'prop':{const p=d.properties.find(x=>x.key===P.key);return p?propMenu(p):null;}
   case 'ptype':return <><div className="sdb-cap">Tipo de propriedade</div>{PROP_TYPES.map(t=><MI key={t.type} g={t.glyph} label={t.label} k={d.properties.find(x=>x.key===P.key)?.type===t.type?'✓':undefined} onClick={()=>{close();commit(changePropType(latest.current,P.key,t.type));}}/>)}</>;
   case 'popts':{const p=d.properties.find(x=>x.key===P.key);if(!p)return null;return <><div className="sdb-cap">Opções de {p.label}</div>{(p.options||[]).map(o=><button key={o} className="sdb-mi" onClick={e=>openMenu(null,e.currentTarget,'option',{key:p.key,opt:o},230)}><Tag value={o} color={p.option_colors?.[o]||'gray'}/><span className="k">⋯</span></button>)}
    <div style={{padding:'6px 5px 4px'}}><input className="sdb-inp" placeholder="Nova opção e Enter" onKeyDown={e=>{if(e.key!=='Enter')return;const t=(e.target as HTMLInputElement).value.trim();if(!t)return;(e.target as HTMLInputElement).value='';mutate(x=>{const q=x.properties.find(y=>y.key===p.key)!;const name=uniqueLabel(t,q.options||[]);q.options=[...(q.options||[]),name];q.option_colors={...(q.option_colors||{}),[name]:STATUS_COLORS[(q.options.length-1)%STATUS_COLORS.length].id};});}}/></div></>;}
   case 'newprop':return <><div className="sdb-cap">Nova propriedade</div>{PROP_TYPES.map(t=><MI key={t.type} g={t.glyph} label={t.label} onClick={()=>{const k=addProp(t.type,P.after);close();setTimeout(()=>{const el=document.querySelector('[data-sdb-th="'+block.id+':'+k+'"]');if(el)openMenu(null,el,'prop',{key:k},260);},40);}}/>)}</>;
   case 'icon':return <><div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:2,padding:4}}>{EMOJIS.map(e=><button key={e} className="sdb-ib" style={{fontSize:18,height:30}} onClick={()=>{close();setRow(P.rowId,{icon:e});}}>{e}</button>)}</div>
    <div className="sdb-sep"/><MI g="×" label="Remover ícone" onClick={()=>{close();setRow(P.rowId,{icon:''});}}/></>;
   case 'filterAdd':return <><div className="sdb-cap">Filtrar por</div>{d.properties.map(p=><MI key={p.key} g={propGlyph(p.type)} label={p.label} onClick={()=>{close();addFilter(p.key);}}/>)}</>;
   case 'sortAdd':return <><div className="sdb-cap">Ordenar por</div>{d.properties.map(p=><MI key={p.key} g={propGlyph(p.type)} label={p.label} onClick={()=>{close();mutView(v=>{v.sorts=[...(v.sorts||[]).filter(s=>s.key!==p.key),{key:p.key,dir:'asc'}];v.sort_by='';});}}/>)}</>;
   case 'filter':{const f=(view.filters||[]).find(x=>x.key===P.key),p=d.properties.find(x=>x.key===P.key);if(!f||!p)return null;
    const set=(patch:any)=>mutView(v=>{const g=(v.filters||[]).find(x=>x.key===P.key);if(g)Object.assign(g,patch);});
    const ops=isChoice(p.type)?[['is','é'],['empty','está vazio'],['not_empty','não está vazio']]:p.type==='checkbox'?[['is','é']]:p.type==='date'||p.type==='created'?[['future','de hoje em diante'],['past','antes de hoje'],['is','no dia'],['empty','está vazio']]:[['contains','contém'],['empty','está vazio'],['not_empty','não está vazio']];
    return <><div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 6px 6px'}}><span style={{color:'var(--m)',fontSize:12.5}}>{p.label}</span>
     <select className="sdb-inp" style={{width:'auto',padding:'3px 6px'}} value={f.op} onChange={e=>set({op:e.target.value})}>{ops.map(([o,l])=><option key={o} value={o}>{l}</option>)}</select>
     <button className="sdb-ib" style={{marginLeft:'auto'}} aria-label="Excluir filtro" onClick={()=>{close();mutView(v=>{v.filters=(v.filters||[]).filter(x=>x.key!==P.key);});}}>🗑</button></div>
     {f.op==='empty'||f.op==='not_empty'||f.op==='future'||f.op==='past'?null:
      isChoice(p.type)?(p.options||[]).map(o=>{const on=(Array.isArray(f.value)?f.value:[]).includes(o);return <button key={o} className="sdb-mi" onClick={()=>set({value:on?(f.value||[]).filter((x:string)=>x!==o):[...(Array.isArray(f.value)?f.value:[]),o]})}><span className={'sdb-cbx'+(on?' on':'')}>{on?'✓':''}</span><Tag value={o} color={p.option_colors?.[o]||'gray'}/></button>;}):
      p.type==='checkbox'?[[true,'Marcada'],[false,'Desmarcada']].map(([val,l])=><MI key={String(val)} label={String(l)} k={!!f.value===val?'✓':undefined} onClick={()=>set({value:val})}/>):
      p.type==='date'||p.type==='created'?<div style={{padding:6}}><input className="sdb-inp" type="date" value={String(f.value||'')} onChange={e=>set({value:e.target.value})}/></div>:
      <div style={{padding:6}}><input className="sdb-inp" autoFocus placeholder="Digite um valor…" value={String(f.value??'')} onChange={e=>set({value:e.target.value})}/></div>}</>;}
   case 'sort':{const s=(view.sorts||[]).find(x=>x.key===P.key),p=d.properties.find(x=>x.key===P.key);if(!s||!p)return null;return <>
    <MI g="↑" label="Crescente" k={s.dir==='asc'?'✓':undefined} onClick={()=>{close();mutView(v=>{const t=(v.sorts||[]).find(x=>x.key===P.key);if(t)t.dir='asc';});}}/>
    <MI g="↓" label="Decrescente" k={s.dir==='desc'?'✓':undefined} onClick={()=>{close();mutView(v=>{const t=(v.sorts||[]).find(x=>x.key===P.key);if(t)t.dir='desc';});}}/>
    <div className="sdb-sep"/><MI g="🗑" label="Tirar ordenação" danger onClick={()=>{close();mutView(v=>{v.sorts=(v.sorts||[]).filter(x=>x.key!==P.key);});}}/></>;}
   case 'newview':return <><div className="sdb-cap">Nova visualização</div>{VIEW_TYPES.map(t=><MI key={t.type} g={t.glyph} label={t.label} onClick={()=>{close();const id=makeId();mutate(x=>{const gp=x.properties.find(p=>isChoice(p.type));
    x.views.push({id,label:uniqueLabel(t.label,x.views.map(v=>v.label)),type:t.type,group_by:t.type==='board'?(gp?.key||''):'',filters:[],sorts:[],hidden:[],color_columns:true,show_count:true});x.active_view=id;});}}/>)}</>;
   case 'view':{const v=d.views.find(x=>x.id===P.id);if(!v)return null;return <>
    <div style={{padding:'4px 5px 6px'}}><input className="sdb-inp" autoFocus defaultValue={v.label} aria-label="Nome da visualização" onKeyDown={e=>{if(e.key==='Enter'){(e.target as HTMLInputElement).blur();close();}}}
     onBlur={e=>{const t=e.target.value.trim();if(t&&t!==v.label)mutate(x=>{x.views.find(y=>y.id===v.id)!.label=t;});}}/></div>
    <MI g="⧉" label="Duplicar visualização" onClick={()=>{close();const id=makeId();mutate(x=>{const src=x.views.find(y=>y.id===v.id)!;x.views.splice(x.views.indexOf(src)+1,0,{...clone(src),id,label:uniqueLabel(src.label,x.views.map(y=>y.label))});x.active_view=id;});}}/>
    {d.views.length>1?<MI g="🗑" label="Excluir visualização" danger onClick={()=>{close();const before=latest.current;mutate(x=>{x.views=x.views.filter(y=>y.id!==v.id);if(x.active_view===v.id)x.active_view=x.views[0].id;});say('Visualização excluída',()=>commit(clone(before)));}}/>:null}</>;}
   case 'group':{const p=groupProp(d,view);if(!p)return null;const g=String(P.value);return <>
    {g?optionMenu(p,g):null}
    <MI g="◌" label="Ocultar grupo" onClick={()=>{close();mutView(v=>{v.hidden_groups=[...(v.hidden_groups||[]),g];});}}/></>;}
   case 'new':return <>
    <MI g="📄" label="Nova página" onClick={()=>{close();addRow(seedForView(),'side');}}/>
    <MI g="▤" label="Formulário" onClick={()=>{close();addRow(seedForView(),'center');}}/>
    <div className="sdb-sep"/>
    <MI g="＋" label="Nova propriedade" sub onClick={e=>openMenu(null,e.currentTarget,'newprop',{},230)}/></>;
   case 'settings':return settingsBody();
   case 'nodate':{const dp=dateKeyProp(d,view);const list=rows.filter(r=>dp&&!(dp.type==='created'?createdOf(r,dp):r.values[dp.key]));return <><div className="sdb-cap">Sem data</div>
    {list.length?list.map(r=><MI key={r.id} g={r.icon||'📄'} label={String(r.values[nameKey]||'Sem título')} onClick={()=>{close();setPeek({id:r.id,mode:'side'});}}/>):<div className="sdb-cap">Nenhum item sem data.</div>}</>;}
   case 'block':return <>{onDelete?<MI g="🗑" label="Excluir base de dados" danger onClick={()=>{close();onDelete();}}/>:null}</>;
  }
  return null;
 };
 const seedForView=():Record<string,any>=>{const seed:Record<string,any>={};for(const f of view.filters||[]){const p=d.properties.find(x=>x.key===f.key);if(!p)continue;
  if(isChoice(p.type)&&f.op==='is'&&Array.isArray(f.value)&&f.value[0])seed[p.key]=p.type==='multi_select'?[f.value[0]]:f.value[0];if(p.type==='checkbox'&&f.op==='is')seed[p.key]=!!f.value;}return seed;};

 const settingsBody=()=>{const gp=groupProp(d,view),dp=dateKeyProp(d,view);return <>
  <div style={{padding:'4px 5px 6px'}}><input className="sdb-inp" defaultValue={view.label} aria-label="Nome da visualização" onBlur={e=>{const t=e.target.value.trim();if(t&&t!==view.label)mutView(v=>{v.label=t;});}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/></div>
  <div className="sdb-cap">Layout</div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,padding:'2px 6px 6px'}}>{VIEW_TYPES.map(t=><button key={t.type} onClick={()=>mutView(v=>{v.type=t.type;if(t.type==='board'&&!v.group_by)v.group_by=d.properties.find(p=>isChoice(p.type))?.key||'';})}
   style={{display:'grid',justifyItems:'center',gap:3,padding:'8px 2px',borderRadius:8,border:'1px solid '+(view.type===t.type?'var(--a)':'var(--l)'),fontSize:11.5,color:view.type===t.type?'var(--t)':'var(--m)'}}><span style={{fontSize:16}}>{t.glyph}</span>{t.label}</button>)}</div>
  {view.type==='board'?<>
   <div className="sdb-cap">Agrupar por</div>
   <div style={{padding:'0 6px 6px'}}><select className="sdb-inp" value={gp?.key||''} onChange={e=>mutView(v=>{v.group_by=e.target.value;v.hidden_groups=[];})}>{d.properties.filter(p=>isChoice(p.type)).map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
   <MI g={view.color_columns!==false?'●':'○'} label="Colorir colunas" onClick={()=>mutView(v=>{v.color_columns=v.color_columns===false;})}/>
   <MI g={view.show_count!==false?'●':'○'} label="Mostrar contagem" onClick={()=>mutView(v=>{v.show_count=v.show_count===false;})}/>
   {(view.hidden_groups||[]).length?<MI g="◉" label={'Mostrar grupos ocultos ('+(view.hidden_groups||[]).length+')'} onClick={()=>mutView(v=>{v.hidden_groups=[];})}/>:null}
  </>:null}
  {view.type==='calendar'?<><div className="sdb-cap">Mostrar no calendário por</div><div style={{padding:'0 6px 6px'}}><select className="sdb-inp" value={dp?.key||''} onChange={e=>mutView(v=>{v.date_key=e.target.value;})}>{d.properties.filter(p=>p.type==='date'||p.type==='created').map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></div></>:null}
  <div className="sdb-sep"/>
  <div className="sdb-cap">Propriedades visíveis</div>
  {d.properties.map(p=>{const hid=(view.hidden||[]).includes(p.key);return <div key={p.key} style={{display:'flex',alignItems:'center'}}>
   <button className="sdb-mi" style={{flex:1,color:hid?'var(--m)':undefined}} onClick={e=>openMenu(null,e.currentTarget,'prop',{key:p.key},260)}><span className="g">{propGlyph(p.type)}</span>{p.label}</button>
   {p.key!==nameKey?<button className="sdb-ib" aria-label={(hid?'Mostrar ':'Ocultar ')+p.label} onClick={()=>mutView(v=>{v.hidden=hid?(v.hidden||[]).filter(k=>k!==p.key):[...(v.hidden||[]),p.key];})}>{hid?'◌':'👁'}</button>:null}</div>;})}
  <MI g="＋" label="Nova propriedade" sub onClick={e=>openMenu(null,e.currentTarget,'newprop',{},230)}/>
  <div className="sdb-sep"/>
  {onDelete?<MI g="🗑" label="Excluir base de dados" danger onClick={()=>{close();onDelete();}}/>:null}
 </>;};

 // ---------- arrastar (por ponteiro, como o Kanban da Sofia: mede o alvo de verdade embaixo do mouse) ----------
 type Over={group?:string;before?:string|null;row?:string|null;day?:string;col?:string|null};
 const rootRef=useRef<HTMLDivElement|null>(null),boardRef=useRef<HTMLDivElement|null>(null);
 const dragRef=useRef<{kind:string;id:string;from?:string;x0:number;y0:number;started:boolean;ghost?:HTMLElement;src:HTMLElement;dx:number;dy:number}|null>(null);
 const overRef=useRef<Over|null>(null),justDragged=useRef(false);
 const [dragId,setDragId]=useState<string|null>(null),[over,setOverState]=useState<Over|null>(null);
 const setOver=(o:Over|null)=>{if(JSON.stringify(o)!==JSON.stringify(overRef.current)){overRef.current=o;setOverState(o);}};
 const beginDrag=(e:React.PointerEvent,kind:string,id:string,from?:string)=>{
  if(e.button!==0)return;const t=e.target as HTMLElement;if(t.closest('input,textarea,select,a,button:not([data-drag])'))return;
  const src=e.currentTarget as HTMLElement,b=src.getBoundingClientRect();
  dragRef.current={kind,id,from,x0:e.clientX,y0:e.clientY,started:false,src,dx:e.clientX-b.left,dy:e.clientY-b.top};
  const move=(ev:PointerEvent)=>{const dr=dragRef.current;if(!dr)return;
   if(!dr.started){if(Math.hypot(ev.clientX-dr.x0,ev.clientY-dr.y0)<5)return;dr.started=true;onInteractionChange?.(true);setDragId(dr.id);
    const base=(kind==='row'?(dr.src.closest('tr') as HTMLElement):dr.src),sb=base.getBoundingClientRect(),g=base.cloneNode(true) as HTMLElement;
    if(kind==='row'){dr.dx=ev.clientX-sb.left;dr.dy=ev.clientY-sb.top;}
    const bg=getComputedStyle(base).backgroundColor;
    Object.assign(g.style,{position:'fixed',left:'0px',top:'0px',margin:'0',width:sb.width+'px',pointerEvents:'none',zIndex:'6000',opacity:'0.92',transform:'rotate(1.5deg)',boxShadow:'0 12px 28px rgba(0,0,0,.35)',background:bg==='rgba(0, 0, 0, 0)'?c.surface:bg,borderRadius:'10px',display:kind==='row'?'table':''});
    (document.querySelector('.sdb-portal')||document.body).appendChild(g);dr.ghost=g;document.body.style.cursor='grabbing';document.body.style.userSelect='none';}
   ev.preventDefault();
   if(dr.ghost)dr.ghost.style.translate=(ev.clientX-dr.dx)+'px '+(ev.clientY-dr.dy)+'px';
   const hit=document.elementFromPoint(ev.clientX,ev.clientY) as HTMLElement|null,inside=(el:HTMLElement|null)=>!!el&&!!rootRef.current?.contains(el);
   if(kind==='card'){const col=hit?.closest('[data-col]') as HTMLElement|null;
    if(!inside(col))setOver(null);else{const cards=([...col!.querySelectorAll('[data-card]')] as HTMLElement[]).filter(el=>el.dataset.card!==dr.id);
     const h=cards.find(el=>{const r=el.getBoundingClientRect();return ev.clientY<r.top+r.height/2;});setOver({group:col!.dataset.col||'',before:h?h.dataset.card||null:null});}
    const bd=boardRef.current;if(bd){const r=bd.getBoundingClientRect();if(ev.clientX>r.right-56)bd.scrollLeft+=14;else if(ev.clientX<r.left+56)bd.scrollLeft-=14;}}
   else if(kind==='row'){const tr=hit?.closest('[data-row]') as HTMLElement|null;setOver(inside(tr)?{row:tr!.dataset.row||null}:null);}
   else if(kind==='event'){const day=hit?.closest('[data-day]') as HTMLElement|null;setOver(inside(day)?{day:day!.dataset.day}:null);}
   else if(kind==='col'){const th=hit?.closest('[data-key]') as HTMLElement|null;setOver(inside(th)?{col:th!.dataset.key||null}:null);}
  };
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);
   const dr=dragRef.current,o=overRef.current;dragRef.current=null;if(!dr||!dr.started)return;
   dr.ghost?.remove();document.body.style.cursor='';document.body.style.userSelect='';justDragged.current=true;setTimeout(()=>{justDragged.current=false;},0);
   onInteractionChange?.(false);setDragId(null);setOver(null);if(!o)return;
   if(dr.kind==='card'&&o.group!==undefined){const gp=groupProp(latest.current,view);if(gp)commit(moveToGroup(latest.current,dr.id,gp,dr.from||'',o.group,o.before||''),'kanban-move:'+dr.id+':'+Date.now());}
   else if(dr.kind==='row'&&o.row&&o.row!==dr.id)commit(moveRowBefore(latest.current,dr.id,o.row));
   else if(dr.kind==='event'&&o.day){const dp=dateKeyProp(latest.current,view);if(dp&&dp.type!=='created')setValue(dr.id,dp.key,o.day);}
   else if(dr.kind==='col'&&o.col&&o.col!==dr.id)mutate(x=>{const a=x.properties,i=a.findIndex(y=>y.key===dr.id),src=a.splice(i,1)[0];a.splice(a.findIndex(y=>y.key===o.col),0,src);});
  };
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
 };

 // ---------- quadro ----------
 const drag={current:dragId?{rowId:dragId}:null};
 const dropAt=over&&over.group!==undefined?{group:over.group,before:over.before??null}:null;
 const cardBody=(r:DbRow,gp?:DbProp)=>{const props=visibleProps.filter(p=>p.key!==nameKey&&p.key!==gp?.key&&!(isChoice(p.type)?!choiceValues(r,p).length:p.type==='checkbox'?!r.values[p.key]:p.type==='created'?false:r.values[p.key]===''||r.values[p.key]==null));
  return <>
   <div style={{display:'flex',gap:6,alignItems:'flex-start',fontSize:15,fontWeight:500,lineHeight:'21px',paddingRight:20,wordBreak:'break-word'}}>{r.icon?<span>{r.icon}</span>:null}<span>{String(r.values[nameKey]||'')||<span style={{color:'var(--m)'}}>Sem título</span>}</span></div>
   {props.map(p=><div key={p.key} style={{marginTop:6,fontSize:12.5,display:'flex',alignItems:'center',minWidth:0,color:p.type==='date'||p.type==='created'?'var(--m)':undefined}}>
    {p.type==='checkbox'?<span style={{display:'inline-flex',gap:6,alignItems:'center'}}>{valueView(r,p)}{p.label}</span>:valueView(r,p)}</div>)}
  </>;};
 const board=()=>{
  const gp=groupProp(d,view);
  if(!gp)return <div style={{color:'var(--m)',padding:'14px 4px'}}>O quadro precisa de uma propriedade de Status ou Seleção. <button className="sdb-ib" style={{color:'var(--a)'}} onClick={()=>{const k=addProp('status');mutView(v=>{v.group_by=k;});}}>Criar Status</button></div>;
  const groups=boardGroups(d,view,rows);
  return <div className="sdb-board" ref={boardRef}>
   {groups.map(g=>{const list=rowsInGroup(rows,gp,g.value),hex=colorHex(g.color),colored=view.color_columns!==false;
    return <div key={g.value||'__none'} className="sdb-col" style={{background:colored?hexA(hex,g.color==='none'?0.05:0.07):'transparent'}}
     data-col={g.value}>
     <div className="sdb-colh">
      <span className="sdb-tag" style={{background:hexA(hex,g.color==='none'?0.18:0.38),fontWeight:500}}>{g.label}</span>
      {view.show_count!==false?<span style={{color:'var(--m)',fontSize:12.5}}>{list.length}</span>:null}
      <span className="tools"><button className="sdb-ib" aria-label="Mais opções do grupo" onClick={e=>openMenu(null,e.currentTarget,'group',{value:g.value},230)}>⋯</button>
       <button className="sdb-ib" aria-label="Nova página neste grupo" onClick={()=>addRow({[gp.key]:gp.type==='multi_select'?(g.value?[g.value]:[]):g.value},'side',0)}>＋</button></span>
     </div>
     {list.map(r=><React.Fragment key={r.id}>
      {dropAt&&dropAt.group===g.value&&dropAt.before===r.id?<div className="sdb-drop"/>:null}
      <div data-card={r.id} className={'sdb-card'+(drag.current?.rowId===r.id?' drag':'')+(peek?.id===r.id?' open':'')} onPointerDown={e=>beginDrag(e,'card',r.id,g.value)}
       style={{background:colored&&g.color!=='none'?`linear-gradient(${hexA(hex,0.10)},${hexA(hex,0.10)}),var(--e)`:'var(--e)',border:'1px solid '+(colored?hexA(hex,0.22):'var(--l)')}}
       onClick={()=>{if(!justDragged.current)setPeek({id:r.id,mode:'side'});}} onContextMenu={e=>{e.preventDefault();openMenu(e,null,'row',{rowId:r.id},250);}}>
       {cardBody(r,gp)}
       <button className="more" aria-label="Opções do cartão" onClick={e=>{e.stopPropagation();openMenu(null,e.currentTarget,'row',{rowId:r.id},250);}}>⋯</button>
      </div></React.Fragment>)}
     {dropAt&&dropAt.group===g.value&&dropAt.before===null&&drag.current?<div className="sdb-drop"/>:null}
     <button className="sdb-add" onClick={()=>addRow({[gp.key]:gp.type==='multi_select'?(g.value?[g.value]:[]):g.value},'side')}>＋ Nova página</button>
    </div>;})}
   <div style={{flex:'0 0 220px',paddingTop:6}}><input className="sdb-inp" placeholder="＋ Novo grupo" aria-label="Novo grupo" style={{background:'transparent',borderColor:'transparent'}}
    onKeyDown={e=>{if(e.key!=='Enter')return;const t=(e.target as HTMLInputElement).value.trim();if(!t)return;(e.target as HTMLInputElement).value='';mutate(x=>{const q=x.properties.find(y=>y.key===gp.key)!;const name=uniqueLabel(t,q.options||[]);q.options=[...(q.options||[]),name];q.option_colors={...(q.option_colors||{}),[name]:STATUS_COLORS[(q.options.length)%STATUS_COLORS.length].id};});}}/></div>
  </div>;
 };

 // ---------- tabela ----------
 const [widths,setWidths]=useState<Record<string,number>>({});
 const colW=(p:DbProp)=>widths[p.key]??view.widths?.[p.key]??(p.key===nameKey?260:p.type==='checkbox'?110:p.type==='number'?130:180);
 const dropRow=over?.row??null,dropCol=over?.col??null;
 const startResize=(e:React.MouseEvent,p:DbProp)=>{e.preventDefault();e.stopPropagation();const x0=e.clientX,w0=colW(p);let w=w0;
  const mv=(ev:MouseEvent)=>{w=Math.max(70,Math.min(700,w0+ev.clientX-x0));setWidths(s=>({...s,[p.key]:w}));};
  const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up);document.body.style.cursor='';mutView(v=>{v.widths={...(v.widths||{}),[p.key]:Math.round(w)};});setWidths(s=>{const n={...s};delete n[p.key];return n;});};
  document.body.style.cursor='col-resize';window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up);};
 const table=()=>{
  const cols=visibleProps,manual=!(view.sorts||[]).length;
  const nums=cols.filter(p=>p.type==='number');
  return <div style={{overflowX:'auto',paddingBottom:6}}>
   <table className="sdb-tbl" style={{width:44+cols.reduce((s,p)=>s+colW(p),0)+40}}>
    <colgroup><col style={{width:44}}/>{cols.map(p=><col key={p.key} style={{width:colW(p)}}/>)}<col style={{width:40}}/></colgroup>
    <thead><tr><th style={{border:0,cursor:'default',background:'transparent'}}/>
     {cols.map(p=><th key={p.key} data-sdb-th={block.id+':'+p.key} data-key={p.key} className={dropCol===p.key&&dragId!==p.key?'dropl':''}
      onClick={e=>{if(!justDragged.current)openMenu(null,e.currentTarget,'prop',{key:p.key},260);}} onPointerDown={e=>{if(!(e.target as HTMLElement).closest('.sdb-rz'))beginDrag(e,'col',p.key);}}>
      <span style={{marginRight:6,opacity:.8}}>{propGlyph(p.type)}</span>{p.label}<span className="sdb-rz" onMouseDown={e=>startResize(e,p)} onClick={e=>e.stopPropagation()}/></th>)}
     <th style={{textAlign:'center'}} aria-label="Nova propriedade" onClick={e=>openMenu(null,e.currentTarget,'newprop',{},230)}>＋</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.id} data-row={r.id} className={'r'+(dropRow===r.id&&dragId!==r.id?' dropt':'')}
     onContextMenu={e=>{e.preventDefault();openMenu(e,null,'row',{rowId:r.id},250);}}>
     <td style={{border:0}}><div className="sdb-gutter"><span title={manual?'Arraste para mover':'Tire a ordenação para mover à mão'} style={{cursor:manual?'grab':'default',touchAction:'none'}} onPointerDown={e=>{if(manual)beginDrag(e,'row',r.id);}}>⋮⋮</span>
      <span title="Opções" onClick={e=>openMenu(null,e.currentTarget,'row',{rowId:r.id},250)}>⋯</span></div></td>
     {cols.map(p=><td key={p.key}>{p.key===nameKey?<div className="sdb-name">
      <button className="sdb-ib" style={{minWidth:24,height:24,fontSize:15,padding:0}} aria-label="Ícone" onClick={e=>openMenu(null,e.currentTarget,'icon',{rowId:r.id},252)}>{r.icon||<span style={{opacity:.55}}>📄</span>}</button>
      <input className="sdb-bare" style={{fontWeight:500}} value={String(r.values[nameKey]??'')} placeholder="Sem título" aria-label={nameProp.label} onChange={e=>setValue(r.id,nameKey,e.target.value,true)}/>
      <button className="open" onClick={()=>setPeek({id:r.id,mode:'side'})}>ABRIR</button></div>:cell(r,p)}</td>)}
     <td/></tr>)}</tbody>
    <tfoot><tr><td style={{border:0}}/><td colSpan={cols.length+1} style={{border:0}}><button className="sdb-add" style={{marginTop:0}} onClick={()=>addRow(seedForView(),null)}>＋ Nova página</button></td></tr>
     <tr><td style={{border:0}}/>{cols.map(p=><td key={p.key} style={{border:0,color:'var(--m)',fontSize:12,padding:'4px 8px',textAlign:p.type==='number'?'right':'left'}}>
      {p.key===nameKey?<span>Contagem <b style={{color:'var(--t)',fontWeight:500}}>{rows.length}</b></span>:nums.includes(p)?<span>Soma <b style={{color:'var(--t)',fontWeight:500}}>{sumOf(rows,p.key).toLocaleString('pt-BR')}</b></span>:null}</td>)}<td style={{border:0}}/></tr></tfoot>
   </table></div>;
 };

 // ---------- calendário ----------
 const [month,setMonth]=useState(()=>{const n=new Date();return {y:n.getFullYear(),m:n.getMonth()};});
 const dropDay=over?.day??null;
 const calendar=()=>{
  const dp=dateKeyProp(d,view);if(!dp)return <div style={{color:'var(--m)',padding:'14px 4px'}}>O calendário precisa de uma propriedade de Data. <button className="sdb-ib" style={{color:'var(--a)'}} onClick={()=>{const k=addProp('date');mutView(v=>{v.date_key=k;});}}>Criar Data</button></div>;
  const today=dayKey(new Date()),days=monthGrid(month.y,month.m);
  const dateOf=(r:DbRow)=>(dp.type==='created'?createdOf(r,dp):String(r.values[dp.key]||'')).slice(0,10);
  const byDay=new Map<string,DbRow[]>();let nodate=0;for(const r of rows){const k=dateOf(r);if(!k){nodate++;continue;}if(!byDay.has(k))byDay.set(k,[]);byDay.get(k)!.push(r);}
  return <div>
   <div style={{display:'flex',alignItems:'center',gap:6,margin:'2px 0 10px'}}>
    <span style={{fontSize:16,fontWeight:600}}>{MONTHS[month.m]} de {month.y}</span><span style={{flex:1}}/>
    {nodate?<button className="sdb-ib" onClick={e=>openMenu(null,e.currentTarget,'nodate',{},260)}>Sem data ({nodate})</button>:null}
    <button className="sdb-ib" aria-label="Mês anterior" onClick={()=>setMonth(s=>s.m?{y:s.y,m:s.m-1}:{y:s.y-1,m:11})}>‹</button>
    <button className="sdb-ib" onClick={()=>{const n=new Date();setMonth({y:n.getFullYear(),m:n.getMonth()});}}>Hoje</button>
    <button className="sdb-ib" aria-label="Próximo mês" onClick={()=>setMonth(s=>s.m===11?{y:s.y+1,m:0}:{y:s.y,m:s.m+1})}>›</button>
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',color:'var(--m)',fontSize:12,padding:'0 0 4px'}}>{['dom.','seg.','ter.','qua.','qui.','sex.','sáb.'].map(w=><div key={w} style={{paddingLeft:6}}>{w}</div>)}</div>
   <div className="sdb-cal">{days.map(day=>{const k=dayKey(day),list=byDay.get(k)||[],out=day.getMonth()!==month.m;
    return <div key={k} className={'sdb-day'+(dropDay===k?' drop':'')} style={{background:out&&dropDay!==k?hexA(c.text.length===7?c.text:'#888888',0.025):undefined}}
     data-day={k}>
     <div style={{textAlign:'right',fontSize:12.5,color:out?'var(--m)':'var(--t)'}}>{k===today?<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:22,height:22,borderRadius:11,background:'#e5484d',color:'#fff',fontWeight:600}}>{day.getDate()}</span>:day.getDate()===1?day.getDate()+' de '+MONTHS[day.getMonth()].slice(0,3)+'.':day.getDate()}</div>
     {dp.type!=='created'?<button className="plus" aria-label={'Nova página em '+longDate(k)} onClick={()=>addRow({[dp.key]:k,...seedForView()},'side')}>＋</button>:null}
     {list.map(r=><button key={r.id} className="sdb-ev" data-drag="1" onPointerDown={e=>beginDrag(e,'event',r.id)} style={{opacity:dragId===r.id?.4:1}}
      onClick={()=>{if(!justDragged.current)setPeek({id:r.id,mode:'side'});}} onContextMenu={e=>{e.preventDefault();openMenu(e,null,'row',{rowId:r.id},250);}}>{r.icon?r.icon+' ':''}{String(r.values[nameKey]||'Sem título')}</button>)}
    </div>;})}</div>
  </div>;
 };
 const list=()=><div>{rows.map(r=><div key={r.id} className="sdb-li" onClick={()=>setPeek({id:r.id,mode:'side'})} onContextMenu={e=>{e.preventDefault();openMenu(e,null,'row',{rowId:r.id},250);}}>
   <span>{r.icon||'📄'}</span><span style={{fontWeight:500,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{String(r.values[nameKey]||'Sem título')}</span>
   {visibleProps.filter(p=>p.key!==nameKey&&(isChoice(p.type)||p.type==='date')).slice(0,3).map(p=><span key={p.key} style={{fontSize:12.5,color:'var(--m)'}}>{valueView(r,p,true)}</span>)}
  </div>)}<button className="sdb-add" onClick={()=>addRow(seedForView(),'side')}>＋ Nova página</button></div>;

 // ---------- painel do item ----------
 const peekRow=peek?d.rows.find(r=>r.id===peek.id):null;
 useEffect(()=>{if(peek&&!peekRow)setPeek(null);},[peek,peekRow]);
 const [peekIn,setPeekIn]=useState(false);
 useLayoutEffect(()=>{if(!peek){setPeekIn(false);return;}setPeekIn(false);const t=requestAnimationFrame(()=>requestAnimationFrame(()=>setPeekIn(true)));return()=>cancelAnimationFrame(t);},[peek?.mode,!!peek]);
 const [peekW,setPeekW]=useState(()=>{try{return Number(localStorage.getItem('sofia.peekWidth'))||0;}catch{return 0;}});
 const titleRef=useRef<HTMLTextAreaElement|null>(null),notesRef=useRef<HTMLTextAreaElement|null>(null);
 const grow=(el:HTMLTextAreaElement|null)=>{if(el)fitTextarea(el);};
 useLayoutEffect(()=>{grow(titleRef.current);grow(notesRef.current);});
 const peekPanel=()=>{
  if(!peek||!peekRow)return null;const r=peekRow,idx=rows.findIndex(x=>x.id===r.id);
  const go=(n:number)=>{const t=rows[idx+n];if(t)setPeek({id:t.id,mode:peek.mode});};
  const w=peek.mode==='side'?Math.max(380,Math.min(window.innerWidth-120,peekW||Math.round(window.innerWidth/2))):peek.mode==='center'?Math.min(900,window.innerWidth-80):undefined;
  const resize=(e:React.MouseEvent)=>{e.preventDefault();const x0=e.clientX,w0=w||600;let nw=w0;const mv=(ev:MouseEvent)=>{nw=Math.max(380,Math.min(window.innerWidth-120,w0-(ev.clientX-x0)));setPeekW(nw);};
   const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up);document.body.style.cursor='';try{localStorage.setItem('sofia.peekWidth',String(Math.round(nw)));}catch{}};document.body.style.cursor='col-resize';window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up);};
  return <>
   {peek.mode==='center'?<div className="sdb-veil" onClick={()=>setPeek(null)}/>:null}
   <div className={'sdb-peek '+peek.mode+(peekIn?' in':'')} style={{width:w}} role="dialog" aria-label={String(r.values[nameKey]||'Item')} onKeyDown={e=>{if(e.key==='Escape'&&!menu){e.stopPropagation();e.preventDefault();setPeek(null);}}}>
    {peek.mode==='side'?<div className="sdb-rzl" onMouseDown={resize}/>:null}
    <div className="sdb-pbar">
     <button className="sdb-ib" title="Fechar (Esc)" aria-label="Fechar" onClick={()=>setPeek(null)}>»</button>
     <button className="sdb-ib" title={peek.mode==='full'?'Abrir ao lado':'Abrir em página inteira'} onClick={()=>setPeek({id:r.id,mode:peek.mode==='full'?'side':'full'})}>{peek.mode==='full'?'⇥':'⤢'}</button>
     <button className="sdb-ib" title="Página anterior" aria-label="Página anterior" disabled={idx<=0} style={{opacity:idx<=0?.35:1}} onClick={()=>go(-1)}>▲</button>
     <button className="sdb-ib" title="Próxima página" aria-label="Próxima página" disabled={idx<0||idx>=rows.length-1} style={{opacity:idx<0||idx>=rows.length-1?.35:1}} onClick={()=>go(1)}>▼</button>
     <span style={{flex:1}}/>
     {r.created_at?<span style={{color:'var(--m)',fontSize:12.5,marginRight:6}}>Criada em {longDate(r.created_at)}</span>:null}
     <button className="sdb-ib" aria-label="Ações" onClick={e=>openMenu(null,e.currentTarget,'row',{rowId:r.id},250)}>⋯</button>
    </div>
    <div className="sdb-pbody"><div className="sdb-pin">
     <button className="sdb-ib" style={{fontSize:r.icon?44:13,height:r.icon?60:26,padding:r.icon?0:'0 6px',marginLeft:-6,marginBottom:6}} onClick={e=>openMenu(null,e.currentTarget,'icon',{rowId:r.id},252)}>{r.icon||'☺ Adicionar ícone'}</button>
     <textarea ref={titleRef} className="sdb-ptitle" rows={1} placeholder="Sem título" value={String(r.values[nameKey]??'')} autoFocus={!r.values[nameKey]} aria-label="Título"
      onChange={e=>{grow(e.currentTarget);setValue(r.id,nameKey,e.target.value.replace(/\n/g,' '),true);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();notesRef.current?.focus();}}}/>
     <div style={{marginTop:18,display:'grid',gap:1}}>
      {d.properties.filter(p=>p.key!==nameKey).map(p=><div key={p.key} className="sdb-prow">
       <div className="lab" onClick={e=>openMenu(null,e.currentTarget,'prop',{key:p.key},260)}><span style={{width:16,textAlign:'center'}}>{propGlyph(p.type)}</span>{p.label}</div>
       <div className="val">{p.type==='text'||p.type==='person'||p.type==='number'?<div className="sdb-cell" style={{minHeight:34}}>{p.type==='person'&&r.values[p.key]?<Avatar name={String(r.values[p.key])}/>:null}
         <input className="bare" value={String(r.values[p.key]??'')} placeholder="Vazio" aria-label={p.label} inputMode={p.type==='number'?'decimal':undefined}
          onChange={e=>{const t=e.target.value;setValue(r.id,p.key,p.type==='number'?(t.trim()===''?'':(Number.isFinite(Number(t.replace(',','.')))?Number(t.replace(',','.')):t)):t,true);}}/></div>:
        <div className="sdb-cell" style={{minHeight:34,cursor:p.type==='created'?'default':'pointer',flexWrap:'wrap'}} onClick={e=>editValue(r,p,e.currentTarget)}>{valueView(r,p)||<span style={{color:'var(--m)'}}>Vazio</span>}</div>}</div>
      </div>)}
      <button className="sdb-add" style={{width:'auto'}} onClick={e=>openMenu(null,e.currentTarget,'newprop',{},230)}>＋ Adicionar uma propriedade</button>
     </div>
     <div style={{height:1,background:'var(--l)',margin:'18px 0 20px'}}/>
     <textarea ref={notesRef} className="sdb-notes" placeholder="Escreva aqui as anotações deste item…" value={r.page_content||''} aria-label="Anotações"
      onChange={e=>{grow(e.currentTarget);setRow(r.id,{page_content:e.target.value},'notes:'+r.id);}}/>
    </div></div>
   </div></>;
 };

 // tabelas antigas criadas pelo modelo "Formulário" passam a se chamar Tabela (o Formulário virou opção do Nova)
 const viewLabel=(v:DbView)=>v.type==='table'&&v.id==='links'&&(v.label==='Formulário'||v.label==='Coleção')?'Tabela':v.label;
 const filters=view.filters||[],sorts=(view.sorts||[]).filter(s=>d.properties.some(p=>p.key===s.key));
 const chipText=(f:any)=>{const p=d.properties.find(x=>x.key===f.key);if(!p)return f.key;const v=Array.isArray(f.value)?f.value.join(', '):f.value;
  const op={empty:'vazio',not_empty:'preenchido',future:'de hoje em diante',past:'antes de hoje'}[f.op as string];return p.label+': '+(op||(p.type==='checkbox'?(f.value?'marcada':'desmarcada'):v||'todos'));};
 return <div className="sdb" ref={rootRef} style={{margin:'8px 0 14px'}}>
  <style>{css}</style>
  {d.show_title?<input className="sdb-bare" style={{fontSize:20,fontWeight:700,margin:'2px 0 6px'}} defaultValue={d.title} placeholder="Base sem título" aria-label="Título da base"
   onBlur={e=>{const t=e.target.value;if(t!==d.title)mutate(x=>{x.title=t;});}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>:null}
  <div style={{display:'flex',alignItems:'center',gap:2,borderBottom:'1px solid var(--l)',paddingBottom:6}}>
   <div className="sdb-tabs" style={{display:'flex',alignItems:'center',gap:2,flex:1,minWidth:0,overflowX:'auto',scrollbarWidth:'none'}}>
   {d.views.map(v=><button key={v.id} className={'sdb-tab'+(v.id===view.id?' on':'')} onClick={()=>{if(v.id!==view.id)mutate(x=>{x.active_view=v.id;},'collection-view:'+block.id);}}
    onDoubleClick={e=>openMenu(null,e.currentTarget,'view',{id:v.id},240)} onContextMenu={e=>{e.preventDefault();openMenu(e,null,'view',{id:v.id},240);}}><span>{viewGlyph(v.type)}</span>{viewLabel(v)}</button>)}
   <button className="sdb-ib" aria-label="Nova visualização" title="Nova visualização" onClick={e=>openMenu(null,e.currentTarget,'newview',{},220)}>＋</button>
   </div>
   <span style={{display:'flex',alignItems:'center',gap:2,flex:'0 0 auto',marginLeft:8}}>
   <button className={'sdb-ib'+(filters.length?' on':'')} title="Filtrar" aria-label="Filtrar" onClick={e=>openMenu(null,e.currentTarget,'filterAdd',{},240)}>⏷</button>
   <button className={'sdb-ib'+(sorts.length?' on':'')} title="Ordenar" aria-label="Ordenar" onClick={e=>openMenu(null,e.currentTarget,'sortAdd',{},240)}>⇅</button>
   {search===null?<button className="sdb-ib" title="Buscar" aria-label="Buscar" onClick={()=>setSearch('')}>⌕</button>:
    <input className="sdb-inp" autoFocus placeholder="Buscar nesta base…" value={search} style={{width:190,padding:'4px 8px'}} onChange={e=>setSearch(e.target.value)} onBlur={()=>{if(!search)setSearch(null);}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setSearch(null);}}}/>}
   <button className="sdb-ib" title="Configurações da visualização" aria-label="Configurações da visualização" onClick={e=>openMenu(null,e.currentTarget,'settings',{},290)}>⚙</button>
   <span className="sdb-new"><button onClick={()=>addRow(seedForView(),'side')}>Nova</button><button className="arr" aria-label="Mais opções de Nova" onClick={e=>openMenu(null,e.currentTarget.parentElement,'new',{},230)}>▾</button></span>
   </span>
  </div>
  {filters.length||sorts.length?<div style={{display:'flex',gap:6,flexWrap:'wrap',padding:'8px 0 2px'}}>
   {sorts.map(s=><button key={'s'+s.key} className="sdb-chip" onClick={e=>openMenu(null,e.currentTarget,'sort',{key:s.key},220)}>{s.dir==='asc'?'↑':'↓'} {d.properties.find(p=>p.key===s.key)?.label} ▾</button>)}
   {filters.map(f=><button key={'f'+f.key} data-sdb-filter={block.id+':'+f.key} className="sdb-chip" onClick={e=>openMenu(null,e.currentTarget,'filter',{key:f.key},280)}>{chipText(f)} ▾</button>)}
   <button className="sdb-ib" onClick={e=>openMenu(null,e.currentTarget,'filterAdd',{},240)}>＋ Filtro</button>
  </div>:null}
  <div style={{marginTop:10}}>{view.type==='board'?board():view.type==='calendar'?calendar():view.type==='list'?list():table()}</div>
  {!rows.length&&(search||filters.length)?<div style={{color:'var(--m)',fontSize:13,padding:'6px 4px'}}>Nenhum item com {search?'essa busca':'esses filtros'}.</div>:null}
  {typeof document!=='undefined'?createPortal(<div className="sdb sdb-portal">
   {menu?<><div style={{position:'fixed',inset:0,zIndex:3999}} onMouseDown={()=>setMenu(null)} onContextMenu={e=>{e.preventDefault();setMenu(null);}}/>
    <div className="sdb-menu" style={{left:menu.x,top:menu.y,width:menu.w}} onMouseDown={e=>e.stopPropagation()} role="menu" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();setMenu(null);}}}>{menuBody()}</div></>:null}
   {peekPanel()}
   {toast?<div className="sdb-toast" role="status">{toast.text}{toast.undo?<button onClick={()=>{toast.undo?.();setToast(null);}}>Desfazer</button>:null}<button aria-label="Fechar aviso" onClick={()=>setToast(null)}>×</button></div>:null}
  </div>,document.body):null}
 </div>;
}
