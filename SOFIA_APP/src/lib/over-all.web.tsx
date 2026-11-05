// 05/11/2026: o menu pequeno (ContextMenu) aberto de dentro de uma janela lateral (nota, registro) ficava por baixo dela,
// porque a janela e desenhada no fim da pagina. No site o menu vai para o fim da pagina tambem, acima de tudo.
import React from 'react';
import {createPortal} from 'react-dom';
export function OverAll({children}:{children:React.ReactNode}){
 if(typeof document==='undefined')return <>{children}</>;
 return createPortal(<div style={{position:'fixed',inset:0,zIndex:2147483100,pointerEvents:'none',display:'flex'}}>{children}</div>,document.body);
}
