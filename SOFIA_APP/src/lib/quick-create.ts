// 06/11/2026 (Pedro: "ta demorando muito pra criar, criar uma estrategia"): na janelinha da linha do tempo, pedido de criar
// e entendido aqui mesmo (sem esperar a IA) e salvo na hora. Sem dizer o tipo vira Tarefa; "na agenda", "compromisso",
// "reuniao", "consulta" viram compromisso da Agenda; "lembrete"/"me lembra" vira Lembrete. Pergunta ("?", "o que", "quais"...)
// ou texto vazio devolve null e continua indo para a Sofia.
export type QuickKind = 'task' | 'event' | 'reminder';
export type QuickCreate = {kind: QuickKind; title: string; description: string; priority: 'none' | 'important' | 'medium' | 'light'; at: Date; end: Date | null};

const QUESTION = /^(o que|oque|quais?|qual|quando|como|quanto|quantos?|onde|por que|porque|me (diga|fala|mostra|conta)|mostra|lista|tenho|existe|ha |há |sera|será)\b/i;
const strip = (s: string) => s.replace(/\s{2,}/g, ' ').replace(/^[\s,;:.\-–]+|[\s,;:\-–]+$/g, '').trim();

export function parseQuickCreate(raw: string, at: Date): QuickCreate | null {
  let text = String(raw || '').replace(/\r/g, '').trim();
  if (!text || text.length > 600 || /\?\s*$/.test(text) || QUESTION.test(text)) return null;
  let description = '';
  const d = /\bdescri[çc][ãa]o\s*:\s*/i.exec(text);
  if (d) {description = text.slice(d.index + d[0].length).trim(); text = text.slice(0, d.index);}
  // variacoes (Pedro: "nem sempre escrevo igual"): com ou sem acento, varios verbos e jeitos de dizer agenda/lembrete
  let kind: QuickKind = 'task';
  const AGENDA = /\b(n[ao]s? agenda|(?:para|pra|pro) (?:a )?agenda|agenda|agendar?|agende|no calend[aá]rio|calend[aá]rio|compromisso|reuni[ãa]o|reuniao|consulta|encontro|call|evento)\b/i;
  const REMIND = /\b(lembrete|me lembr[ae]|me lembrar|lembr[ae]-me|lembrar de|me avis[ae]|n[ãa]o esquecer|nao esquecer)\b/i;
  if (REMIND.test(text)) kind = 'reminder';
  else if (AGENDA.test(text)) kind = 'event';
  // primeiro tira o jeito de dizer agenda/lembrete (antes dos verbos: "agendar" engolia o "agenda" de "na agenda")
  text = text.replace(/\b(n[ao]s? agenda|(?:para|pra|pro) (?:a )?agenda|agenda|no calend[aá]rio|calend[aá]rio|na tarefa|como tarefa|uma tarefa|tarefa|compromisso|evento|lembrete|me lembr[ae]( de)?|me lembrar( de)?|lembr[ae]-me( de)?|lembrar de|me avis[ae]( de| para| pra)?|n[ãa]o esquecer( de)?)\b/gi, ' ');
  text = text.replace(/\b(cri[ae]r?|coloc[ae]r?|adicion[ae]r?|marc[ae]r?|agend[ae]r?|agende|anot[ae]r?|bot[ae]r?|p[õo]e|por|p[ôo]r|jog[ae]r?|faz|fazer|inclui|incluir|registr[ae]r?)\b\s*(um|uma|o|a)?\s*/gi, ' ');
  let priority: QuickCreate['priority'] = 'none';
  const p = /\b(?:com\s+)?(?:prioridade|prio)\s+(alta|importante|urgente|m[ée]dia|media|baixa|leve)\b|\b(importante|urgente|sem pressa)\b|(!{1,3})/i.exec(text);
  if (p) {const w = (p[1] || p[2] || '').toLowerCase(), bangs = (p[3] || '').length; priority = bangs ? (bangs >= 3 ? 'important' : bangs === 2 ? 'medium' : 'light') : /alta|importante|urgente/.test(w) ? 'important' : /m[ée]dia|media/.test(w) ? 'medium' : 'light'; text = text.replace(p[0], ' ');}
  // horario: "das 6h ate 7:30" (inicio e fim) ou "as 15h" (so inicio), no dia clicado
  let start = new Date(at), end: Date | null = null;
  const day = (h: number, m: number) => {const x = new Date(at); x.setHours(h, m, 0, 0); return x;};
  const range = /\b(?:das?|de)\s+(\d{1,2})(?:[:h](\d{2}))?\s*(?:h(?:rs?|oras?)?)?\s*(?:at[ée]|às?|a|-|–)\s*(?:as\s+)?(\d{1,2})(?:[:h](\d{2}))?\s*(?:h(?:rs?|oras?)?)?/i.exec(text)
    || /\b(\d{1,2})(?:h|:)(\d{2})?\s*(?:-|–|at[ée])\s*(\d{1,2})(?:h|:)(\d{2})?\s*(?:h(?:rs?|oras?)?)?/i.exec(text);
  if (range) {const h1 = +range[1], m1 = +(range[2] || 0), h2 = +range[3], m2 = +(range[4] || 0);
    if (h1 < 24 && h2 < 24 && m1 < 60 && m2 < 60) {start = day(h1, m1); end = day(h2, m2); if (end <= start) end = new Date(end.getTime() + 86400000); text = text.replace(range[0], ' ');}}
  // so o fim ("desse horario ate 17h", "ate as 17:30", "ate 17horas"): comeca no horario clicado
  else if (/\bat[ée]\s*(?:as\s+|às\s+)?\d/i.test(text)) {const u = /(?:\b(?:desse|deste|nesse|neste)\s+hor[áa]rio\s+|\bdaqui\s+|\bagora\s+)?\bat[ée]\s*(?:as\s+|às\s+)?(\d{1,2})(?:[:h](\d{2}))?\s*(?:h(?:rs?|oras?)?)?(?:\s*(?:da|de)\s+(manh[ãa]|tarde|noite))?/i.exec(text);
    if (u) {let h = +u[1]; const m = +(u[2] || 0), part = (u[3] || '').toLowerCase(); if ((part === 'tarde' || part === 'noite') && h < 12) h += 12;
      if (h < 24 && m < 60) {end = day(h, m); if (end <= start) end = new Date(end.getTime() + 86400000); text = text.replace(u[0], ' ');}}}
  else {const one = /\b(?:(?:às?|as|pras?|para as)\s+)?(\d{1,2})(?:(?:[:h])(\d{2})|\s*h(?:rs?|oras?)?\b|(?=\s*(?:da|de)\s+(?:manh[ãa]|tarde|noite)))(?:\s*(?:da|de)\s+(manh[ãa]|tarde|noite))?/i.exec(text);
    if (one) {let h = +one[1]; const m = +(one[2] || 0), part = (one[3] || '').toLowerCase(); if ((part === 'tarde' || part === 'noite') && h < 12) h += 12;
      if (h < 24 && m < 60) {start = day(h, m); text = text.replace(one[0], ' ');}}}
  let title = strip(text.replace(/\b(hoje|amanh[ãa]|(?:desse|deste|nesse|neste)\s+hor[áa]rio)\b/gi, ' ').replace(/(^|\s)(às|as|pras?|para as)(?=\s|$)/gi, ' '));
  if (!title || title.length < 2) return null;
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return {kind, title: title.slice(0, 200), description: description.slice(0, 8000), priority, at: start, end};
}
