'use strict';
// 14/11/2026 (Pedro, print da pagina Referencia: "fica travado nisso"): o cartao do link (endereco, Copiar, Remover link)
// ficava parado em cima da linha quando o mouseout do link nao chegava. O proprio cartao agora vigia o mouse e fecha.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'..','src/components/LinkHover.tsx'),'utf8');

test('cartao do link fecha sozinho quando o mouse fica longe dele e de qualquer link',()=>{
 assert.ok(s.includes("document.addEventListener('mousemove',move,true)"));
 assert.ok(s.includes("closest?.('a[href]')")&&s.includes('setTimeout(close,300)'));
});
test('tecla, rolagem, clique fora e janela sem foco fecham o cartao, e tudo e desligado ao fechar',()=>{
 for(const ev of ['mousedown','keydown','scroll'])assert.ok(s.includes(`document.addEventListener('${ev}'`)&&s.includes(`document.removeEventListener('${ev}'`),ev);
 assert.ok(s.includes("window.addEventListener('blur',close)")&&s.includes("window.removeEventListener('blur',close)"));
 assert.ok(s.includes('if(!card(e.target))close()'),'clique dentro do cartao (Copiar/Remover) nao fecha antes da acao');
});
