'use strict';
// 06/11/2026: em 1eb44b2 um React.useEffect foi escrito DENTRO de outro useEffect (BackgroundServices). O React recusa
// ("Invalid hook call") e a tela do site caiu em "Algo deu errado nesta tela". tsc e os testes nao pegaram; esta
// varredura procura chamada de hook (useX) dentro do corpo de useEffect/useLayoutEffect/useMemo/useCallback.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','src');
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):/\.tsx?$/.test(e.name)?[path.join(d,e.name)]:[]);
// fim da chamada: casa parenteses ignorando strings e comentarios
function callEnd(s,open){let depth=0;for(let i=open;i<s.length;i++){const ch=s[i];
 if(ch==='/'&&s[i+1]==='/'){i=s.indexOf('\n',i);if(i<0)return s.length;continue;}
 if(ch==='/'&&s[i+1]==='*'){i=s.indexOf('*/',i+2)+1;continue;}
 if(ch==='"'||ch==="'"||ch==='`'){for(i++;i<s.length&&s[i]!==ch;i++)if(s[i]==='\\')i++;continue;}
 if(ch==='(')depth++;else if(ch===')'&&--depth===0)return i;}return s.length;}
function nested(src){const out=[],re=/\b(?:React\.)?(useEffect|useLayoutEffect|useMemo|useCallback)\s*\(/g;let m;
 while((m=re.exec(src))){const open=m.index+m[0].length-1,body=src.slice(open+1,callEnd(src,open));
  const h=/(?:^|[^\w.$])(?:React\.)?(use(?:Effect|LayoutEffect|State|Ref|Memo|Callback|Context|Reducer|Store|Theme)[A-Za-z]*)\s*\(/.exec(body.replace(/\/\/[^\n]*/g,'').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g,"''"));
  if(h)out.push(m[1]+' contém '+h[1]+' (linha '+src.slice(0,m.index).split('\n').length+')');}
 return out;}
test('nenhum hook chamado dentro de useEffect/useMemo/useCallback',()=>{
 const bad=files(ROOT).flatMap(f=>nested(fs.readFileSync(f,'utf8')).map(x=>path.relative(ROOT,f)+': '+x));
 assert.deepEqual(bad,[]);
});
test('a varredura pega o erro de 1eb44b2',()=>{
 assert.equal(nested("useEffect(()=>{\n React.useEffect(()=>{},[api]);\n if(x)return;},[a]);").length,1);
 assert.equal(nested("useEffect(()=>{const s='useState(';},[]);const [a]=useState(0);").length,0);
});
