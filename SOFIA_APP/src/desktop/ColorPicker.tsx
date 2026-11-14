import React,{useEffect,useRef,useState} from 'react';
// 14/11/2026 (Pedro): seletor de cor minimalista e intimista: so a barra de matiz + a barra escuro→cor→claro, pequeno, colado na bolinha.
// Esc cancela (volta a cor antiga); clique fora guarda. Vai para o <body> (portal): dentro da barra lateral ficava cortado e longe da bolinha.
let portal:any=null;try{portal=require('react-dom').createPortal;}catch{/* sem DOM */}
export function hsv2hex(h:number,s:number,v:number){const f=(n:number)=>{const k=(n+h/60)%6;const x=v-v*s*Math.max(0,Math.min(k,4-k,1));return Math.round(x*255).toString(16).padStart(2,'0');};return '#'+f(5)+f(3)+f(1);}
export function hex2hsv(hex:string):[number,number,number]{const m=/^#?([0-9a-f]{6})$/i.exec(hex);if(!m)return [0,.7,.85];const n=parseInt(m[1],16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),d=mx-Math.min(r,g,b);let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}return [h,mx?d/mx:0,mx];}
// t (0..1) da barra de luz: 0 preto, .5 cor pura, 1 branco
export const fromT=(h:number,t:number)=>t<.5?hsv2hex(h,1,t*2):hsv2hex(h,1-(t-.5)*2,1);
export const toT=(hex:string):[number,number]=>{const [h,s,v]=hex2hsv(hex);return [h,v<.999?v/2:.5+(1-s)/2];};
const W=148,P=10,H=46;
export function ColorPicker({color,x,y,onLive,onCommit,onClose}:{color:string;x:number;y:number;onLive:(c:string)=>void;onCommit:(c:string)=>void;onClose:()=>void;defaultColor?:string}){
 const start=useRef(color);const [st,setSt]=useState<[number,number]>(()=>toT(color));const cur=useRef(color),done=useRef(false);
 const set=(t:[number,number])=>{const c=fromT(t[0],t[1]);cur.current=c;setSt(t);onLive(c);};
 const finish=(save:boolean)=>{if(done.current)return;done.current=true;if(save&&cur.current!==start.current)onCommit(cur.current);else onLive(start.current);onClose();};
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}};(globalThis as any).addEventListener?.('keydown',k,true);return()=>{(globalThis as any).removeEventListener?.('keydown',k,true);if(!done.current&&cur.current!==start.current){done.current=true;onCommit(cur.current);}};},[]);
 const cl=(v:number)=>Math.max(0,Math.min(1,v));
 const drag=(apply:(f:number)=>void)=>{const at=(e:any)=>{const r=e.currentTarget.getBoundingClientRect();apply(cl((e.clientX-r.left)/r.width));};return{onPointerDown:(e:any)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);at(e);},onPointerMove:(e:any)=>{if(e.buttons)at(e);}};};
 const vw=(globalThis as any).innerWidth||1200,vh=(globalThis as any).innerHeight||800;
 const left=Math.max(6,Math.min(x,vw-W-P*2-6)),top=Math.max(6,Math.min(y,vh-H-P*2-6));
 const knob=(pos:number,bg:string):any=>({position:'absolute',left:`calc(${pos*100}% - 6px)`,top:'50%',marginTop:-6,width:12,height:12,borderRadius:6,border:'2px solid #fff',boxSizing:'border-box',boxShadow:'0 0 0 1px rgba(0,0,0,.35)',pointerEvents:'none',background:bg});
 const bar:any={position:'relative',height:8,borderRadius:4,cursor:'pointer',touchAction:'none'};
 const pure=hsv2hex(st[0],1,1);
 const ui=<div data-testid="shortcut-color-picker" onPointerDown={e=>e.stopPropagation()} style={{position:'fixed',inset:0,zIndex:9999}} onClick={()=>finish(true)} onContextMenu={e=>{e.preventDefault();finish(true);}}>
  <div role="dialog" aria-label="Cor do atalho" onClick={e=>e.stopPropagation()} style={{position:'absolute',left,top,width:W,padding:P,borderRadius:8,background:'rgba(32,32,34,.96)',border:'1px solid rgba(255,255,255,.08)',boxShadow:'0 6px 18px rgba(0,0,0,.4)',display:'flex',flexDirection:'column',gap:12}}>
   <div data-testid="color-hue" {...drag(f=>set([f*360,st[1]]))} style={{...bar,backgroundImage:'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'}}><div style={knob(st[0]/360,pure)}/></div>
   <div data-testid="color-shade" {...drag(f=>set([st[0],f]))} style={{...bar,backgroundImage:'linear-gradient(to right,#000,'+pure+',#fff)'}}><div style={knob(st[1],cur.current)}/></div>
  </div></div>;
 const body=(globalThis as any).document?.body;
 return portal&&body?portal(ui,body):ui;
}
