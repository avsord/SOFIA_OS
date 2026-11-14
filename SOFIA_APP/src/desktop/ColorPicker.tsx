import React,{useRef,useState} from 'react';
// 14/11/2026 (Pedro): seletor de cor minimalista em gradiente horizontal continuo (tipo Photoshop): barra de matiz + barra escuro→cor→claro. Cor guardada so ao soltar.
function hsv2hex(h:number,s:number,v:number){const f=(n:number)=>{const k=(n+h/60)%6;const x=v-v*s*Math.max(0,Math.min(k,4-k,1));return Math.round(x*255).toString(16).padStart(2,'0');};return '#'+f(5)+f(3)+f(1);}
export function hex2hsv(hex:string):[number,number,number]{const m=/^#?([0-9a-f]{6})$/i.exec(hex);if(!m)return [0,.7,.85];const n=parseInt(m[1],16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),d=mx-Math.min(r,g,b);let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}return [h,mx?d/mx:0,mx];}
// t (0..1) da barra de luminosidade: 0 preto, .5 cor pura, 1 branco
const fromT=(h:number,t:number)=>t<.5?hsv2hex(h,1,t*2):hsv2hex(h,1-(t-.5)*2,1);
const W=200;
export function ColorPicker({color,x,y,onLive,onCommit,onClose}:{color:string;x:number;y:number;onLive:(c:string)=>void;onCommit:(c:string)=>void;onClose:()=>void}){
 const [st,setSt]=useState<[number,number]>(()=>{const [h,s,v]=hex2hsv(color);return [h,v<.999?v/2:.5+(1-s)/2];});const cur=useRef(st);
 const set=(n:[number,number])=>{cur.current=n;setSt(n);onLive(fromT(n[0],n[1]));};
 const cl=(v:number)=>Math.max(0,Math.min(1,v));
 const drag=(apply:(f:number)=>void)=>({
  onPointerDown:(e:any)=>{e.currentTarget.setPointerCapture?.(e.pointerId);const r=e.currentTarget.getBoundingClientRect();apply(cl((e.clientX-r.left)/r.width));},
  onPointerMove:(e:any)=>{if(e.buttons){const r=e.currentTarget.getBoundingClientRect();apply(cl((e.clientX-r.left)/r.width));}},
  onPointerUp:()=>onCommit(fromT(cur.current[0],cur.current[1]))});
 const left=Math.max(8,Math.min(x,(globalThis as any).innerWidth-W-40)),top=Math.min(y,(globalThis as any).innerHeight-90);
 const knob=(pos:number,bg:string):any=>({position:'absolute',left:pos*W,top:7,width:14,height:14,borderRadius:7,border:'2px solid #fff',boxShadow:'0 0 0 1px rgba(0,0,0,.5)',transform:'translate(-7px,-50%)',pointerEvents:'none',background:bg});
 const bar:any={position:'relative',width:W,height:14,borderRadius:7,cursor:'pointer',touchAction:'none'};
 return <div data-testid="shortcut-color-picker" onPointerDown={e=>e.stopPropagation()} style={{position:'fixed',inset:0,zIndex:9999}} onClick={onClose} onContextMenu={e=>{e.preventDefault();onClose();}}>
  <div onClick={e=>e.stopPropagation()} style={{position:'absolute',left,top,padding:12,borderRadius:10,background:'#262626',border:'1px solid rgba(255,255,255,.12)',boxShadow:'0 8px 28px rgba(0,0,0,.5)',width:W}}>
   <div {...drag(f=>set([f*360,st[1]]))} style={{...bar,backgroundImage:'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'}}><div style={knob(st[0]/360,hsv2hex(st[0],1,1))}/></div>
   <div {...drag(f=>set([st[0],f]))} style={{...bar,marginTop:12,backgroundImage:'linear-gradient(to right,#000,'+hsv2hex(st[0],1,1)+',#fff)'}}><div style={knob(st[1],fromT(st[0],st[1]))}/></div>
  </div></div>;
}
