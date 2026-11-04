/* 04/11/2026 (Pedro: "se conseguir, as paginas ja abertas antes de tudo, por baixo do fundo"): pede a lista de Paginas da
 * barra lateral enquanto o codigo do site ainda baixa. O app (api.ts) usa esta resposta em vez de pedir de novo; se ela
 * falhar ou o login tiver vencido, o app pede do jeito normal. So no computador e com sessao salva neste navegador. */
(function(){try{
 if(window.innerWidth<900)return;
 var a=JSON.parse(localStorage.getItem('sofia.secure.sofia.native.session.v1')||'null');
 if(!a||typeof a.token!=='string')return;
 // a lista e o "capabilities" (a ordem das paginas depende dele antes de a lista aparecer)
 window.__sofiaEarly={};
 ['/workspace/entities?limit=100&kind=user_page&q=&offset=0','/md/capabilities'].forEach(function(p){
  window.__sofiaEarly[p]=fetch('/api/mobile'+p,{headers:{Accept:'application/json',Authorization:'Bearer '+a.token},redirect:'error'})
   .then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});
 });
}catch(e){}})();
