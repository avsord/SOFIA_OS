'use strict';
// Dados de exemplo realistas para o robo do site (07/11/2026). Usa so a API do proprio site (como o app faria), num
// servidor de TESTE. Nomes longos, acentos, emoji, muitos itens: o que costuma revelar texto cortado e tela cheia.
// Uso: node tools/site-robot/seed.cjs <url-de-teste> <email> <senha>
const [base, email, password] = process.argv.slice(2);
if (/railway\.app|sofiaos\./.test(base || '')) { console.error('recusado: so servidor de teste'); process.exit(2); }
const day = (add = 0, h = 9, m = 0) => { const d = new Date(); d.setDate(d.getDate() + add); d.setHours(h, m, 0, 0); return d.toISOString(); };
const date = (add = 0) => day(add).slice(0, 10);
async function main() {
  const login = await (await fetch(base + '/api/mobile/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password, device_name: 'robo'})})).json();
  if (!login.token) throw new Error('login falhou: ' + JSON.stringify(login));
  const H = {Authorization: 'Bearer ' + login.token, 'Content-Type': 'application/json'};
  const made = {}, fails = [];
  const post = async (path, body) => { const r = await fetch(base + '/api/mobile' + path, {method: 'POST', headers: H, body: JSON.stringify(body)}); const j = await r.json().catch(() => ({})); if (!r.ok) fails.push(path + ' ' + (body.kind || '') + ': ' + r.status + ' ' + (j.error || '').slice(0, 120)); return j; };
  const ent = async (kind, title, data = {}, extra = {}) => { const j = await post('/workspace/entities', {kind, title, area: 'Pessoal', privacy: 'private', state: extra.state || 'active', tags: extra.tags || [], content: extra.content || '', data}); made[kind] = (made[kind] || 0) + 1; return j.item || j.entity || j; };
  // Agenda: hoje, amanha, semana, com nome comprido
  const ev = [['Reunião de planejamento trimestral com a equipe de produto e marketing', 0, 10, 11], ['Dentista', 0, 15, 16], ['Jantar com a família', 0, 20, 22], ['Aniversário da Ana 🎂', 1, 0, 0, true], ['Consulta médica', 1, 9, 10], ['Treino', 2, 7, 8], ['Entrega do relatório', 3, 17, 18], ['Viagem para São Paulo — voo LA3400', 5, 6, 9], ['Call com cliente internacional (fuso diferente)', 6, 13, 14]];
  for (const [t, a, h1, h2, allDay] of ev) await ent('commitment', t, allDay ? {calendar_all_day: true, calendar_date_start: date(a), calendar_date_end: date(a + 1), start_at: day(a, 0)} : {start_at: day(a, h1), end_at: day(a, h2), location: t.length > 30 ? 'Sala 3 — prédio B' : ''}, {state: 'planned'});
  // Tarefas
  for (const [t, a, p] of [['Pagar a conta de luz', 0, 'high'], ['Ligar para o banco sobre o cartão', 0, 'medium'], ['Revisar a proposta comercial da empresa ABC antes da reunião de sexta-feira', 1, 'high'], ['Comprar presente', 2, 'low'], ['Renovar CNH', 10, 'medium'], ['Organizar a garagem', -2, 'low'], ['Responder e-mails', 0, 'medium']])
    await post('/tasks', {title: t, due_at: day(a, 18), priority: p});
  // Paginas com conteudo e subpaginas
  const pg = await ent('user_page', 'Planejamento 2027', {icon: '🗓️'}, {content: '# Metas\n- Correr uma meia maratona\n- Ler 24 livros\n\n## Viagens\nJapão em abril, Portugal em setembro.'});
  for (const t of ['Receitas favoritas', 'Ideias de negócio', 'Estudos de inglês', 'Casa nova — reforma', 'Leituras', 'Diário de bordo'])
    await ent('user_page', t, {}, {content: 'Texto de exemplo para ' + t + '.\n\n- item um\n- item dois'});
  if (pg && pg.id) await ent('user_page', 'Metas do primeiro trimestre', {parent_id: pg.id}, {content: 'Subpágina.'});
  // Financas
  const acc0 = await ent('fin_account', 'Conta principal', {account_type: 'corrente', initial_balance: '3500', include_total: true, color: '#7258E8'});
  const acc = acc0 && (acc0.id ? acc0 : acc0.item);
  const card = await ent('fin_card', 'Cartão Nubank', {limit: 5000, closing_day: 9, due_day: 15, color: '#8A05BE', account_id: acc && acc.id});
  for (const [t, kind, amount, cat, add] of [['Salário', 'income', 6200, 'Salário', -5], ['Aluguel', 'expense', 1800, 'Moradia', -3], ['Mercado', 'expense', 412.37, 'Alimentação', -1], ['Uber', 'expense', 23.9, 'Transporte', 0], ['Netflix', 'expense', 55.9, 'Assinaturas', -2], ['Farmácia', 'expense', 87.4, 'Saúde', -4]])
    await ent('fin_tx', t, {kind, amount, category: cat, date: date(add), account_id: acc && acc.id, paid: true});
  await ent('fin_tx', 'Tênis de corrida', {kind: 'expense', amount: 699, category: 'Compras', date: date(-1), card_id: card && card.id, installments: 3, installment: 1});
  await ent('fin_goal', 'Reserva de emergência', {target: 20000, saved: 7400, deadline: date(300), role: 'reserve', monthly_plan: 800, account_id: acc && acc.id});
  // Listas, lembretes, rotina, encomendas, biblioteca, notas
  const lst = await ent('list_collection', 'Mercado da semana', {template: 'market', icon: '🛒'});
  for (const t of ['Arroz integral', 'Feijão', 'Azeite extra virgem', 'Café', 'Banana', 'Leite sem lactose', 'Pão de forma integral com grãos e sementes'])
    await ent('list_item', t, {collection_id: lst && lst.id, quantity: '1'}, {state: 'needed'});
  await ent('list_collection', 'Viagem — checklist', {template: 'simple'});
  await ent('reminder', 'Tomar água', {remind_at: day(0, 16), message: 'Beber 500 ml'});
  await ent('reminder', 'Buscar as roupas na lavanderia', {remind_at: day(1, 12)});
  await ent('capsule', 'Vitamina D', {rotina_type: 'capsula', capsule_type: 'supplement', dose_text: '1 cápsula', times_json: '["08:00"]', start_date: date(-10), repeat_type: 'daily'});
  await ent('capsule', 'Alongamento', {rotina_type: 'habito', times_json: '["07:00"]', start_date: date(-3), repeat_type: 'daily'});
  await ent('package', 'Fone de ouvido', {code: 'NL123456789BR', carrier: 'correios', status: 'Objeto em trânsito'});
  for (const [t, type, extra] of [['Duna', 'film', {year: 2021, creator: 'Denis Villeneuve'}], ['O nome do vento', 'reading', {creator: 'Patrick Rothfuss'}], ['Bohemian Rhapsody', 'music', {creator: 'Queen'}]])
    await ent('library_item', t, {type, ...extra}, {state: 'saved'});
  for (const t of ['Ideia: app de receitas por voz', 'Senha do Wi-Fi da casa da praia', 'Lista de presentes de Natal'])
    await ent('annotation', t, {}, {state: 'saved', content: 'Conteúdo da nota ' + t});
  console.log(JSON.stringify({ok: !fails.length, made, fails: fails.slice(0, 20)}));
}
main().catch(e => { console.error(e); process.exit(1); });
