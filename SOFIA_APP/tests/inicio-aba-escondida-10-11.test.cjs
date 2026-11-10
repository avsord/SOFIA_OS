// 10/11/2026 (print do Pedro: "Boa noite, Pedro" e o Inicio vazio ao ligar o PC; "linha do tempo com muito lag quando rola o scroll")
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('site: a trava das leituras abre sozinha com a aba escondida', () => {
  const a = read('src/lib/api.ts');
  assert.ok(a.includes('this.networkGate=new Promise<void>(resolve=>{this.releaseGate=resolve;});armNetworkFallback(this);'), 'toda trava nova arma o plano B');
  assert.ok(a.includes("setTimeout(() => open('relogio'), 1500)"), 'relogio abre em ate 1,5 s (anda com a aba escondida)');
  assert.ok(a.includes("document.addEventListener('visibilitychange', onVis)") && a.includes("window.addEventListener('focus', onFocus)"), 'abre ao voltar para a janela');
  assert.ok(a.includes("if (typeof document === 'undefined' || typeof window === 'undefined'"), 'no Android nada muda');
  assert.ok(a.includes('networkHeld(){return !!this.releaseGate;}'), 'o medidor sabe se a trava ainda estava fechada');
  for (const f of ['src/lib/use-launch-visible.ts', 'src/lib/use-after-first-paint.ts']) {
    const s = read(f);
    assert.ok(s.includes("const clock=typeof document!=='undefined'&&typeof setTimeout==='function'?setTimeout(done,1500):null;") && s.includes('if(clock)clearTimeout(clock);'), f + ': relogio no site');
  }
});

test('Inicio: faltando dado no prazo, pede tudo de novo uma vez e avisa no medidor', () => {
  const h = read('src/screens/Home.tsx');
  assert.ok(h.includes('const retried=useRef(false);'), 'tenta de novo so uma vez');
  assert.ok(h.includes('if(miss.length&&!retried.current){retried.current=true;try{api.releaseNetwork();}catch{/* ja aberta */}setRefreshEpoch(x=>x+1);}'), 'abre a trava e recarrega');
  assert.ok(h.includes("alert:'inicio-incompleto',missing:miss,held,netFallback:"), 'o alarme diz se a trava estava fechada e qual plano B abriu');
});

test('linha do tempo: rodinha sem refazer os botoes nem os blocos', () => {
  const b = read('src/desktop/HomeBrief.tsx');
  assert.ok(b.includes('const LiteDot = ({style, children}: any) => <View pointerEvents="none"'), 'bolinha leve deslizando');
  assert.ok(b.includes('const lite = WEB && moving, Dot: any = lite ? LiteDot : Pressable;') && b.includes('if (WEB && !lite) HITS.push('), 'deslizando sem botao nem area de clique');
  assert.ok(!/<Pressable key=\{p\.key\}/.test(b), 'todas as bolinhas passam pelo Dot');
  assert.ok(b.includes('x >= -1.2 && x <= 2.2') && b.includes('Math.abs(start - frozen.current.start) < SPAN * 1.1'), 'camada mais larga, refeita menos vezes');
  assert.ok(b.includes('const sortedItems = useMemo(') && b.includes('for (const r of sortedItems)'), 'ordem dos itens fora do quadro a quadro');
  assert.ok(b.includes('const deskRows = useMemo(() => p.compact ? null :') && b.includes('{deskRows}'), 'trocar o dia do cabecalho nao redesenha os blocos');
});
