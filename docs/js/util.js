/* Helpers puros: datas, dinheiro, texto. Sem acesso a DOM nem a estado. */

export const MONTH_NAMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export const MONTH_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
export const WEEKDAYS = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

export const pad2 = (n) => String(n).padStart(2, '0');

export function dateToStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
export function todayStr() { return dateToStr(new Date()); }
export function currentMonthStr() { return todayStr().slice(0, 7); }
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return dateToStr(d); }
export function daysInMonth(m) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); }
export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateToStr(parseDate(s)) === s;
}
export function isValidMonth(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }

export function monthLabel(m) { const [y, mo] = m.split('-').map(Number); return MONTH_NAMES[mo - 1] + ' de ' + y; }
export function monthAbbr(m) { const [y, mo] = m.split('-').map(Number); return MONTH_ABBR[mo - 1] + '/' + String(y).slice(2); }
export function shiftMonth(m, delta) {
  let [y, mo] = m.split('-').map(Number);
  mo += delta;
  while (mo > 12) { mo -= 12; y++; }
  while (mo < 1) { mo += 12; y--; }
  return y + '-' + pad2(mo);
}
export function nextMonth(m) { return shiftMonth(m, 1); }
export function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

export function fmtBRL(v) {
  const n = typeof v === 'number' ? v : parseFloat(v || 0);
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function fmtDateBR(s) { return s ? s.split('-').reverse().join('/') : ''; }
export function fmtDayMonth(s) { const [, m, d] = s.split('-').map(Number); return pad2(d) + ' ' + MONTH_ABBR[m - 1]; }
export function longDate(s) {
  const d = parseDate(s);
  return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTH_NAMES[d.getMonth()];
}

export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export const escAttr = escHtml;

export function uid() { return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/** minúsculas e sem acento, para comparar textos */
export function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Aceita 45, "45.9", "45,90", "1.234,56", "R$ 12" e devolve número ou null */
export function parseMoney(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
