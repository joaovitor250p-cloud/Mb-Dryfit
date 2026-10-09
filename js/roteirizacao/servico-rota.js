(function iniciarServicoRota(global) {
  'use strict';

  function cfg() { return global.PEMATO_MAP_CONFIG || {}; }

  function endpoint(nome) {
    const mapa = { optimize: 'pemato_optimize_endpoint', route: 'pemato_route_endpoint' };
    try {
      const salvo = localStorage.getItem(mapa[nome]);
      if (salvo) return salvo;
    } catch (_) {}
    return nome === 'optimize' ? String(cfg().optimizeEndpoint || '') : String(cfg().routeEndpoint || '');
  }

  function healthEndpoint() { return String(cfg().healthEndpoint || ''); }

  async function verificarServico() {
    const url = healthEndpoint();
    if (!url) return { ok: false, configured: false, providerConfigured: false, reason: 'worker_not_configured' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { method: 'GET', headers: { 'X-Pacote-Em-Mato-Client': 'routing-v1' }, credentials: 'omit', signal: controller.signal });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      return { ok: response.ok && data?.ok === true, configured: true, providerConfigured: data?.providerConfigured === true, status: response.status, detail: data };
    } catch (erro) {
      return { ok: false, configured: true, providerConfigured: false, reason: erro?.name === 'AbortError' ? 'timeout' : 'unavailable' };
    } finally { clearTimeout(timer); }
  }

  async function post(url, body, timeoutMs) {
    if (!url) {
      const e = new Error('Serviço seguro de roteirização não configurado.');
      e.code = 'WORKER_NAO_CONFIGURADO';
      throw e;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || Number(cfg().routingRequestTimeoutMs || 45000));
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pacote-Em-Mato-Client': 'routing-v1' },
        credentials: 'omit', body: JSON.stringify(body), signal: controller.signal
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok || !data?.ok) {
        const code = data?.error || `HTTP_${response.status}`;
        const mensagens = {
          provider_not_configured: 'O serviço de rotas está publicado, mas a chave do provedor ainda não foi configurada no servidor.',
          origin_not_allowed: 'Este domínio não está autorizado no serviço de rotas.',
          rate_limited: 'O serviço de rotas atingiu o limite temporário de requisições. Aguarde e tente novamente.',
          optimizer_timeout: 'A otimização demorou mais que o limite do serviço.',
          optimizer_unavailable: 'O otimizador está temporariamente indisponível.',
          route_timeout: 'O cálculo da rota demorou mais que o limite do serviço.',
          route_unavailable: 'O serviço de geometria da rota está temporariamente indisponível.'
        };
        const erro = new Error(mensagens[code] || data?.message || `Falha no serviço de rota (${response.status}).`);
        erro.code = code; erro.status = response.status; erro.detail = data;
        throw erro;
      }
      return data;
    } finally { clearTimeout(timer); }
  }

  function coord(p) {
    if (!p) return null;
    const latBruto = p.lat ?? p.latitude;
    const lonBruto = p.lon ?? p.longitude;
    if (latBruto === null || latBruto === undefined || String(latBruto).trim() === '') return null;
    if (lonBruto === null || lonBruto === undefined || String(lonBruto).trim() === '') return null;
    const lat = Number(latBruto), lon = Number(lonBruto);
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
    const concluidas = new Set((rota.paradas || []).filter(p => ['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega)).map(p => String(p.id)));
    const pendentes = (rota.paradas || []).filter(p => !concluidas.has(String(p.id)));
    const semCoordenada = pendentes.filter(p => !coord(p));
    if (semCoordenada.length) {
      const erro = new Error(`${semCoordenada.length} parada(s) ainda não possuem coordenadas válidas.`);
      erro.code = 'PARADAS_SEM_COORDENADA'; erro.paradas = semCoordenada.map(p => p.id); throw erro;
    }
    if (!pendentes.length) throw new Error('Não existem paradas pendentes para otimizar.');

    const mode = rota.modoRoteamento || perfilVeiculo(rota.veiculo);
    const resultado = await post(endpoint('optimize'), {
      mode, start, end: rota.pontoFinal ? coord(rota.pontoFinal) : null,
      returnToStart: rota.retornarAoInicio === true,
      stopDurationSeconds: Math.max(0, Number(rota.tempoParadaSegundos || 0)),
      traffic: 'approximated', type: 'balanced',
      stops: pendentes.map(p => ({ id: String(p.id), location: coord(p), duration: Math.max(0, Number(rota.tempoParadaSegundos || 0)) }))
    });

    const naoAtribuidas = Array.isArray(resultado?.issues?.unassignedJobs) ? resultado.issues.unassignedJobs : [];
    const esperado = new Set(pendentes.map(p => String(p.id)));
    const ordemRecebida = Array.isArray(resultado?.orderIds) ? [...new Set(resultado.orderIds.map(String))] : [];
    const desconhecidas = ordemRecebida.filter(id => !esperado.has(id));
    const faltantes = [...esperado].filter(id => !ordemRecebida.includes(id));
    if (naoAtribuidas.length || desconhecidas.length || faltantes.length || ordemRecebida.length !== pendentes.length) {
      const erro = new Error('O serviço não conseguiu atribuir todas as paradas. Nenhuma parada foi descartada; revise o relatório e tente novamente.');
      erro.code = 'OTIMIZACAO_INCOMPLETA';
      erro.detail = { ...resultado, faltantes, desconhecidas, naoAtribuidas };
      throw erro;
    }
    return resultado;
  }

  function ordenarParadas(rota, orderIds) {
    const mapa = new Map((rota.paradas || []).map(p => [String(p.id), p]));
    const concluidas = (rota.paradas || []).filter(p => ['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega));
    const pendentesOrdenadas = [];
    (orderIds || []).forEach(id => { const p = mapa.get(String(id)); if (p && !pendentesOrdenadas.includes(p)) pendentesOrdenadas.push(p); });
    (rota.paradas || []).forEach(p => { if (!['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega) && !pendentesOrdenadas.includes(p)) pendentesOrdenadas.push(p); });
    const ordem = [...concluidas, ...pendentesOrdenadas];
    ordem.forEach((p, index) => { p.ordemOtimizada = index + 1; });
    return ordem;
  }

  function pontosDaRota(rota) {
    const start = coord(rota?.pontoInicial);
    if (!start) return [];
    const byId = new Map((rota.paradas || []).map(p => [String(p.id), p]));
    const ordemIds = Array.isArray(rota.ordem) && rota.ordem.length ? rota.ordem : (rota.paradas || []).map(p => p.id);
    const points = [start];
    ordemIds.forEach(id => {
      const p = byId.get(String(id));
      if (!p || ['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega)) return;
      const c = coord(p); if (c) points.push(c);
    });
    if (rota.retornarAoInicio === true) points.push(start);
    else if (rota.pontoFinal) { const end = coord(rota.pontoFinal); if (end) points.push(end); }
    return points;
  }

  function geometriaValida(geometry) {
    if (!geometry || !['LineString', 'MultiLineString'].includes(geometry.type)) return false;
    const linhas = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    return Array.isArray(linhas) && linhas.length > 0 && linhas.every(l => Array.isArray(l) && l.length >= 2 && l.every(c => Array.isArray(c) && coord({ lon: c[0], lat: c[1] })));
  }

  async function calcularRotaPelasRuas(rota, pontosOverride) {
    const points = Array.isArray(pontosOverride) && pontosOverride.length ? pontosOverride.map(coord).filter(Boolean) : pontosDaRota(rota);
    if (points.length < 2) throw new Error('São necessários ao menos dois pontos válidos para calcular a rota.');
    const mode = rota.modoRoteamento || perfilVeiculo(rota.veiculo);
    const resposta = await post(endpoint('route'), { mode, points, traffic: 'approximated', type: 'balanced' });
    if (!geometriaValida(resposta?.feature?.geometry)) {
      const erro = new Error('O serviço respondeu sem uma geometria rodoviária válida. A linha da rota não será simulada.');
      erro.code = 'GEOMETRIA_INVALIDA'; erro.detail = resposta; throw erro;
    }
    return resposta;
  }

  function textoInstrucao(step) {
    const instrucao = step?.instruction;
    if (typeof instrucao === 'string') return instrucao;
    if (instrucao && typeof instrucao === 'object') return String(instrucao.text || instrucao.transition_instruction || instrucao.pre_transition_instruction || '');
    return String(step?.instruction_text || step?.text || '');
  }

  function extrairInstrucoes(feature) {
    const legs = feature?.properties?.legs || [];
    const instrucoes = [];
    legs.forEach((leg, legIndex) => {
      (leg?.steps || []).forEach((step, stepIndex) => {
        const detalhe = step?.instruction && typeof step.instruction === 'object' ? step.instruction : {};
        instrucoes.push({
          id: `${legIndex}:${stepIndex}`,
          legIndex, stepIndex,
          texto: textoInstrucao(step) || 'Continue pela rota',
          distancia: Number(step?.distance || 0), tempo: Number(step?.time || 0),
          fromIndex: Number.isFinite(Number(step?.from_index)) ? Number(step.from_index) : null,
          toIndex: Number.isFinite(Number(step?.to_index)) ? Number(step.to_index) : null,
          tipo: String(detalhe?.type || step?.type || ''),
          rua: String(detalhe?.street_name || step?.name || ''),
          exitNumber: detalhe?.exit_number ?? null
        });
      });
    });
    return instrucoes;
  }

  global.PacoteEMatoServicoRota = Object.freeze({ endpoint, healthEndpoint, verificarServico, perfilVeiculo, otimizar, ordenarParadas, calcularRotaPelasRuas, pontosDaRota, extrairInstrucoes, coord, geometriaValida });
})(window);
