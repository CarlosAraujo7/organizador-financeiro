/* Estado, persistência (localStorage), backup e cálculos do mês. */
import {
  uid, pad2, todayStr, currentMonthStr, shiftMonth, monthDiff, daysInMonth, addDays, norm, isValidMonth,
} from './util.js';
import { CATEGORIES, COLLECTIONS, DEFAULT_QUICK_TAGS } from './defs.js';

export const LOCAL_KEY = 'livro-caixa-dados-v1';

export const state = {
  config: { ownerName: 'Você', roommate2Name: 'Morador 2', roommate3Name: 'Morador 3' },
  tagColorMap: {}, // etiqueta -> índice de cor (0-7), fixo desde a 1ª vez que aparece
  income: [], subscriptions: [], fixedExpenses: [], variableExpenses: [],
  loans: [], cardInstallments: [], sharedExpenses: [], contributions: [],
};

/** Estado só da interface (não é salvo): mês que está sendo visto */
export const ui = { refMonth: currentMonthStr() };

const listeners = [];
export function subscribe(fn) { listeners.push(fn); }
function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
function announceSave(ok) { window.dispatchEvent(new CustomEvent('lc:saved', { detail: { ok } })); }

/* ---------- persistência ---------- */
export function saveLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); announceSave(true); return true; }
  catch (e) { console.warn(e); announceSave(false); return false; }
}

function absorb(incoming) {
  if (!incoming || typeof incoming !== 'object') throw new Error('formato inválido');
  const cfg = incoming.config || {};
  ['ownerName', 'roommate2Name', 'roommate3Name'].forEach((k) => {
    if (typeof cfg[k] === 'string' && cfg[k].trim()) state.config[k] = cfg[k].trim();
  });
  if (incoming.tagColorMap && typeof incoming.tagColorMap === 'object') {
    Object.entries(incoming.tagColorMap).forEach(([k, v]) => { if (Number.isInteger(v) && v >= 0 && v < 8) state.tagColorMap[k] = v; });
  }
  let count = 0;
  COLLECTIONS.forEach((c) => {
    if (!Array.isArray(incoming[c])) return;
    state[c] = incoming[c].filter((x) => x && typeof x === 'object').map((x) => ({ ...x, id: x.id || uid() }));
    count += state[c].length;
  });
  return count;
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) { absorb(JSON.parse(raw)); return true; }
  } catch (e) { console.warn(e); }
  return false;
}

export function hasData() { return COLLECTIONS.some((c) => state[c].length > 0); }

/* ---------- CRUD ---------- */
export function addItem(collection, data) {
  const id = uid();
  state[collection].push({ id, ...data });
  saveLocal(); notify();
  return id;
}
export function updateItem(collection, id, data) {
  const it = state[collection].find((x) => x.id === id);
  if (it) Object.assign(it, data);
  saveLocal(); notify();
}
export function removeItem(collection, id) {
  state[collection] = state[collection].filter((x) => x.id !== id);
  saveLocal(); notify();
}
export function saveConfig(patch) {
  Object.assign(state.config, patch);
  saveLocal(); notify();
}
export function findItem(collection, id) { return state[collection].find((x) => x.id === id) || null; }

/* ---------- backup ---------- */
export function backupPayload() {
  return { app: 'livro-caixa', version: 1, exportedAt: new Date().toISOString(), state };
}
export function backupFileName() {
  const d = new Date();
  return 'livro-caixa-backup-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json';
}
/** Lê um .json de backup (o do app antigo também serve). Substitui os dados atuais. */
export function importBackupText(text) {
  const parsed = JSON.parse(text);
  const count = absorb(parsed.state || parsed);
  saveLocal(); notify();
  return count;
}

/* ---------- datas e parcelas ---------- */
/** Ativo no mês m? startMonth (inclusivo) / endMonth (exclusivo, opcional) */
export function isActiveInMonth(item, m) {
  if (!item.startMonth) return false;
  if (item.startMonth > m) return false;
  if (item.endMonth && m >= item.endMonth) return false;
  return true;
}
export function installmentInfo(item, m) {
  const diff = monthDiff(item.startMonth, m) + 1;
  const total = item.installmentsCount || 1;
  const status = diff < 1 ? 'future' : (diff > total ? 'done' : 'active');
  return {
    current: Math.min(Math.max(diff, 0), total), total, active: status === 'active', status,
    remaining: status === 'done' ? 0 : (total - Math.max(diff, 1) + 1) * (item.installmentValue || 0),
  };
}

export function personLabel(p) {
  if (p === 'me') return 'Eu (' + state.config.ownerName + ')';
  if (p === 'p2') return state.config.roommate2Name;
  if (p === 'p3') return state.config.roommate3Name;
  return p;
}
export function personShort(p) {
  if (p === 'me') return state.config.ownerName;
  if (p === 'p2') return state.config.roommate2Name;
  if (p === 'p3') return state.config.roommate3Name;
  return p;
}

/* ---------- linhas consolidadas do mês ---------- */
/** Cada linha guarda de onde veio (collection + id), para poder editar ao tocar. */
export function monthExpenseLines(m) {
  const lines = [];
  state.subscriptions.forEach((it) => { if (isActiveInMonth(it, m)) lines.push({ type: 'Assinatura', label: it.name, category: it.category, value: it.value || 0, day: it.billingDay, collection: 'subscriptions', id: it.id }); });
  state.fixedExpenses.forEach((it) => { if (isActiveInMonth(it, m)) lines.push({ type: 'Fixo', label: it.name, category: it.category, value: it.value || 0, day: it.day, collection: 'fixedExpenses', id: it.id }); });
  state.variableExpenses.forEach((it) => { if ((it.date || '').slice(0, 7) === m) lines.push({ type: 'Avulso', label: it.description, category: it.category, value: it.value || 0, day: parseInt((it.date || '').slice(8, 10), 10) || null, collection: 'variableExpenses', id: it.id }); });
  state.loans.forEach((it) => { const info = installmentInfo(it, m); if (info.active) lines.push({ type: 'Empréstimo', label: it.name + ' (' + info.current + '/' + info.total + ')', category: it.category, value: it.installmentValue || 0, day: it.day || null, collection: 'loans', id: it.id }); });
  state.cardInstallments.forEach((it) => { const info = installmentInfo(it, m); if (info.active) lines.push({ type: 'Cartão', label: it.description + ' (' + info.current + '/' + info.total + ')', category: it.category, value: it.installmentValue || 0, day: it.day || null, collection: 'cardInstallments', id: it.id }); });
  state.sharedExpenses.forEach((it) => { if (isActiveInMonth(it, m)) { const mine = (it.value || 0) * ((it.splitMePct || 0) / 100); lines.push({ type: 'Casa', label: it.name, category: it.category || 'Moradia', value: mine, day: it.day, collection: 'sharedExpenses', id: it.id }); } });
  return lines;
}
export function monthIncomeLines(m) {
  return state.income.filter((it) => isActiveInMonth(it, m)).map((it) => ({ type: 'Renda', label: it.description, category: it.category, value: it.value || 0, day: it.day, collection: 'income', id: it.id }));
}
export function monthTotals(m) {
  const income = monthIncomeLines(m).reduce((s, l) => s + l.value, 0);
  const expense = monthExpenseLines(m).reduce((s, l) => s + l.value, 0);
  return { income, expense, balance: income - expense };
}
export function categoryTotals(m) {
  const map = {};
  monthExpenseLines(m).forEach((l) => { const c = l.category || 'Outros'; map[c] = (map[c] || 0) + l.value; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/** Vencimentos entre hoje e hoje+dias (inclusive). Gastos avulsos não entram (já foram pagos). */
export function upcomingDue(days = 7, fromStr = todayStr()) {
  const toStr = addDays(fromStr, days);
  const months = [fromStr.slice(0, 7)];
  if (toStr.slice(0, 7) !== months[0]) months.push(toStr.slice(0, 7));
  const out = [];
  months.forEach((m) => {
    monthExpenseLines(m).forEach((l) => {
      if (l.type === 'Avulso' || !l.day) return;
      const dueDay = Math.min(l.day, daysInMonth(m));
      const due = m + '-' + pad2(dueDay);
      if (due >= fromStr && due <= toStr) out.push({ ...l, due });
    });
  });
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/* ---------- etiquetas ---------- */
export function tagColorIndex(tag) {
  const t = String(tag || 'Outros');
  if (t === 'Outros') return -1;
  if (Object.prototype.hasOwnProperty.call(state.tagColorMap, t)) return state.tagColorMap[t];
  const used = new Set(Object.values(state.tagColorMap));
  let idx = 0;
  while (used.has(idx) && idx < 8) idx++;
  if (idx >= 8) idx = Object.keys(state.tagColorMap).length % 8;
  state.tagColorMap[t] = idx;
  saveLocal();
  return idx;
}
export function tagColor(tag) {
  const idx = tagColorIndex(tag);
  return idx < 0 ? 'var(--ink-faint)' : 'var(--series-' + (idx + 1) + ')';
}
export function tagUsage() {
  const map = {};
  COLLECTIONS.forEach((c) => state[c].forEach((it) => { if (it.category) map[it.category] = (map[it.category] || 0) + 1; }));
  return map;
}
export function collectAllTags() {
  const set = new Set(CATEGORIES);
  Object.keys(tagUsage()).forEach((t) => set.add(t));
  return [...set];
}
export function quickTags(n = 8) {
  const used = Object.entries(tagUsage()).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const out = [];
  [...used, ...DEFAULT_QUICK_TAGS].forEach((t) => { if (!out.includes(t) && out.length < n) out.push(t); });
  return out;
}
/** Casa o texto com uma etiqueta que o usuário já tem (sem diferenciar acento/maiúscula). */
export function canonicalTag(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const hit = collectAllTags().find((x) => norm(x) === norm(t));
  return hit || t.charAt(0).toUpperCase() + t.slice(1);
}

export function boot() {
  loadLocal();
}

export { COLLECTIONS, isValidMonth, shiftMonth };
