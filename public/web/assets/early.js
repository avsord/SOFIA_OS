/* 06/11/2026 (Pedro: "quando clico no voltar com o botao do mouse fica tudo preto"): no voltar/avancar o navegador
 * reaproveita a pagina guardada, que pode apontar para os arquivos do app de uma publicacao anterior (ja apagados).
 * Se um arquivo do app nao carregar, recarrega a pagina uma vez (no maximo 1 vez a cada 30 s) para pegar a versao atual. */
(function(){try{
 var KEY='sofia.reload.at';var again=function(){try{var last=+sessionStorage.getItem(KEY)||0;if(Date.now()-last<30000)return;sessionStorage.setItem(KEY,String(Date.now()));}catch(e){}location.reload();};
 window.addEventListener('error',function(e){var t=e&&e.target;if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')){var u=String(t.src||t.href||'');if(u.indexOf('/_expo/')>=0)again();}},true);
 window.addEventListener('unhandledrejection',function(e){var m=String(e&&e.reason&&(e.reason.message||e.reason)||'');if(/Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(m))again();});
 window.addEventListener('pageshow',function(e){var r=document.getElementById('root');if(e.persisted&&(!r||!r.children.length))again();});
}catch(e){}})();
/* 04/11/2026 (Pedro: "as paginas ja abertas antes de tudo" e "quando o texto parar, os blocos ja carregados"): pede a
 * lista de Paginas da barra lateral e as leituras dos blocos do Inicio enquanto o codigo do site ainda baixa. O app (api.ts) usa esta resposta em vez de pedir de novo; se ela
 * falhar ou o login tiver vencido, o app pede do jeito normal. So no computador e com sessao salva neste navegador. */
(function(){try{
 // a cor que cobre a tela na abertura e a do tema do app da ultima vez (escuro a noite), nao a do Windows: sem clarao
 try{var bg=localStorage.getItem('sofia.veil.bg');if(bg&&/^#[0-9a-fA-F]{3,8}$/.test(bg)){var v=document.getElementById('sofia-veil');if(v)v.style.background=bg;document.documentElement.style.background=bg;document.body.style.background=bg;}}catch(e){}
 if(window.innerWidth<900)return;
 var a=JSON.parse(localStorage.getItem('sofia.secure.sofia.native.session.v1')||'null');
 if(!a||typeof a.token!=='string')return;
 // a lista e o "capabilities" (a ordem das paginas depende dele antes de a lista aparecer)
 window.__sofiaEarly={};
 // + as leituras que o Inicio fez da ultima vez ate os blocos aparecerem (so os enderecos; api.ts saveEarlyPaths)
 // 06/11/2026 (Pedro: "minha foto esta aparecendo so depois"): a foto do perfil tambem sai junto com a pagina
 var paths=['/workspace/entities?limit=100&kind=user_page&q=&offset=0','/md/capabilities','/profile/photo'];
 try{var saved=JSON.parse(localStorage.getItem('sofia.early.paths.v1')||'[]');if(Array.isArray(saved))saved.slice(0,40).forEach(function(x){if(typeof x==='string'&&x.charAt(0)==='/'&&paths.indexOf(x)<0)paths.push(x);});}catch(e){}
 paths.forEach(function(p){
  window.__sofiaEarly[p]=fetch('/api/mobile'+p,{headers:{Accept:'application/json',Authorization:'Bearer '+a.token},redirect:'error'})
   .then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});
 });
 // a foto pronta fica a mao do avatar, que ja nasce com ela (sem as iniciais primeiro)
 window.__sofiaEarly['/profile/photo'].then(function(d){if(d&&d.photo&&/^image\/[a-z+.-]+$/.test(d.photo.mime))window.__sofiaPhoto='data:'+d.photo.mime+';base64,'+d.photo.base64;});
}catch(e){}})();
/* 07/11/2026 (Pedro: "abri la e continua na mesma"): depois de uma publicacao, a aba aberta continuava com a versao antiga ate
 * alguem recarregar na mao - as correcoes "nao chegavam". Ao voltar para a aba (e a cada 10 min com ela visivel), confere se
 * o site tem versao nova; se tiver e a pessoa nao estiver digitando nem arrastando, recarrega (no maximo 1 vez a cada 2 min). */
(function(){try{
 var sig=function(html){var m=String(html).match(/\/_expo\/static\/js\/web\/index-[0-9a-f]+\.js/);return m?m[0]:'';};
 var mine='';var own=function(){if(!mine){var el=document.querySelector('script[src*="/_expo/static/js/web/index-"]');mine=el?sig(el.getAttribute('src')):'';}return mine;}; /* lida na hora: este arquivo roda antes do resto da pagina */
 var busy=function(){var a=document.activeElement;if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.isContentEditable))return true;return !!(document.body&&document.body.style.cursor==='grabbing');};
 var KEY='sofia.version.reload.at',checking=false;
 var check=function(){if(checking||document.visibilityState!=='visible')return;checking=true;
  fetch('/inicio',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.text():'';}).then(function(html){checking=false;var now=sig(html),cur=own();if(!now||!cur||now===cur||busy())return;
   try{var last=+sessionStorage.getItem(KEY)||0;if(Date.now()-last<120000)return;sessionStorage.setItem(KEY,String(Date.now()));}catch(e){}location.reload();}).catch(function(){checking=false;});};
 document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);setInterval(check,600000);
}catch(e){}})();
