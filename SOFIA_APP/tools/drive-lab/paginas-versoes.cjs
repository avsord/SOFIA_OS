// 08/11/2026 (Pedro: "as paginas tambem guardam versoes"): cria uma pagina, edita 3 vezes, abre Versoes anteriores, volta
// para a 1a e confere o texto (e depois de recarregar). Uso: node paginas-versoes.cjs
const {chromium} = require('playwright'); const {spawn} = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 6500 + Math.floor(Math.random() * 200) * 2, B = 'http://127.0.0.1:' + PORT;
(async () => {
  const lab = spawn(process.execPath, [path.join(__dirname, 'lab-server.cjs'), String(PORT), fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-vs-'))], {stdio: ['ignore', 'pipe', 'pipe']}); let log = ''; lab.stdout.on('data', d => log += d); lab.stderr.on('data', d => log += d);
  for (let i = 0; i < 80 && !/pronto/.test(log); i++) await new Promise(r => setTimeout(r, 250));
  const br = await chromium.launch(); const page = await br.newPage({viewport: {width: 1500, height: 900}});
  let ok = false;
  try {
    await page.goto(B + '/paginas'); await page.waitForTimeout(1500);
    await page.getByPlaceholder('Seu e-mail cadastrado').fill('lab@sofia.local'); await page.getByPlaceholder('Senha da sua conta').fill('senha-do-laboratorio-123'); await page.getByText('Entrar', {exact: true}).last().click(); await page.waitForTimeout(3000);
    await page.goto(B + '/paginas'); await page.waitForTimeout(3000);
    await page.getByLabel('Nova página').first().click(); await page.waitForTimeout(2000);
    const ed = () => page.locator('[contenteditable="true"]').last();
    for (const t of ['versao um', 'versao dois', 'versao tres']) { await ed().click(); await page.keyboard.press('Control+a'); await page.keyboard.type(t); await page.waitForTimeout(3500); }
    await page.getByLabel('Opções da página').click(); await page.waitForTimeout(500); await page.getByText('Versões anteriores…').last().click(); await page.waitForTimeout(2500);
    const rows = page.locator('[data-testid^="page-version-"]').filter({hasNot: page.locator('[data-testid="page-version-preview"]')});
    const n = await page.locator('[data-testid="page-versions-list"] [role="radio"]').count(); console.log('versoes na lista', n);
    let found = false;
    for (let i = 0; i < n && !found; i++) { await page.locator('[data-testid="page-versions-list"] [role="radio"]').nth(i).click(); await page.waitForTimeout(600); const pv = await page.getByTestId('page-version-preview').innerText().catch(() => ''); if (/versao um/.test(pv)) found = true; }
    console.log('achou a versao 1 na previa', found);
    await page.getByTestId('page-version-restore').click(); await page.waitForTimeout(3500);
    const now = await ed().innerText(); console.log('texto depois de voltar:', JSON.stringify(now));
    await page.reload(); await page.waitForTimeout(4000);
    const after = await page.evaluate(() => [...document.querySelectorAll('[contenteditable="true"]')].map(e => e.innerText).join(' | ')); console.log('depois de recarregar:', JSON.stringify(after));
    ok = found && /versao um/.test(now) && /versao um/.test(after) && !/versao tres/.test(after);
  } catch (e) { console.log('✗ ERR', e.message); }
  console.log(ok ? '✓ VERSOES OK' : '✗ VERSOES FALHOU'); process.exitCode = ok ? 0 : 1;
  await br.close(); lab.kill('SIGKILL');
})();
