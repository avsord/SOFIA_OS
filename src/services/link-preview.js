'use strict';
// 0.3.269 (Listas e Biblioteca): ler um link colado - titulo, imagem, site e preco - para criar o item ja preenchido.
// So https/http publico (sem rede local), ate 3 redirecionamentos, 1,5 MB, 8 s. Site que nao deixa ler devolve so o link.
const https=require('node:https'),http=require('node:http'),dns=require('node:dns').promises,net=require('node:net');
const {publicIP}=require('./safe-feed');
const STORES={'mercadolivre.com.br':'Mercado Livre','produto.mercadolivre.com.br':'Mercado Livre','kabum.com.br':'KaBuM!','amazon.com.br':'Amazon','pichau.com.br':'Pichau','shopee.com.br':'Shopee','aliexpress.com':'AliExpress','pt.aliexpress.com':'AliExpress','magazineluiza.com.br':'Magalu','youtube.com':'YouTube','youtu.be':'YouTube','imdb.com':'IMDb','netflix.com':'Netflix','letterboxd.com':'Letterboxd','amazon.com':'Amazon','americanas.com.br':'Americanas','casasbahia.com.br':'Casas Bahia','terabyteshop.com.br':'Terabyte'};
function host(u){try{return new URL(u).hostname.replace(/^www\./,'').replace(/^m\./,'');}catch{return '';}}
function siteName(u){const h=host(u);return STORES[h]||(h?h.split('.').slice(-3,-2)[0]||h.split('.')[0]:'').replace(/^./,c=>c.toUpperCase());}
function decode(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/\s+/g,' ').trim();}
function meta(html,names){for(const n of names){const re=new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']'+n.replace(/[:.]/g,'\\$&')+'["\'][^>]*>','i');const m=html.match(re);if(m){const c=m[0].match(/content=["']([^"']*)["']/i);if(c&&c[1].trim())return decode(c[1]);}
 const re2=new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name|itemprop)=["\']'+n.replace(/[:.]/g,'\\$&')+'["\']','i');const m2=html.match(re2);if(m2&&m2[1].trim())return decode(m2[1]);}return '';}
function priceFrom(html){
 const direct=meta(html,['product:price:amount','og:price:amount','price']);if(direct&&/^\d/.test(direct))return Number(direct.replace(',','.'));
 for(const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)){try{const walk=o=>{if(!o||typeof o!=='object')return null;if(Array.isArray(o)){for(const x of o){const v=walk(x);if(v!=null)return v;}return null;}const off=o.offers;if(off){const list=Array.isArray(off)?off:[off];for(const x of list){const p=Number(String(x.price??x.lowPrice??'').replace(',','.'));if(Number.isFinite(p)&&p>0)return p;}}for(const k of ['@graph','mainEntity','itemListElement']){const v=walk(o[k]);if(v!=null)return v;}return null;};const v=walk(JSON.parse(m[1]));if(v!=null)return v;}catch{/* json invalido */}}
 return null;
}
function slugTitle(u){try{const url=new URL(u);const parts=url.pathname.split('/').filter(Boolean).filter(p=>!/^(p|dp|produto|item|gp|product)$/i.test(p));let s=decodeURIComponent(parts.sort((a,b)=>b.length-a.length)[0]||'');s=s.replace(/\.(html?|php|aspx?)$/,'').replace(/MLB-?\d+/i,'').replace(/[-_]+/g,' ').replace(/\b[a-z0-9]{10,}\b/gi,'').trim();if(s.length<4)return '';return s.charAt(0).toUpperCase()+s.slice(1);}catch{return '';}}
async function fetchHtml(address,{resolve=dns.lookup,hops=0}={}){
 let u;try{u=new URL(address);}catch{throw Object.assign(new Error('Link inválido.'),{code:'LINK_URL'});}
 if(!/^https?:$/.test(u.protocol)||u.username||u.password||net.isIP(u.hostname)||u.hostname==='localhost'||/\.(?:localhost|local|internal|test)$/i.test(u.hostname))throw Object.assign(new Error('Esse link não pode ser lido.'),{code:'LINK_BLOCKED'});
 const addresses=await resolve(u.hostname,{all:true,verbatim:true}).catch(()=>[]);
 if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw Object.assign(new Error('Esse link não pode ser lido.'),{code:'LINK_PRIVATE'});
 const chosen=addresses[0],lib=u.protocol==='https:'?https:http;
 return new Promise((ok,bad)=>{
  let total=0,done=false;const chunks=[];const finish=(e,v)=>{if(done)return;done=true;e?bad(e):ok(v);};
  const req=lib.get(u,{timeout:8000,headers:{'User-Agent':'Mozilla/5.0 (compatible; SofiaOS-LinkPreview/1.0)','Accept':'text/html,application/xhtml+xml','Accept-Language':'pt-BR,pt;q=0.9'},lookup:(h,o,cb)=>o?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)},res=>{
   if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location&&hops<3){res.resume();finish(null,fetchHtml(new URL(res.headers.location,u).toString(),{resolve,hops:hops+1}));return;}
   if(res.statusCode!==200){res.resume();return finish(Object.assign(new Error('O site respondeu '+res.statusCode+'.'),{code:'LINK_HTTP'}));}
   if(!/html/i.test(res.headers['content-type']||'')){res.resume();return finish(null,{url:u.toString(),html:'',type:String(res.headers['content-type']||'')});}
   res.on('data',b=>{total+=b.length;if(total>1.5*1024*1024){req.destroy();return finish(null,{url:u.toString(),html:Buffer.concat(chunks).toString('utf8')});}chunks.push(b);});
   res.on('end',()=>finish(null,{url:u.toString(),html:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',()=>finish(Object.assign(new Error('Não foi possível abrir o link.'),{code:'LINK_CONNECTION'})));
 });
}
/** Nunca falha: sem leitura, devolve titulo pelo endereco e o nome do site (o item e salvo com o link). */
async function linkPreview(address,opts={}){
 const base={url:String(address||''),title:'',site:siteName(address),image:'',price:null,description:'',read:false};
 try{
  const r=await fetchHtml(address,opts);const html=r.html||'';
  const title=meta(html,['og:title','twitter:title'])||decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const image=meta(html,['og:image','og:image:url','twitter:image']);
  return {...base,url:r.url||base.url,title:(title||slugTitle(address)).slice(0,200),site:meta(html,['og:site_name'])||base.site,image:/^https?:\/\//.test(image)?image:'',price:priceFrom(html),description:meta(html,['og:description','description']).slice(0,400),type:meta(html,['og:type']),read:!!title};
 }catch{return {...base,title:slugTitle(address)};}
}
module.exports={linkPreview,priceFrom,slugTitle,siteName,host};
