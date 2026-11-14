export type Mark={start:number;end:number;bold?:boolean;italic?:boolean;underline?:boolean;strike?:boolean;code?:boolean;color?:string;highlight?:string;nolink?:boolean};
export type LeafBlock={id:string;text:string;type:string;marks:Mark[];checked?:boolean;align?:'left'|'center'|'right';data?:Record<string,any>};
export type Leaf={id:string;title:string;content:string;created_at?:string;blocks?:LeafBlock[];properties?:{id:string;name:string;value:string}[]};
export const leafId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
export function leafBlocks(leaf:Leaf):LeafBlock[]{return leaf.blocks?.length?leaf.blocks:[{id:leaf.id+'-body',text:leaf.content||'',type:'text',marks:[]}];}
export function editBlockText(block:LeafBlock,text:string,typing:Partial<Mark>={}):LeafBlock{
 let start=0;while(start<block.text.length&&start<text.length&&block.text[start]===text[start])start++;
 let oldEnd=block.text.length,end=text.length;while(oldEnd>start&&end>start&&block.text[oldEnd-1]===text[end-1]){oldEnd--;end--;}
 const delta=end-oldEnd;
 const marks=(block.marks||[]).map(m=>({...m,start:m.start<=start?m.start:m.start>=oldEnd?m.start+delta:start,end:m.end<start?m.end:m.end>=oldEnd?m.end+delta:end})).filter(m=>m.end>m.start);
 if(end>start&&Object.keys(typing).length)marks.push({...typing,start,end});
 return compactMarks({...block,text,marks});
}
export function formatRange(block:LeafBlock,start:number,end:number,style:Partial<Mark>):LeafBlock{
 if(end<=start)return block;const parts:Mark[]=[];
 for(const m of block.marks||[]){if(m.end<=start||m.start>=end){parts.push(m);continue;}if(m.start<start)parts.push({...m,end:start});parts.push({...m,start:Math.max(m.start,start),end:Math.min(m.end,end),...style});if(m.end>end)parts.push({...m,start:end});}
 parts.push({start,end,...style});return compactMarks({...block,marks:parts});
}
export function textRuns(block:LeafBlock){const stops=[...new Set([0,block.text.length,...(block.marks||[]).flatMap(m=>[Math.max(0,Math.min(block.text.length,m.start)),Math.max(0,Math.min(block.text.length,m.end))])])].sort((a,b)=>a-b);return stops.slice(0,-1).map((start,i)=>{const end=stops[i+1],style:Partial<Mark>={};for(const m of block.marks||[])if(m.start<=start&&m.end>=end)Object.assign(style,m);return {start,end,text:block.text.slice(start,end),style};});}

/** Keep equal adjacent formatting as one range, including after thousands of keystrokes. */
export function compactMarks(block:LeafBlock):LeafBlock{const marks:Mark[]=[];for(const run of textRuns(block)){const style:Partial<Mark>={};for(const key of ['bold','italic','underline','strike','code','color','highlight','nolink'] as const){const value=run.style[key];if(value)(style as any)[key]=value;}if(!Object.keys(style).length)continue;const previous=marks[marks.length-1];if(previous&&previous.end===run.start&&JSON.stringify({...previous,start:0,end:0})===JSON.stringify({...style,start:0,end:0})){previous.end=run.end;}else marks.push({...style,start:run.start,end:run.end});}return {...block,marks};}

export function applyLeafPatch(leaf:Leaf,patch:Partial<Leaf>,now=()=>new Date().toISOString()):Leaf{
 const next={...leaf,...patch};
 const writing=!!patch.title?.trim()||!!patch.content?.trim()||!!patch.properties?.some(p=>p.name.trim()||p.value.trim());
 if(!next.created_at&&writing&&!Object.prototype.hasOwnProperty.call(patch,'created_at'))next.created_at=now();
 return next;
}

// 05/11/2026 (Pedro: "links ... logo que cola ja fica link pra clicar, se quiser remove"): todo endereco http(s) no texto
// vira link sozinho (inclusive em notas antigas); "Remover link" marca o trecho com nolink e ele volta a ser texto comum.
const URL_RE=/\bhttps?:\/\/[^\s<>"']+/gi;
export function findLinks(text:string):{start:number;end:number;url:string}[]{
 const out:{start:number;end:number;url:string}[]=[];const s=String(text||'');URL_RE.lastIndex=0;let m:RegExpExecArray|null;
 while((m=URL_RE.exec(s))){let url=m[0];while(/[.,;:!?)\]}'"»]$/.test(url)&&!(url.endsWith(')')&&url.includes('(')))url=url.slice(0,-1);if(url.length>8)out.push({start:m.index,end:m.index+url.length,url});}
 return out;
}
export function linkRanges(block:LeafBlock){const off=(block.marks||[]).filter(m=>m.nolink);return findLinks(block.text).filter(l=>!off.some(m=>m.start<l.end&&m.end>l.start));}
export function unlinkRange(block:LeafBlock,start:number,end:number):LeafBlock{return formatRange(block,start,end,{nolink:true});}
