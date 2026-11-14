// 14/11/2026 (seletor de data/hora padrao Notion): data e hora digitadas no campo.
const pad=(n:number)=>String(n).padStart(2,'0');
/** "14/11", "14/11/26", "14/11/2026" -> mesma hora de base; invalido = null. */
export function parseDateText(text:string,base:Date):Date|null{
 const m=/^\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s*$/.exec(String(text||''));if(!m)return null;
 const y=m[3]?(m[3].length===2?2000+Number(m[3]):Number(m[3])):base.getFullYear(),mo=Number(m[2])-1,d=Number(m[1]);
 const out=new Date(base);out.setFullYear(y,mo,d);return out.getMonth()===mo&&out.getDate()===d?out:null;
}
/** "1530", "930", "9", "15:30", "15h30", "15h" -> hora no dia de base; invalido = null. */
export function parseTimeText(text:string,base:Date):Date|null{
 const s=String(text||'').trim().toLowerCase().replace(/\s/g,'');let h:number,mi:number;
 let m=/^(\d{1,2})[:h](\d{2})?$/.exec(s);
 if(m){h=Number(m[1]);mi=Number(m[2]||0);}
 else if((m=/^(\d{1,4})$/.exec(s))){const v=m[1];if(v.length<=2){h=Number(v);mi=0;}else{h=Number(v.slice(0,v.length-2));mi=Number(v.slice(-2));}}
 else return null;
 if(!(h>=0&&h<24&&mi>=0&&mi<60))return null;const out=new Date(base);out.setHours(h,mi,0,0);return out;
}
export const TIME_SLOTS=Array.from({length:96},(_,i)=>`${pad(Math.floor(i/4))}:${pad((i%4)*15)}`);
