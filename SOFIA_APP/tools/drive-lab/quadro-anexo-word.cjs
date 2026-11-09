// 08/11/2026 (Pedro): robo do anexo Word aberto da pagina de um cartao do Quadro: digitar e salvar sem pulo, Sincronizar com o
// original, trazer para frente sem mexer no texto e rodinha travada no quadro durante o movimento. Uso: node quadro-anexo-word.cjs
const {chromium}=require('playwright'); const {spawn}=require('child_process'); const OS=require('os'), fs=require('fs'), P=require('path');
const PORT=6900+Math.floor(Math.random()*200)*2, B='http://127.0.0.1:'+PORT, O=fs.mkdtempSync(P.join(OS.tmpdir(),'qword-'))+'/';
const res=[]; const ok=(c,m)=>{res.push((c?'OK   ':'FALHA')+' '+m);};
(async()=>{
 const lab=spawn(process.execPath,[P.join(__dirname,'lab-server.cjs'),String(PORT),O+'data'],{stdio:['ignore','pipe','pipe']}); let log=''; lab.stdout.on('data',d=>log+=d); lab.stderr.on('data',d=>log+=d);
 for(let i=0;i<240&&!/pronto/.test(log);i++) await new Promise(r=>setTimeout(r,250));
 const br=await chromium.launch(); const page=await br.newPage({viewport:{width:1500,height:900}}); const errs=[]; page.on('pageerror',e=>errs.push(String(e.message).slice(0,200)));
 try{
 await page.goto(B+'/paginas'); await page.waitForTimeout(1500);
 await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar',{exact:true}).last().click(); await page.waitForTimeout(3000);
 await page.goto(B+'/paginas'); await page.waitForTimeout(3000);
 // pagina original com um Word
 await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(2000);
 await page.locator('[contenteditable="true"]').last().click(); await page.keyboard.type('texto da original'); await page.keyboard.press('Enter'); await page.keyboard.type('/documento'); await page.waitForTimeout(600); await page.keyboard.press('Enter'); await page.waitForTimeout(6000);
 await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
 // quadro com a pagina
 await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(2000);
 await page.getByLabel('Quadro',{exact:true}).click(); await page.waitForTimeout(1500);
 await page.getByTestId('board-add-page').click(); await page.waitForTimeout(800);
 await page.getByTestId('board-page-picker').locator('button:not([disabled])',{hasText:'Sem título'}).first().click(); await page.waitForTimeout(3000);
 const pc=page.locator('[data-testid=board-item][data-type=page_link]');
 // dentro do cartao nao aparece esqueleto com brilho
 {const fr=await (await pc.locator('iframe').elementHandle()).contentFrame(); const sk=await fr.evaluate(()=>[...document.querySelectorAll('[data-testid*=skeleton],[data-testid*=Skeleton],[data-testid=pages-loading-placeholder]')].length); ok(sk===0,'cartão da página sem esqueleto/brilho');}
 await pc.click({position:{x:60,y:20}}); await page.waitForTimeout(1500);
 const f2=await (await pc.locator('iframe').elementHandle()).contentFrame(); await f2.waitForSelector('[data-testid=page-file-row]',{timeout:15000});
 await f2.locator('[data-testid=page-file-row]').first().click(); await page.waitForTimeout(6000);
 const win=page.locator('[data-testid=board-item][data-type=file]').last();
 ok(/Editando/.test(await win.innerText()),'Word aberto da página do cartão vira janela editando');
 const sync=page.getByTestId('board-file-sync');
 ok(await sync.count()===1 && /Sincronizado/.test(await sync.innerText()),'janela mostra "Sincronizado com o original" antes de mexer');
 // digitar e salvar sem pulo
 const ed=win.locator('[contenteditable="true"]').first(); await ed.click(); await page.keyboard.type(' MUDANCA NA JANELA');
 await ed.evaluate(e=>{e.__mark=1;}); const sc=()=>win.evaluate(w=>[...w.querySelectorAll('*')].reduce((t,x)=>t+x.scrollTop,0)); const scd=()=>win.evaluate(w=>[...w.querySelectorAll('*')].filter(x=>x.scrollTop).map(x=>x.tagName+'.'+(x.className||'').toString().slice(0,30)+'='+x.scrollTop).join(' | '));
 const s0=await sc(), r0=await ed.boundingBox(); await page.waitForTimeout(7000);
 const same=await ed.evaluate(e=>e.__mark===1).catch(()=>false), s1=await sc(), r1=await ed.boundingBox(), txt=await ed.innerText();
 ok(same && s1===s0 && Math.abs(r1.y-r0.y)<2 && /MUDANCA NA JANELA/.test(txt),'digitar: o salvamento automático não recarrega nem pula o conteúdo');
 ok(/^Sincronizar com o original$/.test(await sync.innerText()),'depois de salvar aparece "Sincronizar com o original"');
 // trazer para frente nao mexe no texto
 const fs0=await ed.evaluate(e=>{const t=[...e.querySelectorAll('*')].find(x=>x.children.length===0&&/\S/.test(x.textContent||''))||e; return [getComputedStyle(t).fontSize, t.getBoundingClientRect().height];});
 await win.locator('[data-board-handle]').first().click({position:{x:40,y:8}}); await page.waitForTimeout(300); await page.getByLabel('Trazer para a frente').click(); await page.waitForTimeout(1500);
 const fs1=await ed.evaluate(e=>{const t=[...e.querySelectorAll('*')].find(x=>x.children.length===0&&/\S/.test(x.textContent||''))||e; return [getComputedStyle(t).fontSize, t.getBoundingClientRect().height];}).catch(()=>null), still=await ed.evaluate(e=>e.__mark===1).catch(()=>false);
 ok(still && fs1 && fs1[0]===fs0[0] && Math.abs(fs1[1]-fs0[1])<1,'trazer para frente não muda o tamanho do texto ('+fs0[0]+' -> '+(fs1&&fs1[0])+')');
 // sincronizar
 await sync.click(); await page.waitForTimeout(2500);
 ok(/Sincronizado/.test(await sync.innerText()),'Sincronizar leva a mudança para o anexo da página (volta a "Sincronizado")');
 // rodinha travada: arrastando o fundo, girar a rodinha em cima da janela anda o quadro, nao rola o conteudo
 {const wb=await win.boundingBox(), s2=await sc(); const o0=await page.getByTestId('board-origin').boundingBox();
  const bg=await page.evaluate(([x0,y0,w,h])=>{for(let y=y0+h+10;y<innerHeight-120;y+=20)for(let x=x0;x<x0+w;x+=20){const e=document.elementFromPoint(x,y);if(e&&e.closest('[data-testid=page-board]')&&!e.closest('[data-board-item],[data-board-ui]'))return [x,y];}for(let y=y0;y<y0+h;y+=20)for(let x=x0+w+10;x<innerWidth-20;x+=20){const e=document.elementFromPoint(x,y);if(e&&e.closest('[data-testid=page-board]')&&!e.closest('[data-board-item],[data-board-ui]'))return [x,y];}return null;},[wb.x,wb.y,wb.width,wb.height]);
  await page.mouse.move(bg[0],bg[1]); await page.mouse.down(); await page.mouse.move(bg[0]+10,bg[1]+5,{steps:3}); await page.mouse.move(wb.x+wb.width/2,wb.y+wb.height/2,{steps:6});
  await page.mouse.wheel(0,300); await page.waitForTimeout(300); await page.mouse.up(); await page.waitForTimeout(300); const s3=await sc();
  ok(s3===s2,'arrastando, a rodinha não rola o conteúdo da janela');}
 {const wb=await win.boundingBox(), s2=await sc(); const bg2=await page.evaluate(([x0,y0,w,h])=>{for(let x=x0+w+10;x<innerWidth-20;x+=20){const y=y0+h/2;const e=document.elementFromPoint(x,y);if(e&&e.closest('[data-testid=page-board]')&&!e.closest('[data-board-item],[data-board-ui]'))return [x,y];}return [x0+w+30,y0+h/2];},[wb.x,wb.y,wb.width,wb.height]); await page.mouse.move(bg2[0],bg2[1]); await page.mouse.wheel(0,120); await page.waitForTimeout(60); await page.mouse.move(wb.x+wb.width/2,wb.y+wb.height/2); await page.mouse.wheel(0,120); await page.waitForTimeout(60); await page.mouse.wheel(0,120); await page.waitForTimeout(400);
  ok(await sc()===s2,'giro da rodinha que começou andando o quadro continua no quadro ao passar por cima da janela');}
  // 09/11/2026 (Pedro: "to scrolando nas paginas e nao ta indo", nas janelas do Word): parou de girar o quadro, a rodinha em cima
  // da janela rola a janela; com o texto da janela em uso, rola a janela mesmo logo depois de andar o quadro
  {const ed2=win.locator('[contenteditable="true"]').first(); await ed2.click(); await page.keyboard.press('Control+End'); for(let i=0;i<50;i++){await page.keyboard.press('Enter'); await page.keyboard.type('linha extra '+i);} await page.waitForTimeout(600);
   await page.keyboard.press('Control+Home'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(700);
   const wb=await win.boundingBox(), o0=await page.getByTestId('board-origin').boundingBox(); await page.mouse.move(wb.x-40,wb.y+wb.height/2); for(let i=0;i<3;i++){await page.mouse.wheel(0,25); await page.waitForTimeout(60);}
   await page.waitForTimeout(500); const wb2=await win.boundingBox(); await page.mouse.move(wb2.x+wb2.width/2,wb2.y+wb2.height/2); const a=await sc(), o1=await page.getByTestId('board-origin').boundingBox();
   for(let i=0;i<4;i++){await page.mouse.wheel(0,150); await page.waitForTimeout(60);} await page.waitForTimeout(400); const b=await sc(), o2=await page.getByTestId('board-origin').boundingBox();
   ok(b>a && Math.abs(o2.y-o1.y)<1,'parou de girar o quadro: a rodinha em cima da janela rola a janela ('+a+' -> '+b+')'); void o0;
   await ed2.click(); await page.waitForTimeout(200); const wb3=await win.boundingBox(); await page.mouse.move(wb3.x-40,wb3.y+wb3.height/2); await page.mouse.wheel(0,25); await page.waitForTimeout(40);
   await page.mouse.move(wb3.x+wb3.width/2,wb3.y+wb3.height/2); const c0=await sc(), q0=await page.getByTestId('board-origin').boundingBox(); for(let i=0;i<3;i++){await page.mouse.wheel(0,150); await page.waitForTimeout(50);} await page.waitForTimeout(400);
   const c1=await sc(), q1=await page.getByTestId('board-origin').boundingBox(); ok(c1>c0 && Math.abs(q1.y-q0.y)<1,'escrevendo na janela: a rodinha rola a janela mesmo logo depois de andar o quadro ('+c0+' -> '+c1+')');
   await page.keyboard.press('Escape'); await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(700);}
 // 08/11 (Pedro: "a letra H vira a maozinha: com ela so arrasta, clicar em qualquer coisa fica bloqueado")
 {await page.keyboard.press('Escape'); await page.getByTestId('board-origin').evaluate(()=>{(document.activeElement)?.blur?.();}); await page.keyboard.press('h'); await page.waitForTimeout(300);
  const hand=page.getByTestId('board-hand'); ok(await hand.count()===1,'H liga a mãozinha');
  const done=win.getByTestId('board-file-done'), db=await done.boundingBox(), o0=await page.getByTestId('board-origin').boundingBox();
  await page.mouse.click(db.x+db.width/2,db.y+db.height/2); await page.waitForTimeout(500);
  ok(/Editando/.test(await win.innerText()),'com a mãozinha, clicar em "Pronto" não faz nada (clique bloqueado)');
  const wb=await win.boundingBox(); await page.mouse.move(wb.x+wb.width/2,wb.y+wb.height/2); await page.mouse.down(); await page.mouse.move(wb.x+wb.width/2+120,wb.y+wb.height/2+60,{steps:6}); await page.mouse.up(); await page.waitForTimeout(300);
  const o1=await page.getByTestId('board-origin').boundingBox(), wb2=await win.boundingBox();
  ok(Math.abs(o1.x-o0.x-120)<4 && Math.abs(o1.y-o0.y-60)<4 && Math.abs(wb2.x-wb.x-120)<4,'com a mãozinha, arrastar em cima da janela anda o quadro (não move a janela sozinha)');
  await page.keyboard.press('h'); await page.waitForTimeout(300); ok(await hand.count()===0,'H de novo desliga a mãozinha');}
 }catch(e){ok(false,'ERRO '+String(e.message).split('\n')[0]); await page.screenshot({path:O+'erro.png'}).catch(()=>{});}
 await br.close(); lab.kill();
 console.log(res.join('\n')); const bad=res.filter(r=>r.startsWith('FALHA')).length; console.log(bad?'✗ QUADRO-WORD: '+bad+' falha(s) — '+O:'✓ QUADRO-WORD OK ('+res.length+' verificacoes)'); console.log('erros JS: '+(errs.length?errs.join(' | '):'nenhum')); process.exit(bad?1:0);
})();
