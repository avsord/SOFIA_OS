import React,{useRef,useState} from 'react';
// 14/11/2026 (Pedro): seletor de cor em gradiente continuo, minimalista (tipo Photoshop): quadrado saturacao/brilho + barra de matiz. Cor guardada so ao soltar.
function hsv2hex(h:number,s:number,v:number){const f=(n:number)=>{const k=(n+h/60)%6;const x=v-v*s*Math.max(0,Math.min(k,4-k,1));return Math.round(x*255).toString(16).padStart(2,'0');};return '#'+f(5)+f(3)+f(1);}
export function hex2hsv(hex:string):[number,number,number]{const m=/^#?([0-9a-f]{6})$/i.exec(hex);if(!m)return [0,.7,.85];const n=parseInt(m[1],16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),d=mx-Math.min(r,g,b);let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}return [h,mx?d/mx:0,mx];}
const W=200,H=130;
export function ColorPicker({color,x,y,onLive,onCommit,onClose}:{color:string;x:number;y:number;onLive:(c:string)=>void;onCommit:(c:string)=>void;onClose:()=>void}){
 const [hsv,setHsv]=useState<[number,number,number]>(()=>hex2hsv(color));const cur=useRef(hsv);
 const set=(n:[number,number,number])=>{cur.current=n;setHsv(n);onLive(hsv2hex(...n));};
 const drag=(apply:(px:number,py:number,r:DOMRect)=>void)=>({
  onPointerDown:(e:any)=>{e.currentTarget.setPointerCapture?.(e.pointerId);apply(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect());},
  onPointerMove:(e:any)=>{if(e.buttons)apply(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect());},
  onPointerUp:()=>onCommit(hsv2hex(...cur.current))});
 const cl=(v:number)=>Math.max(0,Math.min(1,v));
 const left=Math.max(8,Math.min(x,(globalThis as any).innerWidth-W-32)),top=Math.min(y,(globalThis as any).innerHeight-H-70);
 const dot:any={position:'absolute',width:12,height:12,borderRadius:6,border:'2px solid #fff',boxShadow:'0 0 0 1px rgba(0,0,0,.5)',transform:'translate(-6px,-6px)',pointerEvents:'none'};
 return <div data-testid="shortcut-color-picker" onPointerDown={e=>e.stopPropagation()} style={{position:'fixed',inset:0,zIndex:9999}} onClick={onClose} onContextMenu={e=>{e.preventDefault();onClose();}}>
  <div onClick={e=>e.stopPropagation()} style={{position:'absolute',left,top,padding:10,borderRadius:10,background:'#262626',border:'1px solid rgba(255,255,255,.12)',boxShadow:'0 8px 28px rgba(0,0,0,.5)',width:W}}>
   <div {...drag((px,py,r)=>set([hsv[0],cl((px-r.left)/r.width),1-cl((py-r.top)/r.height)]))} style={{position:'relative',width:W,height:H,borderRadius:6,cursor:'crosshair',touchAction:'none',backgroundImage:'linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,rgba(255,255,255,0)),linear-gradient(hsl('+hsv[0]+',100%,50%),hsl('+hsv[0]+',100%,50%))'}}>
    <div style={{...dot,left:hsv[1]*W,top:(1-hsv[2])*H,background:hsv2hex(...hsv)}}/></div>
   <div {...drag((px,_py,r)=>set([cl((px-r.left)/r.width)*360,hsv[1],hsv[2]]))} style={{position:'relative',width:W,height:10,marginTop:10,borderRadius:5,cursor:'pointer',touchAction:'none',backgroundImage:'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'}}>
    <div style={{...dot,left:hsv[0]/360*W,top:5,background:hsv2hex(hsv[0],1,1)}}/></div>
  </div></div>;
}
