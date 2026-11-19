// 19/11/2026 (Pedro: aceitar emojis em imagem, ex. slackmojis, já no tamanho certo):
// o ícone da página pode ser um link de imagem (png/gif/webp) ou imagem colada (data:).
// O desenho é medido (margem transparente cortada) e ocupa o mesmo quadrado que o emoji de
// texto do mesmo tamanho (emoji de 16 px = desenho de 16×16), centralizado. GIF continua animado.
import React,{useEffect,useState} from 'react';
import {Image,Platform,Text,View,type TextStyle} from 'react-native';

// também aceita endereço de imagem sem "https://" (ex.: emojis.slackmojis.com/.../claude.png)
const BARE=/^[\w.-]+\.[a-z]{2,}\/\S+\.(png|gif|jpe?g|webp|svg|avif)(\?\S*)?$/i;
export const isImageIcon=(v:unknown):boolean=>typeof v==='string'&&(/^(https?:\/\/\S+|data:image\/[a-z+.-]+;base64,)/i.test(v.trim())||BARE.test(v.trim()));
const srcOf=(v:string)=>{const t=v.trim();return BARE.test(t)?'https://'+t:t;};

/** Caixa do desenho, em frações da imagem (fx,fy,fw,fh) e proporção (ar = largura/altura). */
type Ink={fx:number;fy:number;fw:number;fh:number;ar:number};
const inkCache=new Map<string,Promise<Ink|null>>();
// Sites de emoji não liberam ler os pixels (CORS); a cópia do images.weserv.nl libera, só para medir.
function measure(src:string):Promise<Ink|null>{
 if(Platform.OS!=='web'||typeof document==='undefined')return Promise.resolve(null);
 let p=inkCache.get(src);if(p)return p;
 p=new Promise<Ink|null>(resolve=>{const img=new window.Image();img.crossOrigin='anonymous';
  img.onerror=()=>resolve(null);
  img.onload=()=>{try{const W=img.naturalWidth,H=img.naturalHeight;if(!W||!H){resolve(null);return;}const k=Math.min(1,256/Math.max(W,H)),w=Math.max(1,Math.round(W*k)),h=Math.max(1,Math.round(H*k));
   const cv=document.createElement('canvas');cv.width=w;cv.height=h;const x=cv.getContext('2d');if(!x){resolve(null);return;}x.drawImage(img,0,0,w,h);const d=x.getImageData(0,0,w,h).data;
   let t=h,b=-1,l=w,r=-1;for(let y=0;y<h;y++)for(let i=0;i<w;i++)if(d[(y*w+i)*4+3]>16){if(y<t)t=y;if(y>b)b=y;if(i<l)l=i;if(i>r)r=i;}
   if(r<0){resolve(null);return;}resolve({fx:l/w,fy:t/h,fw:(r-l+1)/w,fh:(b-t+1)/h,ar:W/H});}catch{resolve(null);}};
  img.src=/^(data|blob):/i.test(src)?src:'https://images.weserv.nl/?url='+encodeURIComponent(src)+'&output=png';});
 inkCache.set(src,p);return p;
}

export function PageGlyph({icon,size,style}:{icon:string;size:number;style?:TextStyle}){
 const image=isImageIcon(icon),src=image?srcOf(icon):'';
 const [ink,setInk]=useState<Ink|null|undefined>(undefined);
 useEffect(()=>{if(!image){setInk(undefined);return;}let live=true;setInk(undefined);void measure(src).then(v=>{if(live)setInk(v);});return()=>{live=false;};},[image,src]);
 if(!image)return <Text style={[{fontSize:size},style]}>{icon}</Text>;
 const s=Math.round(size);
 // A caixa é a de um emoji de texto invisível com o mesmo estilo (fonte, tamanho, altura de linha):
 // nome ao lado e altura da linha ficam idênticos aos de um emoji comum. O desenho fica por cima,
 // centralizado na horizontal e ~5% abaixo do centro, como o desenho do emoji fica (medido 19/11/2026).
 let art:React.ReactNode=null;
 if(ink===null){const f=Math.round(size*1.15);art=<Image accessibilityIgnoresInvertColors source={{uri:src}} resizeMode="contain" style={{width:f,height:f}}/>;}
 else if(ink){const iw=ink.fw*ink.ar,ih=ink.fh,H=Math.min(s/Math.sqrt(iw*ih),1.15*s/Math.max(iw,ih)),W=H*ink.ar,left=(s-ink.fw*W)/2-ink.fx*W,top=(s-ink.fh*H)/2-ink.fy*H;
  art=<View style={{width:s,height:s,position:'relative'}}><Image accessibilityIgnoresInvertColors source={{uri:src}} resizeMode="stretch" style={{position:'absolute',width:W,height:H,left,top}}/></View>;}
 return <View style={{position:'relative'}}>
  <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{fontSize:size},style,{opacity:0,color:'transparent'}]}>📄</Text>
  <View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0,alignItems:'center',justifyContent:'center',paddingTop:Math.round(size*0.1)}}>{art}</View>
 </View>;
}

/** Imagem colada/arrastada vira data: pequena (GIF pequeno fica como está para continuar animado). */
export function imageBlobToIcon(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Não foi possível ler a imagem.'));r.onload=()=>{const src=String(r.result||'');
  if(blob.size<=200*1024||typeof document==='undefined'){resolve(src);return;}
  const img=new window.Image();img.onerror=()=>reject(Error('Imagem inválida.'));img.onload=()=>{const k=Math.min(1,128/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.width*k));cv.height=Math.max(1,Math.round(img.height*k));cv.getContext('2d')?.drawImage(img,0,0,cv.width,cv.height);resolve(cv.toDataURL('image/png'));};img.src=src;};
  r.readAsDataURL(blob);});
}
