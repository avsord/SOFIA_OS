// 0.3.267: no celular não há necessidade de renderizar na hora; a versão .web.ts usa o flushSync do react-dom.
export function flushNow(fn:()=>void){fn();}
