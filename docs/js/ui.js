/* Peças de interface reutilizadas pelas telas. */
import { escHtml, escAttr, fmtBRL } from './util.js';
import { tagColor } from './store.js';
import { tagEmoji } from './defs.js';

/* ---------- aviso rápido ---------- */
let toastTimer;
export function toast(msg, kind = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'err' ? 5200 : 2800);
}

/* ---------- etiquetas ---------- */
export function avatar(tag, extraCls = '') {
  const t = tag || 'Outros';
  return `<span class="avatar ${extraCls}" style="--c:${tagColor(t)}" aria-hidden="true">${tagEmoji(t)}</span>`;
}
export function tagChip(tag) {
  const t = tag || 'Outros';
  return `<span class="tagchip"><i style="background:${tagColor(t)}"></i>${escHtml(t)}</span>`;
}
export function chip(cls, text) { return `<span class="chip ${cls}">${escHtml(text)}</span>`; }

/* ---------- blocos ---------- */
export function emptyState(title, text, actionHtml = '') {
  return `<div class="empty"><strong>${escHtml(title)}</strong><p>${escHtml(text)}</p>${actionHtml}</div>`;
}
export function progress(pct) {
  return `<div class="progress"><span style="width:${Math.min(100, Math.max(0, pct))}%"></span></div>`;
}
export function cardHead(title, sub, rightHtml = '') {
  return `<div class="card-head"><div><h2>${escHtml(title)}</h2>${sub ? `<p>${escHtml(sub)}</p>` : ''}</div>${rightHtml}</div>`;
}
export function stat(label, value, sub, cls = '') {
  return `<div class="stat"><span class="stat-label">${escHtml(label)}</span><span class="stat-value num ${cls}">${value}</span>${sub ? `<span class="stat-sub">${escHtml(sub)}</span>` : ''}</div>`;
}
/** Valor com sinal: o sinal e a cor carregam o sentido (nunca só a cor) */
export function money(value, kind) {
  if (kind === 'in') return `<span class="money in">+ ${fmtBRL(value)}</span>`;
  if (kind === 'out') return `<span class="money out">− ${fmtBRL(value)}</span>`;
  return `<span class="money">${fmtBRL(value)}</span>`;
}
/** Linha de lista tocável (abre a edição) */
export function listRow({ entity, id, tag, title, meta, right, dim = false }) {
  return `<button type="button" class="row${dim ? ' dim' : ''}" data-action="edit" data-entity="${escAttr(entity)}" data-id="${escAttr(id)}">
    ${avatar(tag)}
    <span class="row-main"><span class="row-title">${escHtml(title || '(sem descrição)')}</span><span class="row-meta">${meta}</span></span>
    <span class="row-right">${right}</span>
  </button>`;
}

/* ---------- dica dos gráficos (mouse e toque) ---------- */
export function initTooltips() {
  const tip = document.getElementById('chart-tip');
  if (!tip) return;
  let timer;
  const hide = () => tip.classList.remove('show');
  const show = (el, x, y) => {
    tip.textContent = el.getAttribute('data-tip');
    tip.style.left = Math.min(Math.max(x, 90), window.innerWidth - 90) + 'px';
    tip.style.top = Math.max(44, y - 14) + 'px';
    tip.classList.add('show');
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!el) return hide();
    show(el, e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const el = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!el) return hide();
    show(el, e.clientX, e.clientY);
    clearTimeout(timer);
    timer = setTimeout(hide, 2600);
  });
  document.addEventListener('scroll', hide, { passive: true });
}
