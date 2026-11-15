// 15/11/2026: regras puras da previa de link na Conversa (sem rede), testadas em tests/link-preview-chat-15-11.test.cjs.
/** Primeiro endereco http(s) do texto, sem pontuacao final; '' se nao houver. */
export function firstUrl(text:string):string{
 const m=String(text||'').match(/https?:\/\/[^\s<>"']+/i);
 return m?m[0].replace(/[).,;:!?]+$/,''):'';
}
/** Id do video do YouTube (watch?v=, youtu.be/, shorts/, embed/, live/); '' se nao for video do YouTube. */
export function youtubeId(url:string):string{
 let u:URL;try{u=new URL(url);}catch{return '';}
 const h=u.hostname.replace(/^(www\.|m\.|music\.)/,''),ok=(id:string|null|undefined)=>id&&/^[\w-]{11}$/.test(id)?id:'';
 if(h==='youtu.be')return ok(u.pathname.split('/')[1]);
 if(h!=='youtube.com'&&h!=='youtube-nocookie.com')return '';
 if(u.pathname==='/watch')return ok(u.searchParams.get('v'));
 const m=u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);return m?ok(m[2]):'';
}
/** Nome curto do site (www.youtube.com -> youtube.com). */
export function linkHost(url:string):string{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}}
