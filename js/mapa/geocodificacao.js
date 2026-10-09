(function iniciarGeocodificacaoPacoteEMato(global) {
  'use strict';

  const provider = 'geoapify-worker';
  let execucaoAtual = 0;
  let ultimoInicioRequisicao = 0;

  function config() {
    return global.PEMATO_MAP_CONFIG || {};
  }

  function normalizarTexto(valor) {
    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limparEnderecoParaConsulta(endereco) {
    let valor = String(endereco || '')
      .replace(/\bBR[A-Z0-9]{8,25}\b/gi, ' ')
      .replace(/\b(?:apto|apartamento|ap|bloco|bl|torre|sala|unidade)\s*[A-Za-z0-9-]+\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return valor;
  }

  function numeroComparavel(valor) {
    return normalizarTexto(valor).replace(/\s/g, '');
  }

  function tokensLogradouro(valor) {
    const ignorar = new Set([
      'rua', 'r', 'avenida', 'av', 'alameda', 'travessa', 'tv', 'estrada', 'rodovia',
      'do', 'da', 'dos', 'das', 'de', 'e', 'bairro', 'brasil'
    ]);

    return normalizarTexto(valor)
      .split(' ')
      .filter(t => t && !ignorar.has(t) && !/^\d+$/.test(t));
  }

  function similaridadeLogradouro(origem, candidato) {
    const a = tokensLogradouro(origem);
    const b = tokensLogradouro(candidato);
    if (!a.length || !b.length) return 0;

    const sa = new Set(a);
    const sb = new Set(b);
    let inter = 0;
    sa.forEach(t => { if (sb.has(t)) inter++; });
    const base = Math.min(sa.size, sb.size);
    if (!base) return 0;
    return inter / base;
  }

  function coordenadasValidas(lat, lon) {
    if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
    if (String(lat).trim() === '' || String(lon).trim() === '') return false;
    const a = Number(lat);
    const o = Number(lon);
    return Number.isFinite(a) && Number.isFinite(o) && a >= -90 && a <= 90 && o >= -180 && o <= 180;
  }

  function numeroSolicitado(parada) {
    // Rotas XLSX/manuais usam `numero`; o legado pode usar `numeroImovel` ou chaveFisica.
    const explicito = String(parada?.numero ?? parada?.numeroImovel ?? '').trim();
    if (explicito) return numeroComparavel(explicito);

    const endereco = String(parada?.enderecoOriginal || parada?.enderecoConsulta || '');
    const base = endereco.split(/\s+-\s+/)[0] || endereco;
    const aposVirgula = base.match(/,\s*(\d+[A-Za-z]?)\b/);
    if (aposVirgula) return numeroComparavel(aposVirgula[1]);
    const numerosEndereco = base.match(/\b\d+[A-Za-z]?\b/g) || [];
    if (numerosEndereco.length) return numeroComparavel(numerosEndereco[numerosEndereco.length - 1]);

    const chave = String(parada?.chaveFisica || '');
    const m = chave.match(/_(\d+[a-z]?)(?:_s\d+)?$/i);
    return m ? numeroComparavel(m[1]) : '';
  }

  function avaliarResultados(parada, resposta) {
    const resultados = Array.isArray(resposta?.results) ? resposta.results : [];
    const numeroEsperado = numeroSolicitado(parada);
    const cfg = config();
    const aceitos = [];

    // Sem número do imóvel não aceitamos silenciosamente um ponto aproximado.
    if (!numeroEsperado) {
      return { status: resultados.length ? 'ambiguo' : 'nao_encontrado', motivo: 'numero_imovel_ausente' };
    }

    for (const r of resultados) {
      if (!coordenadasValidas(r.lat, r.lon)) continue;

      const numeroRetornado = numeroComparavel(r.housenumber || '');
      if (!numeroRetornado || numeroRetornado !== numeroEsperado) continue;

      const confidence = Number(r.rank?.confidence ?? 0);
      const streetConfidence = Number(r.rank?.confidence_street_level ?? confidence);
      if (confidence < Number(cfg.geocodingMinConfidence ?? 0.90)) continue;
      if (streetConfidence < Number(cfg.geocodingMinStreetConfidence ?? 0.90)) continue;

      const ruaRetornada = r.street || r.address_line1 || r.formatted || '';
      const similaridade = similaridadeLogradouro(parada.enderecoConsulta, ruaRetornada);
      if (similaridade < 0.5) continue;

      aceitos.push({
        lat: Number(r.lat),
        lon: Number(r.lon),
        formatted: String(r.formatted || ''),
        housenumber: String(r.housenumber || ''),
        street: String(r.street || ''),
        city: String(r.city || ''),
        state: String(r.state || ''),
        postcode: String(r.postcode || ''),
        resultType: String(r.result_type || ''),
        matchType: String(r.rank?.match_type || ''),
        confidence,
        streetConfidence,
        buildingConfidence: Number(r.rank?.confidence_building_level ?? NaN),
        similaridadeLogradouro: similaridade
      });
    }

    if (!aceitos.length) {
      return { status: resultados.length ? 'ambiguo' : 'nao_encontrado' };
    }

    aceitos.sort((a, b) =>
      b.confidence - a.confidence ||
      b.streetConfidence - a.streetConfidence ||
      b.similaridadeLogradouro - a.similaridadeLogradouro
    );

    const primeiro = aceitos[0];
    const distintos = aceitos.filter((item, index) => {
      if (index === 0) return true;
      const dLat = Math.abs(item.lat - primeiro.lat);
      const dLon = Math.abs(item.lon - primeiro.lon);
      return dLat > 0.0002 || dLon > 0.0002;
    });

    if (distintos.length > 1) {
      return { status: 'ambiguo', candidatos: aceitos.length };
    }

    return { status: 'ok', resultado: primeiro };
  }

  function aplicarResultado(parada, validacao, origem) {
    const agora = Date.now();
    parada.geocodificadoEm = agora;
    parada.fonteCoordenada = origem || 'rede';

    if (validacao.status === 'ok' && validacao.resultado) {
      const r = validacao.resultado;
      parada.latitude = r.lat;
      parada.longitude = r.lon;
      parada.statusGeocodificacao = 'ok';
      parada.confiabilidade = r.confidence;
      parada.confiabilidadeRua = r.streetConfidence;
      parada.precisaoGeocodificacao = 'logradouro_numero_validado';
      parada.enderecoGeocodificado = r.formatted;
      parada.geocodificacao = r;
      return;
    }

    parada.latitude = null;
    parada.longitude = null;
    parada.statusGeocodificacao = validacao.status;
    parada.confiabilidade = null;
    parada.confiabilidadeRua = null;
    parada.precisaoGeocodificacao = null;
    parada.enderecoGeocodificado = '';
    parada.geocodificacao = null;
  }

  function emitir(nome, detalhe) {
    try {
      global.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
    } catch (_) {}
  }

  function endpointAtual() {
    try {
      const salvo = global.localStorage?.getItem('pemato_geocoding_endpoint');
      if (salvo) return salvo;
    } catch (_) {}
    return String(config().geocodingEndpoint || '').trim();
  }

  function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function respeitarIntervalo() {
    const gap = Math.max(0, Number(config().geocodingRequestGapMs || 0));
    const agora = Date.now();
    const espera = Math.max(0, ultimoInicioRequisicao + gap - agora);
    if (espera) await esperar(espera);
    ultimoInicioRequisicao = Date.now();
  }

  async function consultarWorker(parada) {
    const endpoint = endpointAtual();
    if (!endpoint) {
      const erro = new Error('Endpoint de geocodificação não configurado.');
      erro.code = 'ENDPOINT_NAO_CONFIGURADO';
      throw erro;
    }

    await respeitarIntervalo();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(config().geocodingRequestTimeoutMs || 12000));

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pacote-Em-Mato-Client': 'map-v1'
        },
        body: JSON.stringify({ address: parada.enderecoConsulta }),
        signal: controller.signal,
        credentials: 'omit'
      });

      if (!response.ok) {
        let detalhe = null;
        try { detalhe = await response.json(); } catch (_) {}
        const erro = new Error(`Falha na geocodificação (${response.status}).`);
        erro.code = (response.status === 404 || response.status === 503 || detalhe?.error === 'provider_not_configured')
          ? 'PROVIDER_NOT_CONFIGURED'
          : `HTTP_${response.status}`;
        throw erro;
      }

      const dados = await response.json();
      if (!dados || dados.ok !== true || !Array.isArray(dados.results)) {
        const erro = new Error('Resposta inválida do serviço de geocodificação.');
        erro.code = 'RESPOSTA_INVALIDA';
        throw erro;
      }

      return dados;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function geocodificarUma(parada, execucaoId) {
    if (!parada || execucaoId !== execucaoAtual) return;

    parada.enderecoConsulta = limparEnderecoParaConsulta(parada.enderecoOriginal);
    if (!parada.enderecoConsulta) {
      aplicarResultado(parada, { status: 'nao_encontrado' }, 'local');
      emitir('pemato:geo:update', { paradaId: parada.id });
      return;
    }

    const cache = global.PacoteEMatoGeoCache;
    if (cache) {
      const registro = await cache.obter(provider, parada.enderecoConsulta);
      if (registro?.payload) {
        aplicarResultado(parada, registro.payload, 'cache');
        emitir('pemato:geo:update', { paradaId: parada.id, cache: true });
        return;
      }
    }

    if (execucaoId !== execucaoAtual) return;
    parada.statusGeocodificacao = 'consultando';
    emitir('pemato:geo:update', { paradaId: parada.id });

    try {
      const resposta = await consultarWorker(parada);
      if (execucaoId !== execucaoAtual) return;

      const validacao = avaliarResultados(parada, resposta);
      aplicarResultado(parada, validacao, 'rede');

      if (cache && ['ok', 'nao_encontrado', 'ambiguo'].includes(validacao.status)) {
        const ttl = validacao.status === 'ok'
          ? Number(config().geocodingCacheTtlMs)
          : Number(config().geocodingNegativeCacheTtlMs);
        await cache.salvar(provider, parada.enderecoConsulta, validacao, ttl);
      }
    } catch (erro) {
      if (execucaoId !== execucaoAtual) return;
      parada.latitude = null;
      parada.longitude = null;
      parada.statusGeocodificacao = ['ENDPOINT_NAO_CONFIGURADO', 'PROVIDER_NOT_CONFIGURED'].includes(erro?.code)
        ? 'nao_configurado'
        : 'erro';
      parada.erroGeocodificacao = String(erro?.message || erro || 'Erro desconhecido');
      parada.erroGeocodificacaoCodigo = String(erro?.code || 'ERRO');
    }

    emitir('pemato:geo:update', { paradaId: parada.id });
    return parada.statusGeocodificacao;
  }

  function resumo(paradas) {
    const lista = Array.isArray(paradas) ? paradas : [];
    const contagem = {
      total: lista.length,
      ok: 0,
      pendente: 0,
      consultando: 0,
      ambiguo: 0,
      naoEncontrado: 0,
      erro: 0,
      naoConfigurado: 0
    };

    lista.forEach(p => {
      switch (p.statusGeocodificacao) {
        case 'ok': contagem.ok++; break;
        case 'consultando': contagem.consultando++; break;
        case 'ambiguo': contagem.ambiguo++; break;
        case 'nao_encontrado': contagem.naoEncontrado++; break;
        case 'erro': contagem.erro++; break;
        case 'nao_configurado': contagem.naoConfigurado++; break;
        default: contagem.pendente++;
      }
    });

    return contagem;
  }

  async function geocodificarParadas(paradas) {
    const lista = Array.isArray(paradas) ? paradas : [];
    const minhaExecucao = ++execucaoAtual;

    for (let i = 0; i < lista.length; i++) {
      if (minhaExecucao !== execucaoAtual) break;
      const parada = lista[i];
      if (parada.statusGeocodificacao === 'ok' && coordenadasValidas(parada.latitude, parada.longitude)) {
        emitir('pemato:geo:progress', { ...resumo(lista), processadas: i + 1 });
        continue;
      }

      const status = await geocodificarUma(parada, minhaExecucao);
      const atual = resumo(lista);
      if (global.appState?.roteirizacao) global.appState.roteirizacao.geocodificacaoResumo = atual;
      emitir('pemato:geo:progress', { ...atual, processadas: i + 1 });

      // Se o Worker ainda não foi publicado/configurado ou ficou indisponível,
      // não dispara dezenas de requisições inúteis para a mesma rota.
      if (status === 'nao_configurado' || (status === 'erro' && parada.erroGeocodificacaoCodigo)) {
        for (let j = i + 1; j < lista.length; j++) {
          if (lista[j].statusGeocodificacao === 'pendente') {
            lista[j].statusGeocodificacao = status === 'nao_configurado' ? 'nao_configurado' : 'erro';
            lista[j].erroGeocodificacao = parada.erroGeocodificacao || '';
            lista[j].erroGeocodificacaoCodigo = parada.erroGeocodificacaoCodigo || '';
          }
        }
        break;
      }
    }

    const final = resumo(lista);
    if (global.appState?.roteirizacao) global.appState.roteirizacao.geocodificacaoResumo = final;
    if (minhaExecucao === execucaoAtual) {
      emitir('pemato:geo:complete', final);
    }

    return final;
  }

  async function geocodificarParada(parada) {
    const minhaExecucao = ++execucaoAtual;
    await geocodificarUma(parada, minhaExecucao);
    return parada;
  }

  async function geocodificarEnderecoLivre(endereco) {
    const texto = String(endereco || '').trim();
    const numeros = texto.match(/\b\d+[A-Za-z]?\b/g) || [];
    const parada = {
      id: 'endereco-livre-' + Date.now(),
      enderecoOriginal: texto,
      enderecoConsulta: '',
      numeroImovel: numeros.length ? numeros[numeros.length - 1] : '',
      statusGeocodificacao: 'pendente',
      latitude: null,
      longitude: null
    };
    await geocodificarParada(parada);
    return parada;
  }

  function cancelar() {
    execucaoAtual++;
  }

  function configurarEndpoint(url) {
    const valor = String(url || '').trim();
    try {
      if (valor) global.localStorage?.setItem('pemato_geocoding_endpoint', valor);
      else global.localStorage?.removeItem('pemato_geocoding_endpoint');
    } catch (_) {}
    return valor;
  }

  global.PacoteEMatoGeocodificacao = Object.freeze({
    limparEnderecoParaConsulta,
    avaliarResultados,
    geocodificarParadas,
    geocodificarParada,
    geocodificarEnderecoLivre,
    resumo,
    cancelar,
    configurarEndpoint,
    endpointAtual
  });
})(window);
