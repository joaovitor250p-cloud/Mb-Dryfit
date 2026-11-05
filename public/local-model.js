/**
 * MB REFERÊNCIAS — IA local sem API paga.
 * Tentativa 1: WebLLM + Qwen2.5 0.5B em WebGPU.
 * Tentativa 2: Transformers.js + SmolLM2 135M em CPU/WebAssembly.
 * Os dois motores só são carregados após clique explícito. Sem chave ou backend pago.
 * AVISO: pesos e bibliotecas são baixados de CDNs públicos; é necessário acesso à internet
 * no primeiro uso. Nem todo dispositivo terá memória suficiente; o modo de comandos
 * do Assistente MB continua disponível mesmo que nenhum motor carregue.
 */
const WEBLLM_URL = 'https://esm.sh/@mlc-ai/web-llm@0.2.78?bundle';
const GPU_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const TRANSFORMERS_URL = 'https://esm.sh/@huggingface/transformers@3.5.2?bundle';
const CPU_MODEL = 'onnx-community/SmolLM2-135M-Instruct';

let engine = null;
let enginePromise = null;
let backend = null;
let lastStatus = 'Desativada';
const listeners = new Set();

function tell(message) {
  lastStatus = String(message);
  for (const callback of listeners) {
    try { callback(lastStatus); } catch { /* erro isolado do componente visual */ }
  }
}

function secure() {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}
export function localModelSupported() {
  // WebAssembly permite CPU; uma GPU não é requisito.
  return secure() && typeof WebAssembly !== 'undefined';
}
export function localModelReady() { return Boolean(engine); }
export function localModelStatus() { return lastStatus; }
export function localModelBackend() { return backend; }

async function webGpuAvailable() {
  if (typeof navigator === 'undefined' || !navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') return false;
  try { return Boolean(await navigator.gpu.requestAdapter()); }
  catch { return false; }
}

async function startGPU() {
  tell('GPU detectada. Preparando modelo de IA…');
  const library = await import(/* @vite-ignore */ WEBLLM_URL);
  if (typeof library.CreateMLCEngine !== 'function') throw new Error('WebLLM indisponível');
  const activeEngine = await library.CreateMLCEngine(GPU_MODEL, {
    initProgressCallback(progress) {
      const percent = typeof progress?.progress === 'number' ? ` (${Math.round(progress.progress * 100)}%)` : '';
      tell(`${progress?.text || 'Baixando IA para GPU'}${percent}`);
    }
  });
  return { type:'gpu', instance:activeEngine };
}

async function startCPU() {
  tell('Este aparelho não tem GPU compatível. Iniciando IA leve pela CPU…');
  const library = await import(/* @vite-ignore */ TRANSFORMERS_URL);
  if (typeof library.pipeline !== 'function') throw new Error('Biblioteca de IA para CPU indisponível');
  // GitHub Pages normalmente não usa isolamento entre origens: WASM em thread única.
  if (library.env?.backends?.onnx?.wasm) library.env.backends.onnx.wasm.numThreads = 1;
  // Modelo de instruções pequeno (~135M parâmetros). Não requer WebGPU nem servidor pago.
  const generator = await library.pipeline('text-generation', CPU_MODEL, {
    device:'wasm',
    dtype:'q4',
    progress_callback(progress) {
      if (progress?.status === 'progress' && Number.isFinite(progress.progress)) {
        tell(`Baixando IA para CPU… ${Math.round(progress.progress)}%`);
      } else if (progress?.status === 'ready') {
        tell('Preparando motor de IA para CPU…');
      } else if (progress?.status === 'initiate') {
        tell('Baixando modelo leve da IA para CPU…');
      }
    }
  });
  return { type:'cpu', instance:generator };
}

/** Download somente após clique, com fallback real de GPU para CPU. */
export async function loadLocalModel(onProgress) {
  if (typeof onProgress === 'function') listeners.add(onProgress);
  try {
    if (!localModelSupported()) {
      throw new Error('IA local precisa de HTTPS e WebAssembly. Os comandos por texto e voz continuam disponíveis.');
    }
    if (engine) { tell(`IA local pronta (${backend === 'cpu' ? 'CPU' : 'GPU'})`); return engine; }
    if (!enginePromise) {
      enginePromise = (async () => {
        let loaded;
        if (await webGpuAvailable()) {
          try { loaded = await startGPU(); }
          catch (error) {
            // Alguns navegadores oferecem navigator.gpu, mas não suportam o modelo.
            tell('GPU não conseguiu iniciar o modelo. Tentando CPU sem WebGPU…');
            console.warn('[Assistente MB] Modelo WebGPU indisponível; usando alternativa CPU.', error);
          }
        }
        if (!loaded) loaded = await startCPU();
        backend = loaded.type;
        engine = loaded.instance;
        tell(`IA local pronta em ${backend === 'cpu' ? 'CPU (modo leve)' : 'GPU'}.`);
        return engine;
      })().catch(error => {
        enginePromise = null;
        backend = null;
        engine = null;
        tell('Não foi possível iniciar a IA neste aparelho. Os comandos locais continuam disponíveis.');
        throw new Error('O modelo local não conseguiu carregar pela CPU. Confira a internet, a memória disponível e tente novamente. Os comandos de OC e PIX continuam funcionando.', {cause:error});
      });
    }
    return await enginePromise;
  } finally {
    if (typeof onProgress === 'function') listeners.delete(onProgress);
  }
}

const SYSTEM_PROMPT = `Você é o Assistente MB de uma confecção brasileira.
Responda em português e não invente valores, PIX, OCs ou outros dados do Firebase.
Você NÃO acessa o banco. Para consultar ou modificar dados reais, converta a intenção em um dos comandos reconhecidos pelo aplicativo.
Responda somente JSON sem markdown: {"reply":"resposta breve em português","command":null} ou {"reply":"Vou consultar os dados.","command":"COMANDO"}.
Comandos aceitos: "OC 707", "OC 707 paga", "Consultar REF 10088", "Mudar preço da REF 10088 para 4,50", "Quanto devo ao Mauro?", "Qual o PIX do Mauro?", "Quais OCs do Rodrigo estão pendentes?", "Quantas peças o Jony tem em andamento?", "Quanto paguei ao Mauro este mês?", "Apagar amostra da OC 303".
Se for um preço especial por costureiro ou uma ação fora dessa lista, explique a limitação e use command=null.
Nunca gere JavaScript, seletores DOM, dados financeiros inventados ou instruções para contornar permissões.
Qualquer modificação exige validação e confirmação separadas no aplicativo.`;

function pickJSON(raw) {
  const text = String(raw || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch {
    const first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
    if (first < 0 || last <= first) return {reply:cleaned.slice(0,550),command:null};
    try { parsed = JSON.parse(cleaned.slice(first,last+1)); }
    catch { return {reply:cleaned.slice(0,550),command:null}; }
  }
  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0,600) : '';
  const command = typeof parsed?.command === 'string' ? parsed.command.slice(0,180) : null;
  return {reply:reply || 'Entendi seu pedido.',command};
}

function getReply(result) {
  const generated = result?.[0]?.generated_text;
  if (Array.isArray(generated)) {
    const assistant = [...generated].reverse().find(x => x?.role === 'assistant');
    const content = assistant?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(part => part?.text || '').join('');
  }
  if (typeof generated === 'string') return generated;
  if (typeof result?.[0]?.text === 'string') return result[0].text;
  return '';
}

/** Apenas interpreta; ações reais são validadas pelo aplicativo, nunca pelo modelo. */
export async function interpretWithLocalModel(message, history = [], onProgress) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('Escreva ou fale um pedido.');
  await loadLocalModel(onProgress);
  const context = history.slice(-4).filter(x => (x?.role === 'user' || x?.role === 'assistant') && typeof x?.text === 'string')
    .map(x => ({role:x.role,content:x.text.slice(0,350)}));
  const chat = [
    {role:'system',content:SYSTEM_PROMPT},
    ...context,
    {role:'user',content:message.trim().slice(0,600)}
  ];
  if (backend === 'gpu') {
    const response = await engine.chat.completions.create({messages:chat,temperature:0.1,max_tokens:220,stream:false});
    return pickJSON(response?.choices?.[0]?.message?.content || '');
  }
  // Transformers.js suporta mensagens em formato chat; apenas WebAssembly na CPU.
  const response = await engine(chat, {max_new_tokens:150,do_sample:false,return_full_text:false});
  return pickJSON(getReply(response));
}

export async function unloadLocalModel() {
  if (backend === 'gpu' && engine?.unload) await engine.unload();
  if (backend === 'cpu' && engine?.dispose) await engine.dispose();
  engine = null;
  enginePromise = null;
  backend = null;
  tell('Modelo descarregado');
}
