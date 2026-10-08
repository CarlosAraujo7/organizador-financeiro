/* Ponto de entrada: rotas (#/painel, #/lancamentos/cartao...), navegação e ações dos botões. */
import {
  ui, boot, subscribe, hasData, saveConfig, importBackupText, backupPayload, backupFileName,
} from './store.js';
import { icon } from './icons.js';
import { monthLabel, monthAbbr, shiftMonth } from './util.js';
import { renderDashboard, renderLancamentos, renderCasa, renderAjustes, viewFlags } from './views.js';
import { renderAssistantShell, mountAssistant, initAssistant } from './assistant.js';
import { openModal, initModal } from './modal.js';
import { toast, initTooltips } from './ui.js';
import { getAIConfig, setAIConfig, testKey, GeminiError } from './gemini.js';

const $ = (id) => document.getElementById(id);
const THEME_KEY = 'livro-caixa-tema';

const NAV = [
  { id: 'painel', label: 'Painel', icon: 'home' },
  { id: 'lancamentos', label: 'Lançamentos', icon: 'list' },
  { id: 'assistente', label: 'Assistente', icon: 'sparkles', center: true },
  { id: 'casa', label: 'Casa', icon: 'users' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
];
const TITLES = {
  painel: ['Painel', 'Visão geral das suas finanças'],
  lancamentos: ['Lançamentos', 'Gastos, contas fixas, renda e parcelas'],
  assistente: ['Assistente', 'Conte o que gastou, eu organizo'],
  casa: ['Casa', 'Contas divididas e quanto cada um mandou'],
  ajustes: ['Ajustes', 'Chave da IA, nomes, backup e aparência'],
};
const WITH_MONTH = ['painel', 'lancamentos', 'casa'];

let deferredInstall = null;
let lastKey = '';

function parseRoute() {
  const parts = (location.hash || '').replace(/^#\/?/, '').split('/');
  const view = TITLES[parts[0]] ? parts[0] : 'painel';
  return { view, sub: parts[1] || '' };
}

function buildNav() {
  $('side-nav').innerHTML = NAV.map((n) =>
    `<a class="nav-item${n.center ? ' accent' : ''}" data-nav="${n.id}" href="#/${n.id}">${icon(n.icon, 20)}<span>${n.label}</span></a>`).join('');
  $('tabbar').innerHTML = NAV.map((n) =>
    `<a class="tab-item${n.center ? ' center' : ''}" data-nav="${n.id}" href="#/${n.id}" aria-label="${n.label}"><span class="tab-ic">${icon(n.icon, n.center ? 26 : 22)}</span><span class="tab-label">${n.label}</span></a>`).join('');
}

function render() {
  const { view, sub } = parseRoute();
  document.body.dataset.view = view;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === view;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('view-title').textContent = TITLES[view][0];
  $('view-sub').textContent = TITLES[view][1];
  $('month-picker').hidden = !WITH_MONTH.includes(view);
  $('month-label').innerHTML = `<span class="ml-long">${monthLabel(ui.refMonth)}</span><span class="ml-short">${monthAbbr(ui.refMonth)}</span>`;

  let html = '';
  if (view === 'painel') html = renderDashboard();
  else if (view === 'lancamentos') html = renderLancamentos(sub);
  else if (view === 'casa') html = renderCasa();
  else if (view === 'assistente') html = renderAssistantShell();
  else html = renderAjustes();
  $('view-root').innerHTML = html;

  if (view === 'assistente') mountAssistant();
  if (view === 'ajustes' && deferredInstall) { const r = $('install-row'); if (r) r.hidden = false; }
  const key = view + '/' + sub;
  if (key !== lastKey) { window.scrollTo(0, 0); lastKey = key; }
}

/* ---------------------------------------------------------------- tema */
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function setTheme(t) {
  try { if (t === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) { /* sem storage */ }
  applyTheme(t);
  render();
}

/* -------------------------------------------------------------- backup */
function downloadBackup() {
  const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = backupFileName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup exportado.');
}
async function shareBackup() {
  const file = new File([JSON.stringify(backupPayload(), null, 2)], backupFileName(), { type: 'application/json' });
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) { downloadBackup(); return; }
  try { await navigator.share({ files: [file], title: 'Backup do Livro-Caixa' }); }
  catch (e) { if (e.name !== 'AbortError') toast('Não consegui compartilhar. Use "Exportar backup".', 'err'); }
}
function importFile(file) {
  if (hasData() && !window.confirm('Importar vai SUBSTITUIR os dados que estão neste aparelho. Continuar?')) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const n = importBackupText(String(reader.result));
      toast('Backup importado: ' + n + ' lançamentos.');
      render();
    } catch (e) { console.warn(e); toast('Não consegui ler esse arquivo. Use um backup exportado pelo Livro-Caixa.', 'err'); }
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------ assistente */
async function saveAI() {
  const keyInput = $('ai-key');
  const model = $('ai-model').value;
  const key = (keyInput.value || '').trim() || getAIConfig().apiKey;
  if (!key) { toast('Cole a chave primeiro.', 'err'); return; }
  const btn = document.querySelector('[data-action="save-ai"]');
  btn.disabled = true; btn.textContent = 'Testando…';
  try {
    await testKey(key, model);
    setAIConfig({ apiKey: key, model });
    toast('Chave testada e salva neste aparelho.');
    render();
  } catch (e) {
    toast(e instanceof GeminiError ? e.message : 'Não consegui testar a chave.', 'err');
    btn.disabled = false; btn.textContent = 'Testar e salvar';
  }
}

/* ------------------------------------------------------------- eventos */
function onClick(e) {
  const t = e.target;
  if (t.closest('#month-prev')) { ui.refMonth = shiftMonth(ui.refMonth, -1); render(); return; }
  if (t.closest('#month-next')) { ui.refMonth = shiftMonth(ui.refMonth, 1); render(); return; }
  const el = t.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  switch (a) {
    case 'add': openModal(el.dataset.entity, null); break;
    case 'edit': openModal(el.dataset.entity, el.dataset.id); break;
    case 'toggle-lines': viewFlags.showAllLines = !viewFlags.showAllLines; render(); break;
    case 'set-theme': setTheme(el.dataset.theme); break;
    case 'save-config':
      saveConfig({
        ownerName: $('cfg-owner').value.trim() || 'Você',
        roommate2Name: $('cfg-p2').value.trim() || 'Morador 2',
        roommate3Name: $('cfg-p3').value.trim() || 'Morador 3',
      });
      toast('Nomes salvos.');
      break;
    case 'export-backup': downloadBackup(); break;
    case 'share-backup': shareBackup(); break;
    case 'toggle-key': { const i = $('ai-key'); i.type = i.type === 'password' ? 'text' : 'password'; el.innerHTML = icon(i.type === 'password' ? 'eye' : 'eyeOff', 18); break; }
    case 'save-ai': saveAI(); break;
    case 'remove-ai':
      if (window.confirm('Remover a chave deste aparelho? O assistente será desativado até você colar uma chave de novo.')) {
        setAIConfig({ apiKey: '' }); toast('Chave removida.'); render();
      }
      break;
    case 'install-app':
      if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; const r = $('install-row'); if (r) r.hidden = true; }
      break;
    default: break;
  }
}

function init() {
  try { applyTheme(localStorage.getItem(THEME_KEY) || 'auto'); } catch (e) { /* tema do sistema */ }
  boot();
  buildNav();
  initModal();
  initAssistant();
  initTooltips();

  document.addEventListener('click', onClick);
  document.addEventListener('change', (e) => {
    if (e.target.matches && e.target.matches('input[data-import]')) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importFile(f);
    }
  });
  window.addEventListener('hashchange', render);
  window.addEventListener('lc:rerender', render);
  window.addEventListener('lc:saved', (e) => {
    const ok = e.detail && e.detail.ok;
    $('save-dot').className = 'dot ' + (ok ? 'ok' : 'warn');
    $('save-text').textContent = ok ? 'Salvo neste aparelho' : 'Não consegui salvar (armazenamento cheio ou bloqueado)';
    if (!ok) toast('Não consegui salvar neste navegador. Exporte um backup agora.', 'err');
  });
  subscribe(() => { if (parseRoute().view !== 'assistente') render(); });

  // teclado aberto no celular: esconde a barra de baixo para o campo de mensagem ficar à vista
  document.addEventListener('focusin', (e) => { if (e.target.id === 'chat-input') document.body.classList.add('kb-open'); });
  document.addEventListener('focusout', (e) => { if (e.target.id === 'chat-input') setTimeout(() => document.body.classList.remove('kb-open'), 120); });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredInstall = e;
    const r = $('install-row'); if (r) r.hidden = false;
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('sw', err));
  }
  render();
}

init();
