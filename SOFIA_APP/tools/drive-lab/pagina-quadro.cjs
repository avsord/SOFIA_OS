// 08/11/2026 (Pedro: Pagina Quadro): robo do quadro no laboratorio (servidor de verdade). Uso: node pagina-quadro.cjs
const {chromium} = require('playwright'); const {spawn} = require('child_process'); const path=require('path').join(__dirname,'lab-server.cjs'), OS=require('os');
const PORT = 6500 + Math.floor(Math.random()*200)*2, B='http://127.0.0.1:'+PORT, O=require('fs').mkdtempSync(require('path').join(OS.tmpdir(),'quadro-'))+'/';
const res=[]; const ok=(c,m)=>{res.push((c?'OK   ':'FALHA')+' '+m);};
(async()=>{
 const lab=spawn(process.execPath,[path,String(PORT),O+'data'],{stdio:['ignore','pipe','pipe']}); let log=''; lab.stdout.on('data',d=>log+=d); lab.stderr.on('data',d=>log+=d);
 for(let i=0;i<80&&!/pronto/.test(log);i++) await new Promise(r=>setTimeout(r,250));
 const br=await chromium.launch(); const page=await br.newPage({viewport:{width:1500,height:900}});
 const errs=[]; page.on('pageerror',e=>errs.push(String(e.message).slice(0,200)));
 try{
 await page.goto(B+'/paginas'); await page.waitForTimeout(1500);
 await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar',{exact:true}).last().click(); await page.waitForTimeout(3000);
 await page.goto(B+'/paginas'); await page.waitForTimeout(3000);
 // pagina original para trazer depois
 await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(2000);
 await page.locator('[contenteditable="true"]').last().click(); await page.keyboard.type('linha da original'); await page.waitForTimeout(1500);
 // o quadro
 await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(2000);
 await page.getByLabel('Quadro',{exact:true}).click(); await page.waitForTimeout(1500);
 const board=page.getByTestId('page-board'); ok(await board.count()===1,'virou quadro');
 const items=()=>page.locator('[data-testid=board-item]');
 const bb=await board.boundingBox();
 await page.getByTestId('board-title').fill('Hacker'); await page.keyboard.press('Enter');
 // nota por duplo clique no fundo
 await page.mouse.dblclick(bb.x+300,bb.y+250); await page.waitForTimeout(400); await page.keyboard.type('ideia um'); await page.mouse.click(bb.x+900,bb.y+600); await page.waitForTimeout(800);
 ok((await items().count())===1 && /ideia um/.test(await items().first().innerText()),'nota criada com texto');
 // lista
 await page.getByTestId('board-add-list').click(); await page.waitForTimeout(300); await page.keyboard.type('alugar luz'); await page.keyboard.press('Enter'); await page.keyboard.type('roteiro'); await page.mouse.click(bb.x+1000,bb.y+150); await page.waitForTimeout(600);
 ok((await items().count())===2,'lista criada');
 // foto pelo botao
 const fc=page.waitForEvent('filechooser'); await page.getByTestId('board-add-file').click(); await (await fc).setFiles(require('path').join(__dirname,'fixtures','retrato.png')); await page.waitForTimeout(5000);
 ok((await items().count())===3 && await page.locator('[data-testid=board-item] img').count()>=1,'foto entrou aberta no quadro');
 // zoom pela rodinha
 const z0=await page.getByTestId('board-zoom').innerText(); await page.mouse.move(bb.x+600,bb.y+400); await page.mouse.wheel(0,-300); await page.waitForTimeout(300); const z1=await page.getByTestId('board-zoom').innerText();
 ok(z0!==z1,'rodinha muda o zoom ('+z0+' -> '+z1+')');
 await page.mouse.wheel(0,300); await page.waitForTimeout(300);
 // mover a nota
 const n=items().first(); const a=await n.boundingBox(); await page.mouse.move(a.x+20,a.y+20); await page.mouse.down(); await page.mouse.move(a.x+220,a.y+120,{steps:8}); await page.mouse.up(); await page.waitForTimeout(500);
 const a2=await n.boundingBox(); ok(Math.abs(a2.x-a.x-200)<6,'arrastar move a nota');
 // redimensionar pelo canto
 await n.click({position:{x:12,y:12}}); await page.waitForTimeout(200); const se=n.locator('[aria-label="Mudar o tamanho"]').nth(3); const sb=await se.boundingBox(); await page.mouse.move(sb.x+5,sb.y+5); await page.mouse.down(); await page.mouse.move(sb.x+105,sb.y+65,{steps:6}); await page.mouse.up(); await page.waitForTimeout(400);
 const a3=await n.boundingBox(); ok(a3.width>a2.width+60,'canto aumenta ('+Math.round(a2.width)+' -> '+Math.round(a3.width)+')');
 // andar arrastando o fundo
 const b4=await n.boundingBox(); await page.mouse.move(bb.x+1150,bb.y+130); await page.mouse.down(); await page.mouse.move(bb.x+1050,bb.y+80,{steps:5}); await page.mouse.up(); await page.waitForTimeout(300);
 const b5=await n.boundingBox(); ok(Math.abs(b5.x-b4.x+100)<6,'arrastar o fundo anda pelo quadro');
 // duplicar (Ctrl+D) e apagar
 await n.click({position:{x:12,y:12}}); await page.keyboard.press('Control+d'); await page.waitForTimeout(500); ok((await items().count())===4,'Ctrl+D duplica');
 await page.keyboard.press('Delete'); await page.waitForTimeout(400); ok((await items().count())===3,'Delete apaga');
 // pagina existente: entra como copia, sincronizar
 await page.getByTestId('board-add-page').click(); await page.waitForTimeout(500); await page.getByTestId('board-page-picker').getByRole('button',{name:'Sem título'}).first().click(); await page.waitForTimeout(2500);
 const pc=page.locator('[data-testid=board-item][data-type=page_link]'); ok(await pc.count()===1 && /Cópia/.test(await pc.innerText()) && /linha da original/.test(await pc.innerText()),'página entra como cópia com o conteúdo');
 await pc.click({position:{x:12,y:12}}); await page.waitForTimeout(300); await page.getByTestId('board-sync').click(); await page.waitForTimeout(600); ok(/Sincronizada/.test(await pc.innerText()),'sincronizar liga a original');
 // desenho
 await page.getByTestId('board-draw').click(); await page.mouse.move(bb.x+200,bb.y+600); await page.mouse.down(); await page.mouse.move(bb.x+260,bb.y+640,{steps:5}); await page.mouse.move(bb.x+330,bb.y+600,{steps:5}); await page.mouse.up(); await page.getByTestId('board-draw').click(); await page.waitForTimeout(400);
 ok(await page.locator('[data-testid=board-item][data-type=image] svg path').count()===1,'desenho feito');
 // Word novo
 await page.getByTestId('board-add-doc').click(); await page.waitForTimeout(5000); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
 const wd=page.locator('[data-testid=board-item][data-type=file]').filter({hasText:'.docx'}); ok(await wd.count()===1,'Word criado no quadro');
 await page.screenshot({path:O+'q1.png'});
 // recarregar: tudo no lugar
 const before=await items().count(); await page.waitForTimeout(2500); await page.reload(); await page.waitForTimeout(4500);
 ok((await page.getByTestId('page-board').count())===1 && (await items().count())===before,'recarregou: quadro com os '+before+' itens');
 // duplo clique no Word: edita no lugar
 const wd2=page.locator('[data-testid=board-item][data-type=file]').filter({hasText:'.docx'}); await wd2.dblclick(); await page.waitForTimeout(6000);
 ok(await page.locator('[data-board-editing] [contenteditable="true"], [data-board-editing] iframe').count()>=1 || /Editando/.test(await wd2.innerText()),'duplo clique edita o Word no quadro');
 await page.screenshot({path:O+'q2.png'});
 await page.keyboard.press('Escape');
 // ver como pagina
 await page.getByLabel('Opções da página').click(); await page.waitForTimeout(400); await page.getByText('Ver como página').last().click(); await page.waitForTimeout(1500);
 ok((await page.getByTestId('page-board').count())===0 && /ideia um/.test(await page.locator('body').innerText()),'Ver como página mostra os blocos');
 }catch(e){ok(false,'ERRO '+String(e.message).split('\n')[0]); try{await page.screenshot({path:O+'erro.png'});}catch{}}
 console.log(res.join('\n')); const bad=res.filter(r=>r.startsWith('FALHA')).length; console.log(bad?'✗ QUADRO: '+bad+' falha(s)':'✓ QUADRO OK ('+res.length+' verificacoes)'); process.exitCode=bad?1:0; console.log('erros JS:',errs.slice(0,5).join(' | ')||'nenhum');
 await br.close(); lab.kill('SIGKILL');
})();
