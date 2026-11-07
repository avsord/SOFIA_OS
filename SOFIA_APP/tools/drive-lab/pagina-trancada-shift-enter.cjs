// 07/11/2026 (Pedro: "shift enter na pagina trancada atualiza e recarrega"): tranca uma pagina (Media), digita e aperta
// Shift+Enter 6 vezes. Falha se o editor for trocado (pagina redesenhada) ou o texto sumir. Uso: node pagina-trancada-shift-enter.cjs
const {chromium} = require('playwright'); const {spawn} = require('child_process'); const path=require('path').join(__dirname,'lab-server.cjs'), OUTDIR=require('os').tmpdir();
const PORT = 6100 + Math.floor(Math.random()*200)*2, B='http://127.0.0.1:'+PORT;
(async()=>{
 const lab=spawn(process.execPath,[path,String(PORT),require('fs').mkdtempSync(require('path').join(OUTDIR,'sofia-lk-'))],{stdio:['ignore','pipe','pipe']}); let log=''; lab.stdout.on('data',d=>log+=d); lab.stderr.on('data',d=>log+=d);
 for(let i=0;i<80&&!/pronto/.test(log);i++) await new Promise(r=>setTimeout(r,250));
 const br=await chromium.launch(); const page=await br.newPage({viewport:{width:1500,height:900}});
 try{
 await page.goto(B+'/paginas'); await page.waitForTimeout(1500);
 await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar',{exact:true}).last().click(); await page.waitForTimeout(3000);
 await page.goto(B+'/paginas'); await page.waitForTimeout(3000);

 await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(2000);
 const ce=page.locator('[contenteditable="true"]'); console.log('editables',await ce.count()); await page.screenshot({path:require('path').join(OUTDIR,'pagina-trancada-b.png')});
 await ce.last().click(); await page.keyboard.type('linha um'); await page.waitForTimeout(2500);
 await page.keyboard.press('Escape');
 await page.getByLabel('Opções da página').click(); await page.waitForTimeout(600); await page.getByText('Trancar com senha…').last().click(); await page.waitForTimeout(800);
 await page.getByTestId('lock-pw').fill('abcd1234'); await page.getByTestId('lock-pw2').fill('abcd1234'); await page.getByTestId('page-lock-dialog').getByText('Média',{exact:true}).click({force:true}); await page.getByTestId('lock-confirm').click(); await page.waitForTimeout(3000);
 await page.screenshot({path:require('path').join(OUTDIR,'pagina-trancada-d.png')});
 // marca o editor; se a pagina recarregar, o elemento marcado some
 const mark=()=>page.evaluate(()=>{const e=[...document.querySelectorAll('[contenteditable="true"]')].pop(); if(e) e.dataset.mk='1'; return !!e;});
 console.log('marcado',await mark());
 let flashes=0; await page.exposeFunction('flash',()=>flashes++);
 await page.evaluate(()=>{new MutationObserver(()=>{if(document.querySelector('[data-testid="page-locked"]')||!document.querySelector('[data-mk="1"]'))window.flash();}).observe(document.body,{subtree:true,childList:true});});
 const ed=page.locator('[data-mk="1"]'); await ed.click(); await page.keyboard.press('End');
 for(let k=0;k<6;k++){ await page.keyboard.type(' parte'+k); await page.keyboard.press('Shift+Enter'); await page.waitForTimeout(k%2?1800:400); }
 await page.waitForTimeout(4000);
 console.log('flashes',flashes,'editor ainda o mesmo',await page.locator('[data-mk="1"]').count(),'texto',JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('[contenteditable="true"]')].map(e=>e.innerText).join(' || '))));
 await page.screenshot({path:require('path').join(OUTDIR,'pagina-trancada-e.png')});
 const okk = flashes===0 && (await page.locator('[data-mk="1"]').count())===1 && /parte5/.test(await page.locator('[data-mk="1"]').innerText());
 console.log(okk?'✓ PAGINA TRANCADA OK':'✗ PAGINA TRANCADA RECARREGOU'); process.exitCode=okk?0:1;
 }catch(e){console.log('✗ ERR',e.message);process.exitCode=1;} await br.close(); lab.kill('SIGKILL');
})();
