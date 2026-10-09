(function iniciarRotaStore(global) {
  'use strict';

  const DB_NAME = 'pacote_e_mato_rotas_v2';
  const DB_VERSION = 1;
  const STORE_ROTAS = 'rotas';
  const STORE_META = 'meta';
  const META_ATIVA = 'rotaAtivaId';
  const LOCAL_ACTIVE_ID = 'pemato_rota_ativa_id_v2';
  let dbPromise = null;
  let rotaAtivaMemoria = null;

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function uuid(prefix) {
    const p = prefix || 'rota';
    if (global.crypto?.randomUUID) return `${p}-${global.crypto.randomUUID()}`;
    return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function agora() { return Date.now(); }

  function numero(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function numeroCoordenada(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizarParada(parada, index) {
    const p = parada && typeof parada === 'object' ? clone(parada) : {};
    p.id = String(p.id || uuid('parada'));
    p.ordemOriginal = numero(p.ordemOriginal, index + 1);
    p.ordemOtimizada = Number.isFinite(Number(p.ordemOtimizada)) ? Number(p.ordemOtimizada) : null;
    p.enderecoOriginal = String(p.enderecoOriginal || p.endereco || '').trim();
    p.enderecoNormalizado = String(p.enderecoNormalizado || '').trim();
    p.logradouro = String(p.logradouro || '').trim();
    p.numero = String(p.numero || '').trim();
    p.complemento = String(p.complemento || '').trim();
    p.apartamento = String(p.apartamento || '').trim();
    p.bloco = String(p.bloco || '').trim();
    p.sala = String(p.sala || '').trim();
    p.loja = String(p.loja || '').trim();
    p.bairro = String(p.bairro || '').trim();
    p.cidade = String(p.cidade || '').trim();
    p.estado = String(p.estado || '').trim();
    p.cep = String(p.cep || '').trim();
    p.observacao = String(p.observacao || '').trim();
    p.pacotes = Array.isArray(p.pacotes) ? [...new Set(p.pacotes.map(v => String(v || '').trim()).filter(Boolean))] : [];
    p.pacotesBipados = Array.isArray(p.pacotesBipados)
      ? [...new Set(p.pacotesBipados.map(v => String(v || '').trim()).filter(v => p.pacotes.includes(v)))]
      : [];
    p.quantidadePacotes = p.pacotes.length || numero(p.quantidadePacotes, 0);
    p.quantidadeBipada = p.pacotesBipados.length || Math.max(0, numero(p.quantidadeBipada, 0));
    p.latitude = numeroCoordenada(p.latitude);
    p.longitude = numeroCoordenada(p.longitude);
    p.statusGeocodificacao = String(p.statusGeocodificacao || 'pendente');
    p.confiabilidade = Number.isFinite(Number(p.confiabilidade)) ? Number(p.confiabilidade) : null;
    p.confiabilidadeRua = Number.isFinite(Number(p.confiabilidadeRua)) ? Number(p.confiabilidadeRua) : null;
    p.precisaoGeocodificacao = p.precisaoGeocodificacao || null;
    p.enderecoGeocodificado = String(p.enderecoGeocodificado || '');
    p.geocodificadoEm = p.geocodificadoEm || null;
    p.fonteCoordenada = p.fonteCoordenada || null;
    p.statusEntrega = ['pendente', 'parcial', 'concluida', 'entregue', 'nao_entregue'].includes(p.statusEntrega)
      ? p.statusEntrega
      : 'pendente';
    p.motivoNaoEntrega = String(p.motivoNaoEntrega || '');
    p.observacaoNaoEntrega = String(p.observacaoNaoEntrega || '');
    p.observacaoEntrega = String(p.observacaoEntrega || '');
    p.entregueEm = p.entregueEm || null;
    p.naoEntregueEm = p.naoEntregueEm || null;
    p.statusAtualizadoEm = p.statusAtualizadoEm || null;
    p.origem = String(p.origem || 'manual');
    p.criadoEm = p.criadoEm || agora();
    p.alteradoEm = p.alteradoEm || p.criadoEm;
    return p;
  }

  function normalizarPonto(ponto) {
    if (!ponto || typeof ponto !== 'object') return null;
    const lat = numeroCoordenada(ponto.lat ?? ponto.latitude);
    const lon = numeroCoordenada(ponto.lon ?? ponto.longitude);
    const valido = lat !== null && lon !== null;
    return {
      tipo: String(ponto.tipo || 'coordenada'),
      descricao: String(ponto.descricao || ponto.endereco || ''),
      lat,
      lon,
      status: String(ponto.status || (valido ? 'ok' : 'pendente'))
    };
  }

  function modoPorVeiculo(veiculo) {
    if (veiculo === 'moto') return 'motorcycle';
    if (veiculo === 'caminhao') return 'light_truck';
    return 'drive';
  }

  function normalizarRota(rota) {
    const r = rota && typeof rota === 'object' ? clone(rota) : {};
    const created = r.criadoEm || agora();
    r.schemaVersion = 2;
    r.id = String(r.id || uuid('rota'));
    r.nome = String(r.nome || 'Rota sem nome');
    r.usuario = String(r.usuario || obterUsuarioChave() || 'local');
    r.data = String(r.data || new Date(created).toISOString().slice(0, 10));
    r.origem = String(r.origem || 'manual');
    r.criadoEm = created;
    r.alteradoEm = r.alteradoEm || created;
    r.status = ['planejamento', 'ativa', 'aguardando_finalizacao', 'concluida', 'arquivada'].includes(r.status) ? r.status : 'planejamento';
    r.veiculo = ['carro', 'moto', 'caminhao'].includes(r.veiculo) ? r.veiculo : 'carro';
    r.modoRoteamento = String(r.modoRoteamento || modoPorVeiculo(r.veiculo));
    r.tempoParadaSegundos = Math.max(0, numero(r.tempoParadaSegundos, 180));
    r.pontoInicial = normalizarPonto(r.pontoInicial);
    r.pontoFinal = normalizarPonto(r.pontoFinal);
    r.retornarAoInicio = r.retornarAoInicio === true;
    r.paradas = (Array.isArray(r.paradas) ? r.paradas : []).map(normalizarParada);
    const ids = new Set(r.paradas.map(p => p.id));
    r.ordem = Array.isArray(r.ordem)
      ? r.ordem.map(String).filter(id => ids.has(id))
      : [];
    r.paradas.forEach(p => { if (!r.ordem.includes(p.id)) r.ordem.push(p.id); });
    r.rotaOtimizada = r.rotaOtimizada === true;
    r.geometria = r.geometria || null;
    r.instrucoes = Array.isArray(r.instrucoes) ? r.instrucoes : [];
    r.pernas = Array.isArray(r.pernas) ? r.pernas : [];
    r.distanciaTotalMetros = Number.isFinite(Number(r.distanciaTotalMetros)) ? Number(r.distanciaTotalMetros) : null;
    r.duracaoDirecaoSegundos = Number.isFinite(Number(r.duracaoDirecaoSegundos)) ? Number(r.duracaoDirecaoSegundos) : null;
    r.duracaoParadasSegundos = Number.isFinite(Number(r.duracaoParadasSegundos))
      ? Number(r.duracaoParadasSegundos)
      : r.paradas.length * r.tempoParadaSegundos;
    r.duracaoTotalSegundos = Number.isFinite(Number(r.duracaoTotalSegundos)) ? Number(r.duracaoTotalSegundos) : null;
    r.horarioTerminoEstimado = r.horarioTerminoEstimado || null;
    r.otimizadoEm = r.otimizadoEm || null;
    r.iniciadoEm = r.iniciadoEm || null;
    r.concluidoEm = r.concluidoEm || null;
    r.conclusaoPendente = r.conclusaoPendente === true;
    r.recalculadoEm = r.recalculadoEm || null;
    r.duracaoPlanejadorSegundos = Number.isFinite(Number(r.duracaoPlanejadorSegundos)) ? Number(r.duracaoPlanejadorSegundos) : null;
    return r;
  }

  function abrirDB() {
    if (!('indexedDB' in global)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_ROTAS)) {
            const store = db.createObjectStore(STORE_ROTAS, { keyPath: 'id' });
            store.createIndex('alteradoEm', 'alteradoEm', { unique: false });
            store.createIndex('data', 'data', { unique: false });
            store.createIndex('status', 'status', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    return dbPromise;
  }

  async function dbPut(storeName, value) {
    const db = await abrirDB();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  async function dbGet(storeName, key) {
    const db = await abrirDB();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  async function dbGetAll(storeName) {
    const db = await abrirDB();
    if (!db) return [];
    return new Promise(resolve => {
      try {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  async function dbDelete(storeName, key) {
    const db = await abrirDB();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function obterUsuarioChave() {
    try { return String(localStorage.getItem('usuario_zap_salvo') || '').replace(/\D/g, ''); }
    catch (_) { return ''; }
  }

  function usuarioAtual() {
    return obterUsuarioChave() || 'local';
  }

  function chaveAtivaLocal() {
    return `${LOCAL_ACTIVE_ID}_${usuarioAtual()}`;
  }

  function chaveAtivaMeta() {
    return `${META_ATIVA}:${usuarioAtual()}`;
  }

  async function listarRotasFirestore() {
    try {
      if (!global.firebase || !global.firebase.firestore || !global.firebase.auth) return [];
      const user = global.firebase.auth().currentUser;
      const zap = obterUsuarioChave();
      if (!user || !zap) return [];
      const snapshot = await global.firebase.firestore()
        .collection('usuarios')
        .doc(zap)
        .collection('rotas_v2')
        .get();
      const rotas = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (!data || typeof data !== 'object') return;
        const rota = normalizarRota(Object.assign({}, data, { id: data.id || doc.id, usuario: zap }));
        if (rota.usuario === zap) rotas.push(rota);
      });
      return rotas;
    } catch (erro) {
      console.warn('Pacote É Mato: leitura do histórico remoto indisponível; usando dados locais.', erro?.message || erro);
      return [];
    }
  }

  async function espelharFirestore(rota) {
    try {
      if (!global.firebase || !global.firebase.firestore || !global.firebase.auth) return false;
      const user = global.firebase.auth().currentUser;
      const zap = obterUsuarioChave();
      if (!user || !zap) return false;
      const payload = clone(rota);
      payload._sync = { uid: user.uid, atualizadoEm: Date.now(), schemaVersion: 2 };
      await global.firebase.firestore()
        .collection('usuarios')
        .doc(zap)
        .collection('rotas_v2')
        .doc(rota.id)
        .set(payload, { merge: true });
      return true;
    } catch (erro) {
      console.warn('Pacote É Mato: rota salva localmente; espelhamento Firestore indisponível.', erro?.message || erro);
      return false;
    }
  }

  function sincronizarComAppState(rota) {
    if (!global.appState?.roteirizacao || !rota) return;
    const r = global.appState.roteirizacao;
    r.rotaAtivaId = rota.id;
    r.origem = rota.origem;
    r.nome = rota.nome;
    r.pontoInicial = clone(rota.pontoInicial);
    r.pontoFinal = clone(rota.pontoFinal);
    r.retornarAoInicio = rota.retornarAoInicio;
    r.veiculo = rota.veiculo;
    r.modoRoteamento = rota.modoRoteamento;
    r.tempoParadaSegundos = rota.tempoParadaSegundos;
    r.paradas = clone(rota.paradas);
    r.ordem = [...rota.ordem];
    r.geometria = clone(rota.geometria);
    r.instrucoes = clone(rota.instrucoes);
    r.pernas = clone(rota.pernas);
    r.distanciaTotalMetros = rota.distanciaTotalMetros;
    r.duracaoDirecaoSegundos = rota.duracaoDirecaoSegundos;
    r.duracaoParadasSegundos = rota.duracaoParadasSegundos;
    r.duracaoTotalSegundos = rota.duracaoTotalSegundos;
    r.horarioTerminoEstimado = rota.horarioTerminoEstimado;
    r.calculadoEm = rota.otimizadoEm;
    r.rotaOtimizada = rota.rotaOtimizada;
    r.alteradoEm = rota.alteradoEm;
    r.sujo = false;
    if (!r.paradaSelecionadaId || !rota.paradas.some(p => p.id === r.paradaSelecionadaId)) {
      r.paradaSelecionadaId = rota.ordem[0] || rota.paradas[0]?.id || null;
    }
  }

  function emitir(nome, detail) {
    try { global.dispatchEvent(new CustomEvent(nome, { detail })); } catch (_) {}
  }

  async function salvarRota(rota, opcoes) {
    const entrada = clone(rota || {});
    entrada.alteradoEm = agora();
    const normalizada = normalizarRota(entrada);
    rotaAtivaMemoria = normalizada;
    await dbPut(STORE_ROTAS, normalizada);
    if (opcoes?.ativa !== false) {
      await dbPut(STORE_META, { key: chaveAtivaMeta(), value: normalizada.id, updatedAt: Date.now(), usuario: usuarioAtual() });
      try { localStorage.setItem(chaveAtivaLocal(), normalizada.id); } catch (_) {}
      sincronizarComAppState(normalizada);
    }
    if (opcoes?.firestore !== false) espelharFirestore(normalizada);
    emitir('pemato:rota:salva', { rota: clone(normalizada), ativa: opcoes?.ativa !== false });
    return clone(normalizada);
  }

  async function obterRota(id) {
    if (!id) return null;
    const value = await dbGet(STORE_ROTAS, String(id));
    return value ? normalizarRota(value) : null;
  }

  async function obterRotaAtiva() {
    const usuario = usuarioAtual();
    if (rotaAtivaMemoria && String(rotaAtivaMemoria.usuario || 'local') === usuario) return clone(rotaAtivaMemoria);
    rotaAtivaMemoria = null;

    let id = '';
    try { id = localStorage.getItem(chaveAtivaLocal()) || ''; } catch (_) {}
    if (!id) {
      const meta = await dbGet(STORE_META, chaveAtivaMeta());
      id = meta?.value || '';
    }

    // Migração conservadora da primeira versão da ETAPA 4: só reutiliza a chave antiga
    // quando a rota pertence ao usuário atual.
    if (!id) {
      let antigo = '';
      try { antigo = localStorage.getItem(LOCAL_ACTIVE_ID) || ''; } catch (_) {}
      if (antigo) {
        const rotaAntiga = await obterRota(antigo);
        if (rotaAntiga && String(rotaAntiga.usuario || 'local') === usuario) {
          id = antigo;
          try { localStorage.setItem(chaveAtivaLocal(), id); } catch (_) {}
          await dbPut(STORE_META, { key: chaveAtivaMeta(), value: id, updatedAt: Date.now(), usuario });
        }
      }
    }

    if (!id) return null;
    const rota = await obterRota(id);
    if (!rota || String(rota.usuario || 'local') !== usuario) return null;
    rotaAtivaMemoria = rota;
    sincronizarComAppState(rota);
    return clone(rota);
  }

  async function definirRotaAtiva(rotaOuId) {
    const rota = typeof rotaOuId === 'string' ? await obterRota(rotaOuId) : normalizarRota(rotaOuId);
    if (!rota) return null;
    rota.status = rota.status === 'concluida' ? 'concluida' : 'ativa';
    return salvarRota(rota, { ativa: true });
  }

  async function limparRotaAtiva() {
    rotaAtivaMemoria = null;
    try { localStorage.removeItem(chaveAtivaLocal()); } catch (_) {}
    await dbDelete(STORE_META, chaveAtivaMeta());
    if (global.appState?.roteirizacao) global.PacoteEMatoState?.resetarRoteirizacao?.();
    emitir('pemato:rota:ativa-limpa', {});
  }

  async function listarRotas(opcoes) {
    let rotas = (await dbGetAll(STORE_ROTAS)).map(normalizarRota);
    const usuario = usuarioAtual();

    if (!opcoes?.todosUsuarios && opcoes?.firestore !== false) {
      const remotas = await listarRotasFirestore();
      if (remotas.length) {
        const porId = new Map(rotas.map(r => [r.id, r]));
        for (const remota of remotas) {
          const local = porId.get(remota.id);
          if (!local || Number(remota.alteradoEm || 0) > Number(local.alteradoEm || 0)) {
            porId.set(remota.id, remota);
            await dbPut(STORE_ROTAS, remota);
          }
        }
        rotas = [...porId.values()];
      }
    }

    if (!opcoes?.todosUsuarios) {
      rotas = rotas.filter(r => String(r.usuario || 'local') === usuario);
    }
    if (opcoes?.status) rotas = rotas.filter(r => r.status === opcoes.status);
    if (opcoes?.dataInicio) rotas = rotas.filter(r => r.data >= opcoes.dataInicio);
    if (opcoes?.dataFim) rotas = rotas.filter(r => r.data <= opcoes.dataFim);
    rotas.sort((a, b) => Number(b.alteradoEm || 0) - Number(a.alteradoEm || 0));
    return rotas;
  }

  async function finalizarRota(rotaOuId) {
    const rota = typeof rotaOuId === 'string' ? await obterRota(rotaOuId) : normalizarRota(rotaOuId);
    if (!rota) return null;
    rota.status = 'concluida';
    rota.concluidoEm = Date.now();
    return salvarRota(rota, { ativa: true });
  }

  function criarRota(dados) {
    return normalizarRota(Object.assign({
      id: uuid('rota'),
      nome: `Rota ${new Date().toLocaleDateString('pt-BR')}`,
      status: 'planejamento',
      origem: 'manual',
      paradas: []
    }, dados || {}));
  }

  global.PacoteEMatoRotaStore = Object.freeze({
    criarRota,
    normalizarRota,
    normalizarParada,
    modoPorVeiculo,
    salvarRota,
    obterRota,
    obterRotaAtiva,
    definirRotaAtiva,
    limparRotaAtiva,
    listarRotas,
    listarRotasFirestore,
    finalizarRota,
    sincronizarComAppState,
    obterUsuarioChave,
    clone
  });
})(window);
