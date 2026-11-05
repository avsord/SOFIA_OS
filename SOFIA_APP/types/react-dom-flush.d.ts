// 0.3.267: só o flushSync é usado (src/lib/flush-sync.web.ts); o pacote react-dom não traz tipos.
declare module 'react-dom' { export function flushSync(fn: () => void): void; }
