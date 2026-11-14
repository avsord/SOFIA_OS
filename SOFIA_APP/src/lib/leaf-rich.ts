// 13/11/2026 22h (Pedro: "pedi editor de texto no texto das notas"): no site o texto da nota passa a ser editado com o mesmo
// campo rico das Paginas (negrito, italico, cor, marca-texto aparecendo de verdade). A nota continua guardada como texto +
// marcas (o formato que o app do celular entende); aqui ficam as duas conversoes, sem tela, para os testes.
import {linkRanges,textRuns} from './leaf-document';
import type {LeafBlock,Mark} from './leaf-document';

type Style=Partial<Omit<Mark,'start'|'end'|'nolink'>>;
const esc=(v:string)=>String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const safeColor=(v:string)=>/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,24})$/i.test(String(v||'').trim())?String(v).trim():'';

/** Texto + marcas da nota -> HTML do campo rico. Enderecos viram link (como ja eram na nota). */
export function leafToHtml(block:LeafBlock):string{
 const text=String(block.text||''),runs=textRuns({...block,text,marks:block.marks||[]}),links=linkRanges({...block,text,marks:block.marks||[]});
 const stops=[...new Set([0,text.length,...runs.flatMap(r=>[r.start,r.end]),...links.flatMap(l=>[l.start,l.end])])].filter(n=>n>=0&&n<=text.length).sort((a,b)=>a-b);
 let out='';
 for(let i=0;i<stops.length-1;i++){
  const s=stops[i],e=stops[i+1];if(e<=s)continue;
  const st:any=runs.find(r=>r.start<=s&&r.end>=e)?.style||{},link=links.find(l=>l.start<=s&&l.end>=e);
  let h=esc(text.slice(s,e)).replace(/\n/g,'<br>');
  if(st.code)h='<code>'+h+'</code>';if(st.strike)h='<s>'+h+'</s>';if(st.underline)h='<u>'+h+'</u>';if(st.italic)h='<i>'+h+'</i>';if(st.bold)h='<b>'+h+'</b>';
  const css=[st.color&&safeColor(st.color)?'color:'+safeColor(st.color):'',st.highlight&&safeColor(st.highlight)?'background-color:'+safeColor(st.highlight):''].filter(Boolean).join(';');
  if(css)h='<span style="'+css+'">'+h+'</span>';
  if(link)h='<a href="'+esc(link.url)+'">'+h+'</a>';
  out+=h;
 }
 return out;
}

const ENT:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ','#39':"'"};
const decode=(v:string)=>v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,k:string)=>{const l=k.toLowerCase();if(ENT[l]!==undefined)return ENT[l];if(l.startsWith('#x'))return String.fromCodePoint(parseInt(l.slice(2),16));if(l.startsWith('#'))return String.fromCodePoint(parseInt(l.slice(1),10));return m;});
function tagStyle(tag:string,attrs:string):Style{
 const s:Style={};
 if(tag==='b'||tag==='strong')s.bold=true;else if(tag==='i'||tag==='em')s.italic=true;else if(tag==='u')s.underline=true;else if(tag==='s'||tag==='strike'||tag==='del')s.strike=true;else if(tag==='code')s.code=true;
 const m=/style\s*=\s*"([^"]*)"/i.exec(attrs)||/style\s*=\s*'([^']*)'/i.exec(attrs);
 if(m)for(const part of decode(m[1]).split(';')){const i=part.indexOf(':');if(i<0)continue;const k=part.slice(0,i).trim().toLowerCase(),v=part.slice(i+1).trim();
  if(k==='color'){const c=safeColor(v);if(c)s.color=c;}
  else if(k==='background-color'||k==='background'){const c=safeColor(v);if(c&&c!=='transparent')s.highlight=c;}
  else if(k==='font-weight'&&/^(bold|bolder|[6-9]00)$/i.test(v))s.bold=true;
  else if(k==='font-style'&&/italic/i.test(v))s.italic=true;
  else if((k==='text-decoration'||k==='text-decoration-line')){if(/underline/i.test(v))s.underline=true;if(/line-through/i.test(v))s.strike=true;}}
 return s;
}
const VOID=new Set(['br','img','hr','input','meta','link','wbr']);
const sameStyle=(a:Style,b:Style)=>JSON.stringify(a)===JSON.stringify(b);

/** HTML do campo rico -> texto + marcas da nota. Um endereco que o campo deixou sem link (Remover link) vira `nolink`. */
/** `prev`: o bloco antes da edicao. So vira `nolink` o endereco que era link e o campo desfez (Remover link); endereco recem
 * digitado continua virando link sozinho, como antes. */
export function htmlToLeaf(html:string,prev?:LeafBlock):{text:string;marks:Mark[]}{
 const stack:{tag:string;style:Style}[]=[];let text='';const segs:{start:number;end:number;style:Style;link:boolean}[]=[];
 const re=/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;let m:RegExpExecArray|null;
 while((m=re.exec(String(html||'')))){
  if(m[4]!==undefined){const t=decode(m[4]).replace(/ /g,' ');if(!t)continue;const style:Style={};let link=false;for(const f of stack){Object.assign(style,f.style);if(f.tag==='a')link=true;}
   segs.push({start:text.length,end:text.length+t.length,style,link});text+=t;continue;}
  const close=m[1]==='/',tag=m[2].toLowerCase(),attrs=m[3]||'';
  if(tag==='br'){if(!/data-fill/i.test(attrs))text+='\n';continue;}
  if(close){for(let i=stack.length-1;i>=0;i--)if(stack[i].tag===tag){stack.splice(i);break;}continue;}
  if(VOID.has(tag)||/\/\s*$/.test(attrs))continue;
  stack.push({tag,style:tagStyle(tag,attrs)});
 }
 const marks:Mark[]=[];
 for(const s of segs){if(!Object.keys(s.style).length)continue;const last=marks[marks.length-1];const {start:_a,end:_b,...ls}=(last||{}) as any;
  if(last&&last.end===s.start&&sameStyle(ls,s.style))last.end=s.end;else marks.push({start:s.start,end:s.end,...s.style});}
 const was=new Set(prev?linkRanges({...prev,marks:prev.marks||[]}).map(l=>l.url):[]),off=new Set((prev?.marks||[]).filter(k=>k.nolink).map(k=>String(prev!.text||'').slice(k.start,k.end)));
 for(const l of linkRanges({id:'',type:'text',text,marks:[]})){const u=text.slice(l.start,l.end);if(off.has(u)||was.has(l.url)&&segs.some(s=>!s.link&&s.start<l.end&&s.end>l.start))marks.push({start:l.start,end:l.end,nolink:true});}
 return {text,marks};
}
