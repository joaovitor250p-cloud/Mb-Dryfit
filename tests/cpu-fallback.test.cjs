const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const os = require('node:os');
const sourcePath = path.resolve(__dirname, '../public/local-model.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function makeModule({gpuAvailable=false, gpuCrash=false, cpuCrash=false}={}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-ai-fallback-'));
  const target = path.join(temp, 'model.mjs');
  const modSource = source
    .replace('await import(/* @vite-ignore */ WEBLLM_URL)', 'await globalThis.__MB_TEST_WEBLLM()')
    .replace('await import(/* @vite-ignore */ TRANSFORMERS_URL)', 'await globalThis.__MB_TEST_TRANSFORMERS()');
  fs.writeFileSync(target, modSource);
  globalThis.window = { isSecureContext: true };
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter: async()=>gpuAvailable?{}:null}}});
  let gpuCalls=0, cpuCalls=0;
  globalThis.__MB_TEST_WEBLLM = async()=>({
    CreateMLCEngine: async()=>{
      gpuCalls++;
      if(gpuCrash) throw new Error('Unable to find a compatible GPU');
      return {chat: {completions: {create: async()=>({choices:[{message:{content:'{"reply":"Olá pela GPU","command":null}'}}]})}}};
    }
  });
  globalThis.__MB_TEST_TRANSFORMERS = async()=>({
    env:{ backends:{ onnx:{ wasm:{numThreads:4} } } },
    pipeline: async()=>{
      cpuCalls++;
      if(cpuCrash) throw new Error('Modelo indisponível');
      return async()=>[{generated_text:[{role:'user',content:'oi'},{role:'assistant',content:'{"reply":"Olá pela CPU","command":null}'}]}];
    }
  });
  return {target,counts:()=>({gpuCalls,cpuCalls})};
}

// Node test runner executes tests serially because the stubs above live in globalThis.
test('Sem GPU compatível inicia CPU, sem falhar no WebGPU', async()=>{
  const testModule=makeModule({gpuAvailable:false});
  const local=await import(pathToFileURL(testModule.target).href);
  assert.equal(local.localModelSupported(),true);
  await local.loadLocalModel();
  assert.equal(local.localModelBackend(),'cpu');
  assert.deepEqual(testModule.counts(),{gpuCalls:0,cpuCalls:1});
  const response=await local.interpretWithLocalModel('Olá');
  assert.equal(response.reply,'Olá pela CPU');
});

test('GPU disponível mas WebLLM falhou: fallback para CPU',async()=>{
  const testModule=makeModule({gpuAvailable:true,gpuCrash:true});
  const local=await import(pathToFileURL(testModule.target).href);
  await local.loadLocalModel();
  assert.equal(local.localModelBackend(),'cpu');
  assert.deepEqual(testModule.counts(),{gpuCalls:1,cpuCalls:1});
});

test('GPU compatível usa WebLLM e não baixa CPU',async()=>{
  const testModule=makeModule({gpuAvailable:true});
  const local=await import(pathToFileURL(testModule.target).href);
  await local.loadLocalModel();
  assert.equal(local.localModelBackend(),'gpu');
  assert.deepEqual(testModule.counts(),{gpuCalls:1,cpuCalls:0});
  const response=await local.interpretWithLocalModel('Olá');
  assert.equal(response.reply,'Olá pela GPU');
});

test('Se CPU também falhar, mensagem em português e possibilidade de tentar novamente',async()=>{
  const testModule=makeModule({gpuAvailable:false,cpuCrash:true});
  const local=await import(pathToFileURL(testModule.target).href);
  await assert.rejects(local.loadLocalModel(), /modelo local não conseguiu carregar pela CPU/i);
  assert.equal(local.localModelReady(),false);
  assert.equal(local.localModelBackend(),null);
  assert.match(local.localModelStatus(), /comandos locais continuam disponíveis/i);
});

test('Código sem APIs ou segredos pagos',()=>{
  assert.doesNotMatch(source, /OPENAI_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY|api\.openai\.com|generativelanguage\.googleapis\.com/);
  assert.match(source,/device:'wasm'/);
  assert.match(source,/requestAdapter/);
  assert.match(source,/startCPU/);
});
