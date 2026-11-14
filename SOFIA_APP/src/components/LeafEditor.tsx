import {DateTimeField} from './DateTimeField';
import {PALETTE} from '../lib/palette';
import {KeyboardToolbar} from './KeyboardToolbar';
import {useKeyboardVisible} from '../lib/motion';
import React,{useLayoutEffect,useRef,useState} from 'react';
import {Keyboard,Platform,Pressable,Text,TextInput,View} from 'react-native';
import {useDesktop} from '../lib/desktop';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from './RevealScroll';
import {useTheme} from '../lib/theme';
import {editBlockText,formatRange,leafBlocks,leafId,linkRanges,textRuns,unlinkRange} from '../lib/leaf-document';
import {LinkHoverCard,openUrl} from './LinkHover';
import type {LinkPop} from './LinkHover';
import type {Leaf,LeafBlock,Mark} from '../lib/leaf-document';
import {Sheet} from './Sheet';
import {Button,IconButton} from './UI';
import {PageFileBlock,uploadPageFile} from './PageFiles';
import {currentApi} from '../lib/api';
import {appAlert} from '../lib/app-alert';
import {PageRichInput} from './PageRichInput';
import {htmlToLeaf,leafToHtml} from '../lib/leaf-rich';
import {NoteFormatBar} from './NoteFormatBar';
import {fitTextarea} from '../lib/fit-textarea';
import {diaryDays,diaryHidden,isDiaryEntry} from '../lib/page-templates';
import {leafDiaryEnter,leafToDiary,lineTimesFromVersions} from '../lib/leaf-diary';
const RICH_WEB=Platform.OS==='web';
export function LeafEditor({leaf,onChange,titleRef,pageId}:{leaf:Leaf;onChange:(patch:Partial<Leaf>)=>void;titleRef:React.RefObject<TextInput|null>;pageId?:string}){
 const keyboard=useKeyboardVisible();
 const c=useTheme(),blocks=leafBlocks(leaf),[active,setActive]=useState(blocks[0].id),[selection,setSelection]=useState({start:0,end:0}),[typing,setTyping]=useState<Partial<Mark>>({}),[format,setFormat]=useState(false),[property,setProperty]=useState(false),[propName,setPropName]=useState(''),[propValue,setPropValue]=useState('');
 const desktop=useDesktop(),titleNode=useRef<any>(null);
 const inputs=useRef(new Map<string,TextInput>()),past=useRef<LeafBlock[][]>([]),future=useRef<LeafBlock[][]>([]),latest=useRef(blocks);latest.current=blocks;
 function save(next:LeafBlock[],history=true){if(history){past.current.push(JSON.parse(JSON.stringify(latest.current)));past.current=past.current.slice(-100);future.current=[];}latest.current=next;onChange({blocks:next,content:next.map(b=>b.text).join('\n\n')});}
 function patch(change:Partial<LeafBlock>){save(blocks.map(b=>b.id===active?{...b,...change}:b));}
 function mark(style:Partial<Mark>){if(selection.end>selection.start)save(blocks.map(b=>b.id===active?formatRange(b,selection.start,selection.end,style):b));else setTyping(old=>({...old,...style}));inputs.current.get(active)?.focus();}
 function toggleStyle(key:'bold'|'italic'|'underline'|'strike'|'code'){const block=blocks.find(b=>b.id===active);const selected=block?textRuns(block).filter(r=>r.end>selection.start&&r.start<selection.end):[];const enabled=selection.end>selection.start?selected.length>0&&selected.every(r=>r.style[key]):!!typing[key];mark({[key]:!enabled});}
 function undo(redo=false){const from=redo?future.current:past.current,to=redo?past.current:future.current;const value=from.pop();if(value){to.push(JSON.parse(JSON.stringify(blocks)));save(value,false);}}
 function add(type='text'){const next={id:leafId(),text:'',type,marks:[]};const at=blocks.findIndex(b=>b.id===active);save([...blocks.slice(0,at+1),next,...blocks.slice(at+1)]);setActive(next.id);setSelection({start:0,end:0});setTyping({});setFormat(false);setTimeout(()=>inputs.current.get(next.id)?.focus(),100);}
 // 05/11/2026 (Pedro: "um puta espaco entre titulo e o que vem depois"): no site cada campo (titulo e linhas) nascia com
 // 2 linhas de altura; agora tem a altura do proprio texto, sem rolagem propria.
 // 13/11/2026 (Pedro: "a pagina da nota buga quando o texto passa do tamanho da pagina e fica bugando o scroll"): medir o campo
 // encolhia ele a 0 por um instante e o navegador puxava a rolagem para cima a cada tecla. Agora guarda e devolve a rolagem
 // de quem rola, e so mexe na altura quando ela muda de fato.
 const scrollerOf=(n:any)=>{let p=n?.parentElement;while(p&&p!==document.body){const o=getComputedStyle(p).overflowY;if((o==='auto'||o==='scroll')&&p.scrollHeight>p.clientHeight)return p;p=p.parentElement;}return null;};
 const sizeField=(n:any)=>fitTextarea(n);
 useLayoutEffect(()=>{if(Platform.OS!=='web')return;sizeField(titleNode.current);for(const n of inputs.current.values())sizeField(n);});
 // 06/11/2026 (Pedro: "erro novamente e nao consigo descer"): a janela da nota entra deslizando e muda de largura depois do
 // primeiro desenho; a linha que passa a quebrar em duas ficava com altura de uma (cortada, sem rolagem). Mede de novo
 // sempre que a largura de um campo muda e quando as letras do site terminam de carregar.
 React.useEffect(()=>{if(Platform.OS!=='web'||typeof (globalThis as any).ResizeObserver==='undefined')return;const widths=new WeakMap<any,number>();
  const ro=new (globalThis as any).ResizeObserver((entries:any[])=>{for(const e of entries){const w=Math.round(e.contentRect.width);if(widths.get(e.target)!==w){widths.set(e.target,w);sizeField(e.target);}}});
  const watch=()=>{ro.disconnect();if(titleNode.current?.tagName==='TEXTAREA')ro.observe(titleNode.current);for(const n of inputs.current.values())if((n as any)?.tagName==='TEXTAREA')ro.observe(n as any);};
  watch();const t=setInterval(watch,1500);try{(globalThis as any).document?.fonts?.ready?.then(()=>{sizeField(titleNode.current);for(const n of inputs.current.values())sizeField(n);});}catch{}
  return()=>{clearInterval(t);ro.disconnect();};},[]);
 // 13/11/2026 (Pedro: "em notas poder colar imagem, escolher se aparece como anexo ou print mostrando"): a imagem vira
 // anexo da pagina (o mesmo das Paginas) e um bloco 'file' da nota; Anexo = so o nome.jpeg, Visualizacao = o print.
 const rootRef=useRef<any>(null),activeRef=useRef(active);activeRef.current=active;
 const isTextBlock=(b:LeafBlock)=>b.type!=='file'&&b.type!=='divider';
 // poe o cursor no FIM da linha (no site o campo rico e um contenteditable)
 const focusEnd=(id:string,tries=8)=>{const n:any=inputs.current.get(id);if(!n){if(tries>0)setTimeout(()=>focusEnd(id,tries-1),60);return;}if(Platform.OS!=='web'){n.focus?.();return;}try{n.focus?.({preventScroll:true});const el:any=(globalThis as any).document?.activeElement;el?.scrollIntoView?.({block:'nearest'});if(el&&typeof el.value==='string'&&el.setSelectionRange){const k=el.value.length;el.setSelectionRange(k,k);}if(el?.isContentEditable){const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const sel=getSelection();sel?.removeAllRanges();sel?.addRange(r);}}catch{/* sem cursor */}};
 // 14/11/2026: clicar no espaco embaixo da nota abre uma linha nova no fim (ou usa a ultima, se estiver vazia), como no Notion
 const writeBelow=()=>{const cur=latest.current,last=cur[cur.length-1];if(last&&isTextBlock(last)&&!last.text){setActive(last.id);focusEnd(last.id);return;}
  const nb:LeafBlock={id:leafId(),text:'',type:'text',marks:[]};save([...cur,nb]);setActive(nb.id);setTimeout(()=>focusEnd(nb.id),60);};
 // 14/11/2026 (Pedro: "nao to conseguindo mover a foto nas notas"): no computador cada linha (foto, texto, divisoria) tem a alca
 // ⋮⋮ na esquerda, como nas Paginas: arrastar muda a ordem, com a linha azul mostrando onde vai cair.
 React.useEffect(()=>{if(Platform.OS!=='web'||typeof document==='undefined'||document.getElementById('leaf-grip-css'))return;const st=document.createElement('style');st.id='leaf-grip-css';
  st.textContent='.leaf-grip{opacity:0;transition:opacity .12s,background .12s}.leaf-row:hover>.leaf-grip{opacity:.7}.leaf-grip:hover{opacity:1!important;background:rgba(127,127,127,.18)}[data-leaf-moving] .leaf-grip{opacity:0!important}';document.head.appendChild(st);},[]);
 const startMove=(id:string)=>(e:any)=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const root:any=rootRef.current;if(!root?.querySelectorAll)return;
  const rows=()=>[...root.querySelectorAll('[data-leaf-block]')] as HTMLElement[];const me=rows().find(r=>r.getAttribute('data-leaf-block')===id);if(!me)return;
  const sy=e.clientY,line=document.createElement('div');let target=-1,moved=false;
  Object.assign(line.style,{position:'fixed',height:'3px',borderRadius:'2px',background:c.accent,pointerEvents:'none',zIndex:'2147483000',display:'none'});document.body.appendChild(line);
  const sc=scrollerOf(me);
  const mv=(ev:PointerEvent)=>{if(!moved&&Math.abs(ev.clientY-sy)<4)return;if(!moved){moved=true;me.style.opacity='0.4';root.setAttribute('data-leaf-moving','1');document.body.style.cursor='grabbing';}
   if(sc){const r=sc.getBoundingClientRect();if(ev.clientY<r.top+40)sc.scrollTop-=14;else if(ev.clientY>r.bottom-40)sc.scrollTop+=14;}
   const list=rows();let t=list.length;for(let k=0;k<list.length;k++){const r=list[k].getBoundingClientRect();if(ev.clientY<r.top+r.height/2){t=k;break;}}target=t;
   const ref=list[Math.min(t,list.length-1)].getBoundingClientRect(),y=t<list.length?ref.top-2:ref.bottom+1;Object.assign(line.style,{display:'block',top:y+'px',left:ref.left+'px',width:ref.width+'px'});};
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);line.remove();me.style.opacity='';root.removeAttribute('data-leaf-moving');document.body.style.cursor='';
   if(!moved||target<0)return;const cur=latest.current,from=cur.findIndex(x=>x.id===id);if(from<0||target===from||target===from+1)return;
   const arr=cur.filter(x=>x.id!==id);arr.splice(target>from?target-1:target,0,cur[from]);save(arr);};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);};
 const shell=(b:LeafBlock,node:React.ReactNode)=>!RICH_WEB||!desktop?node:React.createElement('div',{key:b.id,'data-leaf-block':b.id,className:'leaf-row',style:{position:'relative'}},
  React.createElement('div',{className:'leaf-grip','data-testid':'leaf-grip',title:'Arraste para mover','aria-label':'Arraste para mover',onPointerDown:startMove(b.id),
   style:{position:'absolute',left:-26,top:b.type==='file'?10:b.type.startsWith('heading')?8:2,width:20,height:24,display:'flex',alignItems:'center',justifyContent:'center',cursor:'grab',color:c.muted,fontSize:13,letterSpacing:-3,borderRadius:4,userSelect:'none'}},'⋮⋮'),node);
 // 14/11/2026 (Pedro: "modelo Diário também nas Notas"): escolha por nota (padrão sem). Ligar converte o que já está escrito
 // (cada linha vira um registro com a hora em que foi escrita); Enter no fim de um registro já põe a hora; dias recolhíveis;
 // índice preso com "Hoje"; a nota abre no fim. Mesmo desenho do Diário das Páginas (page-templates.ts).
 const [diaryBusy,setDiaryBusy]=useState(false);
 // 14/11/2026 (Pedro: "em anotações não tá apagando esses espaços extras com o backspace"): como no Notion, Backspace no começo
 // de uma linha vazia apaga a linha e volta ao fim da anterior; no começo de uma linha com texto, junta com a anterior.
 // 14/11/2026 (Pedro: "e nem subindo com as setas"): seta para cima na 1a linha (ou para baixo na última) passa para a linha vizinha da nota.
 const arrowAt=(id:string,dir:number)=>{const n:any=inputs.current.get(id);if(!n||n.selectionStart!==n.selectionEnd)return false;
  try{const sel=document.getSelection(),box=n.getBoundingClientRect();let edge=true;if(sel&&sel.rangeCount&&n.textContent){const rc=sel.getRangeAt(0).getBoundingClientRect(),lh=parseFloat(getComputedStyle(n).lineHeight)||24;if(rc.height)edge=dir<0?rc.top-box.top<lh*0.8:box.bottom-rc.bottom<lh*0.8;}if(!edge)return false;}catch{return false;}
  const cur=latest.current;let i=cur.findIndex(x=>x.id===id)+dir;while(i>=0&&i<cur.length&&(!isTextBlock(cur[i])||dHidden.has(cur[i].id)))i+=dir;const t=cur[i];if(!t)return false;
  setActive(t.id);if(dir<0)focusEnd(t.id);else{const p:any=inputs.current.get(t.id);try{p?.focus?.({preventScroll:false});p?.setSelectionRange?.(0,0);}catch{}}return true;};
 const backspaceAt=(id:string)=>{const n:any=inputs.current.get(id),cur=latest.current,i=cur.findIndex(x=>x.id===id),me=cur[i];if(!n||i<=0||!me||n.selectionStart!==0||n.selectionEnd!==0)return false;
  const prev=cur[i-1];if(!isTextBlock(prev)||prev.type==='code'){if(me.text)return false;save(cur.filter(x=>x.id!==id));return true;}
  const at=prev.text.length,merged={...prev,text:prev.text+me.text,marks:[...(prev.marks||[]),...(me.marks||[]).map(m=>({...m,start:m.start+at,end:m.end+at}))]};
  save(cur.filter(x=>x.id!==id).map(x=>x.id===prev.id?merged:x));setActive(prev.id);
  setTimeout(()=>{const p:any=inputs.current.get(prev.id);try{p?.focus?.({preventScroll:true});p?.setSelectionRange?.(at,at);}catch{focusEnd(prev.id);}},40);return true;};
 const diaryEnterAt=(id:string)=>{const n:any=inputs.current.get(id),cur=latest.current.find(x=>x.id===id);if(!n||!cur||n.selectionStart!==n.selectionEnd||Number(n.selectionEnd)<cur.text.length)return false;
  const r=leafDiaryEnter(latest.current,id);if(!r)return false;save(r.blocks);setActive(r.focus);setTimeout(()=>focusEnd(r.focus),60);return true;};
 async function setDiary(on:boolean){if(!on){onChange({diary:false});return;}if(diaryBusy)return;setDiaryBusy(true);let times=new Map<string,string>();
  try{const api=currentApi();if(api&&pageId)times=lineTimesFromVersions(await api.entityVersions(pageId),leaf.id);}catch{/* sem versões: usa a data da linha ou da nota */}
  const r=leafToDiary(leaf,latest.current,times);setDiaryBusy(false);past.current.push(JSON.parse(JSON.stringify(latest.current)));future.current=[];latest.current=r.blocks;
  onChange({blocks:r.blocks,content:r.blocks.map(b=>b.text).join('\n\n'),diary:true});
  const s=r.sources,total=s.versions+s.block+s.note;if(total){const parts=[s.versions?`${s.versions} pelo histórico de versões`:'',s.block?`${s.block} pela data guardada da linha`:'',s.note?`${s.note} pela data de criação da nota (não havia registro melhor)`:''].filter(Boolean);
   appAlert('Modelo Diário ligado',`${total} ${total===1?'linha virou registro':'linhas viraram registros'}. Hora de cada uma: ${parts.join('; ')}.`);}}
 const dHidden=leaf.diary?diaryHidden(blocks as any):new Set<string>();
 const days=leaf.diary?diaryDays(blocks as any):[];
 const toggleDay=(id:string)=>save(latest.current.map(x=>x.id===id?{...x,data:{...(x.data||{}),collapsed:!x.data?.collapsed}}:x));
 const goDay=(d:{id:string;collapsed:boolean})=>{if(d.collapsed)toggleDay(d.id);setTimeout(()=>{try{const doc:any=(globalThis as any).document;const el=doc?.querySelector?.(`[data-leaf-block="${d.id}"]`)||inputs.current.get(d.id);const sc=scrollerOf(el);if(!el||!sc)return;
  const ix=doc.querySelector('[data-testid="leaf-diary-index"]');sc.scrollTop+=el.getBoundingClientRect().top-sc.getBoundingClientRect().top-(ix?.offsetHeight||0)-6;}catch{}},80);};
 const nowD=new Date(),todayKey=`${nowD.getFullYear()}-${String(nowD.getMonth()+1).padStart(2,'0')}-${String(nowD.getDate()).padStart(2,'0')}`;
 const dayIndex=days.length<2?null:<View testID="leaf-diary-index" style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12,...(RICH_WEB?{position:'sticky',top:0,zIndex:15,paddingVertical:8,backgroundColor:c.bg}:{})} as any}>{days.map(d=>{const today=d.key===todayKey;
  return <Pressable key={'ldi-'+d.id} accessibilityRole="button" testID={'leaf-diary-index-'+d.key} onPress={()=>goDay(d)} style={({hovered}:any)=>({paddingHorizontal:10,height:28,borderRadius:14,justifyContent:'center',backgroundColor:today?c.accent:hovered?c.line:c.input})}><Text style={{color:today?'#fff':c.text,fontSize:12,fontWeight:today?'700':'500'}}>{today?'Hoje':d.label}{d.count?` · ${d.count}`:''}</Text></Pressable>;})}</View>;
 const dayWrap=(b:LeafBlock,node:React.ReactNode)=>{const d=leaf.diary?days.find(x=>x.id===b.id):undefined;if(!d)return node;
  return <View key={b.id} style={{flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}>{node}</View><Pressable accessibilityRole="button" accessibilityLabel={d.collapsed?'Abrir o dia':'Recolher o dia'} testID={'leaf-diary-toggle-'+b.id} onPress={()=>toggleDay(b.id)} style={({hovered}:any)=>({flexDirection:'row',alignItems:'center',gap:6,marginLeft:8,paddingHorizontal:8,height:26,borderRadius:6,backgroundColor:hovered?c.input:'transparent'})}><Text style={{color:c.muted,fontSize:12}}>{d.count} {d.count===1?'registro':'registros'}</Text><Text style={{color:c.muted,fontSize:12}}>{d.collapsed?'▸':'▾'}</Text></Pressable></View>;};
 const diaryButton=<Pressable accessibilityRole="button" accessibilityLabel={leaf.diary?'Desligar o modelo Diário':'Ligar o modelo Diário'} testID="leaf-diary-switch" onPress={()=>setDiary(!leaf.diary)} style={({hovered}:any)=>({paddingVertical:desktop?6:12,paddingHorizontal:desktop?6:0,marginLeft:desktop?-6:0,alignSelf:'flex-start',borderRadius:6,backgroundColor:hovered?c.input:'transparent'})}><Text style={{color:leaf.diary?c.accent:c.muted,fontSize:desktop?13:undefined,fontWeight:leaf.diary?'700':'400'}}>{diaryBusy?'Convertendo…':leaf.diary?'✎ Modelo Diário ligado':'✎ Modelo Diário'}</Text></Pressable>;
 // abrir a nota com Diário já no fim (o registro mais novo)
 React.useEffect(()=>{if(Platform.OS!=='web'||!leaf.diary)return;const t=setTimeout(()=>{try{const first=rootRef.current?.querySelector?.('[data-leaf-block],textarea,[contenteditable]');const sc=scrollerOf(first);if(sc)sc.scrollTop=sc.scrollHeight;}catch{}},250);return()=>clearTimeout(t);},[leaf.id]);
 const pasteRef=useRef<(f:File)=>void>(()=>{});
 pasteRef.current=(f:File)=>{
  const api=currentApi();if(!api||!pageId){appAlert('Não deu para colar','Abra a nota dentro de uma página para colar imagens.');return;}
  const d=new Date(),two=(n:number)=>String(n).padStart(2,'0'),ext=(f.type.split('/')[1]||'png').replace('jpeg','jpg').replace(/[^a-z0-9]/g,'').slice(0,5)||'png';
  const name=f.name&&!/^image\.(png|jpe?g|gif|webp)$/i.test(f.name)?f.name:'print-'+two(d.getDate())+'-'+two(d.getMonth()+1)+'-'+d.getFullYear()+'-'+two(d.getHours())+'h'+two(d.getMinutes())+'.'+ext;
  const go=(view:'attach'|'preview')=>{
   const blk:LeafBlock={id:leafId(),text:'',type:'file',marks:[],data:{uploading:true,name,mime:f.type,size:f.size,view}};
   const cur=latest.current,at=cur.findIndex(b=>b.id===activeRef.current),empty=at>=0&&cur[at].type==='text'&&!cur[at].text;
   let next=at<0?[...cur,blk]:empty?[...cur.slice(0,at),blk,...cur.slice(at)]:[...cur.slice(0,at+1),blk,...cur.slice(at+1)];
   // 14/11/2026 (Pedro: "nao ta dando pra digitar depois da foto"): sempre fica uma linha de texto logo depois da imagem e o cursor vai para ela
   const bi=next.findIndex(x=>x.id===blk.id);let after=next[bi+1];
   if(!after||!isTextBlock(after)){after={id:leafId(),text:'',type:'text',marks:[]};next=[...next.slice(0,bi+1),after,...next.slice(bi+1)];}
   save(next);const go2=after.id;setActive(go2);setTimeout(()=>focusEnd(go2),120);
   uploadPageFile(api,pageId,new File([f],name,{type:f.type})).then(up=>save(latest.current.map(x=>x.id===blk.id?{...x,data:{...up,view}}:x),false))
    .catch((e:any)=>{save(latest.current.filter(x=>x.id!==blk.id),false);appAlert('Não deu para colar a imagem',String(e?.message||e));});
  };
  // 14/11/2026 (Pedro: "quando cola uma coisa em nota aparece só o print ou anexo, isso não é o tipo de nome que o notion colocaria"):
  // como no Notion, a imagem entra na hora mostrando a foto; para ver só como arquivo, a barra do bloco tem Arquivo | Imagem.
  go('preview');
 };
 React.useEffect(()=>{if(Platform.OS!=='web')return;const el=rootRef.current;if(!el?.addEventListener)return;
  const onPaste=(e:any)=>{const items=[...(e.clipboardData?.items||[])] as any[];const f=items.find(x=>x.kind==='file'&&/^image\//.test(x.type))?.getAsFile?.();if(!f)return;e.preventDefault();e.stopPropagation();pasteRef.current(f);};
  el.addEventListener('paste',onPaste,true);return()=>el.removeEventListener('paste',onPaste,true);},[]);
 // 13/11/2026 22h (Pedro: "pedi editor de texto no texto das notas"): no site o texto da nota usa o campo rico das Paginas
 // (negrito, italico, cor e marca-texto aparecem de verdade; Ctrl+B/I/U) e, ao selecionar, a barra de formatacao.
 // A nota continua guardada como texto + marcas (leaf-rich.ts), igual o app do celular le.
  // o que o proprio campo mandou volta igual para ele (senao o navegador recebe o texto de novo e o cursor pula)
 const richCache=useRef(new Map<string,{key:string;html:string}>());
 const htmlFor=(b:LeafBlock)=>{const k=richCache.current.get(b.id);return k&&k.key===b.text+'\u0000'+JSON.stringify(b.marks||[])?k.html:leafToHtml(b);};
 const richWeb=(b:LeafBlock,i:number)=>!RICH_WEB||b.type==='code'?null:<PageRichInput ref={(r:any)=>{if(r)inputs.current.set(b.id,r);else inputs.current.delete(b.id);}} testID={'leaf-rich-'+b.id} accessibilityLabel={i===0?'Conteúdo da nota':'Bloco de texto '+(i+1)}
  value={b.text} html={htmlFor(b)} placeholder={i===0?'Escreva algo…':''} placeholderColor={c.muted+'77'} style={{flex:1,minHeight:desktop?26:42,color:c.text,padding:0,...blockFont(b),...(leaf.diary&&isDiaryEntry(b as any)?{paddingLeft:'3.12em',textIndent:'-3.12em'}:{})} as any}
  onFocus={()=>{setActive(b.id);setTypingIn(b.id);}} onBlur={()=>setTypingIn(t=>t===b.id?null:t)} onUndo={(redo:boolean)=>undo(redo)}
  onKeyPress={(e:any)=>{const ne=e?.nativeEvent||{};
   // Enter continua quebrando a linha dentro do mesmo bloco, como no campo antigo da nota
   if((ne.key==='ArrowUp'||ne.key==='ArrowDown')&&!ne.shiftKey&&!ne.ctrlKey&&!ne.metaKey&&!ne.altKey&&arrowAt(b.id,ne.key==='ArrowUp'?-1:1)){e.preventDefault?.();return;}
   if(ne.key==='Backspace'&&!ne.shiftKey&&!ne.ctrlKey&&!ne.metaKey&&!ne.altKey&&backspaceAt(b.id)){e.preventDefault?.();return;}
   if(ne.key==='Enter'&&!ne.shiftKey&&!ne.ctrlKey&&!ne.metaKey&&!ne.altKey&&leaf.diary&&diaryEnterAt(b.id)){e.preventDefault?.();return;}
   if(ne.key==='Enter'&&!ne.ctrlKey&&!ne.metaKey&&!ne.altKey){e.preventDefault?.();(globalThis as any).document?.execCommand?.('insertLineBreak');return;}
   if(ne.key!=='Tab'||ne.ctrlKey||ne.metaKey||ne.altKey)return;e.preventDefault?.();if(!ne.shiftKey)(globalThis as any).document?.execCommand?.('insertText',false,'\t');}}
  onChange={(text:string,html:string)=>{const cur=latest.current.find(x=>x.id===b.id)||b,r=htmlToLeaf(html,cur),next=r.text===text?r:{text,marks:editBlockText(cur,text,typing).marks};richCache.current.set(b.id,{key:next.text+'\u0000'+JSON.stringify(next.marks),html});save(latest.current.map(x=>x.id===b.id?{...x,text:next.text,marks:next.marks}:x));}}/>;
 const fileBlock=(b:LeafBlock)=>{const api=currentApi();return <View key={b.id} testID="leaf-file-block" style={{marginBottom:desktop?6:16}}>{api?<PageFileBlock api={api} pageId={pageId} data={(b.data||{}) as any} selected={active===b.id} onSelect={()=>setActive(b.id)}
  onChange={d=>save(latest.current.map(x=>x.id===b.id?{...x,data:d as any}:x))} onRemove={()=>save(latest.current.filter(x=>x.id!==b.id))}/>:<Text style={{color:c.muted}}>{String(b.data?.name||'arquivo')}</Text>}</View>;};
 const action=(label:string,text:string,fn:()=>void)=><Pressable key={label} accessibilityLabel={label} onPress={fn} style={{minWidth:42,height:44,alignItems:'center',justifyContent:'center',paddingHorizontal:10}}><Text style={{color:c.text,fontSize:18}}>{text}</Text></Pressable>;
 // 05/11/2026 (Pedro: links como no Notion): no site o campo da linha e um textarea (sem link clicavel). Quando a linha
 // tem endereco, uma camada por cima desenha o mesmo texto com o link sublinhado e clicavel; o textarea continua
 // embaixo para digitar (texto transparente, cursor visivel). Passar o mouse no link abre Copiar / Remover link.
 const blockFont=(b:LeafBlock):any=>({fontSize:b.type==='heading1'?29:b.type==='heading2'?24:b.type==='heading3'?20:16,lineHeight:b.type.startsWith('heading')?36:26,fontWeight:b.type.startsWith('heading')?'700':'400',fontFamily:b.type==='code'?'monospace':undefined,textAlign:b.align||'left',textDecorationLine:b.checked?'line-through':'none'});
 // 06/11/2026 (Pedro: cursor fora do lugar): a camada de links so aparece na linha que NAO esta sendo digitada; na linha em
 // edicao fica o texto normal do campo, com o cursor no lugar certo.
 const [typingIn,setTypingIn]=useState<string|null>(null);
 const webLinks=(b:LeafBlock)=>Platform.OS==='web'&&b.type!=='code'&&typingIn!==b.id?linkRanges(b):[];
 const [linkPop,setLinkPop]=useState<(NonNullable<LinkPop>&{block:string;start:number;end:number})|null>(null),popTimer=useRef<any>(null);
 const popKeep=()=>{if(popTimer.current)clearTimeout(popTimer.current);popTimer.current=null;};
 const popLeave=()=>{popKeep();popTimer.current=setTimeout(()=>setLinkPop(null),220);};
 function linkLayer(b:LeafBlock){
  const links=webLinks(b);if(!links.length)return null;const runs=textRuns(b);
  const stops=[...new Set([0,b.text.length,...links.flatMap(l=>[l.start,l.end]),...runs.map(r=>r.start)])].sort((x,y)=>x-y);
  return <Text testID="leaf-link-layer" style={{position:'absolute',left:0,top:0,right:0,color:c.text,pointerEvents:'none',...blockFont(b)}}>{stops.slice(0,-1).map((start,i)=>{const end=stops[i+1],t=b.text.slice(start,end),l=links.find(x=>x.start<=start&&x.end>=end),r:any=runs.find(x=>x.start<=start&&x.end>=end)?.style||{};
   const base:any={color:r.color||c.text,backgroundColor:r.highlight||'transparent',textDecorationLine:r.underline&&r.strike?'underline line-through':r.underline?'underline':r.strike?'line-through':'none'};
   if(!l)return <Text key={start} style={base}>{t}</Text>;
   return <Text key={start} accessibilityRole="link" {...({href:l.url,hrefAttrs:{target:'_blank',rel:'noopener noreferrer'},onMouseEnter:(e:any)=>{popKeep();const rc=e?.currentTarget?.getBoundingClientRect?.();if(rc)setLinkPop({url:l.url,x:rc.left,y:rc.bottom,block:b.id,start:l.start,end:l.end});},onMouseLeave:popLeave} as any)} onPress={(e:any)=>{e?.preventDefault?.();openUrl(l.url);}} style={{...base,pointerEvents:'auto',cursor:'pointer',textDecorationLine:'underline',textDecorationColor:c.muted} as any}>{t}</Text>;})}</Text>;
 }
 return <View ref={rootRef} style={{flex:1}}><ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={desktop?{paddingHorizontal:48,paddingTop:28,paddingBottom:80,width:'100%',maxWidth:820,alignSelf:'center'}:{padding:24,paddingBottom:80}}>
 <TextInput scrollEnabled={false} ref={(n:any)=>{(titleRef as any).current=n;titleNode.current=n;}} {...(Platform.OS==='web'?({numberOfLines:1} as any):{})} accessibilityLabel="Título da nota" value={leaf.title} onChangeText={title=>onChange({title})} multiline placeholder="Sem título" placeholderTextColor={c.muted+'88'} style={{fontSize:32,fontWeight:'700',color:c.text,padding:0,marginBottom:desktop?10:22}}/>
 <View style={{marginBottom:desktop?4:16}}><DateTimeField compact allowClear={false} label="Criado em" value={leaf.created_at||''} emptyLabel="Ao começar a escrever" onChange={created_at=>onChange({created_at})}/></View>
 {(leaf.properties||[]).map(p=><View key={p.id} style={{flexDirection:'row',gap:14,marginVertical:4}}><Text style={{color:c.muted,width:120,paddingVertical:8}}>{p.name}</Text><TextInput accessibilityLabel={'Propriedade '+p.name} value={p.value} onChangeText={value=>onChange({properties:leaf.properties!.map(x=>x.id===p.id?{...x,value}:x)})} style={{flex:1,color:c.text,paddingVertical:8}}/></View>)}
 <Pressable accessibilityLabel="Adicionar propriedade" onPress={()=>{setPropName('');setPropValue('');setProperty(true);}} style={({hovered}:any)=>({paddingVertical:desktop?6:12,paddingHorizontal:desktop?6:0,marginLeft:desktop?-6:0,alignSelf:'flex-start',borderRadius:6,backgroundColor:hovered?c.input:'transparent'})}><Text style={{color:c.muted,fontSize:desktop?13:undefined}}>＋ Adicionar propriedade</Text></Pressable>{diaryButton}<View style={{height:1,backgroundColor:c.line,marginTop:desktop?8:14,marginBottom:desktop?16:24}}/>
 {dayIndex}{blocks.map((b,i)=>dHidden.has(b.id)?null:dayWrap(b,shell(b,b.type==='file'?fileBlock(b):b.type==='divider'?<Pressable key={b.id} onPress={()=>setActive(b.id)} style={{paddingVertical:14}}><View style={{height:1,backgroundColor:c.line}}/></Pressable>:<View key={b.id} style={{flexDirection:'row',marginBottom:desktop?4:16,borderLeftWidth:b.type==='quote'?3:0,borderColor:c.accent,paddingLeft:b.type==='quote'?14:0,backgroundColor:b.type==='code'?c.input:'transparent',borderRadius:4}}>
 {['bullet','number','todo'].includes(b.type)?<Pressable onPress={()=>{setActive(b.id);if(b.type==='todo')save(blocks.map(x=>x.id===b.id?{...x,checked:!x.checked}:x));}} style={{paddingTop:8,paddingRight:10}}><Text style={{color:c.text}}>{b.type==='todo'?(b.checked?'☑':'☐'):b.type==='number'?String(i+1)+'.':'•'}</Text></Pressable>:null}
 <View style={{flex:1,position:'relative',flexDirection:'row'/* 06/11/2026: em linha, o flex:1 do campo vale para a largura; em coluna ele ignorava a altura e cortava a 2a linha */}}>{richWeb(b,i)||<TextInput scrollEnabled={false} {...(Platform.OS==='web'?({numberOfLines:1} as any):{})} ref={r=>{if(r)inputs.current.set(b.id,r);else inputs.current.delete(b.id);}} accessibilityLabel={i===0?'Conteúdo da nota':'Bloco de texto '+(i+1)} multiline onFocus={()=>{setActive(b.id);setTypingIn(b.id);}} onBlur={()=>setTypingIn(t=>t===b.id?null:t)} onSelectionChange={e=>{if(active===b.id)setSelection(e.nativeEvent.selection);}} {...(Platform.OS==='web'?({onKeyPress:(e:any)=>{const ne=e?.nativeEvent||{};if(ne.key!=='Tab'||ne.ctrlKey||ne.metaKey||ne.altKey)return;e.preventDefault?.(); /* 13/11/2026 (Pedro: "tab na area de texto da o espaco maior do tab"): Tab escreve a tabulacao na nota */if(ne.shiftKey)return;const d:any=(globalThis as any).document;if(!d?.execCommand?.('insertText',false,'\t')){const n:any=e.target,s=n?.selectionStart??b.text.length,z=n?.selectionEnd??s;save(blocks.map(x=>x.id===b.id?editBlockText(x,b.text.slice(0,s)+'\t'+b.text.slice(z),typing):x));}}} as any):{})} onChangeText={text=>save(blocks.map(x=>x.id===b.id?editBlockText(x,text,typing):x))} placeholder={i===0?'Escreva algo…':''} placeholderTextColor={c.muted+'77'} style={{flex:1,minHeight:42,color:c.text,padding:0,textAlignVertical:'top',...blockFont(b),...(webLinks(b).length?{color:'transparent',caretColor:c.text} as any:{})}} {...(Platform.OS==='web'?{value:b.text}:{})}>{Platform.OS==='web'?null:textRuns(b).map(r=><Text key={r.start} style={{fontWeight:r.style.bold?'700':undefined,fontStyle:r.style.italic?'italic':undefined,textDecorationLine:r.style.underline&&r.style.strike?'underline line-through':r.style.underline?'underline':r.style.strike?'line-through':'none',fontFamily:r.style.code?'monospace':undefined,color:r.style.color||c.text,backgroundColor:r.style.highlight||'transparent'}}>{r.text}</Text>)}</TextInput>}{RICH_WEB&&b.type!=='code'?null:linkLayer(b)}</View></View>)))}
 <Pressable testID="leaf-write-below" accessibilityLabel="Escrever no fim da nota" onPress={writeBelow} style={{minHeight:desktop?140:60,...(Platform.OS==='web'?{cursor:'text'} as any:{})}}/>
 </ScrollView>{RICH_WEB?<NoteFormatBar rootRef={rootRef} activeType={(blocks.find(x=>x.id===active)||blocks[0]).type} onType={type=>patch({type})}/>:null}<KeyboardToolbar visible={keyboard&&!property} testID="leaf-format-toolbar"><View style={{borderTopWidth:1,borderColor:c.line,backgroundColor:c.surface}}><ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}>{action('Novo bloco','＋',()=>add())}{action('Estilos de texto','Aa',()=>setFormat(true))}{action('Negrito','B',()=>toggleStyle('bold'))}{action('Itálico','𝘐',()=>toggleStyle('italic'))}{action('Sublinhado','U̲',()=>toggleStyle('underline'))}{action('Desfazer na nota','↶',()=>undo())}{action('Refazer na nota','↷',()=>undo(true))}{action('Excluir bloco','⌫',()=>{const next=blocks.filter(b=>b.id!==active);if(!next.length)next.push({id:leafId(),type:'text',text:'',marks:[]});save(next);setActive(next[0].id);})}{action('Fechar teclado','⌨',()=>Keyboard.dismiss())}</ScrollView></View></KeyboardToolbar>
 <Sheet visible={format} onClose={()=>setFormat(false)}><Text style={{color:c.text,fontSize:24,fontWeight:'600',marginBottom:14}}>Estilos de texto</Text><ScrollView keyboardShouldPersistTaps="always"><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[['text','Texto'],['heading1','Título 1'],['heading2','Título 2'],['heading3','Título 3'],['bullet','Lista com marcadores'],['number','Lista numerada'],['todo','Lista de tarefas'],['quote','Citação'],['code','Código']].map(([type,label])=><Pressable key={type} onPress={()=>{patch({type});setFormat(false);}} style={{backgroundColor:c.input,borderRadius:9,padding:12}}><Text style={{color:c.text}}>{label}</Text></Pressable>)}</View><View style={{flexDirection:'row',flexWrap:'wrap',marginVertical:12}}>{action('Tachado','S̶',()=>{toggleStyle('strike');setFormat(false);})}{action('Código no texto','<>',()=>{toggleStyle('code');setFormat(false);})}{action('Alinhar à esquerda','≡←',()=>patch({align:'left'}))}{action('Centralizar','≡',()=>patch({align:'center'}))}{action('Alinhar à direita','→≡',()=>patch({align:'right'}))}{action('Inserir divisor','―',()=>add('divider'))}</View><Text style={{color:c.muted}}>Cor do texto</Text><View style={{flexDirection:'row',gap:12,marginVertical:14}}>{[c.text,PALETTE.violetLight1,PALETTE.red2,PALETTE.teal3,PALETTE.yellow1,PALETTE.blue1].map(color=><Pressable accessibilityLabel={'Cor '+color} key={color} onPress={()=>{mark({color});setFormat(false);}} style={{width:34,height:34,borderRadius:17,backgroundColor:color}}/>)}</View><Text style={{color:c.muted}}>Destaque</Text><View style={{flexDirection:'row',gap:12,marginVertical:14}}>{['transparent',PALETTE.violet1+'55',PALETTE.orange2+'55',PALETTE.teal2+'55',PALETTE.red1+'55'].map(highlight=><Pressable accessibilityLabel={'Destaque '+highlight} key={highlight} onPress={()=>{mark({highlight});setFormat(false);}} style={{width:34,height:34,borderRadius:8,borderWidth:1,borderColor:c.line,backgroundColor:highlight}}/>)}</View></ScrollView></Sheet>
 <Sheet visible={property} onClose={()=>setProperty(false)}><Text style={{color:c.text,fontSize:24,fontWeight:'600'}}>Nova propriedade</Text><TextInput accessibilityLabel="Nome da propriedade" value={propName} onChangeText={setPropName} placeholder="Nome" placeholderTextColor={c.muted} style={{color:c.text,padding:14,backgroundColor:c.input,marginVertical:12}}/><TextInput accessibilityLabel="Valor da propriedade" value={propValue} onChangeText={setPropValue} placeholder="Valor" placeholderTextColor={c.muted} style={{color:c.text,padding:14,backgroundColor:c.input,marginBottom:12}}/><Button title="Adicionar propriedade" disabled={!propName.trim()} onPress={()=>{onChange({properties:[...(leaf.properties||[]),{id:leafId(),name:propName.trim(),value:propValue}]});setProperty(false);}}/></Sheet>
 <LinkHoverCard pop={linkPop} onEnter={popKeep} onLeave={popLeave} onClose={()=>setLinkPop(null)} onRemove={()=>{const t=linkPop;if(t)save(blocks.map(x=>x.id===t.block?unlinkRange(x,t.start,t.end):x));}}/>
 </View>;
}
