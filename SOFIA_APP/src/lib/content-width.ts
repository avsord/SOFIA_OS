// 0.3.253: largura de leitura da regiao atual no computador. A tela continua rolando na largura toda
// (barra de rolagem na borda, nao no meio da tela); so o conteudo fica centralizado nessa largura.
// Arquivo sem dependencias: a camada web (src/web/rn-desktop.tsx) tambem le daqui.
import {createContext} from 'react';
export const ContentWidth=createContext<number|undefined>(undefined);
/** Barra que ocupa a largura toda (fundo e borda de ponta a ponta) com o conteudo alinhado a coluna de leitura. */
/** 0.3.273 (padrao aprovado): no computador todo conteudo comeca na mesma linha a esquerda (DESK_LEFT), com a mesma
 * largura maxima; antes cada tela centralizava a coluna e as margens mudavam de tela para tela. */
export const DESK_LEFT=40;
/** 0.3.278: medida fixa do site na escala da tela (o mesmo fator do texto e dos espacos). */
export function dpx(n:number):string{let f=1;try{f=require('../web/desktop-scale').uiScale();}catch{f=1;}return Math.round(n*f*2)/2+'px';}
export function columnPadding(max:number,base:number):any{const m=dpx(Math.max(base,DESK_LEFT));let f=1;try{f=require('../web/desktop-scale').uiScale();}catch{f=1;}const v=`max(${m}, calc((100% - ${Math.round(max*f)}px) / 2 + ${m}))`;return {left:v,right:v};}
