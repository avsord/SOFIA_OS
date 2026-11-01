// 0.3.253: largura de leitura da regiao atual no computador. A tela continua rolando na largura toda
// (barra de rolagem na borda, nao no meio da tela); so o conteudo fica centralizado nessa largura.
// Arquivo sem dependencias: a camada web (src/web/rn-desktop.tsx) tambem le daqui.
import {createContext} from 'react';
export const ContentWidth=createContext<number|undefined>(undefined);
/** Barra que ocupa a largura toda (fundo e borda de ponta a ponta) com o conteudo alinhado a coluna de leitura. */
/** 0.3.273 (padrao aprovado): no computador todo conteudo comeca na mesma linha a esquerda (DESK_LEFT), com a mesma
 * largura maxima; antes cada tela centralizava a coluna e as margens mudavam de tela para tela. */
export const DESK_LEFT=40;
export function columnPadding(max:number,base:number):any{return {left:`${Math.max(base,DESK_LEFT)}px`,right:`max(${base}px, calc(100% - ${max}px - ${Math.max(base,DESK_LEFT)}px))`};}
