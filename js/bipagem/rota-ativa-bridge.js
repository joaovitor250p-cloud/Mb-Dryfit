(function iniciarBridgeBipagem(global) {
  'use strict';

  let wrapperInstalado = false;
  let rotaBridgeId = null;

  function $(id) { return document.getElementById(id); }

  function notificar(msg) {
    if (typeof global.notificar === 'function') global.notificar(msg);
    else console.log(msg);
  }

  function pacotesDaRota(rota) {
    return (rota?.paradas || []).flatMap(p => Array.isArray(p.pacotes) ? p.pacotes : []);
  }

  function validarPacotesUnicos(rota) {
    const owner = new Map();
    const duplicados = [];
    (rota?.paradas || []).forEach(p => {
      (p.pacotes || []).forEach(codigo => {
        const c = String(codigo || '').trim();
        if (!c) return;
        if (owner.has(c) && owner.get(c) !== p.id) duplicados.push(c);
        else owner.set(c, p.id);
      });
    });
    return [...new Set(duplicados)];
  }


  function chaveFisicaBipagem(p) {
    const endereco = String(p?.logradouro || p?.enderecoFonte || p?.enderecoOriginal || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const numero = String(p?.numero || (endereco.match(/\b\d+[a-z]?\b/i) || [''])[0] || '').toLowerCase();
    let rua = endereco;
    if (numero) rua = rua.replace(new RegExp(`\\b${numero.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b.*$`,'i'),'');
    rua = rua.replace(/\b(ap|apto|apartamento|casa|bloco|sala|loja|suite|fundos|frente)\b.*$/i,'').replace(/[^a-z0-9]+/g,' ').trim();
    return rua && numero ? `${rua}_${numero}` : `parada_${String(p?.id || '')}`;
  }

  function nomeFisicoBipagem(p) {
    const logradouro = String(p?.logradouro || p?.enderecoFonte || p?.enderecoOriginal || '').trim();
    const numero = String(p?.numero || (logradouro.match(/\b\d+[A-Za-z]?\b/) || [''])[0] || '').trim();
    if (!numero) return logradouro || 'Endereço não informado';
    const pos = logradouro.toLowerCase().indexOf(numero.toLowerCase());
    const rua = pos >= 0 ? logradouro.slice(0, pos).replace(/[\s,;-]+$/,'').trim() : logradouro;
    return [rua, numero].filter(Boolean).join(', ');
  }

  function atualizarCard(rota, mensagem) {
    const card = $('activeRouteBipagemCard');
    if (!card) return;
    if (!rota) {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'block';
    if ($('activeRouteBipagemName')) $('activeRouteBipagemName').textContent = rota.nome || 'Rota ativa';
    const pacotes = pacotesDaRota(rota).length;
    const paradasFisicas = new Set((rota.paradas || []).map(chaveFisicaBipagem)).size;
    if ($('activeRouteBipagemMeta')) {
      $('activeRouteBipagemMeta').textContent = mensagem || `${paradasFisicas} paradas físicas · ${pacotes} pacotes · ${rota.rotaOtimizada ? 'otimizada' : 'não otimizada'}`;
    }
  }

  async function prepararRotaAtivaParaBipagem(opcoes) {
    const rota = await global.PacoteEMatoRotaStore?.obterRotaAtiva?.();
    if (!rota || rota.status === 'concluida') {
      atualizarCard(null);
      return { ok: false, reason: 'sem_rota' };
    }

    const pacotes = pacotesDaRota(rota);
    if (!pacotes.length) {
      atualizarCard(rota, 'Esta rota não possui códigos de pacote. Você pode continuar usando a importação PDF da Bipagem.');
      return { ok: false, reason: 'sem_pacotes', rota };
    }

    const duplicados = validarPacotesUnicos(rota);
    if (duplicados.length) {
      atualizarCard(rota, `Existem ${duplicados.length} código(s) repetidos em paradas diferentes. Corrija a rota antes da bipagem.`);
      return { ok: false, reason: 'pacotes_duplicados', rota, duplicados };
    }

    const mapa = {};
    const nomes = {};
    const stops = {};
    const todos = new Set();
    const bipados = new Set();
    const byOrder = new Map();
    (rota.ordem || []).forEach((id, i) => byOrder.set(id, i + 1));

    const grupos = new Map();
    rota.paradas.forEach((p, index) => {
      const lista = Array.isArray(p.pacotes) ? p.pacotes.slice() : [];
      if (!lista.length) return;
      const keyBase = chaveFisicaBipagem(p);
      if (!grupos.has(keyBase)) grupos.set(keyBase, { paradas: [], pacotes: [], nome: nomeFisicoBipagem(p), ordem: Infinity });
      const grupo = grupos.get(keyBase);
      grupo.paradas.push(p);
      grupo.pacotes.push(...lista);
      grupo.ordem = Math.min(grupo.ordem, Number(byOrder.get(p.id) || p.ordemOtimizada || p.ordemOriginal || index + 1));
      (p.pacotesBipados || []).forEach(codigo => { if (lista.includes(codigo)) bipados.add(codigo); });
    });
    [...grupos.entries()].sort((a,b)=>a[1].ordem-b[1].ordem).forEach(([keyBase, grupo], idx) => {
      const key = `rotaativa_${keyBase.replace(/[^A-Za-z0-9_-]/g,'_')}`;
      const lista = [...new Set(grupo.pacotes.map(String).filter(Boolean))];
      mapa[key] = lista; nomes[key] = grupo.nome;
      lista.forEach(codigo => { todos.add(codigo); stops[codigo] = idx + 1; });
    });

    global.mapaRotas = mapa;
    global.nomeExibicao = nomes;
    global.stopCorrespondente = stops;
    global.todosPacotes = todos;
    global.pacotesBipados = bipados;
    global.chaveStorageAtual = `rotaativa_v2_${rota.id}`;
    global.rotaInicioEm = Number(rota.iniciadoEm || Date.now());
    global.resumoFinalJaExibido = false;
    rotaBridgeId = rota.id;

    try { localStorage.setItem(global.chaveStorageAtual, JSON.stringify([...bipados])); } catch (_) {}
    if (typeof global.salvarEstadoCompletoRota === 'function') {
      try { global.salvarEstadoCompletoRota(rota.nome || 'Rota ativa'); } catch (_) {}
    }

    $('areaExecucao') && ($('areaExecucao').style.display = 'block');
    if (typeof global.entrarModoRotaAtiva === 'function') global.entrarModoRotaAtiva();
    if (typeof global.atualizarStats === 'function') global.atualizarStats();
    if (opcoes?.iniciarScanner !== false && typeof global.iniciarScanner === 'function') global.iniciarScanner();

    atualizarCard(rota, `${Object.keys(mapa).length} paradas físicas · ${todos.size} pacotes · rota ativa pronta para bipagem`);
    return { ok: true, rota };
  }

  async function sincronizarBipagemNoStore(codigoNovo) {
    if (!rotaBridgeId || !codigoNovo) return;
    const rota = await global.PacoteEMatoRotaStore.obterRota(rotaBridgeId);
    if (!rota) return;
    let mudou = false;
    rota.paradas.forEach(p => {
      if (!(p.pacotes || []).includes(codigoNovo)) return;
      if (!Array.isArray(p.pacotesBipados)) p.pacotesBipados = [];
      if (!p.pacotesBipados.includes(codigoNovo)) {
        p.pacotesBipados.push(codigoNovo);
        mudou = true;
      }
      p.quantidadeBipada = p.pacotesBipados.length;
      if (p.pacotes.length && p.quantidadeBipada >= p.pacotes.length) {
        p.statusEntrega = 'concluida';
        p.entregueEm = p.entregueEm || Date.now();
      } else if (p.quantidadeBipada > 0 && p.statusEntrega !== 'nao_entregue') {
        p.statusEntrega = 'parcial';
      }
    });
    if (mudou) {
      const todosConcluidos = rota.paradas.filter(p => p.pacotes?.length).every(p => ['entregue', 'concluida'].includes(p.statusEntrega));
      if (todosConcluidos) {
        rota.status = 'concluida';
        rota.concluidoEm = Date.now();
      }
      await global.PacoteEMatoRotaStore.salvarRota(rota, { ativa: true });
      global.PacoteEMatoHistorico?.renderizar?.();
      global.PacoteEMatoAppShell?.atualizarInicio?.();
    }
  }

  function instalarWrapper() {
    if (wrapperInstalado) return;
    const original = global.processarCodigo;
    if (typeof original !== 'function') return;
    wrapperInstalado = true;
    global.processarCodigo = function(...args) {
      const antes = new Set(global.pacotesBipados || []);
      const retorno = original.apply(this, args);
      setTimeout(() => {
        let novo = null;
        for (const c of global.pacotesBipados || []) {
          if (!antes.has(c)) { novo = c; break; }
        }
        if (novo) sincronizarBipagemNoStore(novo);
      }, 0);
      return retorno;
    };
    global.processarCodigo.__pematoRotaAtivaBridge = true;
    global.processarCodigo.__pematoOriginal = original;
  }

  function bind() {
    $('activeRouteBipagemUseBtn')?.addEventListener('click', () => prepararRotaAtivaParaBipagem({ iniciarScanner: true }));
    instalarWrapper();
  }

  async function atualizar() {
    const rota = await global.PacoteEMatoRotaStore?.obterRotaAtiva?.();
    atualizarCard(rota);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  global.addEventListener('pemato:rota:salva', atualizar);

  global.PacoteEMatoBipagemBridge = Object.freeze({
    prepararRotaAtivaParaBipagem,
    atualizar,
    sincronizarBipagemNoStore
  });
})(window);
