// 0.3.273: tipos da Rotina num lugar leve (o Inicio usa sem carregar a tela inteira de Rotina)
import {PALETTE} from './palette';
import type {Entity} from './types';
export const ROTINA_TYPES=[{id:'capsula',one:'Cápsula',name:'Cápsulas',color:PALETTE.green},{id:'cuidado',one:'Cuidado',name:'Cuidados',color:PALETTE.lilac},{id:'habito',one:'Hábito',name:'Hábitos',color:PALETTE.blue},{id:'treino',one:'Treino',name:'Treino',color:PALETTE.amber}];
export const typeOf=(p:Entity)=>String(p.data?.rotina_type||'capsula');
export const periodOf=(t:string)=>{const h=Number(String(t).slice(0,2));return h<12?'Manhã':h<18?'Tarde':'Noite';};

/** 0.3.315 (Pedro): tipos criados pela pessoa na Rotina ("O que e" -> + Novo tipo), com nome, cor e simbolo. Ficam no
 * proprio item (rotina_type="outro" + type_label/type_color/type_icon); a lista de tipos junta os de fabrica com os
 * nomes que aparecem nos itens. Cor e simbolo valem em todo lugar: Rotina, linha do tempo e previas. */
export type RotinaTypeInfo={id:string;one:string;name:string;color:string;icon:string;custom?:boolean};
const BUILTIN_ICON:Record<string,string>={capsula:'capsule',cuidado:'heart',habito:'repeat',treino:'barbell'};
export const slugType=(label:string)=>'outro:'+label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function typeInfo(p:Entity|undefined|null):RotinaTypeInfo{
 const d:any=p?.data||{};
 if(d.rotina_type==='outro'&&String(d.type_label||'').trim()){const label=String(d.type_label).trim();return {id:slugType(label),one:label,name:label,color:String(d.type_color||PALETTE.blue),icon:String(d.type_icon||'star'),custom:true};}
 const t=ROTINA_TYPES.find(x=>x.id===String(d.rotina_type||'capsula'))||ROTINA_TYPES[0];
 return {...t,icon:BUILTIN_ICON[t.id]||'capsule'};
}
/** Tipos de fabrica + os criados pela pessoa (um por nome). */
export function allTypes(plans:Entity[]):RotinaTypeInfo[]{
 const out:RotinaTypeInfo[]=ROTINA_TYPES.map(t=>({...t,icon:BUILTIN_ICON[t.id]||'capsule'}));
 for(const p of plans){if(p.state==='archived')continue;const t=typeInfo(p);if(t.custom&&!out.some(x=>x.id===t.id))out.push(t);}
 return out;
}
/** id do tipo de um item (igual ao de typeInfo; usado nos filtros). */
export const typeIdOf=(p:Entity)=>typeInfo(p).id;
