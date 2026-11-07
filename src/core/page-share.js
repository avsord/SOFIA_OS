'use strict';
// 06/11/2026 (Pedro: "compartilhar link da pagina para os usuarios visualizarem o conteudo, tipo Notion"):
// "Publicar na web" de uma pagina. O link e um codigo secreto aleatorio (32 bytes); quem tem o link ve SO LEITURA a pagina
// e as subpaginas DELA (compartilhar uma subpagina mostra so ela e o que esta dentro dela). Nada de login, edicao, Sofia,
// barra lateral ou outras paginas. Desligar apaga o codigo na hora; "gerar novo link" troca o codigo.
// Os codigos ficam nas configuracoes (settings.pageShares), fora do conteudo da pagina: um salvar antigo da pagina nunca
// religa nem desliga o compartilhamento.
const crypto=require('node:crypto');
const {AppError,validId}=require('./util');

const TOKEN_RE=/^[A-Za-z0-9_-]{30,64}$/;
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const SAFE_COLOR=/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;

function makePageShares(store,workspace){
 const read=()=>{const v=store.settings().pageShares;return v&&typeof v==='object'&&!Array.isArray(v)?v:{};};
 const write=map=>store.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('pageShares',JSON.stringify(map));
 // 07/11/2026 (Pedro: "no meu notebook o fundo ficou branco"): a pagina compartilhada segue a APARENCIA ESCOLHIDA NA SOFIA
 // (escuro, claro ou por horario), nao o tema do sistema de quem abre. O app manda a escolha em /api/mobile/appearance.
 const getAppearance=()=>{try{const r=store.db.prepare('SELECT value FROM settings WHERE key=?').get('ownerAppearanceV1');const v=r?JSON.parse(r.value):null;return v&&typeof v==='object'?v:null;}catch{return null;}};
 const setAppearance=a=>store.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('ownerAppearanceV1',JSON.stringify(a));
 // 06/11/2026: pagina trancada com senha nunca aparece no link publico (nem como subpagina)
 const locked=e=>(e.tags||[]).includes('sofia-lock-v1');
 const page=id=>{try{const e=workspace.get(id);return e&&e.kind==='user_page'&&e.state!=='archived'&&!locked(e)?e:null;}catch{return null;}};
 const parentOf=e=>String((e&&e.data&&e.data.parent_id)||'');
 const tokenOf=pageId=>Object.keys(read()).find(t=>read()[t]&&read()[t].page===pageId)||null;
 /** A pagina continua dentro da compartilhada (ela mesma ou descendente). */
 function inside(root,id){let cur=page(id),guard=0;while(cur&&guard++<60){if(cur.id===root)return true;const up=parentOf(cur);if(!up)return false;cur=page(up);}return false;}
 function children(id){const out=[];for(let offset=0;offset<20000;offset+=500){const rows=workspace.list({kind:'user_page',limit:500,offset});for(const e of rows)if(e.state!=='archived'&&!locked(e)&&parentOf(e)===id)out.push(e);if(rows.length<500)break;}
  return out.sort((a,b)=>(Number(a.data&&a.data.sort_order)||0)-(Number(b.data&&b.data.sort_order)||0)||String(a.title).localeCompare(String(b.title),'pt-BR'));}
 return {
  status(pageId){validId(pageId);if(!page(pageId))throw new AppError('NOT_FOUND','Página não encontrada.',404);return {token:tokenOf(pageId)};},
  set(pageId,{on,regenerate}){validId(pageId);if(!page(pageId))throw new AppError('NOT_FOUND','Página não encontrada.',404);
   const map={...read()};for(const t of Object.keys(map))if(map[t]&&map[t].page===pageId&&(!on||regenerate))delete map[t];
   let token=Object.keys(map).find(t=>map[t].page===pageId)||null;
   if(on&&!token){token=crypto.randomBytes(32).toString('base64url');map[token]={page:pageId,at:new Date().toISOString()};}
   write(map);store.audit(on?'page.share.on':'page.share.off',pageId);return {token:on?token:null};},
  /** Paginas publicas (para o sinal na barra lateral). */
  list(){return Object.values(read()).map(x=>x.page);},
  resolve(token,subId){if(!TOKEN_RE.test(String(token||'')))return null;const entry=read()[token];if(!entry)return null;const root=page(entry.page);if(!root)return null;
   if(!subId)return {root,current:root};if(!/^[\w-]{1,80}$/.test(subId)||!inside(root.id,subId))return null;return {getAppearance,setAppearance,root,current:page(subId)};},
  attachmentAllowed(token,attId){const r=this.resolve(token);if(!r||!/^[\w-]{1,80}$/.test(attId))return false;let a;try{a=workspace.attachment(attId);}catch{return false;}
   if(!inside(r.root.id,a.entity_id))return false;const owner=page(a.entity_id);if(!owner)return false;const d=owner.data||{};
   return d.cover_attachment_id===attId||String(d.blocks_json||'').includes(attId);},
  children,
 };
}

// ---------- pagina publica (HTML do servidor, sem script) ----------
function richHtml(html){
 // so as marcas do editor: negrito, italico, sublinhado, riscado, codigo, link http(s)/mailto, cor e quebra de linha
 const allowed={b:'b',strong:'b',i:'i',em:'i',u:'u',s:'s',strike:'s',del:'s',code:'code',a:'a',span:'span',mark:'mark',br:'br'};
 return String(html||'').replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g,(m,close,tag,attrs,text)=>{
  if(text!=null)return text.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const t=allowed[String(tag).toLowerCase()];if(!t)return '';if(t==='br')return '<br>';if(close)return '</'+t+'>';
  if(t==='a'){const h=/href\s*=\s*"([^"]*)"/i.exec(attrs||'');const href=h?h[1].replace(/&amp;/g,'&'):'';return /^(https?:|mailto:)/i.test(href)?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer nofollow">':'<a>';}
  if(t==='span'||t==='mark'){const st=/style\s*=\s*"([^"]*)"/i.exec(attrs||'');let css='';if(st){for(const part of st[1].split(';')){const [k,v]=part.split(':').map(x=>String(x||'').trim().toLowerCase());if((k==='color'||k==='background-color')&&SAFE_COLOR.test(v))css+=k+':'+v+';';}}return '<'+t+(css?' style="'+esc(css)+'"':'')+'>';}
  return '<'+t+'>';});
}
function plainWithLinks(text){return esc(text).replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g,u=>'<a href="'+u+'" target="_blank" rel="noopener noreferrer nofollow">'+u+'</a>').replace(/\n/g,'<br>');}
function textOf(b){return b.html?richHtml(b.html):plainWithLinks(b.text);}
function leafHtml(leaf){
 const blocks=Array.isArray(leaf.blocks)&&leaf.blocks.length?leaf.blocks:[{type:'text',text:leaf.content||''}];
 return blocks.map(b=>{const t=plainWithLinks(b.text||'');if(b.type==='divider')return '<hr>';if(/^heading/.test(b.type))return '<h4>'+t+'</h4>';if(b.type==='todo'||b.type==='check')return '<p class="todo">'+(b.checked?'☑':'☐')+' '+t+'</p>';if(b.type==='bullet')return '<p>• '+t+'</p>';return t?'<p>'+t+'</p>':'';}).join('');
}
function collectionHtml(data){
 if(data.mode==='notebooks'&&Array.isArray(data.notebooks)){
  const books=data.notebooks;const out=['<div class="notes">'+(data.title?'<h3>'+esc(data.title)+'</h3>':'')];
  for(const bk of books){const pages=Array.isArray(bk.pages)?bk.pages:[];if(!pages.length)continue;out.push('<details open><summary>'+esc((bk.root?'📝 Fora de pastas':(bk.emoji||'📁')+' '+(bk.name||'Sem título')))+' <small>'+pages.length+'</small></summary>');
   for(const p of pages)out.push('<details class="note"><summary>'+esc(p.title||'Sem título')+'</summary><div class="note-body">'+leafHtml(p)+'</div></details>');out.push('</details>');}
  out.push('</div>');return out.join('');
 }
 const props=Array.isArray(data.properties)?data.properties:[],rows=Array.isArray(data.rows)?data.rows:[];if(!rows.length)return '';
 const cols=props.length?props:[{key:'name',label:'Nome'}];
 const cell=v=>Array.isArray(v)?esc(v.join(', ')):typeof v==='boolean'?(v?'☑':'☐'):plainWithLinks(v==null?'':String(v));
 return '<div class="table-wrap">'+(data.title&&data.show_title!==false?'<h3>'+esc(data.title)+'</h3>':'')+'<table><thead><tr>'+cols.map(c=>'<th>'+esc(c.label||c.key)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+cell((r.values||{})[c.key])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
/** 07/11/2026: tipo do arquivo pelo tipo/nome (mesma divisao do site). */
function fileKind(mime,name){const m=String(mime||''),n=String(name||'').toLowerCase();
 if(/^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(m))return 'image';if(m.startsWith('video/'))return 'video';if(m.startsWith('audio/'))return 'audio';
 if(m==='application/pdf'||n.endsWith('.pdf'))return 'pdf';
 if(/wordprocessingml|msword|opendocument\.text|rtf/.test(m)||/\.(docx?|odt|rtf)$/.test(n))return 'doc';
 if(/spreadsheetml|ms-excel|opendocument\.spreadsheet/.test(m)||/\.(xlsx?|ods)$/.test(n))return 'sheet';
 if(/presentationml|ms-powerpoint|opendocument\.presentation/.test(m)||/\.(pptx?|odp)$/.test(n))return 'slides';return 'other';}
const FILE_LABEL={pdf:'PDF',doc:'Documento',sheet:'Planilha',slides:'Apresentação',image:'Imagem',video:'Vídeo',audio:'Áudio',other:'Arquivo'};
const FILE_COLOR={pdf:'#E5484D',doc:'#3B82F6',sheet:'#16A34A',slides:'#EA8A23',image:'#D9534F',video:'#E5484D',audio:'#A855F7',other:'#8A8F98'};
function sizeText(n){n=Number(n)||0;if(!n)return '';if(n<1048576)return Math.max(1,Math.round(n/1024))+' KB';return (n/1048576).toFixed(1).replace('.',',')+' MB';}
function fileHtml(d,{fileUrl}){
 const id=String(d.attachment_id),k=fileKind(d.mime,d.name),name=String(d.name||'Arquivo'),office=k==='doc'||k==='sheet'||k==='slides';
 const view=(d.view||((k==='image'||k==='video'||k==='audio')?'preview':'attach'))==='preview',scale=Math.max(15,Math.min(100,Number(d.scale)||(k==='image'?70:100)));
 const open=fileUrl(id)+(office?'?as=pdf':''),dl=fileUrl(id)+'?dl=1';
 const row='<a class="file-row" href="'+esc(k==='other'?dl:open)+'" target="_blank" rel="noopener"><span class="file-ico" style="background:'+FILE_COLOR[k]+'22;color:'+FILE_COLOR[k]+'">'+esc((name.split('.').pop()||'').slice(0,4).toUpperCase()||'ARQ')+'</span><span class="file-txt"><b>'+esc(name)+'</b><small>'+esc([FILE_LABEL[k],sizeText(d.size)].filter(Boolean).join(' · '))+'</small></span><span class="file-dl" title="Baixar">⬇</span></a>';
 if(!view)return row.replace('<span class="file-dl" title="Baixar">⬇</span>','')+'<div class="file-actions"><a href="'+esc(dl)+'">Baixar</a></div>';
 if(k==='image')return '<figure style="width:'+scale+'%"><img src="'+esc(fileUrl(id))+'" alt="'+esc(name)+'" loading="lazy"></figure>';
 if(k==='video')return '<figure style="width:'+scale+'%"><video controls preload="metadata" src="'+esc(fileUrl(id))+'"></video><figcaption>'+esc(name)+'</figcaption></figure>';
 if(k==='audio')return '<figure><audio controls preload="metadata" src="'+esc(fileUrl(id))+'"></audio><figcaption>'+esc(name)+'</figcaption></figure>';
 if(k==='pdf'||office)return '<figure style="width:'+scale+'%"><iframe class="file-frame" src="'+esc(open)+'" title="'+esc(name)+'"></iframe><figcaption><a href="'+esc(open)+'" target="_blank" rel="noopener">Abrir em tela cheia</a> · <a href="'+esc(dl)+'">Baixar</a></figcaption></figure>';
 return row;
}
function blocksHtml(blocks,ctx){const {token,linkable,imgUrl}=ctx;
 const out=[];let list=null;
 const closeList=()=>{if(list){out.push('</'+list+'>');list=null;}};
 for(const b of blocks){
  const type=String(b.type||'text');
  if(type==='bullet'||type==='number'){const tag=type==='bullet'?'ul':'ol';if(list!==tag){closeList();out.push('<'+tag+'>');list=tag;}out.push('<li>'+textOf(b)+'</li>');continue;}
  closeList();
  if(type==='heading1')out.push('<h1>'+textOf(b)+'</h1>');
  else if(type==='heading2')out.push('<h2>'+textOf(b)+'</h2>');
  else if(type==='heading3')out.push('<h3>'+textOf(b)+'</h3>');
  else if(type==='todo')out.push('<p class="todo">'+(b.checked?'<span class="box on">✓</span>':'<span class="box"></span>')+'<span'+(b.checked?' class="done"':'')+'>'+textOf(b)+'</span></p>');
  else if(type==='quote')out.push('<blockquote>'+textOf(b)+'</blockquote>');
  else if(type==='callout')out.push('<div class="callout"><span>'+esc((b.data&&b.data.icon)||'💡')+'</span><div>'+textOf(b)+'</div></div>');
  else if(type==='code')out.push('<pre><code>'+esc(b.text)+'</code></pre>');
  else if(type==='divider')out.push('<hr>');
  else if(type==='file'&&b.data&&b.data.attachment_id)out.push(fileHtml(b.data,ctx)); /* 07/11/2026 (Pedro): arquivos da pagina aparecem para quem recebe o link */
  else if(type==='image'&&b.data&&b.data.attachment_id)out.push('<figure><img src="'+esc(imgUrl(String(b.data.attachment_id)))+'" alt="'+esc(b.data.caption||'')+'" loading="lazy">'+(b.data.caption?'<figcaption>'+esc(b.data.caption)+'</figcaption>':'')+'</figure>');
  else if(type==='page_link'&&b.data&&b.data.page_id){const l=linkable(String(b.data.page_id));if(l)out.push('<a class="page-link" href="'+esc(l.href)+'">'+esc(l.icon)+' <span>'+esc(l.title)+'</span></a>');}
  else if(type==='collection'&&b.data)out.push(collectionHtml(b.data));
  else if(type==='text'){const t=textOf(b);out.push(t?'<p>'+t+'</p>':'<p class="empty"></p>');}
 }
 closeList();return out.join('\n');
}
const PALETTE={bg:'#131218',text:'#F2EEFA',muted:'#9A95A8',line:'#2A2833',soft:'#1D1B24',accent:'#B9A6FF'};
const LIGHT={bg:'#FFFFFF',text:'#1F1D24',muted:'#6E6A78',line:'#E7E4EC',soft:'#F6F4F9',accent:'#6B4FD8'};
/** 'dark' | 'light' | null (null = segue o sistema de quem abre). Por horario: conta no horario de Brasilia. */
function shareTheme(a,now=new Date()){
 if(!a)return null;if(a.appearance==='dark'||a.appearance==='light')return a.appearance;if(a.appearance!=='schedule')return null;
 const ok=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t),min=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
 const light=ok(a.lightAt)?min(a.lightAt):300,dark=ok(a.darkAt)?min(a.darkAt):1140;
 const hm=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now),cur=min(hm);
 return light<dark?(cur>=light&&cur<dark?'light':'dark'):(cur>=light||cur<dark?'light':'dark');
}
function renderSharedPage({root,current,shares,token}){
 const base='/p/'+encodeURIComponent(token);
 const href=id=>id===root.id?base:base+'/'+encodeURIComponent(id);
 const imgUrl=att=>base+'/img/'+encodeURIComponent(att),fileUrl=att=>base+'/file/'+encodeURIComponent(att);
 const isEmoji=v=>v&&!/^[a-z0-9_-]+$/i.test(String(v));
 const pageIcon=e=>isEmoji(e.data&&e.data.icon)?String(e.data.icon):'📄';
 const linkable=id=>{const r=shares.resolve(token,id===root.id?undefined:id);if(!r||!r.current)return null;return {href:href(id),title:r.current.title||'Sem título',icon:pageIcon(r.current)};};
 let blocks=[];try{blocks=JSON.parse(String(current.data&&current.data.blocks_json||'[]'));}catch{blocks=[];}if(!Array.isArray(blocks))blocks=[];
 const linked=new Set(blocks.filter(b=>b&&b.type==='page_link').map(b=>String(b.data&&b.data.page_id||'')));
 const kids=shares.children(current.id).filter(k=>!linked.has(k.id));
 // caminho dentro do compartilhado (pagina compartilhada > ... > atual)
 const trail=[];let cur=current,guard=0;while(cur&&guard++<60){trail.unshift(cur);if(cur.id===root.id)break;const up=String(cur.data&&cur.data.parent_id||'');cur=up?shares.resolve(token,up===root.id?undefined:up)?.current:null;}
 const d=current.data||{},cover=d.cover_type==='attachment'&&d.cover_attachment_id?imgUrl(String(d.cover_attachment_id)):'';
 const rawPos=d.cover_position,pos=rawPos!==''&&rawPos!=null&&Number.isFinite(Number(rawPos))?Math.max(0,Math.min(100,Number(rawPos))):50;
 const icon=isEmoji(d.icon)?String(d.icon):'';
 const title=current.title||'Sem título';
 // sem a escolha ainda registrada (o app manda ao abrir), vale o padrao da Sofia: por horario, em Brasilia - nunca o tema de quem abre
 const theme=shareTheme((shares.getAppearance&&shares.getAppearance())||{appearance:'schedule'});
 const css=(p)=>`--bg:${p.bg};--text:${p.text};--muted:${p.muted};--line:${p.line};--soft:${p.soft};--accent:${p.accent};`;
 return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>${theme==='dark'?`:root{${css(PALETTE)}color-scheme:dark}`:theme==='light'?`:root{${css(LIGHT)}color-scheme:light}`:`:root{${css(PALETTE)}color-scheme:dark}@media (prefers-color-scheme:light){:root{${css(LIGHT)}color-scheme:light}}`}
*{box-sizing:border-box}/* 07/11/2026 (Pedro: "era pra ficar assim", print da pagina dentro da Sofia): mesma letra da Sofia */@font-face{font-family:SofiaSans;src:url(/assets/fonts/SofiaSans-Regular.woff2) format("woff2");font-weight:400;font-display:swap}@font-face{font-family:SofiaSans;src:url(/assets/fonts/SofiaSans-SemiBold.woff2) format("woff2");font-weight:600;font-display:swap}@font-face{font-family:SofiaSans;src:url(/assets/fonts/SofiaSans-Bold.woff2) format("woff2");font-weight:700;font-display:swap}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 SofiaSans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:6px;padding:10px 16px;font-size:13px;color:var(--muted);background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);overflow-x:auto;white-space:nowrap}
.top a{color:var(--muted);text-decoration:none}.top a:hover{color:var(--text)}.top .sep{opacity:.5}
.cover{position:relative;height:30vh;min-height:160px;max-height:280px;background:var(--soft);overflow:hidden}
/* 06/11/2026 (Pedro): roda de carregamento primeiro e a foto entra depois, de proposito, para nao piscar */
.cover:before{content:"";position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--muted);animation:spin .8s linear infinite}
.cover img{position:relative;width:100%;height:100%;object-fit:cover;object-position:50% ${pos}%;display:block;opacity:0;animation:reveal .25s ease-out .5s forwards}
figure img{opacity:0;animation:reveal .25s ease-out .35s forwards}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes reveal{to{opacity:1}}
@media (prefers-reduced-motion:reduce){.cover:before{animation:none}.cover img,figure img{animation:none;opacity:1}}
main{max-width:960px;margin:0 auto;padding:0 48px 96px}.icon{font-size:64px;line-height:1;margin-top:${cover?'-36px':'48px'};position:relative}
h1.title{font-size:40px;line-height:1.2;margin:${icon?'16px':cover?'40px':'72px'} 0 18px;font-weight:700;letter-spacing:-.01em}
h1,h2,h3,h4{line-height:1.3}main h1{font-size:30px;margin:28px 0 6px}main h2{font-size:24px;margin:24px 0 4px}main h3{font-size:20px;margin:20px 0 4px}
p{margin:3px 0;min-height:1.65em;overflow-wrap:anywhere}p.empty{min-height:1.2em}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline;text-decoration-color:var(--muted);text-underline-offset:2px} /* como na Sofia: endereco como texto, sublinha so ao passar o mouse */
ul,ol{margin:4px 0;padding-left:26px}li{margin:2px 0}blockquote{margin:8px 0;padding:2px 14px;border-left:3px solid var(--text)}
.callout{display:flex;gap:10px;margin:8px 0;padding:14px 16px;border-radius:8px;background:var(--soft)}pre{background:var(--soft);padding:14px 16px;border-radius:8px;overflow:auto;font-size:14px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:88%;background:var(--soft);padding:1px 5px;border-radius:4px}pre code{padding:0;background:none}
hr{border:0;border-top:1px solid var(--line);margin:18px 0}figure{margin:12px 0}.file-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;text-decoration:none;color:inherit;margin:8px 0 2px}.file-row:hover{background:var(--soft)}.file-ico{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0}.file-txt{flex:1;min-width:0;display:flex;flex-direction:column}.file-txt b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.file-txt small{color:var(--muted)}.file-actions{font-size:12px;margin:0 0 10px 4px}.file-actions a{color:var(--muted)}.file-frame{width:100%;height:560px;border:0;border-radius:8px;background:#fff}figure video{width:100%;border-radius:8px;background:#000}figure audio{width:100%}figcaption a{color:var(--muted)}figure img{max-width:100%;border-radius:6px;display:block}figcaption{font-size:13px;color:var(--muted);margin-top:6px}
.todo{display:flex;gap:10px;align-items:flex-start}.box{flex:0 0 16px;height:16px;margin-top:5px;border:1.5px solid var(--muted);border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:11px}.box.on{background:var(--accent);border-color:var(--accent);color:var(--bg)}.done{text-decoration:line-through;color:var(--muted)}
.page-link{display:flex;align-items:center;gap:8px;margin:4px 0;padding:4px 6px;border-radius:6px;text-decoration:none;font-weight:600}.page-link span{text-decoration:underline;text-decoration-color:var(--line)}.page-link:hover{background:var(--soft)}
.subs{margin-top:28px;padding-top:14px;border-top:1px solid var(--line)}.subs .label{font-size:12px;color:var(--muted);margin-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}.table-wrap{overflow:auto;margin:12px 0}
details{margin:6px 0}summary{cursor:pointer;font-weight:600}summary small{color:var(--muted);font-weight:400}details.note{margin:4px 0 4px 18px;padding:6px 10px;border-radius:8px;background:var(--soft)}details.note summary{font-weight:500}.note-body{padding:6px 2px 2px}
footer{max-width:960px;margin:0 auto;padding:24px 48px;color:var(--muted);font-size:12px}
@media (max-width:600px){main{padding:0 16px 72px}footer{padding:24px 16px}h1.title{font-size:30px}.icon{font-size:48px}}
</style></head><body>
<nav class="top">${trail.map((t,i)=>(i?'<span class="sep">/</span>':'')+(t.id===current.id?'<span>'+esc(pageIcon(t))+' '+esc(t.title||'Sem título')+'</span>':'<a href="'+esc(href(t.id))+'">'+esc(pageIcon(t))+' '+esc(t.title||'Sem título')+'</a>')).join(' ')}</nav>
${cover?'<div class="cover"><img src="'+esc(cover)+'" alt=""></div>':''}
<main>${icon?'<div class="icon">'+esc(icon)+'</div>':''}<h1 class="title">${esc(title)}</h1>
${blocksHtml(blocks,{token,linkable,imgUrl,fileUrl})}
${kids.length?'<div class="subs"><div class="label">Subpáginas</div>'+kids.map(k=>'<a class="page-link" href="'+esc(href(k.id))+'">'+esc(pageIcon(k))+' <span>'+esc(k.title||'Sem título')+'</span></a>').join('')+'</div>':''}
</main><footer>Publicado com Sofia OS · somente leitura</footer></body></html>`;
}
const NOT_FOUND_PAGE=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Página indisponível</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#131218;color:#F2EEFA;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}p{color:#9A95A8}</style></head><body><div><h1>Página indisponível</h1><p>Este link não existe ou o compartilhamento foi desligado.</p></div></body></html>`;

/** Rotas publicas /p/<codigo>, /p/<codigo>/<subpagina> e /p/<codigo>/img/<anexo>. Devolve true se respondeu. */
async function servePublicPage(req,res,p,m,{shares,workspace,google}){
 if(m!=='GET'&&m!=='HEAD')return false;const match=p.match(/^\/p\/([A-Za-z0-9_-]+)(?:\/(img|file)\/([\w-]+)|\/([\w-]+))?\/?$/);if(!match)return false;
 const [,token,kindPath,attId,subId]=match,isImg=kindPath==='img';
 if(kindPath==='file')return serveSharedFile(req,res,m,token,attId,{shares,workspace,google});
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Frame-Options','DENY');
 if(isImg){
  if(!shares.attachmentAllowed(token,attId)){res.statusCode=404;res.setHeader('Cache-Control','no-store');res.end();return true;}
  const a=workspace.attachment(attId);const bytes=google&&google.attachmentBytes?await google.attachmentBytes(a):Buffer.from(a.blob);
  const mime=/^image\/(png|jpe?g|gif|webp|avif)$/i.test(String(a.mime||''))?a.mime:'application/octet-stream';
  res.setHeader('Content-Type',mime);res.setHeader('Content-Disposition','inline');res.setHeader('Cache-Control','private, max-age=300');res.setHeader('Content-Length',String(bytes.length));res.end(m==='HEAD'?undefined:bytes);return true;
 }
 const r=shares.resolve(token,subId);
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; media-src 'self'; frame-src 'self'; font-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if(!r||!r.current){res.statusCode=404;res.end(NOT_FOUND_PAGE);return true;}
 res.statusCode=200;res.end(m==='HEAD'?undefined:renderSharedPage({root:r.root,current:r.current,shares,token}));return true;
}
/** 07/11/2026: arquivo de pagina compartilhada (video/audio com avanço, PDF e Office em quadro, download). So os da pagina. */
async function serveSharedFile(req,res,m,token,attId,{shares,workspace,google}){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!shares.attachmentAllowed(token,attId)){res.statusCode=404;res.setHeader('Cache-Control','no-store');res.end();return true;}
 const url=new URL(req.url,'http://x'),dl=url.searchParams.get('dl')==='1',pdf=url.searchParams.get('as')==='pdf';
 const a0=workspace.attachment(attId),a=pdf?{...a0,mime:'application/pdf',name:String(a0.name||'arquivo').replace(/\.[^.]+$/,'')+'.pdf'}:a0;
 const bytes=pdf?await google.attachmentPdf(a0):google&&google.attachmentBytes?await google.attachmentBytes(a0):Buffer.from(a0.blob||[]);
 const inline=!dl&&require('./workspace').inlineSafe(a.mime),total=bytes.length;
 res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',"frame-ancestors 'self'; object-src 'self'");res.setHeader('Cache-Control','private, max-age=300');res.setHeader('Accept-Ranges','bytes');
 res.setHeader('Content-Type',inline?a.mime:'application/octet-stream');res.setHeader('Content-Disposition',(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(a.name));
 let start=0,end=total-1;const r=/^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range||''));
 if(r&&total){if(r[1]==='')start=Math.max(0,total-Number(r[2]||0));else{start=Number(r[1]);if(r[2]!=='')end=Math.min(total-1,Number(r[2]));}
  if(start>end||start>=total){res.statusCode=416;res.setHeader('Content-Range','bytes */'+total);res.end();return true;}
  res.statusCode=206;res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+total);}else res.statusCode=200;
 res.setHeader('Content-Length',String(total?end-start+1:0));res.end(m==='HEAD'?undefined:bytes.subarray(start,end+1));return true;
}
module.exports={makePageShares,servePublicPage,renderSharedPage,richHtml,shareTheme};
