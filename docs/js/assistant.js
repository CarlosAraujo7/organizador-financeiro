/* Assistente de IA: transforma texto, voz ou foto em lançamentos (que o usuário confirma)
 * e responde perguntas sobre os números. Usa function calling do Gemini.
 *
 * Princípio: o modelo NUNCA grava nada. Ele só "propõe" lançamentos, que aparecem como cartões
 * com Salvar / Editar / Descartar. Consultas (resumo do mês, vencimentos) rodam aqui no navegador
 * e só devolvem números para o modelo explicar. */
import {
  uid, escHtml, escAttr, fmtBRL, fmtDateBR, todayStr, currentMonthStr, nextMonth, isValidDate, isValidMonth,
  parseMoney, norm, monthLabel, monthAbbr, WEEKDAYS,
} from './util.js';
import { ENTITY_DEFS, tagEmoji } from './defs.js';
import {
  state, addItem, removeItem, canonicalTag, isActiveInMonth, collectAllTags, monthIncomeLines, monthExpenseLines, monthTotals,
  upcomingDue, personShort, tagColor,
} from './store.js';
import { icon } from './icons.js';
import { callGemini, getAIConfig, setAIConfig, testKey, modelLabel, GeminiError } from './gemini.js';
import { openModal } from './modal.js';
import { toast, tagChip } from './ui.js';

const CHAT_KEY = 'livro-caixa-chat-v1';
const MAX_SAVED = 60;
const HISTORY_TURNS = 14;
const MAX_STEPS = 5;

const chat = { messages: [] };
let loaded = false;
let busy = false;
let pendingImage = null; // { b64, mime, thumb }
let lastReq = null;      // para "tentar de novo"
let listening = false;
let recog = null;

const $ = (id) => document.getElementById(id);
const round2 = (n) => Math.round(n * 100) / 100;

/* ============================================================ persistência */
function loadChat() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}');
    if (Array.isArray(raw.messages)) chat.messages = raw.messages;
  } catch (e) { /* conversa vazia */ }
}
function persist() {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify({ messages: chat.messages.slice(-MAX_SAVED) })); }
  catch (e) { /* sem espaço: a conversa continua só na memória */ }
}

/* ===================================================== ferramentas (Gemini) */
const TIPOS = ['gasto', 'renda', 'assinatura', 'gasto_fixo', 'cartao_parcelado', 'emprestimo', 'conta_casa', 'contribuicao_casa'];
const TIPO_LABEL = {
  gasto: 'Gasto', renda: 'Renda', assinatura: 'Assinatura', gasto_fixo: 'Gasto fixo', cartao_parcelado: 'Cartão parcelado',
  emprestimo: 'Empréstimo', conta_casa: 'Conta da casa', contribuicao_casa: 'Recebido da casa',
};
const DEFAULT_TAG = {
  gasto: 'Outros', renda: 'Trabalho', assinatura: 'Assinaturas', gasto_fixo: 'Outros', cartao_parcelado: 'Compras',
  emprestimo: 'Outros', conta_casa: 'Moradia', contribuicao_casa: 'Moradia',
};

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'propor_lancamentos',
      description: 'Propõe lançamentos financeiros para o usuário revisar e confirmar na tela. NÃO grava nada. Use sempre que o usuário relatar (por texto, voz, extrato colado ou foto) gastos, compras, pagamentos, assinaturas, parcelamentos, empréstimos, rendas/recebimentos ou valores que um morador mandou para a casa. Inclua todos os itens de uma vez, em uma única chamada.',
      parameters: {
        type: 'object',
        properties: {
          itens: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tipo: { type: 'string', enum: TIPOS, description: 'gasto = compra/pagamento avulso (mercado, uber, restaurante, farmácia, também compra no crédito à vista); gasto_fixo = conta mensal de valor estável; assinatura = serviço recorrente (streaming, nuvem, app); cartao_parcelado = compra parcelada no cartão; emprestimo = parcelas de empréstimo/financiamento; renda = dinheiro que entrou (salário, bolsa, freela, pix recebido); conta_casa = conta rateada entre moradores; contribuicao_casa = um morador mandou dinheiro para as contas da casa.' },
                descricao: { type: 'string', description: 'Descrição curta e clara (ex.: "Mercado", "Uber para a UFC", "Netflix").' },
                valor: { type: 'number', description: 'Valor em reais. Em cartao_parcelado e emprestimo é o valor de CADA PARCELA (se o usuário informar o total, divida pelo número de parcelas). Em conta_casa é o valor TOTAL da conta.' },
                etiqueta: { type: 'string', description: 'Etiqueta/categoria. Prefira uma das etiquetas já usadas pelo usuário; só invente uma nova se nenhuma servir.' },
                data: { type: 'string', description: 'YYYY-MM-DD. Data da compra/pagamento/recebimento. Padrão: hoje.' },
                dia: { type: 'integer', description: 'Dia do mês (1-31) do vencimento/cobrança/recebimento, para tipos recorrentes ou parcelados.' },
                mes_inicio: { type: 'string', description: 'YYYY-MM em que começa a valer (1ª parcela, início da assinatura...). Padrão: mês da data ou o mês atual.' },
                mes_fim: { type: 'string', description: 'YYYY-MM do ÚLTIMO mês em que ainda vale (inclusive). Deixe vazio se não tem fim.' },
                recorrente: { type: 'boolean', description: 'Só para renda e conta_casa: true se se repete todo mês.' },
                parcelas: { type: 'integer', description: 'Número total de parcelas (cartao_parcelado e emprestimo).' },
                cartao: { type: 'string', description: 'Nome do cartão (ex.: Nubank) SOMENTE se o usuário disse. Se não disse, deixe vazio: nunca invente.' },
                pessoa: { type: 'string', enum: ['me', 'p2', 'p3'], description: 'Só para contribuicao_casa: quem mandou o dinheiro.' },
                meu_pct: { type: 'number', description: 'Só conta_casa: % do usuário (ex.: 34).' },
                p2_pct: { type: 'number', description: 'Só conta_casa: % do morador 2.' },
                p3_pct: { type: 'number', description: 'Só conta_casa: % do morador 3.' },
                observacao: { type: 'string', description: 'Nota opcional.' },
              },
              required: ['tipo', 'descricao', 'valor'],
            },
          },
        },
        required: ['itens'],
      },
    },
    {
      name: 'consultar_mes',
      description: 'Consulta os números reais do app para um mês: renda, gastos, saldo, gastos por etiqueta e a lista de lançamentos, com filtro opcional por texto ou etiqueta. Use para responder qualquer pergunta sobre os gastos/renda do usuário. Nunca chute números.',
      parameters: {
        type: 'object',
        properties: {
          mes: { type: 'string', description: 'YYYY-MM. Padrão: mês atual.' },
          texto: { type: 'string', description: 'Filtra lançamentos cuja descrição ou etiqueta contenha este texto (ex.: "uber").' },
          etiqueta: { type: 'string', description: 'Filtra por etiqueta.' },
        },
      },
    },
    {
      name: 'proximos_vencimentos',
      description: 'Lista contas que vencem nos próximos dias (assinaturas, fixos, parcelas de cartão/empréstimo e sua parte das contas da casa).',
      parameters: { type: 'object', properties: { dias: { type: 'integer', description: 'Janela em dias a partir de hoje (padrão 7, máximo 31).' } } },
    },
  ],
}];

function recurringNames() {
  const names = [];
  state.sharedExpenses.forEach((x) => names.push(x.name + ' (casa)'));
  state.fixedExpenses.forEach((x) => names.push(x.name + ' (fixo)'));
  state.subscriptions.forEach((x) => names.push(x.name + ' (assinatura)'));
  state.loans.forEach((x) => names.push(x.name + ' (empréstimo)'));
  return names.slice(0, 30).join(', ');
}

function buildSystemPrompt() {
  const today = todayStr();
  const d = new Date();
  const month = currentMonthStr();
  const t = monthTotals(month);
  const c = state.config;
  return `Você é o assistente do Livro-Caixa, um app pessoal de controle financeiro de ${c.ownerName}. Seu trabalho é facilitar o registro e a organização dos gastos: transformar o que o usuário conta (texto, voz transcrita, extrato colado ou foto de comprovante/print) em lançamentos e responder perguntas sobre os números dele.

Hoje é ${WEEKDAYS[d.getDay()]}, ${today}. Mês atual: ${month}.
Pessoas: ${c.ownerName} (o usuário, "me"), ${c.roommate2Name} ("p2") e ${c.roommate3Name} ("p3") dividem as contas da casa.
Resumo de ${monthLabel(month)}: renda ${fmtBRL(t.income)}, gastos ${fmtBRL(t.expense)}, saldo ${fmtBRL(t.balance)}.
Etiquetas já usadas pelo usuário: ${collectAllTags().join(', ')}.
Contas recorrentes já cadastradas: ${recurringNames() || 'nenhuma'}.

COMO AGIR
1. Quando o usuário relatar gasto, compra, pagamento, assinatura, parcelamento, empréstimo, renda ou dinheiro recebido de morador, chame propor_lancamentos UMA vez com todos os itens. Isso não grava nada: o usuário revisa e confirma na tela.
2. Nunca invente valores. Se faltar o valor, ou a mensagem for ambígua demais, faça UMA pergunta curta em vez de propor. Para o resto, assuma o mais provável (data = hoje, etiqueta mais adequada); o usuário corrige no cartão.
3. Avulso x recorrente: na dúvida, use "gasto" (avulso). Só use gasto_fixo, assinatura, conta_casa ou emprestimo quando o usuário disser que se repete ("todo mês", "mensal", "assinei", "fixo", "parcelado"). Se ele disser que pagou uma conta que JÁ está nas contas recorrentes cadastradas (ex.: "paguei a internet"), não crie outra recorrente: avise que ela já está cadastrada e só proponha um gasto avulso se for um pagamento extra ou diferente.
4. Converta datas relativas ("ontem", "segunda", "dia 5", "semana passada") em YYYY-MM-DD com base em hoje. Não use datas futuras, a menos que o usuário peça.
5. Nunca invente nome de cartão, pessoa ou local: se não foi dito, deixe em branco. Em compras parceladas, "valor" é o valor de cada parcela. Se o usuário disser só o total ("600 em 4x"), divida (150). Compra no crédito à vista é "gasto".
6. Fotos, prints e extratos: extraia cada transação visível como um item e ignore saldos e totais. Se algo estiver ilegível, diga qual parte.
7. Perguntas sobre os dados: chame consultar_mes ou proximos_vencimentos e responda só com o que voltou. Quando o filtro for "hoje" ou "ontem", use a data do lançamento para conferir.
8. Responda em português do Brasil, com tom simpático e direto, curto, sem repetir o que já aparece nos cartões. Dinheiro no formato R$ 1.234,56. Pode usar **negrito** e listas com "-".
9. Você só organiza registros: não movimenta dinheiro nem recomenda investimentos. Pode sugerir cortes e ajustes de orçamento com base nos números reais do usuário.`;
}

/* ====================================================== normalização dos itens */
const clampDay = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null; };
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function resolvePessoa(v) {
  const s = norm(v);
  if (['me', 'p2', 'p3'].includes(s)) return s;
  const c = state.config;
  if (s && s === norm(c.ownerName)) return 'me';
  if (s && s === norm(c.roommate3Name)) return 'p3';
  return 'p2';
}

/** Valida e completa um item vindo do modelo. Devolve {error} se não der pra aproveitar. */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'item inválido' };
  const tipo = TIPOS.includes(raw.tipo) ? raw.tipo : 'gasto';
  const valor = parseMoney(raw.valor);
  const descricao = str(raw.descricao);
  if (valor === null || valor <= 0) return { error: descricao || 'item sem valor' };
  const dataOk = isValidDate(raw.data) ? raw.data : null;
  const it = {
    tipo,
    descricao: descricao || TIPO_LABEL[tipo],
    valor: round2(valor),
    etiqueta: canonicalTag(raw.etiqueta) || DEFAULT_TAG[tipo],
    data: dataOk || todayStr(),
    dia: clampDay(raw.dia) || (dataOk ? parseInt(dataOk.slice(8), 10) : new Date().getDate()),
    mes_inicio: isValidMonth(raw.mes_inicio) ? raw.mes_inicio : (dataOk ? dataOk.slice(0, 7) : currentMonthStr()),
    mes_fim: isValidMonth(raw.mes_fim) ? raw.mes_fim : null,
    recorrente: typeof raw.recorrente === 'boolean' ? raw.recorrente : (tipo === 'conta_casa'),
    parcelas: Math.max(1, parseInt(raw.parcelas, 10) || 1),
    cartao: str(raw.cartao),
    pessoa: resolvePessoa(raw.pessoa),
    observacao: str(raw.observacao),
  };
  const pcts = [raw.meu_pct, raw.p2_pct, raw.p3_pct].map(parseMoney);
  const okPcts = pcts.every((p) => p !== null && p >= 0) && Math.abs(pcts[0] + pcts[1] + pcts[2] - 100) <= 0.5;
  [it.meu_pct, it.p2_pct, it.p3_pct] = okPcts ? pcts : [34, 33, 33];
  return it;
}

/** Converte o item no formato de cada tabela do app. */
export function toEntity(it) {
  const notes = it.observacao || '';
  const end = it.mes_fim ? nextMonth(it.mes_fim) : null;
  switch (it.tipo) {
    case 'renda': {
      const rec = !!it.recorrente;
      return { entityKey: 'income', data: { description: it.descricao, value: it.valor, category: it.etiqueta, day: it.dia, startMonth: it.mes_inicio, recurring: rec, endMonth: rec ? end : nextMonth(it.mes_inicio), notes } };
    }
    case 'assinatura':
      return { entityKey: 'subscriptions', data: { name: it.descricao, value: it.valor, category: it.etiqueta, billingDay: it.dia, startMonth: it.mes_inicio, endMonth: end, notes } };
    case 'gasto_fixo':
      return { entityKey: 'fixedExpenses', data: { name: it.descricao, value: it.valor, category: it.etiqueta, day: it.dia, startMonth: it.mes_inicio, endMonth: end, notes } };
    case 'cartao_parcelado':
      return { entityKey: 'cardInstallments', data: { description: it.descricao, cardName: it.cartao, installmentValue: it.valor, installmentsCount: it.parcelas, day: it.dia, startMonth: it.mes_inicio, category: it.etiqueta, notes } };
    case 'emprestimo':
      return { entityKey: 'loans', data: { name: it.descricao, installmentValue: it.valor, installmentsCount: it.parcelas, day: it.dia, startMonth: it.mes_inicio, category: it.etiqueta, notes } };
    case 'conta_casa':
      return { entityKey: 'sharedExpenses', data: { name: it.descricao, value: it.valor, category: it.etiqueta, splitMePct: it.meu_pct, split2Pct: it.p2_pct, split3Pct: it.p3_pct, day: it.dia, startMonth: it.mes_inicio, recurring: it.recorrente !== false, endMonth: it.recorrente !== false ? end : nextMonth(it.mes_inicio), notes } };
    case 'contribuicao_casa':
      return { entityKey: 'contributions', data: { person: it.pessoa, value: it.valor, type: 'Mensal', date: it.data, note: it.observacao || (it.descricao !== TIPO_LABEL.contribuicao_casa ? it.descricao : '') } };
    default:
      return { entityKey: 'variableExpenses', data: { description: it.descricao, value: it.valor, category: it.etiqueta, date: it.data, notes } };
  }
}

const DUP_MAP = {
  renda: ['income', 'description', 'value'], assinatura: ['subscriptions', 'name', 'value'], gasto_fixo: ['fixedExpenses', 'name', 'value'],
  cartao_parcelado: ['cardInstallments', 'description', 'installmentValue'], emprestimo: ['loans', 'name', 'installmentValue'],
  conta_casa: ['sharedExpenses', 'name', 'value'],
};
/** Aviso se já existe algo parecido salvo (evita lançar duas vezes). */
function findDup(it) {
  const close = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.005;
  if (it.tipo === 'gasto') {
    const h = state.variableExpenses.find((x) => x.date === it.data && close(x.value, it.valor));
    if (h) return `Já existe "${h.description}" de ${fmtBRL(h.value)} em ${fmtDateBR(h.date)}. Salve só se for outro.`;
    // pagamento de uma conta que já entra todo mês: lançar de novo contaria em dobro
    const m = it.data.slice(0, 7);
    const d = norm(it.descricao);
    const rec = [
      ...state.sharedExpenses.filter((x) => isActiveInMonth(x, m)).map((x) => [x.name, 'casa']),
      ...state.fixedExpenses.filter((x) => isActiveInMonth(x, m)).map((x) => [x.name, 'fixo']),
      ...state.subscriptions.filter((x) => isActiveInMonth(x, m)).map((x) => [x.name, 'assinatura']),
    ].find(([name]) => { const n = norm(name); return n.length >= 3 && (d.includes(n) || n.includes(d)); });
    return rec ? `"${rec[0]}" já está cadastrada como conta recorrente (${rec[1]}) e já entra nos gastos do mês. Salve só se for um pagamento a mais.` : null;
  }
  if (it.tipo === 'contribuicao_casa') {
    const h = state.contributions.find((x) => x.date === it.data && x.person === it.pessoa && close(x.value, it.valor));
    return h ? `Já existe um registro igual de ${personShort(h.person)} em ${fmtDateBR(h.date)}. Salve só se for outro.` : null;
  }
  const map = DUP_MAP[it.tipo];
  if (!map) return null;
  const [coll, nameKey, valKey] = map;
  const h = state[coll].find((x) => norm(x[nameKey]) === norm(it.descricao) && close(x[valKey], it.valor));
  return h ? `Já existe "${h[nameKey]}" com esse valor. Salve só se for outro.` : null;
}

/* ========================================================= consultas locais */
function toolConsultarMes(args = {}) {
  const m = isValidMonth(args.mes) ? args.mes : currentMonthStr();
  const totals = monthTotals(m);
  const q = norm(args.texto || '');
  const tg = norm(args.etiqueta || '');
  const all = [...monthIncomeLines(m), ...monthExpenseLines(m)];
  const filtered = all.filter((l) =>
    (!q || norm(l.label).includes(q) || norm(l.category).includes(q)) && (!tg || norm(l.category).includes(tg)))
    .sort((a, b) => (a.day || 99) - (b.day || 99));
  const spent = filtered.filter((l) => l.type !== 'Renda');
  const byTag = {};
  spent.forEach((l) => { const c = l.category || 'Outros'; byTag[c] = (byTag[c] || 0) + l.value; });
  const out = {
    mes: m,
    renda_total_do_mes: round2(totals.income),
    gastos_total_do_mes: round2(totals.expense),
    saldo_do_mes: round2(totals.balance),
    gastos_por_etiqueta: Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([etiqueta, total]) => ({ etiqueta, total: round2(total) })),
    lancamentos: filtered.slice(0, 60).map((l) => ({ dia: l.day, descricao: l.label, etiqueta: l.category || 'Outros', tipo: l.type, valor: round2(l.value) })),
    truncado: filtered.length > 60,
    nota: 'Gastos incluem a parte do usuário nas contas da casa e parcelas de cartão/empréstimo. Valores em reais.',
  };
  if (q || tg) {
    out.filtro = { texto: args.texto || null, etiqueta: args.etiqueta || null, gastos_filtrados: round2(spent.reduce((s, l) => s + l.value, 0)), renda_filtrada: round2(filtered.filter((l) => l.type === 'Renda').reduce((s, l) => s + l.value, 0)) };
  }
  return out;
}
function toolProximosVencimentos(args = {}) {
  const dias = Math.min(31, Math.max(1, parseInt(args.dias, 10) || 7));
  const list = upcomingDue(dias);
  return {
    hoje: todayStr(), dias,
    total: round2(list.reduce((s, l) => s + l.value, 0)),
    vencimentos: list.map((l) => ({ vence_em: l.due, descricao: l.label, etiqueta: l.category || 'Outros', tipo: l.type, valor: round2(l.value) })),
  };
}

/* ============================================================ um turno de chat */
function draftSummary(m) {
  if (!m.drafts || !m.drafts.length) return '';
  const st = { pending: 'aguardando confirmação', saved: 'salvo', discarded: 'descartado' };
  return '\n[Cartões propostos: ' + m.drafts.map((d) => `${d.item.descricao} ${fmtBRL(d.item.valor)}${d.item.tipo === 'cartao_parcelado' || d.item.tipo === 'emprestimo' ? ' x' + d.item.parcelas : ''} (${st[d.status]})`).join('; ') + ']';
}
function buildHistory(messages) {
  const turns = messages.filter((m) => !m.error && (m.text || (m.drafts && m.drafts.length))).slice(-HISTORY_TURNS);
  const out = [];
  turns.forEach((m) => {
    const role = m.role === 'user' ? 'user' : 'model';
    const text = (m.text || '') + (role === 'model' ? draftSummary(m) : '');
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n' + text;
    else out.push({ role, parts: [{ text }] });
  });
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function runTurn(text, image) {
  const parts = [];
  if (text) parts.push({ text });
  else parts.push({ text: 'Extraia os lançamentos desta imagem.' });
  if (image) parts.push({ inlineData: { mimeType: image.mime, data: image.b64 } });
  // a mensagem atual já foi adicionada ao chat: o histórico vai só até a anterior
  const contents = buildHistory(chat.messages.slice(0, -1));
  const tail = contents[contents.length - 1];
  if (tail && tail.role === 'user') tail.parts.push(...parts); // turnos seguidos do usuário viram um só
  else contents.push({ role: 'user', parts });

  const system = buildSystemPrompt();
  const drafts = [];
  const skipped = [];
  const texts = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const { data } = await callGemini({ system, contents, tools: TOOLS });
    const cand = data.candidates && data.candidates[0];
    const cparts = (cand && cand.content && cand.content.parts) || [];
    if (!cparts.length) {
      if (cand && /SAFETY|BLOCK|PROHIBITED/i.test(cand.finishReason || '')) throw new GeminiError('blocked', 'O Gemini recusou essa mensagem. Tente reescrever de outro jeito.');
      break;
    }
    const txt = cparts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
    if (txt) texts.push(txt);
    const calls = cparts.filter((p) => p.functionCall).map((p) => p.functionCall);
    if (!calls.length) break;

    const responses = [];
    let needFollowUp = false;
    calls.forEach((fc) => {
      let response;
      if (fc.name === 'propor_lancamentos') {
        const arr = Array.isArray(fc.args && fc.args.itens) ? fc.args.itens : (fc.args && fc.args.items ? fc.args.items : []);
        arr.forEach((raw) => {
          const it = normalizeItem(raw);
          if (it.error) skipped.push(it.error); else drafts.push({ id: uid(), item: it, status: 'pending', ref: null });
        });
        response = { ok: true, cartoes_mostrados: drafts.length, ignorados_sem_valor: skipped.length, mensagem: 'Os cartões foram mostrados ao usuário; nada foi gravado até ele confirmar.' };
      } else if (fc.name === 'consultar_mes') {
        needFollowUp = true; response = toolConsultarMes(fc.args || {});
      } else if (fc.name === 'proximos_vencimentos') {
        needFollowUp = true; response = toolProximosVencimentos(fc.args || {});
      } else {
        needFollowUp = true; response = { erro: 'ferramenta desconhecida' };
      }
      responses.push({ functionResponse: { name: fc.name, response } });
    });
    if (!needFollowUp) break;
    // devolve a resposta do modelo inteira (inclui assinaturas de raciocínio) + os resultados
    contents.push(cand.content, { role: 'user', parts: responses });
  }

  let out = texts.join('\n\n').trim();
  if (drafts.length && !out) out = drafts.length === 1 ? 'Anotei 1 lançamento. Confira e salve abaixo.' : `Anotei ${drafts.length} lançamentos. Confira e salve abaixo.`;
  if (skipped.length) out += (out ? '\n\n' : '') + 'Não consegui identificar o valor de: ' + skipped.join(', ') + '. Me diga quanto foi que eu adiciono.';
  if (!out) out = 'Não entendi bem. Pode me contar de outro jeito?';
  return { text: out, drafts };
}

async function send(text, image) {
  loadChat();
  if (busy) return;
  text = (text || '').trim();
  if (!text && !image) return;
  if (!getAIConfig().apiKey) { toast('Ative o assistente colando sua chave do Gemini.', 'err'); return; }
  lastReq = { text, image };
  chat.messages.push({ id: uid(), role: 'user', text: text || '📷 Foto enviada', thumb: image ? image.thumb : null, ts: Date.now() });
  busy = true;
  persist(); renderMessages(); setComposerState();
  try {
    const out = await runTurn(text, image);
    chat.messages.push({ id: uid(), role: 'assistant', text: out.text, drafts: out.drafts, ts: Date.now() });
    lastReq = null;
  } catch (e) {
    const msg = e instanceof GeminiError ? e.message : 'Algo deu errado ao falar com o Gemini. Tente de novo.';
    if (!(e instanceof GeminiError)) console.error(e);
    chat.messages.push({ id: uid(), role: 'assistant', text: msg, error: true, ts: Date.now() });
  }
  busy = false;
  persist(); renderMessages(); setComposerState();
}

/* ========================================================= cartões (drafts) */
function findDraft(msgId, draftId) {
  const m = chat.messages.find((x) => x.id === msgId);
  const d = m && m.drafts && m.drafts.find((x) => x.id === draftId);
  return d || null;
}
function saveDraft(d) {
  if (!d || d.status !== 'pending') return;
  const { entityKey, data } = toEntity(d.item);
  const collection = ENTITY_DEFS[entityKey].collection;
  const id = addItem(collection, data);
  d.status = 'saved'; d.ref = { collection, id };
}
function undoDraft(d) {
  if (!d || d.status !== 'saved') return;
  if (d.ref) removeItem(d.ref.collection, d.ref.id);
  d.status = 'pending'; d.ref = null;
}
function editDraft(d) {
  if (!d || d.status !== 'pending') return;
  const { entityKey, data } = toEntity(d.item);
  openModal(entityKey, null, {
    prefill: data,
    onSaved: (id, _data, collection) => { d.status = 'saved'; d.ref = { collection, id }; persist(); renderMessages(); },
  });
}

function describe(it) {
  const inflow = it.tipo === 'renda' || it.tipo === 'contribuicao_casa';
  const installments = it.tipo === 'cartao_parcelado' || it.tipo === 'emprestimo';
  const meta = [TIPO_LABEL[it.tipo]];
  let amount = (inflow ? '+ ' : '− ') + fmtBRL(it.valor);
  let sub = '';
  if (installments) { amount = `${it.parcelas}× ${fmtBRL(it.valor)}`; sub = 'total ' + fmtBRL(it.valor * it.parcelas); }
  if (it.tipo === 'conta_casa') sub = `sua parte ${fmtBRL(it.valor * it.meu_pct / 100)} (${it.meu_pct}%)`;
  switch (it.tipo) {
    case 'gasto': meta.push(fmtDateBR(it.data).slice(0, 5)); break;
    case 'contribuicao_casa': meta.push(personShort(it.pessoa), fmtDateBR(it.data).slice(0, 5)); break;
    case 'renda': meta.push(it.recorrente ? `todo dia ${it.dia}` : 'só em ' + monthAbbr(it.mes_inicio)); break;
    case 'cartao_parcelado': if (it.cartao) meta.push(it.cartao); meta.push('dia ' + it.dia, '1ª em ' + monthAbbr(it.mes_inicio)); break;
    case 'emprestimo': meta.push('dia ' + it.dia, '1ª em ' + monthAbbr(it.mes_inicio)); break;
    default: meta.push('todo dia ' + it.dia);
  }
  return { inflow, amount, sub, meta: meta.filter(Boolean).join(' · '), tag: it.tipo === 'contribuicao_casa' ? 'Moradia' : it.etiqueta };
}

function draftHTML(msg, d) {
  const it = d.item;
  const info = describe(it);
  const dup = d.status === 'pending' ? findDup(it) : null;
  const ids = `data-msg="${escAttr(msg.id)}" data-draft="${escAttr(d.id)}"`;
  let foot = '';
  if (d.status === 'pending') {
    foot = `<div class="draft-actions">
      <button type="button" class="btn primary small" data-chat="save" ${ids}>${icon('check', 16)}<span>Salvar</span></button>
      <button type="button" class="btn ghost small" data-chat="edit" ${ids}>${icon('pencil', 15)}<span>Editar</span></button>
      <button type="button" class="btn ghost small" data-chat="discard" ${ids} aria-label="Descartar">${icon('x', 16)}</button>
    </div>`;
  } else if (d.status === 'saved') {
    foot = `<div class="draft-state ok">${icon('check', 15)}<span>Salvo</span><button type="button" class="link-btn" data-chat="undo" ${ids}>Desfazer</button></div>`;
  } else {
    foot = `<div class="draft-state">Descartado</div>`;
  }
  return `<div class="draft ${d.status}">
    <div class="draft-top">
      <span class="avatar" style="--c:${tagColor(info.tag)}" aria-hidden="true">${tagEmoji(info.tag)}</span>
      <div class="draft-main">
        <div class="draft-title">${escHtml(it.descricao)}</div>
        <div class="draft-meta">${escHtml(info.meta)}</div>
        <div>${tagChip(it.tipo === 'contribuicao_casa' ? 'Moradia' : it.etiqueta)}</div>
      </div>
      <div class="draft-amount ${info.inflow ? 'in' : 'out'}"><b class="num">${escHtml(info.amount)}</b>${info.sub ? `<small>${escHtml(info.sub)}</small>` : ''}</div>
    </div>
    ${dup ? `<div class="draft-warn">${icon('alert', 15)}<span>${escHtml(dup)}</span></div>` : ''}
    ${foot}
  </div>`;
}

/* ================================================================ interface */
function fmtText(t) {
  const lines = String(t || '').split('\n');
  let html = '', list = false;
  lines.forEach((raw) => {
    const bullet = /^\s*[-*•]\s+/.test(raw);
    const line = escHtml(raw.replace(/^\s*[-*•]\s+/, '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (bullet) { if (!list) { html += '<ul>'; list = true; } html += `<li>${line}</li>`; return; }
    if (list) { html += '</ul>'; list = false; }
    if (line.trim()) html += `<p>${line}</p>`;
  });
  if (list) html += '</ul>';
  return html;
}

function messageHTML(m) {
  if (m.role === 'user') {
    return `<div class="msg user"><div class="bubble">${m.thumb ? `<img class="thumb" src="${escAttr(m.thumb)}" alt="foto enviada">` : ''}${fmtText(m.text)}</div></div>`;
  }
  const pending = (m.drafts || []).filter((d) => d.status === 'pending');
  const all = pending.length > 1
    ? `<button type="button" class="btn soft small save-all" data-chat="save-all" data-msg="${escAttr(m.id)}">${icon('check', 16)}<span>Salvar todos (${pending.length})</span></button>` : '';
  const retry = m.error && lastReq ? `<button type="button" class="btn ghost small" data-chat="retry">${icon('refresh', 15)}<span>Tentar de novo</span></button>` : '';
  return `<div class="msg bot"><span class="bot-avatar">${icon('sparkles', 16)}</span>
    <div class="bot-col">
      <div class="bubble${m.error ? ' err' : ''}">${fmtText(m.text)}</div>
      ${(m.drafts || []).map((d) => draftHTML(m, d)).join('')}
      ${all}${retry}
    </div></div>`;
}

function welcomeHTML() {
  const p2 = escHtml(state.config.roommate2Name);
  const ex = [
    'Gastei 45 no mercado ontem e 30 de Uber hoje',
    'Comprei um fone de 600 em 4x no Nubank',
    `Recebi 300 do ${state.config.roommate2Name} pra casa`,
    'Assinei o Spotify, 21,90 todo dia 8',
  ];
  return `<div class="chat-welcome">
    <span class="cw-ic">${icon('sparkles', 26)}</span>
    <h2>Oi! Me conta o que rolou</h2>
    <p>Escreva, fale ou mande a foto de um comprovante. Eu monto os lançamentos e você só confirma. Também respondo perguntas sobre seus gastos.</p>
    <div class="cw-examples">${ex.map((e) => `<button type="button" class="ex" data-chat="chip" data-mode="fill" data-text="${escAttr(e)}">${escHtml(e)}</button>`).join('')}</div>
    <small class="hint">Ex.: com ${p2} e outros nomes que você cadastrou em Ajustes.</small>
  </div>`;
}

const typingHTML = `<div class="msg bot"><span class="bot-avatar">${icon('sparkles', 16)}</span><div class="bubble typing" aria-label="Digitando"><i></i><i></i><i></i></div></div>`;

function renderMessages() {
  const box = $('chat-msgs');
  if (!box) return;
  loadChat();
  const scroller = $('chat-scroll');
  const nearBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
  box.innerHTML = (chat.messages.length ? chat.messages.map(messageHTML).join('') : welcomeHTML()) + (busy ? typingHTML : '');
  if (scroller && (nearBottom || busy)) scroller.scrollTop = scroller.scrollHeight;
}

function renderAttach() {
  const el = $('attach-preview');
  if (!el) return;
  el.hidden = !pendingImage;
  el.innerHTML = pendingImage
    ? `<img src="${escAttr(pendingImage.thumb)}" alt="prévia da foto"><span>Foto pronta para enviar</span><button type="button" class="icon-btn" data-chat="remove-image" aria-label="Remover foto">${icon('x', 16)}</button>` : '';
}
function setComposerState() {
  const send = $('btn-send'), input = $('chat-input'), mic = $('btn-mic');
  // o campo de texto não é desabilitado (no celular isso fecharia o teclado); envios durante a espera são ignorados
  if (send) send.disabled = busy;
  if (input) input.placeholder = busy ? 'Pensando…' : 'Conte um gasto…';
  if (mic) mic.classList.toggle('on', listening);
}
function autosize() {
  const t = $('chat-input');
  if (!t) return;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 132) + 'px';
}

const CHIPS = [
  { label: 'Anotar gastos', mode: 'fill', text: 'Gastei ', icon: 'plus' },
  { label: 'Resumo do mês', mode: 'send', text: 'Faça um resumo do mês atual: quanto entrou, quanto gastei, as etiquetas que mais pesaram e algo que merece atenção.', icon: 'trending' },
  { label: 'O que vence esta semana?', mode: 'send', text: 'O que vence nos próximos 7 dias?', icon: 'calendar' },
  { label: 'Onde economizar?', mode: 'send', text: 'Olhando meus gastos deste mês, onde posso economizar? Seja específico, com base nos meus números.', icon: 'sparkles' },
  { label: 'Ler comprovante', mode: 'photo', text: '', icon: 'image' },
];

/** Casca da tela (HTML). Depois de inserida no DOM, app.js chama mountAssistant(). */
export function renderAssistantShell() {
  const ai = getAIConfig();
  if (!ai.apiKey) {
    return `<section class="chat setup"><div class="card setup-card">
      <span class="cw-ic">${icon('sparkles', 26)}</span>
      <h2>Ative o assistente</h2>
      <p>Ele transforma o que você conta (texto, voz ou foto de comprovante) em lançamentos prontos para confirmar, e responde perguntas sobre seus gastos. Usa o Gemini, do Google, com a <b>sua</b> chave gratuita.</p>
      <ol class="steps">
        <li>Abra <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e crie uma chave.</li>
        <li>Cole aqui embaixo e toque em ativar.</li>
      </ol>
      <div class="field"><label for="setup-key">Chave da API do Gemini</label>
        <input type="password" id="setup-key" placeholder="Cole a chave aqui" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <button type="button" class="btn primary block" data-chat="setup-save">Testar e ativar</button>
      <p class="hint">A chave fica só neste aparelho (nunca vai para o backup nem para o repositório) e é enviada somente ao Google.</p>
    </div></section>`;
  }
  const supportsVoice = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  return `<section class="chat">
    <div class="chat-head">
      <span class="chat-title">${icon('sparkles', 18)}<small>${escHtml(modelLabel(ai.model))}</small></span>
      <button type="button" class="btn ghost small" data-chat="clear">Nova conversa</button>
    </div>
    <div class="chat-scroll" id="chat-scroll"><div class="chat-msgs" id="chat-msgs"></div></div>
    <div class="chat-bottom">
      <div class="chips" id="chat-chips">${CHIPS.map((c) => `<button type="button" class="chip-btn" data-chat="chip" data-mode="${c.mode}" data-text="${escAttr(c.text)}">${icon(c.icon, 15)}<span>${escHtml(c.label)}</span></button>`).join('')}</div>
      <div class="attach-preview" id="attach-preview" hidden></div>
      <form class="composer" id="composer" autocomplete="off">
        <button type="button" class="icon-btn" id="btn-attach" data-chat="attach" aria-label="Enviar foto de comprovante ou extrato">${icon('image', 22)}</button>
        <input type="file" id="file-input" accept="image/*" hidden>
        <textarea id="chat-input" rows="1" placeholder="Conte um gasto…" enterkeyhint="send" aria-label="Mensagem para o assistente"></textarea>
        ${supportsVoice ? `<button type="button" class="icon-btn" id="btn-mic" data-chat="mic" aria-label="Falar">${icon('mic', 22)}</button>` : ''}
        <button type="submit" class="send-btn" id="btn-send" aria-label="Enviar">${icon('send', 20)}</button>
      </form>
    </div>
  </section>`;
}

export function mountAssistant() {
  loadChat();
  renderMessages();
  renderAttach();
  setComposerState();
  const scroller = $('chat-scroll');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  if (window.matchMedia('(hover: hover)').matches && $('chat-input')) $('chat-input').focus();
}

/* ------------------------------------------------------------------ foto */
async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('imagem inválida')); i.src = url; });
    const draw = (max, q) => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    };
    return { mime: 'image/jpeg', b64: draw(1400, 0.82).split(',')[1], thumb: draw(96, 0.6) };
  } finally { URL.revokeObjectURL(url); }
}

/* ------------------------------------------------------------------ voz */
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Este navegador não tem reconhecimento de voz. Use o microfone do teclado.', 'err'); return; }
  if (listening && recog) { recog.stop(); return; }
  recog = new SR();
  recog.lang = 'pt-BR';
  recog.interimResults = true;
  recog.continuous = false;
  let heardFinal = false;
  recog.onresult = (e) => {
    let finalText = '', interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { finalText += r[0].transcript; heardFinal = true; } else interim += r[0].transcript;
    }
    const input = $('chat-input');
    if (input) { input.value = (finalText + interim).trim(); autosize(); }
  };
  recog.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Libere o microfone para este site nas permissões do navegador.', 'err');
    else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Não consegui ouvir (' + e.error + '). Tente de novo.', 'err');
  };
  recog.onend = () => {
    listening = false; setComposerState();
    if (heardFinal) submitComposer(); // os cartões de confirmação são a rede de segurança contra erro de reconhecimento
  };
  try { recog.start(); listening = true; setComposerState(); }
  catch (e) { listening = false; setComposerState(); }
}

/* ---------------------------------------------------------------- eventos */
function submitComposer() {
  const input = $('chat-input');
  if (!input || busy) return;
  const text = input.value;
  const image = pendingImage;
  if (!text.trim() && !image) return;
  input.value = ''; autosize();
  pendingImage = null; renderAttach();
  send(text, image);
}

async function saveSetupKey() {
  const input = $('setup-key');
  const key = (input && input.value || '').trim();
  if (!key) { toast('Cole a chave primeiro.', 'err'); return; }
  const btn = document.querySelector('[data-chat="setup-save"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Testando…'; }
  try {
    await testKey(key, getAIConfig().model);
    setAIConfig({ apiKey: key });
    toast('Assistente ativado!');
    window.dispatchEvent(new Event('lc:rerender'));
  } catch (e) {
    toast(e instanceof GeminiError ? e.message : 'Não consegui testar a chave.', 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Testar e ativar'; }
  }
}

export function initAssistant() {
  const root = document.getElementById('view-root');

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-chat]');
    if (!b) return;
    const act = b.dataset.chat;
    const d = b.dataset.draft ? findDraft(b.dataset.msg, b.dataset.draft) : null;
    switch (act) {
      case 'save': saveDraft(d); persist(); renderMessages(); break;
      case 'undo': undoDraft(d); persist(); renderMessages(); break;
      case 'discard': if (d && d.status === 'pending') { d.status = 'discarded'; persist(); renderMessages(); } break;
      case 'edit': editDraft(d); break;
      case 'save-all': {
        const m = chat.messages.find((x) => x.id === b.dataset.msg);
        if (m) { (m.drafts || []).forEach(saveDraft); persist(); renderMessages(); toast('Lançamentos salvos.'); }
        break;
      }
      case 'chip':
        if (b.dataset.mode === 'photo') { $('file-input').click(); break; }
        if (b.dataset.mode === 'send') { send(b.dataset.text); break; }
        { const i = $('chat-input'); if (i) { i.value = b.dataset.text; autosize(); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
        break;
      case 'attach': $('file-input').click(); break;
      case 'remove-image': pendingImage = null; renderAttach(); break;
      case 'mic': toggleMic(); break;
      case 'retry': {
        if (!lastReq || busy) break;
        const { text, image } = lastReq;
        chat.messages.pop();                       // balão de erro
        if (chat.messages.length && chat.messages[chat.messages.length - 1].role === 'user') chat.messages.pop(); // mensagem que falhou
        send(text, image);
        break;
      }
      case 'clear':
        if (!chat.messages.length || window.confirm('Começar uma nova conversa? A atual será apagada (os lançamentos já salvos continuam).')) {
          chat.messages = []; lastReq = null; persist(); renderMessages();
        }
        break;
      case 'setup-save': await saveSetupKey(); break;
      default: break;
    }
  });

  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'composer') return;
    e.preventDefault();
    submitComposer();
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'chat-input') autosize(); });
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitComposer(); }
    if (e.target.id === 'setup-key' && e.key === 'Enter') { e.preventDefault(); saveSetupKey(); }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.id !== 'file-input') return;
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { pendingImage = await prepareImage(file); renderAttach(); $('chat-input') && $('chat-input').focus(); }
    catch (err) { toast('Não consegui abrir essa imagem.', 'err'); }
  });
}
