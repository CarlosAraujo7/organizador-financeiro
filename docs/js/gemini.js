/* Conexão direta (navegador -> Google) com a API do Gemini. Não existe servidor no meio.
 * A chave fica só no localStorage deste navegador, em uma chave separada dos dados financeiros,
 * por isso nunca vai para o backup nem para o repositório. */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const AI_KEY = 'livro-caixa-ia-v1';
const TIMEOUT_MS = 60000;

export const MODELS = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite · rápido' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash · mais capaz' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash · estável' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash · mais lento' },
];

export function getAIConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_KEY) || '{}');
    return {
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
      model: MODELS.some((m) => m.id === raw.model) ? raw.model : MODELS[0].id,
    };
  } catch (e) { return { apiKey: '', model: MODELS[0].id }; }
}
export function setAIConfig(patch) {
  const next = { ...getAIConfig(), ...patch };
  try { localStorage.setItem(AI_KEY, JSON.stringify(next)); } catch (e) { throw new GeminiError('storage', 'Não consegui salvar a chave neste navegador (armazenamento bloqueado ou cheio).'); }
  return next;
}
export function maskKey(k) { return k && k.length > 10 ? k.slice(0, 4) + '…' + k.slice(-4) : '••••'; }
export function modelLabel(id) { return (MODELS.find((m) => m.id === id) || { label: id }).label.split(' · ')[0]; }

export class GeminiError extends Error {
  constructor(kind, message, status) { super(message); this.kind = kind; this.status = status; }
}

const FRIENDLY = {
  key: 'O Google não aceitou a chave. Confira em Ajustes → Assistente com IA.',
  region: 'O Gemini não está disponível na sua região ou rede neste momento.',
  quota: 'Bati no limite gratuito do Gemini por agora. Espere um minutinho e tente de novo (ou troque o modelo em Ajustes).',
  unavailable: 'O Gemini está sobrecarregado agora. Tente de novo em instantes.',
  notfound: 'Esse modelo não está disponível para a sua chave. Troque o modelo em Ajustes.',
  network: 'Sem conexão com o Gemini. Confira sua internet e tente de novo.',
  timeout: 'O Gemini demorou demais para responder. Tente de novo.',
  blocked: 'O Gemini recusou essa mensagem. Tente reescrever de outro jeito.',
};

function classify(status, message) {
  const m = (message || '').toLowerCase();
  if (status === 400 && m.includes('api key')) return 'key';
  if (status === 401) return 'key';
  if (status === 403) return m.includes('location') ? 'region' : 'key';
  if (status === 404) return 'notfound';
  if (status === 429) return 'quota';
  if (status >= 500) return 'unavailable';
  return 'bad';
}

async function request(model, apiKey, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new GeminiError(e.name === 'AbortError' ? 'timeout' : 'network', FRIENDLY[e.name === 'AbortError' ? 'timeout' : 'network']);
  } finally { clearTimeout(timer); }

  let data = null;
  try { data = await res.json(); } catch (e) { /* corpo vazio */ }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ('Erro ' + res.status);
    const kind = classify(res.status, msg);
    throw new GeminiError(kind, FRIENDLY[kind] || ('O Gemini respondeu com erro: ' + msg.slice(0, 200)), res.status);
  }
  if (data && data.promptFeedback && data.promptFeedback.blockReason) throw new GeminiError('blocked', FRIENDLY.blocked);
  return data;
}

/** Chamada principal. Se o modelo escolhido estiver sem cota, sobrecarregado ou indisponível,
 *  tenta os outros da lista (no máximo 3 no total). */
export async function callGemini({ system, contents, tools, temperature = 0.2 }) {
  const cfg = getAIConfig();
  if (!cfg.apiKey) throw new GeminiError('key', 'Cole sua chave do Gemini em Ajustes → Assistente com IA.');
  const chain = [cfg.model, ...MODELS.map((m) => m.id).filter((id) => id !== cfg.model)].slice(0, 3);
  const body = {
    contents,
    generationConfig: { temperature },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(tools ? { tools } : {}),
  };
  let lastErr;
  for (const model of chain) {
    try {
      const data = await request(model, cfg.apiKey, body);
      return { data, model };
    } catch (e) {
      lastErr = e;
      if (!['quota', 'unavailable', 'notfound'].includes(e.kind)) throw e;
    }
  }
  throw lastErr;
}

/** Testa uma chave com uma pergunta mínima. Lança GeminiError se não funcionar. */
export async function testKey(apiKey, model) {
  const data = await request(model, apiKey, {
    contents: [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 16 },
  });
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || '').join('').trim() || 'ok';
}
