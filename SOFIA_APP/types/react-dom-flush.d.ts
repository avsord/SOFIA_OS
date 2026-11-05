// 0.3.267: só o flushSync e o createPortal são usados (flush-sync.web.ts e over-all.web.tsx); o pacote react-dom não traz tipos.
declare module 'react-dom' { export function flushSync(fn: () => void): void; export function createPortal(children: any, container: any): any; }
