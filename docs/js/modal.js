/* Formulário genérico (criar/editar) guiado pelas definições em defs.js.
 * No celular vira uma "gaveta" que sobe de baixo; no computador, uma janela central. */
import { escHtml, escAttr, nextMonth } from './util.js';
import { ENTITY_DEFS } from './defs.js';
import { state, ui, addItem, updateItem, removeItem, findItem, personLabel, collectAllTags, quickTags } from './store.js';

let ctx = null;
const $ = (id) => document.getElementById(id);

function valOrDef(f, value) {
  return (value === undefined || value === null) ? (typeof f.def === 'function' ? f.def() : f.def) : value;
}
function numAttr(val) { return (val === undefined || val === null || val === '') ? '' : val; }

function fieldInputHTML(f, value) {
  const id = 'f_' + f.key;
  const val = valOrDef(f, value);
  switch (f.type) {
    case 'text': return `<input type="text" id="${id}" placeholder="${escAttr(f.ph || '')}" value="${escAttr(val == null ? '' : val)}" autocomplete="off">`;
    case 'money': return `<input type="number" id="${id}" inputmode="decimal" step="0.01" min="0" placeholder="0,00" value="${numAttr(val)}">`;
    case 'int': return `<input type="number" id="${id}" inputmode="numeric" step="1" min="1" value="${numAttr(val)}">`;
    case 'day': return `<input type="number" id="${id}" inputmode="numeric" step="1" min="1" max="31" value="${numAttr(val)}">`;
    case 'percent': return `<input type="number" id="${id}" inputmode="decimal" step="0.1" min="0" max="100" value="${numAttr(val)}">`;
    case 'date': return `<input type="date" id="${id}" value="${escAttr(val || '')}">`;
    case 'month': return `<input type="month" id="${id}" value="${escAttr(val || '')}">`;
    case 'select': return `<select id="${id}">${f.options.map((o) => `<option value="${escAttr(o)}" ${o === val ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}</select>`;
    case 'tag': return `<input type="text" id="${id}" list="tag-suggestions" autocomplete="off" placeholder="Ex.: Uber, iFood, Aluguel..." value="${escAttr(val == null ? '' : val)}">
      <div class="tag-quick">${quickTags(8).map((t) => `<button type="button" class="qchip" data-qtag="${escAttr(t)}">${escHtml(t)}</button>`).join('')}</div>`;
    case 'checkbox': return `<label class="check" for="${id}"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}><span>${escHtml(f.label)}</span></label>`;
    case 'textarea': return `<textarea id="${id}" rows="2" placeholder="${escAttr(f.ph || '')}">${val == null ? '' : escHtml(val)}</textarea>`;
    case 'person': {
      const opts = [['me', personLabel('me')], ['p2', personLabel('p2')], ['p3', personLabel('p3')]];
      return `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${escHtml(l)}</option>`).join('')}</select>`;
    }
    default: return `<input type="text" id="${id}" value="${escAttr(val == null ? '' : val)}">`;
  }
}
function labelText(f) {
  return (f.label || '').replace('{p2}', state.config.roommate2Name).replace('{p3}', state.config.roommate3Name);
}
function fieldHTML(f, value) {
  if (f.type === 'checkbox') return `<div class="field" id="wrap_${f.key}">${fieldInputHTML({ ...f, label: labelText(f) }, value)}</div>`;
  return `<div class="field" id="wrap_${f.key}"><label for="f_${f.key}">${escHtml(labelText(f))}</label>${fieldInputHTML(f, value)}</div>`;
}
function readValue(f) {
  const el = $('f_' + f.key);
  if (!el) return undefined;
  if (f.type === 'checkbox') return el.checked;
  if (f.type === 'money' || f.type === 'percent') return el.value === '' ? null : parseFloat(el.value);
  if (f.type === 'int' || f.type === 'day') return el.value === '' ? null : parseInt(el.value, 10);
  if (f.type === 'tag') return el.value.trim().replace(/\s+/g, ' ');
  return el.value;
}
const showError = (msg) => { const el = $('modal-error'); el.textContent = msg; el.hidden = false; };
const clearError = () => { const el = $('modal-error'); el.hidden = true; el.textContent = ''; };

/** Abre o formulário. opts.prefill = valores iniciais (novo lançamento vindo do assistente);
 *  opts.onSaved(id, data) é chamado depois de salvar. */
export function openModal(entityKey, editId = null, opts = {}) {
  const def = ENTITY_DEFS[entityKey];
  if (!def) return;
  const item = editId ? findItem(def.collection, editId) : (opts.prefill || null);
  ctx = { entityKey, editId, def, opts };
  $('modal-title').textContent = editId ? 'Editar · ' + def.title : def.addLabel;
  $('tag-suggestions').innerHTML = collectAllTags().map((t) => `<option value="${escAttr(t)}">`).join('');
  $('modal-body').innerHTML = def.fields.map((f) => fieldHTML(f, item ? item[f.key] : undefined)).join('');
  clearError();
  const del = $('modal-delete');
  del.hidden = !editId;
  del.textContent = 'Excluir';
  del.dataset.armed = '0';
  if (entityKey === 'income' || entityKey === 'sharedExpenses') {
    const chk = $('f_recurring');
    const wrap = $('wrap_endMonth');
    const sync = () => { wrap.style.display = chk.checked ? '' : 'none'; };
    chk.addEventListener('change', sync); sync();
  }
  $('modal').showModal();
  $('modal-body').scrollTop = 0;
}

export function closeModal() {
  const dlg = $('modal');
  if (dlg.open) dlg.close();
  ctx = null;
}

async function onSubmit(e) {
  e.preventDefault();
  if (!ctx) return;
  clearError();
  const { entityKey, editId, def, opts } = ctx;
  const data = {};
  def.fields.forEach((f) => { data[f.key] = readValue(f); });
  if (entityKey === 'income' || entityKey === 'sharedExpenses') {
    if (data.recurring === false) data.endMonth = data.startMonth ? nextMonth(data.startMonth) : null;
    else if (!data.endMonth) data.endMonth = null;
  }
  const missing = def.fields.some((f) => {
    if (f.optional || f.type === 'checkbox' || f.key === 'endMonth') return false;
    const v = data[f.key];
    return v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
  });
  if (missing) return showError('Preencha os campos obrigatórios antes de salvar.');
  if (entityKey === 'sharedExpenses') {
    const sum = (data.splitMePct || 0) + (data.split2Pct || 0) + (data.split3Pct || 0);
    if (Math.abs(sum - 100) > 0.5) return showError('As três porcentagens precisam somar 100%. Agora estão em ' + sum.toFixed(1) + '%.');
  }
  // Só lançamentos com DATA específica levam a tela até o mês deles (senão sumiriam da vista).
  if (data.date) ui.refMonth = data.date.slice(0, 7);
  const saveBtn = $('modal-save');
  saveBtn.disabled = true;
  try {
    let id = editId;
    if (editId) updateItem(def.collection, editId, data);
    else id = addItem(def.collection, data);
    const cb = opts.onSaved;
    closeModal();
    if (cb) cb(id, data, def.collection);
  } finally { saveBtn.disabled = false; }
}

export function initModal() {
  const dlg = $('modal');
  $('modal-form').addEventListener('submit', onSubmit);
  dlg.addEventListener('cancel', () => { ctx = null; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeModal(); }); // toque fora fecha
  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-body').addEventListener('click', (e) => {
    const q = e.target.closest('[data-qtag]');
    if (!q) return;
    const input = $('f_category');
    if (input) { input.value = q.dataset.qtag; input.dispatchEvent(new Event('input')); }
  });
  $('modal-delete').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (!ctx || !ctx.editId) return;
    if (btn.dataset.armed === '1') {
      const { def, editId } = ctx;
      closeModal();
      removeItem(def.collection, editId);
      return;
    }
    btn.dataset.armed = '1';
    btn.textContent = 'Confirmar exclusão?';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.dataset.armed = '0'; btn.textContent = 'Excluir'; }, 4000);
  });
}
