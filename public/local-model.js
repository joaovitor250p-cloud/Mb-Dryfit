/**
 * MB Referências | Núcleo de IA no próprio navegador.
 * Zero chamadas para APIs comerciais de IA e zero chave de acesso.
 * O código WebLLM e os pesos do modelo SÃO baixados publicamente na primeira carga.
 * CDN/version/modelo precisam estar acessíveis; o usuário deve consentir no download.
 * Modelo: Qwen2.5 0.5B (pequeno). Requer navegador HTTPS + WebGPU.
 */
const WEBLLM_URL = 'https://esm.sh/@mlc-ai/web-llm@0.2.78?bundle';
const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
let enginePromise = null;
let engine = null;
let lastStatus = 'Desativada';
const progressListeners = new Set();

function tell(message) {
  lastStatus = message;
  for (const callback of progressListeners) {
    try { callback(message); } catch { /* listener de UI isolado */ }
  }
}

export function localModelSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && Boolean(navigator.gpu);
}
export function localModelStatus() { return lastStatus; }
export function localModelReady() { return Boolean(engine); }

/** Precisa ser chamado por clique explícito; não baixa o modelo automaticamente. */
export async function loadLocalModel(onProgress) {
  if (typeof onProgress === 'function') progressListeners.add(onProgress);
  if (!localModelSupported()) {
    throw new Error('IA local exige HTTPS e WebGPU. Experimente Chrome ou Edge atualizado em um aparelho compatível. Os comandos diretos continuam disponíveis.');
  }
  if (engine) { tell('Modelo carregado'); return engine; }
  if (!enginePromise) {
    tell('Baixando o mecanismo de IA aberto…');
    enginePromise = (async () => {
      const library = await import(/* @vite-ignore */ WEBLLM_URL);
      if (typeof library.CreateMLCEngine !== 'function') throw new Error('Biblioteca WebLLM indisponível no CDN.');
      tell('Preparando a IA; o primeiro download pode ser grande…');
      const activeEngine = await library.CreateMLCEngine(MODEL_ID, {
        initProgressCallback(progress) {
          const percent = typeof progress.progress === 'number' ? ` (${Math.round(progress.progress * 100)}%)` : '';
          tell(`${progress.text || 'Carregando modelo'}${percent}`);
        }
      });
      engine = activeEngine;
      tell('IA local pronta para conversar');
      return activeEngine;
    })().catch(error => {
      enginePromise = null;
      tell('Não foi possível carregar a IA local');
      throw error;
    });
  }
  return enginePromise;
}

const SYSTEM_PROMPT = `Você é o Assistente MB, ajudante de uma confecção brasileira.
Fale em português simples, sem inventar números de OCs, preços, PIX ou dados do Firebase.
Você NÃO tem acesso ao banco; para consultar ou modificar dados reais, DEVE converter a intenção em exatamente UM dos comandos aceitos.
Responda SOMENTE com JSON válido e SEM markdown: {"reply":"mensagem breve em português","command":null} ou {"reply":"Vou consultar os dados.","command":"COMANDO"}.
Comandos permitidos:
- "OC 707" (consultar uma OC)
- "OC 707 paga" (solicitar pagamento, com confirmação humana)
- "Consultar REF 10088"
- "Mudar preço da REF 10088 para 4,50" (preço padrão, sem costureiro)
- "Quanto devo ao Mauro?"
- "Qual o PIX do Mauro?"
- "Quais OCs do Rodrigo estão pendentes?"
- "Quantas peças o Jony tem em andamento?"
- "Quanto paguei ao Mauro este mês?"
- "Apagar amostra da OC 303" (somente com confirmação humana)
Se a intenção for mudar preço ESPECIAL por costureiro, recuse a conversão e explique que deve ser feito em Oficinas.
Se o usuário pedir uma ação fora da lista, não invente comando nem diga que executou; responda informando a limitação e use command=null.
Nunca gere JavaScript, seletores DOM ou instruções para contornar autorizações.
Toda modificação só será executada após validação e confirmação no aplicativo.`;

function pickJSON(raw) {
  const text = String(raw || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first < 0 || last <= first) return { reply: cleaned.slice(0, 550), command: null };
    try { parsed = JSON.parse(cleaned.slice(first, last + 1)); }
    catch { return { reply: cleaned.slice(0, 550), command: null }; }
  }
  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 600) : '';
  const command = typeof parsed?.command === 'string' ? parsed.command.slice(0, 180) : null;
  return { reply: reply || 'Entendi seu pedido.', command };
}

/** Interpreta frases, mas NUNCA executa ações. O aplicativo valida e confirma. */
export async function interpretWithLocalModel(message, history = [], onProgress) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('Escreva ou fale um pedido.');
  const active = await loadLocalModel(onProgress);
  const conversation = history.slice(-4).filter(x => (x.role === 'user' || x.role === 'assistant') && typeof x.text === 'string')
    .map(x => ({role:x.role, content:x.text.slice(0,350)}));
  const completion = await active.chat.completions.create({
    messages: [
      {role:'system', content:SYSTEM_PROMPT},
      ...conversation,
      {role:'user', content:message.trim().slice(0,600)}
    ],
    temperature:0.1,
    max_tokens:240,
    stream:false
  });
  const content = completion?.choices?.[0]?.message?.content || '';
  return pickJSON(content);
}

export async function unloadLocalModel() {
  if (engine?.unload) await engine.unload();
  engine = null;
  enginePromise = null;
  tell('Modelo descarregado');
}
