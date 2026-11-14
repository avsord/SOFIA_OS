import React,{useEffect,useRef,useState} from 'react';
// 14/11/2026 (Pedro): seletor de cor minimalista em gradiente horizontal continuo (tipo Photoshop): barra de matiz + barra escuro→cor→claro.
// 14/11/2026 (refeito): cores prontas num clique, previa + codigo da cor editavel, Esc cancela (volta a cor antiga), Enter/clique fora guarda,
// abre para cima quando nao cabe embaixo e nunca sai da tela. Serve aos atalhos e aos subatalhos.
export function hsv2hex(h:number,s:number,v:number){const f=(n:number)=>{const k=(n+h/60)%6;const x=v-v*s*Math.max(0,Math.min(k,4-k,1));return Math.round(x*255).toString(16).padStart(2,'0');};return '#'+f(5)+f(3)+f(1);}
export function hex2hsv(hex:string):[number,number,number]{const m=/^#?([0-9a-f]{6})$/i.exec(hex);if(!m)return [0,.7,.85];const n=parseInt(m[1],16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),d=mx-Math.min(r,g,b);let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}return [h,mx?d/mx:0,mx];}
// t (0..1) da barra de luminosidade: 0 preto, .5 cor pura, 1 branco
export const fromT=(h:number,t:number)=>t<.5?hsv2hex(h,1,t*2):hsv2hex(h,1-(t-.5)*2,1);
export const toT=(hex:string):[number,number]=>{const [h,s,v]=hex2hsv(hex);return [h,v<.999?v/2:.5+(1-s)/2];};
export function normHex(s:string):string|null{const m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());if(!m)return null;const x=m[1].length===3?m[1].split('').map(c=>c+c).join(''):m[1];return '#'+x.toUpperCase();}
export const SWATCHES=['#D9534F','#F0883E','#E3B341','#3FB950','#2DA44E','#39C5CF','#4F8CFF','#8957E5','#DB61A2','#8B949E'];
const W=216,PAD=12,H=150;
export function ColorPicker({color,x,y,onLive,onCommit,onClose,defaultColor}:{color:string;x:number;y:number;onLive:(c:string)=>void;onCommit:(c:string)=>void;onClose:()=>void;defaultColor?:string}){
 const start=useRef(normHex(color)||'#D9534F');
 const [hex,setHex]=useState(start.current),[st,setSt]=useState<[number,number]>(()=>toT(start.current)),[txt,setTxt]=useState(start.current);
 const cur=useRef(hex),done=useRef(false);
 const show=(c:string,t?:[number,number])=>{cur.current=c;setHex(c);setTxt(c);setSt(t||toT(c));onLive(c);};
 const finish=(c:string|null)=>{if(done.current)return;done.current=true;if(c&&c!==start.current)onCommit(c);else onLive(start.current);onClose();};
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(null);}};(globalThis as any).addEventListener?.('keydown',k,true);return()=>{(globalThis as any).removeEventListener?.('keydown',k,true);if(!done.current&&cur.current!==start.current){done.current=true;onCommit(cur.current);}};},[]);
 const cl=(v:number)=>Math.max(0,Math.min(1,v));
 const drag=(apply:(f:number)=>void)=>{const at=(e:any)=>{const r=e.currentTarget.getBoundingClientRect();apply(cl((e.clientX-r.left)/r.width));};return{
  onPointerDown:(e:any)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);at(e);},
  onPointerMove:(e:any)=>{if(e.buttons)at(e);}};};
 const hue=(f:number)=>{const t:[number,number]=[f*360,st[1]];show(fromT(t[0],t[1]),t);};
 const shade=(f:number)=>{const t:[number,number]=[st[0],f];show(fromT(t[0],t[1]),t);};
 const vw=(globalThis as any).innerWidth||1200,vh=(globalThis as any).innerHeight||800;
 const left=Math.max(8,Math.min(x,vw-W-PAD*2-8)),top=y+H+8>vh?Math.max(8,y-H-36):y;
 const knob=(pos:number,bg:string):any=>({position:'absolute',left:`calc(${pos*100}% - 8px)`,top:'50%',width:16,height:16,marginTop:-8,borderRadius:8,border:'2px solid #fff',boxShadow:'0 0 0 1px rgba(0,0,0,.45),0 1px 3px rgba(0,0,0,.4)',pointerEvents:'none',background:bg,boxSizing:'border-box'});
 const bar:any={position:'relative',width:'100%',height:12,borderRadius:6,cursor:'pointer',touchAction:'none',margin:'4px 0'};
 const pure=hsv2hex(st[0],1,1);
 return <div data-testid="shortcut-color-picker" onPointerDown={e=>e.stopPropagation()} style={{position:'fixed',inset:0,zIndex:9999}} onClick={()=>finish(cur.current)} onContextMenu={e=>{e.preventDefault();finish(cur.current);}}>
  <div role="dialog" aria-label="Cor do atalho" onClick={e=>e.stopPropagation()} style={{position:'absolute',left,top,padding:PAD,borderRadius:10,background:'#252525',border:'1px solid rgba(255,255,255,.1)',boxShadow:'0 10px 30px rgba(0,0,0,.5)',width:W,fontFamily:'inherit',color:'#e6e6e6',userSelect:'none'}}>
   <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>{SWATCHES.map(c=><button key={c} type="button" data-testid={'color-swatch-'+c.slice(1)} aria-label={'Cor '+c} onClick={()=>{show(c);finish(c);}} style={{width:16,height:16,padding:0,borderRadius:8,background:c,cursor:'pointer',border:'none',boxShadow:hex===c?'0 0 0 2px #252525,0 0 0 4px #fff':'inset 0 0 0 1px rgba(255,255,255,.15)'}}/>)}</div>
   <div data-testid="color-hue" {...drag(hue)} style={{...bar,backgroundImage:'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'}}><div style={knob(st[0]/360,pure)}/></div>
   <div data-testid="color-shade" {...drag(shade)} style={{...bar,marginTop:10,backgroundImage:'linear-gradient(to right,#000,'+pure+',#fff)'}}><div style={knob(st[1],hex)}/></div>
   <div style={{display:'flex',alignItems:'center',gap:8,marginTop:12}}>
    <div style={{width:22,height:22,borderRadius:6,background:hex,boxShadow:'inset 0 0 0 1px rgba(255,255,255,.15)',flex:'none'}}/>
    <input data-testid="color-hex" value={txt} spellCheck={false} maxLength={7} onChange={e=>{setTxt(e.target.value);const n=normHex(e.target.value);if(n&&/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())){cur.current=n;setHex(n);setSt(toT(n));onLive(n);}}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();finish(normHex(txt)||cur.current);}}} onBlur={()=>{const n=normHex(txt);if(n)show(n);else setTxt(cur.current);}} style={{flex:1,minWidth:0,height:24,padding:'0 8px',borderRadius:6,border:'1px solid rgba(255,255,255,.12)',background:'#1b1b1b',color:'#e6e6e6',font:'12px ui-monospace,Consolas,monospace',outline:'none'}}/>
    {defaultColor&&hex!==normHex(defaultColor)?<button type="button" data-testid="color-reset" onClick={()=>{const d=normHex(defaultColor)!;show(d);finish(d);}} style={{height:24,padding:'0 8px',borderRadius:6,border:'none',background:'transparent',color:'#9a9a9a',cursor:'pointer',fontSize:12}}>Padrão</button>:null}
   </div>
  </div></div>;
}
