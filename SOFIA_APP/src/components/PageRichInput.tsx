// 0.3.267: o texto rico das Páginas só existe no site (PageRichInput.web.tsx). No celular o editor continua com o
// TextInput de sempre; este arquivo existe só para o import do Pages.tsx resolver no app.
import React from 'react';
export function escapeHtml(v:string){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
export function textToHtml(v:string){return escapeHtml(v).replace(/\n/g,'<br>');}
export function sanitizeRich(html:string){return escapeHtml(String(html||'').replace(/<[^>]*>/g,''));}
export const PageRichInput=React.forwardRef<any,any>(function PageRichInput(){return null;});
