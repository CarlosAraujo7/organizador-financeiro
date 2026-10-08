/* Gráficos em SVG/HTML puro: rosca por etiqueta e Renda × Gastos.
 * Cores: etiquetas usam --series-1..8 (paleta categórica validada para daltonismo);
 * Renda = --income (azul, série 1) e Gastos = --expense (vermelho, série 8). Verde × vermelho
 * foi testado e reprovou no teste de daltonismo, por isso renda não é verde. */
import { fmtBRL, escAttr, shiftMonth, monthLabel, monthAbbr } from './util.js';
import { tagColor, monthIncomeLines, monthExpenseLines } from './store.js';

/** Agrupa as etiquetas menores em "Outros" para não poluir o gráfico. */
export function capCategories(list, cap) {
  if (list.length <= cap) return list.slice();
  const top = list.slice(0, cap - 1);
  const rest = list.slice(cap - 1).reduce((s, [, v]) => s + v, 0);
  const idx = top.findIndex(([c]) => c === 'Outros');
  if (idx >= 0) top[idx] = ['Outros', top[idx][1] + rest];
  else top.push(['Outros', rest]);
  return top.sort((a, b) => b[1] - a[1]);
}

export function donutSVG(list, total) {
  const R = 50, CX = 60, CY = 60, SW = 16;
  const circ = 2 * Math.PI * R;
  let acc = 0;
  const gap = list.length > 1 ? 1.2 : 0; // respiro de 2px entre fatias
  const segs = list.map(([cat, val]) => {
    const frac = total > 0 ? val / total : 0;
    const len = Math.max(0, frac * circ - gap);
    const off = -acc;
    acc += frac * circ;
    const pct = (frac * 100).toFixed(1).replace('.', ',');
    const tip = escAttr(cat + ': ' + fmtBRL(val) + ' (' + pct + '%)');
    return `<circle class="donut-seg" cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${tagColor(cat)}" stroke-width="${SW}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${off}" transform="rotate(-90 ${CX} ${CY})" data-tip="${tip}"/>`;
  }).join('');
  return `<svg viewBox="0 0 120 120" class="donut" role="img" aria-label="Gastos por etiqueta">
    ${total > 0 ? segs : `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="${SW}"/>`}
    <text x="60" y="56" text-anchor="middle" class="donut-label">Total</text>
    <text x="60" y="72" text-anchor="middle" class="donut-value">${fmtBRL(total)}</text>
  </svg>`;
}

/** Colunas por mês: renda sobe da linha de base, gastos descem; mesma escala nos dois sentidos. */
export function trendChart(centerMonth) {
  const months = [];
  for (let i = -2; i <= 3; i++) months.push(shiftMonth(centerMonth, i));
  const data = months.map((m) => ({
    m,
    income: monthIncomeLines(m).reduce((s, l) => s + l.value, 0),
    expense: monthExpenseLines(m).reduce((s, l) => s + l.value, 0),
  }));
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const cols = data.map((d) => {
    const hUp = d.income > 0 ? Math.max(4, Math.round(d.income / maxVal * 84)) : 0;
    const hDown = d.expense > 0 ? Math.max(4, Math.round(d.expense / maxVal * 84)) : 0;
    const cur = d.m === centerMonth;
    return `<div class="trend-col${cur ? ' current' : ''}">
      <div class="trend-half up">${hUp ? `<div class="trend-bar" style="height:${hUp}px;background:var(--income)" data-tip="${escAttr('Renda em ' + monthLabel(d.m) + ': ' + fmtBRL(d.income))}"></div>` : ''}</div>
      <div class="trend-base"></div>
      <div class="trend-half down">${hDown ? `<div class="trend-bar" style="height:${hDown}px;background:var(--expense)" data-tip="${escAttr('Gastos em ' + monthLabel(d.m) + ': ' + fmtBRL(d.expense))}"></div>` : ''}</div>
      <div class="trend-month">${monthAbbr(d.m)}</div>
    </div>`;
  }).join('');
  return `<div class="trend" role="img" aria-label="Renda e gastos mês a mês">${cols}</div>`;
}
