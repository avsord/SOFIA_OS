import type {Entity} from './types';
import {cloneOrder} from './page-clone';

/** 13/11/2026 (Pedro: Ctrl+Z tem que trazer de volta a página excluída): o servidor apaga de verdade (página, subpáginas,
 * anexos e versões) e não há como voltar. Agora "Excluir" na barra/na página só ARQUIVA a árvore (state 'archived',
 * que todas as listas já escondem) com a marca de lixeira; desfazer volta tudo como estava: conteúdo, subpáginas, ícone,
 * capa e a mesma posição (os dados não são tocados). Lixeira com mais de 30 dias é apagada de vez ao abrir o site. */
export const TRASH_TAG='sofia-trash',TRASH_ROOT_TAG='sofia-trash-root';
export const TRASH_KEEP_MS=30*24*3600*1000;

type Api={saveEntity:(input:Partial<Entity>)=>Promise<Entity>};

/** Arquiva a página e as subpáginas (filhas antes da mãe: o servidor não aceita salvar filha de mãe arquivada).
 * Devolve as páginas como ficaram (com a revisão nova), na ordem mãe -> filhas, para restaurar. */
export async function trashPageTree(api:Api,pages:readonly Entity[],rootId:string):Promise<Entity[]>{
 const list=cloneOrder(pages,rootId);const out:Entity[]=[];
 for(const p of [...list].reverse()){
  const tags=[...(p.tags||[]).filter(t=>t!==TRASH_TAG&&t!==TRASH_ROOT_TAG),TRASH_TAG,...(p.id===rootId?[TRASH_ROOT_TAG]:[])];
  out.unshift(await api.saveEntity({id:p.id,revision:p.revision,state:'archived',tags}));
 }
 return out;
}

/** Volta a árvore arquivada (mãe antes das filhas). */
export async function restorePageTree(api:Api,trashed:readonly Entity[]):Promise<Entity[]>{
 const out:Entity[]=[];
 for(const p of trashed)out.push(await api.saveEntity({id:p.id,revision:p.revision,state:'active',tags:(p.tags||[]).filter(t=>t!==TRASH_TAG&&t!==TRASH_ROOT_TAG)}));
 return out;
}

/** Raízes da lixeira que já passaram do prazo (apagar de vez leva junto as subpáginas).
 * Revisão de segurança (13/11/2026): `items` deve ser a lista COMPLETA de páginas. Só entra o que está arquivado com as duas
 * marcas de lixeira; o relógio usado é o menor entre o do aparelho e a edição mais recente vista no servidor (relógio do
 * aparelho adiantado não apaga nada antes da hora); sem data válida nada sai; e nunca sai uma raiz que ainda é mãe de
 * página ativa (apagar no servidor levaria a filha junto). */
export function staleTrash(items:readonly Entity[],now=Date.now(),keep=TRASH_KEEP_MS):Entity[]{
 const at=(x:Entity)=>Date.parse(String(x.updated_at||''));let newest=-Infinity;for(const x of items){const t=at(x);if(Number.isFinite(t)&&t>newest)newest=t;}
 const clock=Math.min(Number.isFinite(now)?now:-Infinity,newest);if(!Number.isFinite(clock)||!(keep>0))return [];
 const liveParents=new Set(items.filter(x=>x.state!=='archived').map(x=>String((x.data as any)?.parent_id||'')).filter(Boolean));
 return items.filter(x=>{const tags=x.tags||[],t=at(x);return x.state==='archived'&&tags.includes(TRASH_ROOT_TAG)&&tags.includes(TRASH_TAG)&&Number.isFinite(t)&&clock-t>keep&&!liveParents.has(x.id);});
}
