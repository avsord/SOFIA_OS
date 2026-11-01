// 0.3.273: tipos da Rotina num lugar leve (o Inicio usa sem carregar a tela inteira de Rotina)
import {PALETTE} from './palette';
import type {Entity} from './types';
export const ROTINA_TYPES=[{id:'capsula',one:'Cápsula',name:'Cápsulas',color:PALETTE.green},{id:'cuidado',one:'Cuidado',name:'Cuidados',color:PALETTE.lilac},{id:'habito',one:'Hábito',name:'Hábitos',color:PALETTE.blue},{id:'treino',one:'Treino',name:'Treino',color:PALETTE.amber}];
export const typeOf=(p:Entity)=>String(p.data?.rotina_type||'capsula');
export const periodOf=(t:string)=>{const h=Number(String(t).slice(0,2));return h<12?'Manhã':h<18?'Tarde':'Noite';};
