'use strict';
// 0.3.269 (Biblioteca): ao digitar um nome, busca em catalogos publicos e gratuitos (sem chave): filmes e series no
// iTunes (com poster), series no TVmaze e livros no Open Library (com capa). Ate 3 resultados; falha = lista vazia.
const https=require('node:https');
function getJson(url,timeout=6000){return new Promise(ok=>{const req=https.get(url,{timeout,headers:{'User-Agent':'SofiaOS/1.0 (library search)','Accept':'application/json'}},res=>{if(res.statusCode!==200){res.resume();return ok(null);}let t='',n=0;res.setEncoding('utf8');res.on('data',d=>{n+=d.length;if(n>2e6){req.destroy();return ok(null);}t+=d;});res.on('end',()=>{try{ok(JSON.parse(t));}catch{ok(null);}});});req.on('timeout',()=>req.destroy());req.on('error',()=>ok(null));});}
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const big=u=>String(u||'').replace(/\/\d+x\d+bb\./,'/600x600bb.');
async function films(q){const r=await getJson('https://itunes.apple.com/search?country=br&lang=pt_br&media=movie&entity=movie&limit=4&term='+encodeURIComponent(q));return (r?.results||[]).map(x=>({type:'film',title:x.trackName,year:Number(String(x.releaseDate||'').slice(0,4))||null,creator:x.artistName||'',cover:big(x.artworkUrl100),genre:x.primaryGenreName||'',source:'iTunes'}));}
async function series(q){const r=await getJson('https://api.tvmaze.com/search/shows?q='+encodeURIComponent(q));return (Array.isArray(r)?r:[]).slice(0,4).map(x=>x.show).map(s=>({type:'series',title:s.name,year:Number(String(s.premiered||'').slice(0,4))||null,creator:(s.network?.name||s.webChannel?.name||''),cover:s.image?.medium||s.image?.original||'',genre:(s.genres||[])[0]||'',source:'TVmaze'}));}
async function books(q){const r=await getJson('https://openlibrary.org/search.json?limit=4&fields=title,author_name,first_publish_year,cover_i,subject&q='+encodeURIComponent(q));return (r?.docs||[]).map(d=>({type:'book',title:d.title,year:d.first_publish_year||null,creator:(d.author_name||[])[0]||'',cover:d.cover_i?'https://covers.openlibrary.org/b/id/'+d.cover_i+'-M.jpg':'',genre:'',source:'Open Library'}));}
/** Mistura os catalogos: o titulo mais parecido primeiro, sem repetir o mesmo titulo do mesmo tipo. */
async function librarySearch(query,{prefer=''}={}){
 const q=String(query||'').trim().slice(0,120);if(q.length<2)return [];
 const [f,s,b]=await Promise.all([films(q),series(q),books(q)]);
 const score=x=>{const t=fold(x.title),k=fold(q);return (t===k?0:t.startsWith(k)?1:t.includes(k)?2:3)+(x.cover?0:0.5)+(prefer&&x.type===prefer?-1:0);};
 const seen=new Set(),out=[];
 for(const x of [...f.slice(0,2),...s.slice(0,2),...b.slice(0,2)].sort((a,b2)=>score(a)-score(b2))){const key=x.type+':'+fold(x.title);if(seen.has(key)||score(x)>=3)continue;seen.add(key);out.push(x);if(out.length===3)break;}
 return out;
}
module.exports={librarySearch};
