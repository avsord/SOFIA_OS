// 19/11/2026 (Pedro: aceitar emojis em imagem, ex. slackmojis, já no tamanho certo):
// o ícone da página pode ser um link de imagem (png/gif/webp) ou imagem colada (data:).
// Mostra a imagem no mesmo quadrado que o emoji de texto ocuparia, sem esticar.
import React from 'react';
import {Image,Text,type TextStyle} from 'react-native';

export const isImageIcon=(v:unknown):boolean=>typeof v==='string'&&/^(https?:\/\/\S+|data:image\/[a-z+.-]+;base64,)/i.test(v.trim());

export function PageGlyph({icon,size,style}:{icon:string;size:number;style?:TextStyle}){
 if(isImageIcon(icon)){const s=Math.round(size*1.05);return <Image accessibilityIgnoresInvertColors source={{uri:icon.trim()}} resizeMode="contain" style={{width:s,height:s}}/>;}
 return <Text style={[{fontSize:size},style]}>{icon}</Text>;
}

/** Imagem colada/arrastada vira data: pequena (GIF pequeno fica como está para continuar animado). */
export function imageBlobToIcon(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Não foi possível ler a imagem.'));r.onload=()=>{const src=String(r.result||'');
  if(blob.size<=200*1024||typeof document==='undefined'){resolve(src);return;}
  const img=new window.Image();img.onerror=()=>reject(Error('Imagem inválida.'));img.onload=()=>{const k=Math.min(1,128/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.width*k));cv.height=Math.max(1,Math.round(img.height*k));cv.getContext('2d')?.drawImage(img,0,0,cv.width,cv.height);resolve(cv.toDataURL('image/png'));};img.src=src;};
  r.readAsDataURL(blob);});
}
