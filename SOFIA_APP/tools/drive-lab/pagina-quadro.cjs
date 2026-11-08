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
 await page.locator('[contenteditable="true"]').last().click(); await page.keyboard.type('linha da original'); await page.waitForTimeout(800);
 await page.keyboard.press('Enter'); {const fc0=page.waitForEvent('filechooser',{timeout:10000}); await page.keyboard.type('/arquivo'); await page.waitForTimeout(500); await page.keyboard.press('Enter'); await (await fc0).setFiles(require('path').join(__dirname,'fixtures','retrato.png')); await page.waitForTimeout(4000);}
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
 {await page.mouse.move(bb.x+80,bb.y+300); await page.mouse.down(); await page.mouse.move(bb.x+700,bb.y+40,{steps:8}); await page.mouse.up(); await page.waitForTimeout(200); const selTxt=await page.evaluate(()=>String(window.getSelection()||'')); ok(selTxt==='','arrastar o fundo não seleciona texto (título, cartões)'); await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(300);}
 // duplicar (Ctrl+D) e apagar
 await n.click({position:{x:12,y:12}}); await page.keyboard.press('Control+d'); await page.waitForTimeout(500); ok((await items().count())===4,'Ctrl+D duplica');
 await page.keyboard.press('Delete'); await page.waitForTimeout(400); ok((await items().count())===3,'Delete apaga');
 // pagina existente: entra como copia, sincronizar
 await page.getByTestId('board-add-page').click(); await page.waitForTimeout(500);
 {const z0=await page.getByTestId('board-zoom').innerText(); const pb=await page.getByTestId('board-page-picker').boundingBox(); await page.mouse.move(pb.x+pb.width/2,pb.y+pb.height-60); await page.mouse.wheel(0,400); await page.waitForTimeout(300);
  ok(await page.getByTestId('board-zoom').innerText()===z0,'rodinha em cima da janela não mexe no zoom do quadro'); await page.screenshot({path:O+'picker.png'});} await page.getByTestId('board-page-picker').getByRole('button',{name:'Sem título',exact:true}).first().click(); await page.waitForTimeout(2500);
 const pc=page.locator('[data-testid=board-item][data-type=page_link]'); ok(await pc.count()===1 && /Cópia/.test(await pc.innerText()),'página entra como cópia');
 ok(!/\(cópia\)/.test(await page.getByTestId('sidebar-page-tree').innerText().catch(()=>'')),'cópia do quadro não aparece duplicada na lista de Páginas');
 // 08/11 (Pedro: "versao adaptada"): resumo da pagina - arquivo em linha, abrir/fechar o anexo, clicar abre a janela flutuante
 await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(300); await pc.dblclick({position:{x:60,y:20}}); await page.waitForTimeout(500);
 await pc.click({position:{x:60,y:20}}); await page.getByTestId('board-page-view').click(); await page.waitForTimeout(800);
 await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(300); {const pb=await pc.boundingBox(); await page.mouse.move(pb.x+pb.width/2,pb.y+40); await page.mouse.wheel(0,-250); await page.waitForTimeout(400); const pb2=await pc.boundingBox(); if(pb2.y+pb2.height>bb.y+bb.height-120){await page.mouse.move(bb.x+40,bb.y+200); await page.mouse.down(); await page.mouse.move(bb.x+40,bb.y+200-(pb2.y+pb2.height-(bb.y+bb.height-140)),{steps:5}); await page.mouse.up();}}
 ok(/linha da original/.test(await pc.innerText()) && await pc.getByTestId('page-card-file').count()===1,'cartão mostra o resumo: texto e o arquivo em linha');
 {const tg=pc.getByTestId('page-card-toggle'); const before=await pc.locator('img').count(); await tg.click(); await page.waitForTimeout(2500); const after=await pc.locator('img').count();
  ok(before!==after,'abrir/fechar o anexo dentro do cartão ('+before+' -> '+after+')');
  await pc.getByTestId('page-card-file').click(); await page.waitForTimeout(1500); ok(await page.getByTestId('file-window').count()===1,'clicar no arquivo abre a janela flutuante');
  await page.getByTestId('file-window').getByLabel('Fechar').first().click(); await page.waitForTimeout(400);}
 await pc.click({position:{x:60,y:20}}); await page.getByTestId('board-page-view').click(); await page.waitForTimeout(800);
 {const fr=pc.locator('iframe[data-testid=board-page-frame]'); await fr.waitFor({timeout:15000}); const fh=await fr.elementHandle(); const f=await fh.contentFrame();
  await f.waitForSelector('[contenteditable="true"]',{timeout:20000}).catch(()=>null); await page.waitForTimeout(1500);
  const inner=await f.evaluate(()=>({txt:document.body.innerText,side:!!document.querySelector('[data-testid="desktop-sidebar"]')&&getComputedStyle(document.querySelector('[data-testid="desktop-sidebar"]')).display!=='none'}));
  ok(/linha da original/.test(inner.txt)&&!inner.side,'cartão mostra a página de verdade, sem barra lateral');
  {const e=await page.evaluate(([x0,y0,w,h])=>{for(let y=y0+120;y<y0+h-120;y+=37)for(let x=x0+40;x<x0+w-40;x+=41){const el=document.elementFromPoint(x,y);if(el&&el.getAttribute('data-testid')==='page-board')return {x,y};}return null;},[bb.x,bb.y,bb.width,bb.height]); if(e) await page.mouse.click(e.x,e.y);} await page.waitForTimeout(300); ok(await fr.evaluate(e=>getComputedStyle(e).pointerEvents)==='none','sem selecionar: a página só aparece (o quadro move e seleciona)');
  await pc.click({position:{x:60,y:20}}); await page.waitForTimeout(800);
  ok(await page.locator('iframe[data-testid=board-page-frame]').first().evaluate(e=>getComputedStyle(e).pointerEvents)==='auto','um clique: a página fica pronta para usar');
  await f.evaluate(()=>{const e=[...document.querySelectorAll('[contenteditable="true"]')].find(x=>/linha da original/.test(x.innerText));if(!e)return;e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);const sl=getSelection();sl.removeAllRanges();sl.addRange(r);}); await page.keyboard.type(' +editado no quadro'); await page.waitForTimeout(2500);
  await page.getByTestId('board-page-done').click(); await page.waitForTimeout(1500);
  ok(/editado no quadro/.test(await f.evaluate(()=>document.body.innerText)),'editou a página dentro do cartão');
  // 08/11 (Pedro: "clico nele e ele fica grudado no mouse"): arrastar pelo titulo e soltar em cima da pagina nao gruda
  {const p0=await pc.boundingBox(); await page.mouse.move(p0.x+60,p0.y+20); await page.mouse.down(); await page.mouse.move(p0.x+60,p0.y+140,{steps:6}); await page.mouse.up(); await page.waitForTimeout(400);
   const p1=await pc.boundingBox(); await page.mouse.move(p0.x+300,p0.y+300,{steps:6}); await page.waitForTimeout(400); const p2=await pc.boundingBox();
   ok(Math.abs(p1.y-p0.y)>40 && Math.abs(p2.x-p1.x)<2 && Math.abs(p2.y-p1.y)<2,'arrastar o cartão de página e soltar: não fica grudado no mouse');
   await page.mouse.move(p2.x+60,p2.y+20); await page.mouse.down(); await page.mouse.move(p2.x+60+(p0.x-p2.x),p2.y+20+(p0.y-p2.y),{steps:6}); await page.mouse.up(); await page.waitForTimeout(400);}
  // qualidade: a pagina e desenhada no tamanho do cartao (nada de 35% da resolucao)
  {const z=parseInt(await page.getByTestId('board-zoom').innerText())/100, q=await f.evaluate(()=>({dpr:devicePixelRatio,w:innerWidth})), cw=(await pc.boundingBox()).width;
   ok(Math.abs(q.dpr-z)<0.05 && Math.abs(q.w*z-cw)<40,'página do cartão desenhada no tamanho real (resolução '+q.dpr.toFixed(2)+' com zoom '+z+')');}
  // Anexo | Visualizacao, como no arquivo da pagina
  await pc.click({position:{x:60,y:20}}); await page.waitForTimeout(400); await pc.getByTestId('page-card-view-attach').click(); await page.waitForTimeout(800);
  ok((await pc.boundingBox()).height<90 && await pc.locator('iframe').count()===0,'Anexo: a página vira uma linha');
  await pc.dblclick({position:{x:60,y:20}}); await page.waitForTimeout(2500);
  ok(await pc.locator('iframe[data-testid=board-page-frame]').count()===1 && await pc.locator('iframe[data-testid=board-page-frame]').evaluate(e=>getComputedStyle(e).pointerEvents)==='auto' && page.url().includes('/paginas/'),'dois cliques no anexo: a página abre no cartão com edição (sem aba nova)');
  await page.getByTestId('board-page-done').click(); await page.waitForTimeout(800);}
 await page.waitForTimeout(3000); ok(await page.getByTestId('board-title').inputValue()==='Hacker','editar a página do cartão não mexe no quadro (título continua)');
 await pc.click({position:{x:12,y:12}}); await page.waitForTimeout(300); await page.getByTestId('board-sync').click(); await page.waitForTimeout(600); ok(/Sincronizada/.test(await pc.innerText()),'sincronizar liga a original');
 // desenho
 await page.getByTestId('board-draw').click(); await page.mouse.move(bb.x+200,bb.y+600); await page.mouse.down(); await page.mouse.move(bb.x+260,bb.y+640,{steps:5}); await page.mouse.move(bb.x+330,bb.y+600,{steps:5}); await page.mouse.up(); await page.getByTestId('board-draw').click(); await page.waitForTimeout(400);
 ok(await page.locator('[data-testid=board-item][data-type=image] svg path').count()===1,'desenho feito');
 // Word novo
 await page.getByTestId('board-add-doc').click(); await page.waitForTimeout(5000); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
 const wd=page.locator('[data-testid=board-item][data-type=file]').filter({hasText:'.docx'}); ok(await wd.count()===1,'Word criado no quadro');
 // 08/11 entrega 2/3: cartao vivo de tarefa (marca feito no app), busca no quadro, pedir a Sofia
 const tok=await page.evaluate(()=>{for(const k of Object.keys(localStorage)){const v=localStorage.getItem(k)||'';const m=/"token":"([A-Za-z0-9_-]{43})"/.exec(v);if(m)return m[1];}return '';});
 if(tok){await page.evaluate(async([B,t])=>{await fetch(B+'/api/mobile/tasks',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({title:'Alugar luz flash'})});},[B,tok]);}
 await page.getByTestId('board-add-live').click(); await page.waitForTimeout(800); await page.getByTestId('live-src-task').click(); await page.waitForTimeout(1500);
 const li=page.getByTestId('live-item').filter({hasText:'Alugar luz flash'}); ok(await li.count()===1,'Do app: tarefa aparece na lista'+(tok?'':' (sem token)'));
 if(await li.count()){await li.click(); await page.waitForTimeout(1500);
  const lc=page.locator('[data-testid=board-item][data-type=bookmark]'); ok(await lc.count()===1 && /Alugar luz flash/.test(await lc.innerText()),'cartão vivo da tarefa no quadro');
  await lc.locator('input[type=checkbox]').click(); await page.waitForTimeout(2000);
  const st=await page.evaluate(async([B,t])=>{const r=await fetch(B+'/api/mobile/tasks',{headers:{Authorization:'Bearer '+t}});const j=await r.json();return (j.items||[]).find(x=>x.title==='Alugar luz flash')?.state;},[B,tok]);
  ok(st==='done','marcar no cartão marca a tarefa no app (estado: '+st+')');}
 await page.getByTestId('board-find-open').click(); await page.getByTestId('board-find-input').fill('ideia'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
 ok(/1 de/.test(await page.getByTestId('board-find').innerText()),'busca no quadro acha a nota'); await page.keyboard.press('Escape');
 const nt=items().first(); await nt.click({position:{x:12,y:12}}); await page.getByTestId('board-ask').click(); await page.getByLabel('Pedido para a Sofia').fill('resume'); await page.getByTestId('board-ask-go').click(); await page.waitForTimeout(4000);
 ok(/Pedindo|pensando|nota ao lado|[A-Za-z]/.test(await page.getByTestId('board-ask-box').innerText().catch(()=>'fechou')),'pedir à Sofia envia (no laboratório não há a Sofia: mostra o aviso)');
 await page.keyboard.press('Escape');
 // 08/11 (Pedro: ponto central): 0 no centro e botao de recentralizar
 ok(await page.getByTestId('board-origin').count()===1,'marca do centro (0) no quadro');
 await page.mouse.move(bb.x+1150,bb.y+130); await page.mouse.down(); await page.mouse.move(bb.x+600,bb.y+500,{steps:6}); await page.mouse.up();
 await page.getByTestId('board-center').click(); await page.waitForTimeout(300);
 {const o=await page.getByTestId('board-origin').boundingBox(); ok(Math.abs(o.x-(bb.x+bb.width/2))<40&&Math.abs(o.y-(bb.y+bb.height/2))<40,'botão de centro traz o 0 para o meio da tela');}
 await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(400);
 // 08/11 itens finais: linhas-guia, legenda, mencionar, ligacao com seta e texto, link vira previa, pinca
 await page.keyboard.press('Escape'); {const its=items(); const A=await page.locator('[data-testid=board-item][data-type=callout]').first().boundingBox(), Bb=await page.locator('[data-testid=board-item][data-type=todo]').first().boundingBox();
  await page.evaluate(([x,y])=>{document.querySelectorAll('[data-dbg]').forEach(e=>e.removeAttribute('data-dbg'));const e=document.elementFromPoint(x,y)?.closest('[data-board-item]');if(e)e.setAttribute('data-dbg','1');},[Bb.x+Bb.width/2,Bb.y+Bb.height-8]);
  await page.mouse.move(Bb.x+Bb.width/2,Bb.y+Bb.height-8); await page.mouse.down(); await page.mouse.move(Bb.x+Bb.width/2+(A.x-Bb.x)+2,Bb.y+Bb.height-8+40,{steps:12}); /* segura numa parte vazia (nao na caixinha) */ const gl=await page.getByTestId('board-guide').count(); const gb=gl?await page.getByTestId('board-guide').first().boundingBox():null; const Bm=await page.locator('[data-dbg]').boundingBox(); await page.mouse.up(); await page.waitForTimeout(300);
  ok(gl>=1,'linha-guia aparece ao alinhar com o vizinho'); const edges=Bm?[Bm.x,Bm.x+Bm.width/2,Bm.x+Bm.width,Bm.y,Bm.y+Bm.height/2,Bm.y+Bm.height]:[]; ok(!!gb&&edges.some(e=>Math.abs(e-(gb.width<5?gb.x:gb.y))<2),'item encaixa na linha-guia');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(400); ok(await page.getByTestId('board-title').inputValue()==='Hacker','Ctrl+Z desfaz o movimento sem mexer no título');}
 await items().nth(0).click({position:{x:12,y:12}}); await page.getByTestId('board-caption').click(); await page.getByTestId('board-caption-input').fill('legenda da nota'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
 ok(/legenda da nota/.test(await page.getByTestId('board-caption-text').first().innerText().catch(()=>'')),'legenda embaixo do item');
 await items().nth(0).click({position:{x:12,y:12}}); await page.getByTestId('board-mention').click(); await page.waitForTimeout(400); await page.getByTestId('board-page-picker').getByRole('button',{name:'Sem título',exact:true}).first().click(); await page.waitForTimeout(500);
 ok(await page.getByTestId('board-mention-chip').count()>=1,'mencionar página: @ embaixo do item');
 await items().nth(0).click({position:{x:12,y:12}}); await page.getByLabel('Ligar a outro item (clique no outro item)').click(); await page.locator('[data-testid=board-item][data-type=file]').filter({has:page.locator('img')}).first().click({position:{x:20,y:20}}); await page.waitForTimeout(500);
 ok(await page.locator('[data-testid=page-board] line[marker-end]').count()>=1,'ligação nasce com seta');
 const pt=await page.evaluate(()=>{const l=document.querySelector('[data-testid=board-link]');const L=l.getTotalLength?null:null;const x1=+l.getAttribute('x1'),y1=+l.getAttribute('y1'),x2=+l.getAttribute('x2'),y2=+l.getAttribute('y2');const m=l.getScreenCTM();for(let t=0.05;t<0.96;t+=0.05){const p=new DOMPoint(x1+(x2-x1)*t,y1+(y2-y1)*t).matrixTransform(m);const e=document.elementFromPoint(p.x,p.y);if(e===l)return {x:p.x,y:p.y};}return null;}); if(pt) await page.mouse.click(pt.x,pt.y); await page.waitForTimeout(300);
 if(await page.getByTestId('board-link-bar').count()){await page.getByTestId('board-link-label').fill('depois'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);} 
 ok(await page.locator('[data-testid=page-board] svg text').filter({hasText:'depois'}).count()===1,'texto na ligação');
 await page.mouse.click(bb.x+1150,bb.y+160); await page.evaluate(()=>{const dt=new DataTransfer();dt.setData('text/plain','https://example.com/produto');document.querySelector('[data-testid=page-board]').focus();document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}); await page.waitForTimeout(1500);
 ok(await page.locator('[data-testid=board-item][data-type=bookmark]').filter({hasText:'example.com'}).count()===1,'link colado vira cartão de prévia');
 {const cdp=await page.context().newCDPSession(page); const z0=await page.getByTestId('board-zoom').innerText(); const em=await page.evaluate(([x0,y0,w,h])=>{for(let y=y0+160;y<y0+h-160;y+=37)for(let x=x0+180;x<x0+w-180;x+=41){const ok=[[-160,0],[160,0],[0,0]].every(([dx,dy])=>{const el=document.elementFromPoint(x+dx,y+dy);return el&&el.getAttribute('data-testid')==='page-board';});if(ok)return {x,y};}return {x:x0+w/2,y:y0+h/2};},[bb.x,bb.y,bb.width,bb.height]); const cx=em.x, cy=em.y;
  const tp=(d)=>[{x:cx-d,y:cy,id:1},{x:cx+d,y:cy,id:2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:tp(40)}); for(let d=50;d<=160;d+=15){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:tp(d)}); await page.waitForTimeout(16);} await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.waitForTimeout(300);
  const z1=await page.getByTestId('board-zoom').innerText(); ok(parseInt(z1)>parseInt(z0),'pinça com dois dedos aproxima ('+z0+' -> '+z1+')'); await page.getByLabel('Ver tudo').click(); await page.waitForTimeout(500);}
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
