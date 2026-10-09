(function iniciarServicoRota(global) {
  'use strict';

  function cfg() { return global.PEMATO_MAP_CONFIG || {}; }

  function endpoint(nome) {
    const mapa = {
      optimize: 'pemato_optimize_endpoint',
      route: 'pemato_route_endpoint'
    };
    try {
      const salvo = localStorage.getItem(mapa[nome]);
      if (salvo) return salvo;
    } catch (_) {}
    return nome === 'optimize' ? String(cfg().optimizeEndpoint || '') : String(cfg().routeEndpoint || '');
  }

  async function post(url, body, timeoutMs) {
    if (!url) {
      const e = new Error('Worker de roteirização não configurado.');
      e.code = 'WORKER_NAO_CONFIGURADO';
      throw e;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || Number(cfg().routingRequestTimeoutMs || 45000));
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pacote-Em-Mato-Client': 'routing-v1'
        },
        credentials: 'omit',
        body: JSON.stringify(body),
        signal: controller.signal
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok || !data?.ok) {
        const erro = new Error(data?.error || `Falha no serviço de rota (${response.status}).`);
        erro.code = data?.error || `HTTP_${response.status}`;
        erro.status = response.status;
        erro.detail = data;
        throw erro;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function coord(p) {
    if (!p) return null;
    const latBruto = p.lat ?? p.latitude;
    const lonBruto = p.lon ?? p.longitude;
    if (latBruto === null || latBruto === undefined || String(latBruto).trim() === '') return null;
    if (lonBruto === null || lonBruto === undefined || String(lonBruto).trim() === '') return null;
    const lat = Number(latBruto);
    const lon = Number(lonBruto);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  function perfilVeiculo(veiculo) {
    if (veiculo === 'moto') return 'motorcycle';
    if (veiculo === 'caminhao') return 'light_truck';
    return 'drive';
  }

  async function otimizar(rota) {
    const start = coord(rota?.pontoInicial);
    if (!start) throw new Error('Defina um ponto de partida válido antes de otimizar.');

    const concluidas = new Set(
      (rota.paradas || [])
        .filter(p => ['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega))
        .map(p => p.id)
    );
    const pendentes = (rota.paradas || []).filter(p => !concluidas.has(p.id));
    const semCoordenada = pendentes.filter(p => !coord(p));
    if (semCoordenada.length) {
      const erro = new Error(`${semCoordenada.length} parada(s) ainda não possuem coordenadas válidas.`);
      erro.code = 'PARADAS_SEM_COORDENADA';
      erro.paradas = semCoordenada.map(p => p.id);
      throw erro;
    }
    if (!pendentes.length) throw new Error('Não existem paradas pendentes para otimizar.');

    const mode = rota.modoRoteamento || perfilVeiculo(rota.veiculo);
    const resultado = await post(endpoint('optimize'), {
      mode,
      start,
      end: rota.pontoFinal ? coord(rota.pontoFinal) : null,
      returnToStart: rota.retornarAoInicio === true,
      stopDurationSeconds: Math.max(0, Number(rota.tempoParadaSegundos || 0)),
      traffic: 'approximated',
      type: 'balanced',
      stops: pendentes.map(p => ({
        id: p.id,
        location: coord(p),
        duration: Math.max(0, Number(rota.tempoParadaSegundos || 0))
      }))
    });

    const naoAtribuidas = Array.isArray(resultado?.issues?.unassignedJobs) ? resultado.issues.unassignedJobs : [];
    const ordemRecebida = Array.isArray(resultado?.orderIds) ? [...new Set(resultado.orderIds.map(String))] : [];
    if (naoAtribuidas.length || ordemRecebida.length !== pendentes.length) {
      const erro = new Error('O serviço não conseguiu atribuir todas as paradas à rota. Revise os endereços e tente novamente.');
      erro.code = 'OTIMIZACAO_INCOMPLETA';
      erro.detail = resultado;
      throw erro;
    }
    return resultado;
  }

  function ordenarParadas(rota, orderIds) {
    const mapa = new Map((rota.paradas || []).map(p => [p.id, p]));
    const concluidas = (rota.paradas || []).filter(p => ['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega));
    const pendentesOrdenadas = [];
    (orderIds || []).forEach(id => {
      const p = mapa.get(id);
      if (p && !pendentesOrdenadas.includes(p)) pendentesOrdenadas.push(p);
    });
    (rota.paradas || []).forEach(p => {
      if (!['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega) && !pendentesOrdenadas.includes(p)) pendentesOrdenadas.push(p);
    });
    const ordem = [...concluidas, ...pendentesOrdenadas];
    ordem.forEach((p, index) => { p.ordemOtimizada = index + 1; });
    return ordem;
  }

  function pontosDaRota(rota) {
    const start = coord(rota.pontoInicial);
    if (!start) return [];
    const byId = new Map((rota.paradas || []).map(p => [p.id, p]));
    const ordemIds = Array.isArray(rota.ordem) && rota.ordem.length ? rota.ordem : (rota.paradas || []).map(p => p.id);
    const points = [start];
    ordemIds.forEach(id => {
      const p = byId.get(id);
      if (!p || ['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega)) return;
      const c = coord(p);
      if (c) points.push(c);
    });
    if (rota.retornarAoInicio === true) points.push(start);
    else if (rota.pontoFinal) {
      const end = coord(rota.pontoFinal);
      if (end) points.push(end);
    }
    return points;
  }

  async function calcularRotaPelasRuas(rota, pontosOverride) {
    const points = Array.isArray(pontosOverride) && pontosOverride.length ? pontosOverride : pontosDaRota(rota);
    if (points.length < 2) throw new Error('São necessários ao menos dois pontos válidos para calcular a rota.');
    const mode = rota.modoRoteamento || perfilVeiculo(rota.veiculo);
    return post(endpoint('route'), {
      mode,
      points,
      traffic: 'approximated',
      type: 'balanced'
    });
  }

  function extrairInstrucoes(feature) {
    const legs = feature?.properties?.legs || [];
    const instrucoes = [];
    legs.forEach((leg, legIndex) => {
      (leg?.steps || []).forEach((step, stepIndex) => {
        const instrucao = step?.instruction || step?.instruction?.text || step?.instruction_text || '';
        instrucoes.push({
          legIndex,
          stepIndex,
          texto: typeof instrucao === 'string' ? instrucao : String(instrucao?.text || ''),
          distancia: Number(step?.distance || 0),
          tempo: Number(step?.time || 0),
          fromIndex: step?.from_index ?? null,
          toIndex: step?.to_index ?? null
        });
      });
    });
    return instrucoes;
  }

  global.PacoteEMatoServicoRota = Object.freeze({
    endpoint,
    perfilVeiculo,
    otimizar,
    ordenarParadas,
    calcularRotaPelasRuas,
    pontosDaRota,
    extrairInstrucoes,
    coord
  });
})(window);
