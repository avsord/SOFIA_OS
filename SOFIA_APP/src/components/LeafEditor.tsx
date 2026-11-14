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
 const sizeField=(n:any)=>{if(!n?.style||n.tagName!=='TEXTAREA')return;const sc=scrollerOf(n),top=sc?sc.scrollTop:0,before=n.style.height;n.style.overflow='hidden';n.style.height='0px';const want=n.scrollHeight+'px';n.style.height=want;if(sc&&sc.scrollTop!==top)sc.scrollTop=top;return before!==want;};
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
 const pasteRef=useRef<(f:File)=>void>(()=>{});
 pasteRef.current=(f:File)=>{
  const api=currentApi();if(!api||!pageId){appAlert('Não deu para colar','Abra a nota dentro de uma página para colar imagens.');return;}
  const d=new Date(),two=(n:number)=>String(n).padStart(2,'0'),ext=(f.type.split('/')[1]||'png').replace('jpeg','jpg').replace(/[^a-z0-9]/g,'').slice(0,5)||'png';
  const name=f.name&&!/^image\.(png|jpe?g|gif|webp)$/i.test(f.name)?f.name:'print-'+two(d.getDate())+'-'+two(d.getMonth()+1)+'-'+d.getFullYear()+'-'+two(d.getHours())+'h'+two(d.getMinutes())+'.'+ext;
  const go=(view:'attach'|'preview')=>{
   const blk:LeafBlock={id:leafId(),text:'',type:'file',marks:[],data:{uploading:true,name,mime:f.type,size:f.size,view}};
   const cur=latest.current,at=cur.findIndex(b=>b.id===activeRef.current),empty=at>=0&&cur[at].type==='text'&&!cur[at].text;
   const next=at<0?[...cur,blk]:empty?[...cur.slice(0,at),blk,...cur.slice(at)]:[...cur.slice(0,at+1),blk,...cur.slice(at+1)];save(next);
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
  value={b.text} html={htmlFor(b)} placeholder={i===0?'Escreva algo…':''} placeholderColor={c.muted+'77'} style={{flex:1,minHeight:desktop?26:42,color:c.text,padding:0,...blockFont(b)}}
  onFocus={()=>{setActive(b.id);setTypingIn(b.id);}} onBlur={()=>setTypingIn(t=>t===b.id?null:t)} onUndo={(redo:boolean)=>undo(redo)}
  onKeyPress={(e:any)=>{const ne=e?.nativeEvent||{};
   // Enter continua quebrando a linha dentro do mesmo bloco, como no campo antigo da nota
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
 <Pressable accessibilityLabel="Adicionar propriedade" onPress={()=>{setPropName('');setPropValue('');setProperty(true);}} style={({hovered}:any)=>({paddingVertical:desktop?6:12,paddingHorizontal:desktop?6:0,marginLeft:desktop?-6:0,alignSelf:'flex-start',borderRadius:6,backgroundColor:hovered?c.input:'transparent'})}><Text style={{color:c.muted,fontSize:desktop?13:undefined}}>＋ Adicionar propriedade</Text></Pressable><View style={{height:1,backgroundColor:c.line,marginTop:desktop?8:14,marginBottom:desktop?16:24}}/>
 {blocks.map((b,i)=>b.type==='file'?fileBlock(b):b.type==='divider'?<Pressable key={b.id} onPress={()=>setActive(b.id)} style={{paddingVertical:14}}><View style={{height:1,backgroundColor:c.line}}/></Pressable>:<View key={b.id} style={{flexDirection:'row',marginBottom:desktop?4:16,borderLeftWidth:b.type==='quote'?3:0,borderColor:c.accent,paddingLeft:b.type==='quote'?14:0,backgroundColor:b.type==='code'?c.input:'transparent',borderRadius:4}}>
 {['bullet','number','todo'].includes(b.type)?<Pressable onPress={()=>{setActive(b.id);if(b.type==='todo')save(blocks.map(x=>x.id===b.id?{...x,checked:!x.checked}:x));}} style={{paddingTop:8,paddingRight:10}}><Text style={{color:c.text}}>{b.type==='todo'?(b.checked?'☑':'☐'):b.type==='number'?String(i+1)+'.':'•'}</Text></Pressable>:null}
 <View style={{flex:1,position:'relative',flexDirection:'row'/* 06/11/2026: em linha, o flex:1 do campo vale para a largura; em coluna ele ignorava a altura e cortava a 2a linha */}}>{richWeb(b,i)||<TextInput scrollEnabled={false} {...(Platform.OS==='web'?({numberOfLines:1} as any):{})} ref={r=>{if(r)inputs.current.set(b.id,r);else inputs.current.delete(b.id);}} accessibilityLabel={i===0?'Conteúdo da nota':'Bloco de texto '+(i+1)} multiline onFocus={()=>{setActive(b.id);setTypingIn(b.id);}} onBlur={()=>setTypingIn(t=>t===b.id?null:t)} onSelectionChange={e=>{if(active===b.id)setSelection(e.nativeEvent.selection);}} {...(Platform.OS==='web'?({onKeyPress:(e:any)=>{const ne=e?.nativeEvent||{};if(ne.key!=='Tab'||ne.ctrlKey||ne.metaKey||ne.altKey)return;e.preventDefault?.(); /* 13/11/2026 (Pedro: "tab na area de texto da o espaco maior do tab"): Tab escreve a tabulacao na nota */if(ne.shiftKey)return;const d:any=(globalThis as any).document;if(!d?.execCommand?.('insertText',false,'\t')){const n:any=e.target,s=n?.selectionStart??b.text.length,z=n?.selectionEnd??s;save(blocks.map(x=>x.id===b.id?editBlockText(x,b.text.slice(0,s)+'\t'+b.text.slice(z),typing):x));}}} as any):{})} onChangeText={text=>save(blocks.map(x=>x.id===b.id?editBlockText(x,text,typing):x))} placeholder={i===0?'Escreva algo…':''} placeholderTextColor={c.muted+'77'} style={{flex:1,minHeight:42,color:c.text,padding:0,textAlignVertical:'top',...blockFont(b),...(webLinks(b).length?{color:'transparent',caretColor:c.text} as any:{})}} {...(Platform.OS==='web'?{value:b.text}:{})}>{Platform.OS==='web'?null:textRuns(b).map(r=><Text key={r.start} style={{fontWeight:r.style.bold?'700':undefined,fontStyle:r.style.italic?'italic':undefined,textDecorationLine:r.style.underline&&r.style.strike?'underline line-through':r.style.underline?'underline':r.style.strike?'line-through':'none',fontFamily:r.style.code?'monospace':undefined,color:r.style.color||c.text,backgroundColor:r.style.highlight||'transparent'}}>{r.text}</Text>)}</TextInput>}{RICH_WEB&&b.type!=='code'?null:linkLayer(b)}</View></View>)}
 </ScrollView>{RICH_WEB?<NoteFormatBar rootRef={rootRef} activeType={(blocks.find(x=>x.id===active)||blocks[0]).type} onType={type=>patch({type})}/>:null}<KeyboardToolbar visible={keyboard&&!property} testID="leaf-format-toolbar"><View style={{borderTopWidth:1,borderColor:c.line,backgroundColor:c.surface}}><ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}>{action('Novo bloco','＋',()=>add())}{action('Estilos de texto','Aa',()=>setFormat(true))}{action('Negrito','B',()=>toggleStyle('bold'))}{action('Itálico','𝘐',()=>toggleStyle('italic'))}{action('Sublinhado','U̲',()=>toggleStyle('underline'))}{action('Desfazer na nota','↶',()=>undo())}{action('Refazer na nota','↷',()=>undo(true))}{action('Excluir bloco','⌫',()=>{const next=blocks.filter(b=>b.id!==active);if(!next.length)next.push({id:leafId(),type:'text',text:'',marks:[]});save(next);setActive(next[0].id);})}{action('Fechar teclado','⌨',()=>Keyboard.dismiss())}</ScrollView></View></KeyboardToolbar>
 <Sheet visible={format} onClose={()=>setFormat(false)}><Text style={{color:c.text,fontSize:24,fontWeight:'600',marginBottom:14}}>Estilos de texto</Text><ScrollView keyboardShouldPersistTaps="always"><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[['text','Texto'],['heading1','Título 1'],['heading2','Título 2'],['heading3','Título 3'],['bullet','Lista com marcadores'],['number','Lista numerada'],['todo','Lista de tarefas'],['quote','Citação'],['code','Código']].map(([type,label])=><Pressable key={type} onPress={()=>{patch({type});setFormat(false);}} style={{backgroundColor:c.input,borderRadius:9,padding:12}}><Text style={{color:c.text}}>{label}</Text></Pressable>)}</View><View style={{flexDirection:'row',flexWrap:'wrap',marginVertical:12}}>{action('Tachado','S̶',()=>{toggleStyle('strike');setFormat(false);})}{action('Código no texto','<>',()=>{toggleStyle('code');setFormat(false);})}{action('Alinhar à esquerda','≡←',()=>patch({align:'left'}))}{action('Centralizar','≡',()=>patch({align:'center'}))}{action('Alinhar à direita','→≡',()=>patch({align:'right'}))}{action('Inserir divisor','―',()=>add('divider'))}</View><Text style={{color:c.muted}}>Cor do texto</Text><View style={{flexDirection:'row',gap:12,marginVertical:14}}>{[c.text,PALETTE.violetLight1,PALETTE.red2,PALETTE.teal3,PALETTE.yellow1,PALETTE.blue1].map(color=><Pressable accessibilityLabel={'Cor '+color} key={color} onPress={()=>{mark({color});setFormat(false);}} style={{width:34,height:34,borderRadius:17,backgroundColor:color}}/>)}</View><Text style={{color:c.muted}}>Destaque</Text><View style={{flexDirection:'row',gap:12,marginVertical:14}}>{['transparent',PALETTE.violet1+'55',PALETTE.orange2+'55',PALETTE.teal2+'55',PALETTE.red1+'55'].map(highlight=><Pressable accessibilityLabel={'Destaque '+highlight} key={highlight} onPress={()=>{mark({highlight});setFormat(false);}} style={{width:34,height:34,borderRadius:8,borderWidth:1,borderColor:c.line,backgroundColor:highlight}}/>)}</View></ScrollView></Sheet>
 <Sheet visible={property} onClose={()=>setProperty(false)}><Text style={{color:c.text,fontSize:24,fontWeight:'600'}}>Nova propriedade</Text><TextInput accessibilityLabel="Nome da propriedade" value={propName} onChangeText={setPropName} placeholder="Nome" placeholderTextColor={c.muted} style={{color:c.text,padding:14,backgroundColor:c.input,marginVertical:12}}/><TextInput accessibilityLabel="Valor da propriedade" value={propValue} onChangeText={setPropValue} placeholder="Valor" placeholderTextColor={c.muted} style={{color:c.text,padding:14,backgroundColor:c.input,marginBottom:12}}/><Button title="Adicionar propriedade" disabled={!propName.trim()} onPress={()=>{onChange({properties:[...(leaf.properties||[]),{id:leafId(),name:propName.trim(),value:propValue}]});setProperty(false);}}/></Sheet>
 <LinkHoverCard pop={linkPop} onEnter={popKeep} onLeave={popLeave} onClose={()=>setLinkPop(null)} onRemove={()=>{const t=linkPop;if(t)save(blocks.map(x=>x.id===t.block?unlinkRange(x,t.start,t.end):x));}}/>
 </View>;
}
