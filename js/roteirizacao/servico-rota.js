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
          optimizer_error: 'O provedor recusou ou falhou ao otimizar a rota. A rota anterior foi preservada.',
          route_timeout: 'O cálculo da rota demorou mais que o limite do serviço.',
          route_unavailable: 'O serviço de geometria da rota está temporariamente indisponível.',
          route_error: 'O provedor falhou ao calcular um trecho da rota pelas ruas.'
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
    if (veiculo === 'caminhao_leve') return 'light_truck';
    if (veiculo === 'caminhao') return 'truck';
    return 'drive';
  }

  function tipoRota(rota) {
    const preferencia = String(rota?.preferenciaRota || 'short');
    if (preferencia === 'less_maneuvers' && perfilVeiculo(rota?.veiculo) === 'motorcycle') return 'balanced';
    return ['short', 'balanced', 'less_maneuvers'].includes(preferencia) ? preferencia : 'short';
  }

  function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function erroTransitórioRota(erro) {
    const status = Number(erro?.status || 0);
    const code = String(erro?.code || '');
    return status >= 500 || ['optimizer_timeout','optimizer_unavailable','optimizer_error','route_timeout','route_unavailable','route_error'].includes(code);
  }

  async function postComRetry(url, body, timeoutMs, tentativas) {
    const total = Math.max(1, Number(tentativas || 1));
    let ultimoErro = null;
    for (let i = 0; i < total; i++) {
      try { return await post(url, body, timeoutMs); }
      catch (erro) {
        ultimoErro = erro;
        if (i >= total - 1 || !erroTransitórioRota(erro)) throw erro;
        await esperar(700 * (i + 1));
      }
    }
    throw ultimoErro || new Error('Falha no serviço de rota.');
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

    const mode = perfilVeiculo(rota.veiculo);
    const resultado = await postComRetry(endpoint('optimize'), {
      mode, start, end: rota.pontoFinal ? coord(rota.pontoFinal) : null,
      returnToStart: rota.retornarAoInicio === true,
      stopDurationSeconds: Math.max(0, Number(rota.tempoParadaSegundos || 0)),
      // Planejamento operacional: usa fluxo livre para não inflar a previsão com
      // congestionamento histórico/estimado. O tempo de atendimento continua
      // sendo considerado separadamente pelo Route Planner.
      traffic: 'free_flow', type: tipoRota(rota),
      stops: pendentes.map(p => ({ id: String(p.id), location: coord(p), duration: Math.max(0, Number(rota.tempoParadaSegundos || 0)) }))
    }, Number(cfg().routingRequestTimeoutMs || 45000), 2);

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

  const MAX_PONTOS_POR_TRECHO = 24;

  function dividirPontos(points, tamanhoMaximo) {
    const limite = Math.max(3, Number(tamanhoMaximo || MAX_PONTOS_POR_TRECHO));
    if (points.length <= limite) return [points.slice()];
    const blocos = [];
    let inicio = 0;
    while (inicio < points.length - 1) {
      const fim = Math.min(points.length, inicio + limite);
      const bloco = points.slice(inicio, fim);
      if (bloco.length >= 2) blocos.push(bloco);
      if (fim >= points.length) break;
      inicio = fim - 1; // o último ponto também inicia o bloco seguinte
    }
    return blocos;
  }

  function linhasDaGeometria(geometry) {
    if (!geometriaValida(geometry)) return [];
    return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  }

  function mesclarRespostasRota(respostas) {
    const linhas = [];
    const legs = [];
    const waypoints = [];
    let distance = 0;
    let time = 0;
    let provider = '';

    respostas.forEach((resposta, indiceResposta) => {
      const feature = resposta?.feature;
      if (!feature || !geometriaValida(feature.geometry)) throw new Error('Trecho incompleto: rota preservada.');
      provider = provider || String(resposta?.provider || '');
      linhasDaGeometria(feature.geometry).forEach(linha => linhas.push(linha));
      distance += Math.max(0, Number(feature.properties?.distance || 0));
      time += Math.max(0, Number(feature.properties?.time || 0));
      (Array.isArray(feature.properties?.legs) ? feature.properties.legs : []).forEach(leg => legs.push(leg));
      const ws = Array.isArray(feature.properties?.waypoints) ? feature.properties.waypoints : [];
      ws.forEach((w, i) => {
        if (indiceResposta > 0 && i === 0) return;
        waypoints.push(w);
      });
    });

    if (!linhas.length) {
      const erro = new Error('Nenhum trecho rodoviário válido foi retornado pelo serviço.');
      erro.code = 'GEOMETRIA_INVALIDA';
      throw erro;
    }

    return {
      ok: true,
      provider: provider || 'geoapify-routing-segmentado',
      segmentado: respostas.length > 1,
      segmentos: respostas.length,
      feature: {
        type: 'Feature',
        geometry: linhas.length === 1 ? { type: 'LineString', coordinates: linhas[0] } : { type: 'MultiLineString', coordinates: linhas },
        properties: { distance, time, legs, waypoints }
      }
    };
  }

  async function calcularBlocoRota(rota, bloco, blocoIndex, totalBlocos) {
    const mode = perfilVeiculo(rota.veiculo);
    try {
      const resposta = await postComRetry(endpoint('route'), {
        mode,
        points: bloco,
        traffic: 'free_flow',
        type: tipoRota(rota),
        intermediateWaypointMode: 'stopover'
      }, Number(cfg().routingRequestTimeoutMs || 45000), 2);
      if (!geometriaValida(resposta?.feature?.geometry)) {
        const erro = new Error(`O trecho ${blocoIndex + 1}/${totalBlocos} voltou sem geometria rodoviária válida.`);
        erro.code = 'GEOMETRIA_INVALIDA'; erro.detail = resposta; throw erro;
      }
      const props = resposta.feature.properties;
      if (props?.distance == null || props?.time == null || !Number.isFinite(Number(props.distance)) || Number(props.distance) < 0 || !Number.isFinite(Number(props.time)) || Number(props.time) < 0) throw new Error('O serviço retornou métricas inválidas.');
      return resposta;
    } catch (erro) {
      const detalheStatus = Number(erro?.detail?.status || erro?.detail?.detail?.status || 0);
      const msg = detalheStatus
        ? `Falha ao calcular o trecho ${blocoIndex + 1}/${totalBlocos} da rota (provedor HTTP ${detalheStatus}).`
        : `Falha ao calcular o trecho ${blocoIndex + 1}/${totalBlocos} da rota.`;
      const enriquecido = new Error(msg);
      enriquecido.code = 'ROTA_TRECHO_FALHOU';
      enriquecido.cause = erro;
      enriquecido.status = erro?.status || 0;
      enriquecido.detail = { blocoIndex, totalBlocos, pontos: bloco.length, erro: erro?.detail || null };
      throw enriquecido;
    }
  }

  async function calcularRotaPelasRuas(rota, pontosOverride) {
    const points = Array.isArray(pontosOverride) && pontosOverride.length ? pontosOverride.map(coord).filter(Boolean) : pontosDaRota(rota);
    if (points.length < 2) throw new Error('São necessários ao menos dois pontos válidos para calcular a rota.');

    // Rotas grandes não são mais enviadas em uma única chamada. Além de reduzir
    // o tamanho da URL do provedor, isso evita erros 5xx por excesso de waypoints.
    const blocos = dividirPontos(points, Number(cfg().routingMaxPointsPerRequest || MAX_PONTOS_POR_TRECHO));
    const respostas = [];
    for (let i = 0; i < blocos.length; i++) {
      respostas.push(await calcularBlocoRota(rota, blocos[i], i, blocos.length));
    }
    return mesclarRespostasRota(respostas);
  }

  // Cada alternativa é medida na rede viária, no sentido real de deslocamento.
  // Não usamos distâncias simétricas/em linha reta para escolher a vencedora.
  async function otimizarComparando(rota, progresso = () => {}) {
    const ativas = (rota.paradas || []).filter(p => !['entregue','concluida','nao_entregue'].includes(p.statusEntrega));
    if (!coord(rota.pontoInicial) || !ativas.length || ativas.some(p => !coord(p))) throw new Error('Confira as coordenadas de todas as paradas antes de otimizar.');
    if (new Set(ativas.map(p => String(p.id))).size !== ativas.length) throw new Error('Há identificadores repetidos de paradas. Corrija a importação antes de otimizar.');
    if (rota.pontoFinal && !coord(rota.pontoFinal)) throw new Error('O destino final não tem coordenadas válidas.');
    const copia = () => JSON.parse(JSON.stringify(rota));
    const candidatos = [], vistos = new Set(), falhas = [];
    const objetivo = tipoRota(rota);
    async function avaliar(ordem, tipo, origem) {
      const teste = copia(); teste.ordem = ordem; teste.preferenciaRota = tipo;
      const chave = JSON.stringify([ordem.map(String), tipo]);
      if (vistos.has(chave)) return null;
      vistos.add(chave);
      progresso('Comparando percursos reais', `${origem}: distância e tempo calculados pelas ruas.`);
      try {
        const route = await calcularRotaPelasRuas(teste);
        const d = Number(route.feature.properties.distance), t = Number(route.feature.properties.time);
        if (!Number.isFinite(d) || d < 0 || !Number.isFinite(t) || t < 0) throw new Error('Métricas de rota inválidas.');
        const c = {ordem, tipo, origem, route, distance:d, drivingTime:t};
        candidatos.push(c); return c;
      } catch (e) { falhas.push({origem, mensagem:e.message}); return null; }
    }
    const atual = ordenarParadas(copia(), rota.ordem || []).map(p => p.id);
    await avaliar(atual, objetivo, 'Sequência atual');
    for (const tipo of [...new Set([objetivo, 'short', 'balanced'])]) {
      progresso('Buscando outra sequência', tipo === 'short' ? 'Priorizando menor distância.' : 'Comparando tempo e distância.');
      try {
        const teste = copia(); teste.preferenciaRota = tipo;
        const plano = await otimizar(teste);
        const ordem = ordenarParadas(teste, plano.orderIds).map(p => p.id);
        await avaliar(ordem, tipo, `Planejamento ${tipo}`);
      } catch(e) { falhas.push({origem:tipo, mensagem:e.message}); }
    }
    const comparar = (a,b) => objetivo === 'short'
      ? a.distance - b.distance || a.drivingTime - b.drivingTime
      : a.drivingTime - b.drivingTime || a.distance - b.distance;
    if (!candidatos.length) throw new Error('Não foi possível confirmar um percurso completo pelas ruas. A rota anterior foi preservada.');
    candidatos.sort(comparar);
    // Refinamento limitado: deslocar uma parada perto de um trecho caro.
    // Recalcula o percurso inteiro, pois A→B pode ser diferente de B→A.
    const base = candidatos[0];
    const pendentes = base.ordem.filter(id => !(rota.paradas || []).some(p => String(p.id) === String(id) && ['entregue','concluida','nao_entregue'].includes(p.statusEntrega)));
    if (pendentes.length >= 3 && pendentes.length <= 60) {
      const legs = base.route.feature.properties.legs || [];
      let pior = 0;
      for(let i=1;i<Math.min(legs.length,pendentes.length);i++) if(Number(legs[i].distance)>Number(legs[pior]?.distance||0)) pior=i;
      const finalizadas = base.ordem.filter(id => !pendentes.includes(id));
      for (const deslocamento of [-1,1]) {
        const destino = pior + deslocamento;
        if(destino < 0 || destino >= pendentes.length) continue;
        const ordem = pendentes.slice(); const [id] = ordem.splice(pior,1); ordem.splice(destino,0,id);
        await avaliar([...finalizadas,...ordem], base.tipo, 'Refinamento de trecho');
      }
    }
    candidatos.sort(comparar);
    const melhor = candidatos[0];
    return {...melhor, orderIds:melhor.ordem, provider:'geoapify-comparacao-viaria',
      totalTime:melhor.drivingTime + pendentes.length * Math.max(0,Number(rota.tempoParadaSegundos||0)),
      comparacao:{objetivo, avaliadas:candidatos.map(c => ({origem:c.origem,tipo:c.tipo,distancia:c.distance,tempo:c.drivingTime})), falhas}};
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

  global.PacoteEMatoServicoRota = Object.freeze({ endpoint, healthEndpoint, verificarServico, perfilVeiculo, tipoRota, otimizar, otimizarComparando, ordenarParadas, calcularRotaPelasRuas, pontosDaRota, extrairInstrucoes, coord, geometriaValida });
})(window);
