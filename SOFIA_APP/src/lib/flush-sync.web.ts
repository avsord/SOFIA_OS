// 0.3.267: no computador, Enter/Backspace no editor de Páginas criam ou juntam blocos e o foco precisa ir para o bloco
// novo ANTES da próxima tecla (quem digita rápido perdia letras). flushSync renderiza a mudança na hora.
import {flushSync} from 'react-dom';
export function flushNow(fn:()=>void){flushSync(fn);}
