// 0.3.296: abrir uma tarefa especifica no app Tarefas a partir de outra tela (ex.: a bolinha da linha do tempo do Inicio)
let pending = '';
const listeners = new Set<() => void>();
export function focusTask(id: string) {pending = id; listeners.forEach(fn => fn());}
export function takeFocusedTask(): string {const id = pending; pending = ''; return id;}
export function peekFocusedTask(): string {return pending;}
export function onFocusTask(fn: () => void) {listeners.add(fn); return () => {listeners.delete(fn);};}
