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


  function chaveFisicaBipagem(p) {
    const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(rua|r\.|avenida|av\.|av|travessa|tv\.|estrada|rodovia)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    const numero = String(p?.numero || '').trim() || (String(p?.enderecoOriginal || '').match(/,?\s+(\d+[a-z]?)\b/i)?.[1] || '');
    const logradouro = p?.logradouro || String(p?.enderecoOriginal || '').split(/,\s*\d/)[0] || '';
    const chave = `${norm(logradouro)}|${norm(numero)}`;
    return chave.endsWith('|') ? `id:${p.id}` : chave;
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
    if ($('activeRouteBipagemMeta')) {
      $('activeRouteBipagemMeta').textContent = mensagem || `${rota.paradas.length} paradas · ${pacotes} pacotes · ${rota.rotaOtimizada ? 'otimizada' : 'não otimizada'}`;
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
    (rota.ordem || []).forEach((id, i) => byOrder.set(String(id), i + 1));

    // Bipagem agrupa por endereço físico (logradouro + número). Complementos como
    // apartamento, casa, loja, bloco e sala NÃO criam uma nova parada física.
    const grupos = new Map();
    rota.paradas.forEach((p, index) => {
      const lista = Array.isArray(p.pacotes) ? p.pacotes.slice() : [];
      if (!lista.length) return;
      const chave = chaveFisicaBipagem(p);
      if (!grupos.has(chave)) grupos.set(chave, { paradas: [], pacotes: [], primeira: p, ordem: byOrder.get(String(p.id)) || p.ordemOtimizada || p.ordemOriginal || index + 1 });
      const grupo = grupos.get(chave);
      grupo.paradas.push(p);
      grupo.pacotes.push(...lista);
      grupo.ordem = Math.min(Number(grupo.ordem || Infinity), Number(byOrder.get(String(p.id)) || p.ordemOtimizada || p.ordemOriginal || index + 1));
    });

    [...grupos.entries()].sort((a,b)=>a[1].ordem-b[1].ordem).forEach(([chave, grupo], index) => {
      const lista = [...new Set(grupo.pacotes.map(String).filter(Boolean))];
      const key = `rotaativa_fisica_${index + 1}_${chave.replace(/[^A-Za-z0-9_-]/g, '_').slice(0,60)}`;
      mapa[key] = lista;
      const base = grupo.primeira?.enderecoOriginal || 'Endereço não informado';
      nomes[key] = grupo.paradas.length > 1 ? `${base} · ${grupo.paradas.length}x` : base;
      lista.forEach(codigo => { todos.add(codigo); stops[codigo] = index + 1; });
      grupo.paradas.forEach(p => (p.pacotesBipados || []).forEach(codigo => { if (lista.includes(codigo)) bipados.add(codigo); }));
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
