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
// ---------- 08/11/2026 (Pedro: "Compartilhado: quem recebe so olha, com zoom e mover"): Pagina Quadro so leitura ----------
// Cada bloco fica no lugar guardado em data.board {x,y,w,h,z,color,links}; os sem lugar vao numa coluna a esquerda.
// Zoom pela rodinha (no ponto do mouse), mover arrastando o fundo, "Ver tudo". O script vai com nonce (CSP so libera ele).
const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):d;};
const HEX=/^#[0-9a-f]{3,8}$/i;
function onBoardShared(b){if(b.data&&b.data.board)return true;const t=String(b.type||'text');if(t==='divider')return false;
 if(t==='text'||/^heading/.test(t)||t==='bullet'||t==='number')return !!String(b.text||'').trim();return true;}
function sizeShared(b){const t=String(b.type||'text'),d=b.data||{};
 if(t==='file'){const k=fileKind(d.mime,d.name),pv=(d.view||((k==='image'||k==='video'||k==='audio')?'preview':'attach'))==='preview';return !pv?{w:280,h:64}:k==='audio'?{w:320,h:70}:k==='image'||k==='video'?{w:320,h:240}:{w:280,h:360};}
 if(t==='image')return d.drawing?{w:num(d.drawing.w,200,8,20000),h:num(d.drawing.h,120,8,20000)}:{w:320,h:240};
 if(t==='page_link')return {w:300,h:220};if(t==='todo')return {w:260,h:180};if(t==='callout')return {w:240,h:150};if(/^heading/.test(t))return {w:420,h:60};return {w:300,h:90};}
function boardItemHtml(b,ctx){const t=String(b.type||'text'),d=b.data||{},g=d.board||{};
 if(t==='callout'){const bg=HEX.test(String(g.color||''))?g.color:'#2A2636';return '<div class="bi-note" style="background:'+bg+'">'+(textOf(b)||'<span class="bi-muted">Nota vazia</span>')+'</div>';}
 // 08/11/2026: link colado (cartao com previa) e item vivo do app (so o texto que ficou na pagina)
 if(t==='bookmark'&&d.link&&/^https?:\/\//i.test(String(d.link.url||''))){let host='';try{host=new URL(d.link.url).hostname;}catch{}return '<a class="bi-card" href="'+esc(d.link.url)+'" target="_blank" rel="noopener noreferrer"><b>'+esc(d.link.title||d.link.url)+'</b><span class="bi-muted">'+esc(d.link.site||host)+'</span></a>';}
 if(t==='bookmark'&&d.live)return '<div class="bi-card"><span class="bi-muted">'+esc(({event:'Compromisso',task:'Tarefa',note:'Nota',reminder:'Lembrete',list:'Lista',monitor:'Preço',mail:'E-mail',library:'Biblioteca'})[d.live.kind]||'Item')+'</span><b>'+esc(b.text||'')+'</b></div>';
 if(t==='todo'){const items=Array.isArray(d.items)?d.items:[{text:b.text,done:!!b.checked}];
  return '<div class="bi-card bi-list">'+items.map(i=>'<p class="todo">'+(i&&i.done?'<span class="box on">✓</span>':'<span class="box"></span>')+'<span'+(i&&i.done?' class="done"':'')+'>'+plainWithLinks(String(i&&i.text||''))+'</span></p>').join('')+'</div>';}
 if(t==='image'&&d.drawing){const dw=d.drawing,path=String(dw.d||'');if(!/^[ML0-9.\s-]*$/.test(path))return '';
  return '<svg class="bi-draw" viewBox="0 0 '+num(dw.w,200,1,20000)+' '+num(dw.h,100,1,20000)+'" preserveAspectRatio="none" role="img" aria-label="Desenho"><path d="'+esc(path)+'" fill="none" stroke="'+(HEX.test(String(dw.color||''))?dw.color:'#B9A6FF')+'" stroke-width="'+num(dw.width,3,0.5,40)+'" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';}
 if(t==='image')return d.attachment_id?'<img class="bi-img" src="'+esc(ctx.imgUrl(String(d.attachment_id)))+'" alt="'+esc(d.caption||'')+'" loading="lazy" draggable="false">':'';
 if(t==='file'&&d.attachment_id){const id=String(d.attachment_id),k=fileKind(d.mime,d.name),name=String(d.name||'Arquivo'),office=k==='doc'||k==='sheet'||k==='slides';
  const pv=(d.view||((k==='image'||k==='video'||k==='audio')?'preview':'attach'))==='preview',url=ctx.fileUrl(id),open=url+(office?'?as=pdf':''),dl=url+'?dl=1';
  if(pv&&k==='image')return '<img class="bi-img" src="'+esc(url)+'" alt="'+esc(name)+'" loading="lazy" draggable="false">';
  if(pv&&k==='video')return '<video class="bi-media" controls preload="metadata" src="'+esc(url)+'"></video>';
  if(pv&&k==='audio')return '<div class="bi-card bi-audio"><audio controls preload="metadata" src="'+esc(url)+'"></audio></div>';
  if(pv&&(k==='pdf'||office))return '<iframe class="bi-frame" src="'+esc(open)+'" title="'+esc(name)+'"></iframe>';
  return '<a class="file-row bi-file" href="'+esc(k==='other'?dl:open)+'" target="_blank" rel="noopener"><span class="file-ico" style="background:'+FILE_COLOR[k]+'22;color:'+FILE_COLOR[k]+'">'+esc((name.split('.').pop()||'').slice(0,4).toUpperCase()||'ARQ')+'</span><span class="file-txt"><b>'+esc(name)+'</b><small>'+esc([FILE_LABEL[k],sizeText(d.size)].filter(Boolean).join(' · '))+'</small></span></a>';}
 if(t==='page_link'&&d.page_id){const l=ctx.linkable(String(d.page_id));if(!l)return '';
  const lines=(ctx.pageLines&&ctx.pageLines(String(d.page_id)))||[];
  return '<a class="bi-card bi-page" href="'+esc(l.href)+'"><span class="bi-page-head">'+esc(l.icon)+' <b>'+esc(l.title)+'</b></span>'+(lines.length?lines.map(x=>'<span class="bi-line">'+esc(x)+'</span>').join(''):'<span class="bi-muted">Página vazia</span>')+'</a>';}
 if(t==='code')return '<pre class="bi-text"><code>'+esc(b.text)+'</code></pre>';
 return '<div class="'+(/^heading/.test(t)?'bi-text bi-h':'bi-text')+'">'+textOf(b)+'</div>';}
function boardHtml(blocks,ctx){
 const shown=blocks.filter(b=>b&&typeof b==='object'&&onBoardShared(b));let col=0;const geo=new Map();
 for(const b of shown){const g=(b.data&&b.data.board)||null,s=sizeShared(b);
  if(g&&Number.isFinite(Number(g.x))&&Number.isFinite(Number(g.y)))geo.set(b.id,{x:num(g.x,0,-1e6,1e6),y:num(g.y,0,-1e6,1e6),w:num(g.w,s.w,8,20000),h:num(g.h,s.h,8,20000),z:num(g.z,0,-1e6,1e6),links:Array.isArray(g.links)?g.links.map(l=>l&&typeof l==='object'?{to:String(l.to||''),label:String(l.label||'').slice(0,120),arrow:!!l.arrow}:{to:String(l),label:'',arrow:false}):[],caption:String(g.caption||'').slice(0,300),mentions:Array.isArray(g.mentions)?g.mentions.slice(0,12).map(m=>String(m&&m.title||'').slice(0,120)).filter(Boolean):[]});
  else{geo.set(b.id,{x:-360,y:col,w:s.w,h:s.h,z:0,links:[],caption:'',mentions:[]});col+=s.h+24;}}
 // 08/11/2026: ligacao com seta (encosta na borda do destino) e texto no meio
 const edge=(ax,ay,r)=>{const cx=r.x+r.w/2,cy=r.y+r.h/2,dx=ax-cx,dy=ay-cy;if(!dx&&!dy)return [cx,cy];const k=Math.min(1,Math.abs((r.w/2+6)/(dx||1e-9)),Math.abs((r.h/2+6)/(dy||1e-9)));return [cx+dx*k,cy+dy*k];};
 const lines=['<defs><marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="arw"/></marker></defs>'];for(const b of shown){const a=geo.get(b.id);for(const l of a.links){const c=geo.get(l.to);if(!c)continue;const ax=a.x+a.w/2,ay=a.y+a.h/2,[ex,ey]=l.arrow?edge(ax,ay,c):[c.x+c.w/2,c.y+c.h/2];
  lines.push('<line x1="'+ax+'" y1="'+ay+'" x2="'+ex+'" y2="'+ey+'"'+(l.arrow?' marker-end="url(#arw)"':'')+'/>'+(l.label?'<text x="'+((ax+ex)/2)+'" y="'+((ay+ey)/2-6)+'" text-anchor="middle">'+esc(l.label)+'</text>':''));}}
 const items=shown.map(b=>{const g=geo.get(b.id),inner=boardItemHtml(b,ctx);if(!inner)return '';
  const under=g.caption||g.mentions.length?'<div class="bi-under">'+(g.caption?'<span class="bi-cap">'+esc(g.caption)+'</span>':'')+g.mentions.map(m=>'<span class="bi-at">@'+esc(m)+'</span>').join('')+'</div>':'';
  return '<div class="bi" data-type="'+esc(String(b.type||'text'))+'" style="left:'+g.x+'px;top:'+g.y+'px;width:'+g.w+'px;height:'+g.h+'px;z-index:'+Math.round(g.z)+'">'+inner+under+'</div>';}).filter(Boolean);
 return '<div id="board" class="board" tabindex="0" aria-label="Quadro (somente leitura). Rodinha: zoom; arrastar: mover"><div id="layer" class="layer"><svg class="links" width="1" height="1" aria-hidden="true">'+lines.join('')+'</svg>'+items.join('')+'</div>'+
  (items.length?'':'<div class="bi-empty">Quadro vazio</div>')+
  '<div class="zoombar" role="toolbar" aria-label="Zoom do quadro"><button type="button" id="zout" aria-label="Afastar">−</button><button type="button" id="zpct" aria-label="Voltar para 100%">100%</button><button type="button" id="zin" aria-label="Aproximar">+</button><button type="button" id="zfit">Ver tudo</button></div></div>';
}
const BOARD_CSS=`html,body{height:100%;overflow:hidden}.board{position:fixed;left:0;right:0;top:var(--top,45px);bottom:0;overflow:hidden;outline:none;cursor:grab;touch-action:none;background-color:var(--bg);background-image:none}.board.drag{cursor:grabbing}
.layer{position:absolute;left:0;top:0;transform-origin:0 0}.links{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}.links line{stroke:var(--muted);stroke-width:2}.links .arw{fill:var(--muted)}.links text{fill:currentColor;font-size:13px;paint-order:stroke;stroke:var(--bg);stroke-width:4px}.bi>.bi-under{position:absolute;left:0;top:100%;height:auto;margin-top:6px;display:flex;flex-wrap:wrap;gap:4px}.bi-cap{width:100%;color:var(--muted);font-size:12px}.bi-at{border-radius:6px;padding:2px 7px;background:var(--soft);color:var(--muted);font-size:12px;font-weight:600}
.bi{position:absolute;box-sizing:border-box}.bi>*{width:100%;height:100%;box-sizing:border-box}.bi-note{padding:14px;border-radius:12px;border:1px solid var(--line);font-size:14px;line-height:1.45;overflow:auto;color:#F2EEFA}.bi-text{padding:6px;font-size:18px;line-height:1.45;overflow:auto;margin:0;white-space:pre-wrap}.bi-h{font-size:28px;font-weight:700}
.bi-card{display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:12px;background:var(--soft);border:1px solid var(--line);overflow:hidden;color:inherit;text-decoration:none}.bi-list .todo{margin:0}.bi-audio{justify-content:center}.bi-audio audio{width:100%}
.bi-img{display:block;object-fit:cover;border-radius:6px;user-select:none;-webkit-user-drag:none}.bi-media{display:block;background:#000;border-radius:8px}.bi-frame{border:0;border-radius:8px;background:#fff}.bi-draw{overflow:visible}.bi-file{margin:0}
.bi-page-head{display:flex;gap:6px;align-items:center;padding-bottom:6px;border-bottom:1px solid var(--line)}.bi-line{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bi-muted{color:var(--muted);font-size:12px}.bi-empty{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);color:var(--muted)}
.zoombar{position:absolute;left:16px;bottom:20px;display:flex;gap:2px;padding:4px 6px;border-radius:12px;background:var(--soft);border:1px solid var(--line);box-shadow:0 10px 24px rgba(0,0,0,.25)}.zoombar button{min-width:34px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--text);font:600 14px SofiaSans,system-ui,sans-serif;cursor:pointer}.zoombar button:hover{background:var(--line)}#zpct{min-width:56px;font-size:13px}#zfit{font-size:12px;color:var(--muted)}`;
const BOARD_JS=`(function(){var b=document.getElementById('board'),L=document.getElementById('layer'),P=document.getElementById('zpct'),nav=document.querySelector('.top');if(!b)return;
if(nav)b.style.setProperty('--top',nav.offsetHeight+'px');var v={x:80,y:60,z:1};
function ap(){L.style.transform='translate('+v.x+'px,'+v.y+'px) scale('+v.z+')';/* 08/11/2026: grade de quadrados discreta, igual ao quadro do site */var S=24*v.z,B=S*5,lm='rgba(255,255,255,0.05)',ln='rgba(255,255,255,0.028)',L4=['linear-gradient(to right,'+lm+' 1px,transparent 1px)','linear-gradient(to bottom,'+lm+' 1px,transparent 1px)'],Z4=[B+'px '+B+'px',B+'px '+B+'px'];if(S>=9){L4.push('linear-gradient(to right,'+ln+' 1px,transparent 1px)','linear-gradient(to bottom,'+ln+' 1px,transparent 1px)');Z4.push(S+'px '+S+'px',S+'px '+S+'px');}b.style.backgroundImage=L4.join(',');b.style.backgroundSize=Z4.join(',');b.style.backgroundPosition=L4.map(function(){return v.x+'px '+v.y+'px';}).join(',');P.textContent=Math.round(v.z*100)+'%';}
function zoomAt(k,mx,my){var z=Math.min(4,Math.max(0.1,v.z*k));v.x=mx-(mx-v.x)*(z/v.z);v.y=my-(my-v.y)*(z/v.z);v.z=z;ap();}
function fit(){var it=L.querySelectorAll('.bi');if(!it.length){ap();return;}var x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;for(var i=0;i<it.length;i++){var s=it[i].style,x=parseFloat(s.left),y=parseFloat(s.top),w=parseFloat(s.width),h=parseFloat(s.height);x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x+w);y2=Math.max(y2,y+h);}
var W=b.clientWidth,H=b.clientHeight,z=Math.min(0.6,Math.max(0.1,Math.min((W-80)/Math.max(1,x2-x1),(H-120)/Math.max(1,y2-y1))));v.z=z;v.x=(W-(x2-x1)*z)/2-x1*z;v.y=(H-60-(y2-y1)*z)/2-y1*z;ap();}
b.addEventListener('wheel',function(e){if(e.target.closest&&e.target.closest('iframe,video,audio'))return;e.preventDefault();var r=b.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*(e.ctrlKey?0.01:0.0015)),e.clientX-r.left,e.clientY-r.top);},{passive:false});
b.addEventListener('pointerdown',function(e){if(e.button!==0&&e.button!==1)return;if(e.target.closest('a,button,video,audio,iframe,.zoombar'))return;var sx=e.clientX,sy=e.clientY,x0=v.x,y0=v.y;b.classList.add('drag');
function mv(ev){v.x=x0+ev.clientX-sx;v.y=y0+ev.clientY-sy;ap();}function up(){b.classList.remove('drag');removeEventListener('pointermove',mv);removeEventListener('pointerup',up);}addEventListener('pointermove',mv);addEventListener('pointerup',up);});
var pts={};b.addEventListener('touchstart',function(e){if(e.touches.length===2){pts.d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
b.addEventListener('touchmove',function(e){if(e.touches.length===2&&pts.d){e.preventDefault();var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY),r=b.getBoundingClientRect();zoomAt(d/pts.d,(e.touches[0].clientX+e.touches[1].clientX)/2-r.left,(e.touches[0].clientY+e.touches[1].clientY)/2-r.top);pts.d=d;}},{passive:false});
document.getElementById('zin').onclick=function(){zoomAt(1.25,b.clientWidth/2,b.clientHeight/2);};document.getElementById('zout').onclick=function(){zoomAt(0.8,b.clientWidth/2,b.clientHeight/2);};
P.onclick=function(){zoomAt(1/v.z,b.clientWidth/2,b.clientHeight/2);};document.getElementById('zfit').onclick=fit;fit();})();`;
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
function renderSharedPage({root,current,shares,token,nonce}){
 const base='/p/'+encodeURIComponent(token);
 const href=id=>id===root.id?base:base+'/'+encodeURIComponent(id);
 const imgUrl=att=>base+'/img/'+encodeURIComponent(att),fileUrl=att=>base+'/file/'+encodeURIComponent(att);
 const isEmoji=v=>v&&!/^[a-z0-9_-]+$/i.test(String(v));
 const pageIcon=e=>isEmoji(e.data&&e.data.icon)?String(e.data.icon):'📄';
 const linkable=id=>{const r=shares.resolve(token,id===root.id?undefined:id);if(!r||!r.current)return null;return {href:href(id),title:r.current.title||'Sem título',icon:pageIcon(r.current)};};
 const pageLines=id=>{const r=shares.resolve(token,id===root.id?undefined:id);if(!r||!r.current)return [];let bs=[];try{bs=JSON.parse(String(r.current.data&&r.current.data.blocks_json||'[]'));}catch{bs=[];}return (Array.isArray(bs)?bs:[]).map(x=>String((x&&(x.text||(x.data&&x.data.name)))||'').trim()).filter(Boolean).slice(0,8);};
 let blocks=[];try{blocks=JSON.parse(String(current.data&&current.data.blocks_json||'[]'));}catch{blocks=[];}if(!Array.isArray(blocks))blocks=[];
 const linked=new Set(blocks.filter(b=>b&&b.type==='page_link').map(b=>String(b.data&&b.data.page_id||'')));
 const kids=shares.children(current.id).filter(k=>!linked.has(k.id));
 // caminho dentro do compartilhado (pagina compartilhada > ... > atual)
 const trail=[];let cur=current,guard=0;while(cur&&guard++<60){trail.unshift(cur);if(cur.id===root.id)break;const up=String(cur.data&&cur.data.parent_id||'');cur=up?shares.resolve(token,up===root.id?undefined:up)?.current:null;}
 const d=current.data||{},cover=d.cover_type==='attachment'&&d.cover_attachment_id?imgUrl(String(d.cover_attachment_id)):'';
 const rawPos=d.cover_position,pos=rawPos!==''&&rawPos!=null&&Number.isFinite(Number(rawPos))?Math.max(0,Math.min(100,Number(rawPos))):50;
 const icon=isEmoji(d.icon)?String(d.icon):'';
 const title=current.title||'Sem título';
 const isBoard=d.layout==='board'&&!!nonce; // Pagina Quadro: so leitura com zoom e mover (precisa do nonce do script)
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
${isBoard?BOARD_CSS:''}
</style></head><body>
<nav class="top">${trail.map((t,i)=>(i?'<span class="sep">/</span>':'')+(t.id===current.id?'<span>'+esc(pageIcon(t))+' '+esc(t.title||'Sem título')+'</span>':'<a href="'+esc(href(t.id))+'">'+esc(pageIcon(t))+' '+esc(t.title||'Sem título')+'</a>')).join(' ')}</nav>
${isBoard?boardHtml(blocks,{token,linkable,imgUrl,fileUrl,pageLines})+'<script nonce="'+esc(nonce)+'">'+BOARD_JS+'</script></body></html>':`${cover?'<div class="cover"><img src="'+esc(cover)+'" alt=""></div>':''}
<main>${icon?'<div class="icon">'+esc(icon)+'</div>':''}<h1 class="title">${esc(title)}</h1>
${blocksHtml(blocks,{token,linkable,imgUrl,fileUrl})}
${kids.length?'<div class="subs"><div class="label">Subpáginas</div>'+kids.map(k=>'<a class="page-link" href="'+esc(href(k.id))+'">'+esc(pageIcon(k))+' <span>'+esc(k.title||'Sem título')+'</span></a>').join('')+'</div>':''}
</main><footer>Publicado com Sofia OS · somente leitura</footer></body></html>`}`;
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
 const nonce=crypto.randomBytes(16).toString('base64');
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; media-src 'self'; frame-src 'self'; font-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-"+nonce+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if(!r||!r.current){res.statusCode=404;res.end(NOT_FOUND_PAGE);return true;}
 res.statusCode=200;res.end(m==='HEAD'?undefined:renderSharedPage({root:r.root,current:r.current,shares,token,nonce}));return true;
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
module.exports={makePageShares,servePublicPage,renderSharedPage,richHtml,shareTheme,boardHtml};
