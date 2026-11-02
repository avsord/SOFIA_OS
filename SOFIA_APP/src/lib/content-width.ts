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
/** Recuo lateral que alinha uma barra de ponta a ponta a uma coluna centralizada de largura `max`.
 * Devolve {left,right}: use paddingLeft:pad.left e paddingRight:pad.right (0.3.311: Conversa e caixa de texto passavam
 * o objeto inteiro em paddingLeft, o navegador descartava e o avatar/caixa encostavam nas bordas). `min` e o recuo
 * minimo dentro da coluna (padrao DESK_LEFT; a Conversa usa 12, o mesmo recuo da lista de mensagens no site). */
/** 0.3.311 (Pedro): barras de ponta a ponta (cabecalho e caixa de texto da Conversa) com o mesmo respiro lateral da
 * barra de cima do site (paddingHorizontal 20 do DesktopShell), em vez de encostar nas bordas. */
export function edgePadding():{left:any;right:any}{const v=dpx(20);return {left:v,right:v};}
export function columnPadding(max:number,base:number,min:number=DESK_LEFT):{left:any;right:any}{const m=dpx(Math.max(base,min));let f=1;try{f=require('../web/desktop-scale').uiScale();}catch{f=1;}const v=`max(${m}, calc((100% - ${Math.round(max*f)}px) / 2 + ${m}))`;return {left:v,right:v};}
