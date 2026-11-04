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
 var paths=['/workspace/entities?limit=100&kind=user_page&q=&offset=0','/md/capabilities'];
 try{var saved=JSON.parse(localStorage.getItem('sofia.early.paths.v1')||'[]');if(Array.isArray(saved))saved.slice(0,40).forEach(function(x){if(typeof x==='string'&&x.charAt(0)==='/'&&paths.indexOf(x)<0)paths.push(x);});}catch(e){}
 paths.forEach(function(p){
  window.__sofiaEarly[p]=fetch('/api/mobile'+p,{headers:{Accept:'application/json',Authorization:'Bearer '+a.token},redirect:'error'})
   .then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});
 });
}catch(e){}})();
