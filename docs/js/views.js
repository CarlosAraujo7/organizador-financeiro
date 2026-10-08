/* Telas: Painel, Lançamentos, Casa e Ajustes (a tela do Assistente fica em assistant.js). */
import {
  escHtml, escAttr, fmtBRL, fmtDateBR, fmtDayMonth, longDate, monthLabel, monthAbbr, shiftMonth, pad2,
  todayStr, addDays, currentMonthStr,
} from './util.js';
import { ENTITY_DEFS, LAUNCH_TABS } from './defs.js';
import {
  state, ui, hasData, isActiveInMonth, installmentInfo, personShort, monthExpenseLines, monthIncomeLines,
  monthTotals, categoryTotals, upcomingDue, tagColor,
} from './store.js';
import { icon } from './icons.js';
import { avatar, chip, emptyState, progress, cardHead, stat, money, listRow } from './ui.js';
import { capCategories, donutSVG, trendChart } from './charts.js';
import { getAIConfig, MODELS, maskKey } from './gemini.js';

export const viewFlags = { showAllLines: false };

function periodLabel(it) {
  const start = it.startMonth ? monthLabel(it.startMonth) : '—';
  if (!it.endMonth) return 'desde ' + start;
  return start + ' até ' + monthLabel(shiftMonth(it.endMonth, -1));
}
function statusChip(it, m) {
  if (isActiveInMonth(it, m)) return '';
  if (it.startMonth > m) return chip('warn', 'começa em ' + monthAbbr(it.startMonth));
  return chip('muted', 'encerrado');
}
function dueLabel(due) {
  const t = todayStr();
  if (due === t) return 'hoje';
  if (due === addDays(t, 1)) return 'amanhã';
  return fmtDayMonth(due);
}
const dayMeta = (day) => (day ? 'dia ' + pad2(day) : 'sem dia');

/* ====================================================================== PAINEL */
export function renderDashboard() {
  const m = ui.refMonth;
  const expenseLines = monthExpenseLines(m);
  const incomeLines = monthIncomeLines(m);
  const { income, expense, balance } = monthTotals(m);

  if (!hasData()) return renderWelcome();

  const spentPct = income > 0 ? Math.round(expense / income * 100) : null;
  const barPct = income > 0 ? Math.min(100, expense / income * 100) : (expense > 0 ? 100 : 0);
  const statusText = income <= 0 && expense <= 0 ? 'nada lançado neste mês ainda'
    : balance >= 0 ? (spentPct !== null ? `no azul · gastou ${spentPct}% da renda` : 'no azul')
      : `no vermelho · gastos passaram da renda em ${fmtBRL(-balance)}`;

  const hero = `
    <section class="hero" aria-label="Resumo do mês">
      <span class="hero-label">Saldo de ${monthLabel(m)}</span>
      <div class="hero-value num">${balance < 0 ? '− ' : ''}${fmtBRL(Math.abs(balance))}</div>
      <span class="hero-status">${escHtml(statusText)}</span>
      <div class="hero-bar" aria-hidden="true"><span style="width:${barPct}%"></span></div>
      <div class="hero-split">
        <div class="hero-pill"><span class="hp-ic">${icon('arrowDown', 16)}</span><span><small>Renda</small><b class="num">${fmtBRL(income)}</b></span></div>
        <div class="hero-pill"><span class="hp-ic">${icon('arrowUp', 16)}</span><span><small>Gastos</small><b class="num">${fmtBRL(expense)}</b></span></div>
      </div>
    </section>`;

  const ask = `
    <a class="ask-bar" href="#/assistente">
      <span class="ask-ic">${icon('sparkles', 20)}</span>
      <span class="ask-text">Conte um gasto ou pergunte…</span>
      <span class="ask-mic">${icon('mic', 18)}</span>
    </a>`;

  // vencimentos só fazem sentido olhando o mês atual
  let upcoming = '';
  if (m === currentMonthStr()) {
    const due = upcomingDue(7);
    upcoming = `
      <section class="card s-upcoming">
        ${cardHead('Vence nos próximos 7 dias', due.length ? due.length + (due.length === 1 ? ' conta' : ' contas') + ' · ' + fmtBRL(due.reduce((s, l) => s + l.value, 0)) : '')}
        ${due.length ? `<div class="rows">${due.map((l) => listRow({
          entity: l.collection, id: l.id, tag: l.category, title: l.label,
          meta: escHtml(dueLabel(l.due) + ' · ' + l.type), right: money(l.value),
        })).join('')}</div>` : `<div class="empty small"><p>Nenhuma conta vencendo nesta semana. 🎉</p></div>`}
      </section>`;
  }

  const catList = categoryTotals(m);
  const capped = capCategories(catList, 8);
  const catMax = capped.length ? capped[0][1] : 1;
  const tags = `
    <section class="card s-tags">
      ${cardHead('Por etiqueta', 'Para onde foi o dinheiro em ' + monthLabel(m))}
      <div class="card-pad">
        ${capped.length ? `<div class="tags-wrap">
          <div class="donut-wrap">${donutSVG(capped, expense)}</div>
          <div class="tag-list">${capped.map(([cat, val]) => `
            <div class="tag-bar" data-tip="${escAttr(cat + ': ' + fmtBRL(val))}">
              <span class="tag-bar-top"><span class="tag-name"><i style="background:${tagColor(cat)}"></i>${escHtml(cat)}</span><b class="num">${fmtBRL(val)}</b></span>
              <span class="bar-track"><span style="width:${Math.max(4, val / catMax * 100)}%;background:${tagColor(cat)}"></span></span>
            </div>`).join('')}</div>
        </div>` : '<p class="hint">Sem gastos lançados neste mês ainda.</p>'}
      </div>
    </section>`;

  const trend = `
    <section class="card s-trend">
      ${cardHead('Renda × Gastos', monthLabel(shiftMonth(m, -2)) + ' a ' + monthLabel(shiftMonth(m, 3)))}
      <div class="card-pad">
        <div class="legend"><span><i style="background:var(--income)"></i>Renda (sobe)</span><span><i style="background:var(--expense)"></i>Gastos (desce)</span></div>
        ${trendChart(m)}
      </div>
    </section>`;

  const all = [...incomeLines, ...expenseLines].sort((a, b) => (a.day || 99) - (b.day || 99));
  const LIMIT = 8;
  const shown = viewFlags.showAllLines ? all : all.slice(0, LIMIT);
  const lines = `
    <section class="card s-lines">
      ${cardHead('Extrato de ' + monthLabel(m), 'Renda, contas, parcelas e sua parte da casa')}
      ${all.length ? `<div class="rows">${shown.map((l) => listRow({
        entity: l.collection, id: l.id, tag: l.category, title: l.label,
        meta: escHtml(dayMeta(l.day) + ' · ' + l.type + ' · ' + (l.category || 'Outros')),
        right: money(l.value, l.type === 'Renda' ? 'in' : 'out'),
      })).join('')}</div>
      ${all.length > LIMIT ? `<button type="button" class="more-btn" data-action="toggle-lines">${viewFlags.showAllLines ? 'Mostrar menos' : 'Mostrar todos (' + all.length + ')'}</button>` : ''}`
        : emptyState('Nada lançado neste mês', 'Cadastre contas na aba Lançamentos ou conte pro assistente.')}
    </section>`;

  const loansActive = state.loans.filter((it) => installmentInfo(it, m).active);
  const cardActive = state.cardInstallments.filter((it) => installmentInfo(it, m).active);
  const contribMonth = state.contributions.filter((c) => (c.date || '').slice(0, 7) === m);
  const loanRem = loansActive.reduce((s, it) => s + installmentInfo(it, m).remaining, 0);
  const cardRem = cardActive.reduce((s, it) => s + installmentInfo(it, m).remaining, 0);
  const parcels = `
    <section class="s-parcels stats">
      ${stat('Empréstimos', String(loansActive.length), loansActive.length ? fmtBRL(loanRem) + ' a pagar' : 'nenhum em aberto')}
      ${stat('Cartão parcelado', String(cardActive.length), cardActive.length ? fmtBRL(cardRem) + ' a pagar' : 'nenhuma em aberto')}
      ${stat('Recebido da casa', fmtBRL(contribMonth.reduce((s, c) => s + (c.value || 0), 0)), contribMonth.length + ' registro(s)')}
    </section>`;

  return `${hero}${ask}<div class="dash-grid">${upcoming}${tags}${trend}${lines}${parcels}</div>`;
}

function renderWelcome() {
  return `
    <section class="hero welcome">
      <span class="hero-label">Bem-vindo ao Livro-Caixa</span>
      <div class="hero-value small">Vamos organizar seu dinheiro</div>
      <span class="hero-status">Seus dados ficam só neste aparelho. Comece por onde for mais fácil:</span>
    </section>
    <div class="welcome-grid">
      <a class="card welcome-card" href="#/assistente">
        <span class="wc-ic">${icon('sparkles', 22)}</span>
        <strong>Contar pro assistente</strong>
        <p>Escreva, fale ou mande a foto de um comprovante. Ele monta os lançamentos e você só confirma.</p>
      </a>
      <label class="card welcome-card file-label">
        <span class="wc-ic">${icon('upload', 22)}</span>
        <strong>Importar backup</strong>
        <p>Já usava a versão antiga? Exporte o backup lá (Ajustes) e importe aqui.</p>
        <input type="file" data-import accept="application/json,.json">
      </label>
      <button type="button" class="card welcome-card" data-action="add" data-entity="variableExpenses">
        <span class="wc-ic">${icon('plus', 22)}</span>
        <strong>Lançar manualmente</strong>
        <p>Cadastre um gasto, uma renda ou uma conta fixa pelo formulário.</p>
      </button>
    </div>`;
}

/* ================================================================ LANÇAMENTOS */
function tabsHTML(active) {
  return `<nav class="seg" aria-label="Tipos de lançamento">${LAUNCH_TABS.map((t) =>
    `<a href="#/lancamentos/${t.id}" class="seg-item${t.id === active ? ' active' : ''}"${t.id === active ? ' aria-current="page"' : ''}>${t.label}</a>`).join('')}</nav>`;
}

function installmentCard(it, entityKey, nameField, m) {
  const info = installmentInfo(it, m);
  const pct = info.total ? (Math.min(info.current, info.total) / info.total * 100) : 0;
  const st = info.status === 'done' ? chip('good', 'quitado') : info.status === 'future' ? chip('muted', 'ainda não começou') : chip('accent', 'em andamento');
  return `
    <button type="button" class="card inst" data-action="edit" data-entity="${entityKey}" data-id="${escAttr(it.id)}">
      <span class="inst-top">
        ${avatar(it.category)}
        <span class="row-main"><span class="row-title">${escHtml(it[nameField] || '(sem nome)')}</span>
          <span class="row-meta">${escHtml(it.cardName ? it.cardName + ' · ' : '')}${escHtml(it.category || 'Outros')}</span></span>
        <span class="row-right"><b class="num">${fmtBRL(it.installmentValue)}</b><small>por parcela</small></span>
      </span>
      ${progress(pct)}
      <span class="inst-foot"><span>${info.status === 'future' ? 'Começa em ' + monthLabel(it.startMonth) : 'Parcela ' + Math.min(info.current, info.total) + ' de ' + info.total + ' · vence dia ' + (it.day || '—')}</span>${st}<b class="num">${fmtBRL(info.remaining)} restante</b></span>
    </button>`;
}

export function renderLancamentos(sub) {
  const tab = LAUNCH_TABS.find((t) => t.id === sub) || LAUNCH_TABS[0];
  const key = tab.entity;
  const def = ENTITY_DEFS[key];
  const m = ui.refMonth;
  const addBtn = `<button type="button" class="btn primary" data-action="add" data-entity="${key}">${icon('plus', 18)}<span>${escHtml(def.addLabel)}</span></button>`;
  let body = '';
  let statHTML = '';

  if (key === 'cardInstallments' || key === 'loans') {
    const items = state[key].slice().sort((a, b) => (a.startMonth || '').localeCompare(b.startMonth || ''));
    const active = items.filter((it) => installmentInfo(it, m).active);
    const remaining = items.reduce((s, it) => s + installmentInfo(it, m).remaining, 0);
    const monthTotal = active.reduce((s, it) => s + (it.installmentValue || 0), 0);
    const isCard = key === 'cardInstallments';
    statHTML = `<div class="stats">
      ${stat('Parcelas em ' + monthAbbr(m), fmtBRL(monthTotal), active.length + (isCard ? ' compra(s) ativa(s)' : ' empréstimo(s) ativo(s)'))}
      ${stat(isCard ? 'Falta pagar' : 'Saldo devedor', fmtBRL(remaining), 'somando tudo em aberto')}
    </div>`;
    body = items.length
      ? `<div class="inst-list">${items.map((it) => installmentCard(it, key, isCard ? 'description' : 'name', m)).join('')}</div>`
      : `<div class="card">${emptyState(def.empty.title, def.empty.text)}</div>`;
  } else if (key === 'variableExpenses') {
    const all = state[key];
    const items = all.filter((it) => (it.date || '').slice(0, 7) === m).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = items.reduce((s, it) => s + (it.value || 0), 0);
    const outside = all.length - items.length;
    statHTML = `<div class="stats">${stat('Total em ' + monthAbbr(m), fmtBRL(total), items.length + ' lançamento(s)', 'out')}</div>`;
    const groups = [];
    items.forEach((it) => {
      const last = groups[groups.length - 1];
      if (last && last.date === it.date) last.items.push(it); else groups.push({ date: it.date, items: [it] });
    });
    body = items.length ? groups.map((g) => `
      <section class="card day-group">
        <h3 class="day-head">${escHtml(g.date ? longDate(g.date) : 'Sem data')}<b class="num">${fmtBRL(g.items.reduce((s, x) => s + (x.value || 0), 0))}</b></h3>
        <div class="rows">${g.items.map((it) => listRow({
          entity: key, id: it.id, tag: it.category, title: it.description,
          meta: escHtml((it.category || 'Outros') + (it.notes ? ' · ' + it.notes : '')), right: money(it.value, 'out'),
        })).join('')}</div>
      </section>`).join('')
      : `<div class="card">${emptyState(def.empty.title, def.empty.text)}</div>`;
    if (outside > 0) body += `<p class="hint center">${outside} lançamento(s) em outros meses — use as setas do mês lá em cima.</p>`;
  } else {
    // fixos, assinaturas e renda: cadastros que se repetem todo mês
    const items = state[key].slice().sort((a, b) => (a.day || a.billingDay || 99) - (b.day || b.billingDay || 99));
    const act = items.filter((it) => isActiveInMonth(it, m));
    const total = act.reduce((s, it) => s + (it.value || 0), 0);
    const isIncome = key === 'income';
    statHTML = `<div class="stats">${stat((isIncome ? 'Entra em ' : 'Sai em ') + monthAbbr(m), fmtBRL(total), act.length + ' item(ns) ativo(s)', isIncome ? 'in' : 'out')}</div>`;
    body = items.length ? `<section class="card"><div class="rows">${items.map((it) => {
      const active = isActiveInMonth(it, m);
      const d = it.day || it.billingDay;
      return listRow({
        entity: key, id: it.id, tag: it.category, title: it.description || it.name, dim: !active,
        meta: escHtml(dayMeta(d) + ' · ' + periodLabel(it)) + (active ? '' : ' ' + statusChip(it, m)),
        right: money(it.value, isIncome ? 'in' : 'out'),
      });
    }).join('')}</div></section>` : `<div class="card">${emptyState(def.empty.title, def.empty.text)}</div>`;
  }

  return `${tabsHTML(tab.id)}<div class="page-head">${statHTML}${addBtn}</div>${body}`;
}

/* ===================================================================== CASA */
export function renderCasa() {
  const m = ui.refMonth;
  const sharedActive = state.sharedExpenses.filter((it) => isActiveInMonth(it, m));
  const totalShared = sharedActive.reduce((s, it) => s + (it.value || 0), 0);
  const expected = { me: 0, p2: 0, p3: 0 };
  sharedActive.forEach((it) => {
    expected.me += (it.value || 0) * ((it.splitMePct || 0) / 100);
    expected.p2 += (it.value || 0) * ((it.split2Pct || 0) / 100);
    expected.p3 += (it.value || 0) * ((it.split3Pct || 0) / 100);
  });
  const contribMonth = state.contributions.filter((c) => (c.date || '').slice(0, 7) === m)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const received = { me: 0, p2: 0, p3: 0 };
  contribMonth.forEach((c) => { received[c.person] = (received[c.person] || 0) + (c.value || 0); });

  const personCard = (k, label) => {
    const exp = expected[k], rec = received[k], diff = rec - exp;
    const pct = exp > 0 ? Math.min(100, rec / exp * 100) : (rec > 0 ? 100 : 0);
    const status = exp === 0 && rec === 0 ? 'sem conta neste mês' : diff >= 0 ? (diff > 0 ? 'crédito de ' + fmtBRL(diff) : 'em dia ✓') : 'faltam ' + fmtBRL(-diff);
    return `<div class="stat person">
      <span class="stat-label">${escHtml(label)}</span>
      <span class="stat-value num">${fmtBRL(rec)}</span>
      <span class="stat-sub">de ${fmtBRL(exp)} esperado</span>
      ${progress(pct)}
      <span class="stat-sub strong">${escHtml(status)}</span>
    </div>`;
  };

  const sharedRows = state.sharedExpenses.slice().sort((a, b) => (a.day || 99) - (b.day || 99)).map((it) => {
    const active = isActiveInMonth(it, m);
    return listRow({
      entity: 'sharedExpenses', id: it.id, tag: it.category, title: it.name, dim: !active,
      meta: escHtml(`${dayMeta(it.day)} · ${it.splitMePct || 0}% / ${it.split2Pct || 0}% / ${it.split3Pct || 0}%`) + (active ? '' : ' ' + statusChip(it, m)),
      right: money(it.value),
    });
  }).join('');

  const contribRows = contribMonth.map((c) => `
    <button type="button" class="row" data-action="edit" data-entity="contributions" data-id="${escAttr(c.id)}">
      <span class="avatar" style="--c:var(--income)" aria-hidden="true">💸</span>
      <span class="row-main"><span class="row-title">${escHtml(personShort(c.person))}</span><span class="row-meta">${escHtml(fmtDateBR(c.date))} · ${escHtml(c.type || 'Mensal')}${c.note ? ' · ' + escHtml(c.note) : ''}</span></span>
      <span class="row-right">${money(c.value, 'in')}</span>
    </button>`).join('');

  return `
    <div class="stats three">
      ${personCard('me', 'Você (' + state.config.ownerName + ')')}
      ${personCard('p2', state.config.roommate2Name)}
      ${personCard('p3', state.config.roommate3Name)}
    </div>
    <section class="card">
      ${cardHead('Contas divididas', 'Total de ' + monthAbbr(m) + ': ' + fmtBRL(totalShared), `<button type="button" class="btn soft small" data-action="add" data-entity="sharedExpenses">${icon('plus', 16)}<span>Conta</span></button>`)}
      ${state.sharedExpenses.length ? `<div class="rows">${sharedRows}</div>` : emptyState(ENTITY_DEFS.sharedExpenses.empty.title, ENTITY_DEFS.sharedExpenses.empty.text)}
    </section>
    <section class="card">
      ${cardHead('Valores recebidos', 'O que cada morador mandou em ' + monthLabel(m), `<button type="button" class="btn soft small" data-action="add" data-entity="contributions">${icon('plus', 16)}<span>Registrar</span></button>`)}
      ${contribMonth.length ? `<div class="rows">${contribRows}</div>` : emptyState('Nada registrado neste mês', 'Registre os valores conforme forem chegando.')}
    </section>`;
}

/* =================================================================== AJUSTES */
export function renderAjustes() {
  const c = state.config;
  const ai = getAIConfig();
  let theme = 'auto';
  try { theme = localStorage.getItem('livro-caixa-tema') || 'auto'; } catch (e) { /* sem storage */ }
  const themeBtn = (id, label) => `<button type="button" class="seg-item${theme === id ? ' active' : ''}" data-action="set-theme" data-theme="${id}">${label}</button>`;
  const canShare = typeof navigator.canShare === 'function';
  return `
    <section class="card">
      ${cardHead('Assistente com IA (Gemini)', ai.apiKey ? 'Chave salva neste aparelho: ' + maskKey(ai.apiKey) : 'Cole sua chave gratuita do Google AI Studio para ativar o chat')}
      <div class="card-pad form-stack">
        <div class="field"><label for="ai-key">Chave da API do Gemini</label>
          <div class="input-with-btn">
            <input type="password" id="ai-key" placeholder="${ai.apiKey ? 'Cole outra para trocar' : 'Cole a chave aqui'}" autocomplete="off" autocapitalize="off" spellcheck="false">
            <button type="button" class="icon-btn" data-action="toggle-key" aria-label="Mostrar ou ocultar a chave">${icon('eye', 18)}</button>
          </div>
          <span class="hint">O modelo 3.1 Flash-Lite é o mais rápido e basta para registrar gastos. Crie a chave em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Ela fica só no navegador deste aparelho e nunca entra no backup.</span>
        </div>
        <div class="field"><label for="ai-model">Modelo</label>
          <select id="ai-model">${MODELS.map((mo) => `<option value="${escAttr(mo.id)}" ${mo.id === ai.model ? 'selected' : ''}>${escHtml(mo.label)}</option>`).join('')}</select>
        </div>
        <div class="btn-row">
          <button type="button" class="btn primary" data-action="save-ai">Testar e salvar</button>
          ${ai.apiKey ? '<button type="button" class="btn ghost" data-action="remove-ai">Remover chave</button>' : ''}
        </div>
        <p class="hint">Privacidade: o que você escreve para o assistente (e um resumo dos seus números, quando você pergunta algo) vai direto do seu navegador para o Google. No plano gratuito do Gemini, o Google pode usar esse conteúdo para melhorar os produtos dele; confira os termos da sua chave.</p>
      </div>
    </section>

    <section class="card">
      ${cardHead('Pessoas', 'Usado nas contas divididas com a casa')}
      <div class="card-pad form-stack">
        <div class="field"><label for="cfg-owner">Seu nome</label><input type="text" id="cfg-owner" value="${escAttr(c.ownerName)}"></div>
        <div class="field"><label for="cfg-p2">Morador(a) 2</label><input type="text" id="cfg-p2" value="${escAttr(c.roommate2Name)}"></div>
        <div class="field"><label for="cfg-p3">Morador(a) 3</label><input type="text" id="cfg-p3" value="${escAttr(c.roommate3Name)}"></div>
        <div class="btn-row"><button type="button" class="btn soft" data-action="save-config">Salvar nomes</button></div>
      </div>
    </section>

    <section class="card">
      ${cardHead('Aparência')}
      <div class="card-pad"><div class="seg inline">${themeBtn('auto', 'Automático')}${themeBtn('light', 'Claro')}${themeBtn('dark', 'Escuro')}</div></div>
    </section>

    <section class="card">
      ${cardHead('Backup dos dados', 'Os dados ficam só no navegador deste aparelho')}
      <div class="card-pad form-stack">
        <p class="hint">Celular e computador têm dados separados. Para levar de um para o outro (ou antes de limpar o navegador), exporte o backup e importe no outro aparelho. Importar substitui o que está aqui.</p>
        <div class="btn-row">
          <button type="button" class="btn soft" data-action="export-backup">${icon('download', 18)}<span>Exportar backup</span></button>
          ${canShare ? `<button type="button" class="btn ghost" data-action="share-backup">${icon('share', 18)}<span>Compartilhar</span></button>` : ''}
          <label class="btn ghost file-label">${icon('upload', 18)}<span>Importar backup</span><input type="file" data-import accept="application/json,.json"></label>
        </div>
      </div>
    </section>

    <section class="card">
      ${cardHead('Instalar no celular')}
      <div class="card-pad form-stack">
        <p class="hint">Dá para usar como um app, em tela cheia e até sem internet (o assistente precisa de internet). Android (Chrome): menu ⋮ → <em>Instalar app</em>. iPhone (Safari): Compartilhar → <em>Adicionar à Tela de Início</em>.</p>
        <div class="btn-row" id="install-row" hidden><button type="button" class="btn primary" data-action="install-app">${icon('phone', 18)}<span>Instalar agora</span></button></div>
      </div>
    </section>
    <p class="hint center">Livro-Caixa · versão 2.0</p>`;
}
