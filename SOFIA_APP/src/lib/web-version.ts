// 14/11/2026 (Pedro: "nao ta pulsando na tela maior", "nao sincroniza com o outro navegador"): uma aba aberta antes de
// uma atualizacao do site continuava com o codigo velho para sempre (as correcoes nao chegavam nela). A cada 2 min
// confere o index.html do servidor; se o pacote mudou, recarrega quando a aba esta escondida ou sem foco por 2 conferencias
// seguidas (ninguem digitando nela). Com foco, espera.
export function bundleOf(html:string):string{const m=/\/_expo\/static\/js\/web\/(index-[a-f0-9]+\.js)/.exec(html);return m?m[1]:'';}
export function shouldReload(current:string,remote:string,hidden:boolean,idleChecks:number):boolean{return !!current&&!!remote&&current!==remote&&(hidden||idleChecks>=2);}
export function watchWebVersion(everyMs=120000):()=>void{
 if(typeof document==='undefined'||typeof fetch==='undefined')return()=>{};
 const current=bundleOf(document.documentElement.innerHTML);if(!current)return()=>{};
 let idle=0,stopped=false;
 const check=async()=>{if(stopped)return;try{const r=await fetch('/',{cache:'no-store',credentials:'same-origin'});if(!r.ok)return;const remote=bundleOf(await r.text());
  const hidden=document.visibilityState==='hidden';idle=document.hasFocus()?0:idle+1;
  if(shouldReload(current,remote,hidden,idle))location.reload();}catch{/* sem rede: tenta na proxima */}};
 const t=setInterval(()=>void check(),everyMs);
 return()=>{stopped=true;clearInterval(t);};
}
