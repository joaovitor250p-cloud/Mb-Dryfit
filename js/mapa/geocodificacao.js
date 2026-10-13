(function iniciarGeocodificacaoPacoteEMato(global) {
  'use strict';

  const provider = 'geoapify-worker';
  let execucaoAtual = 0;
  let ultimoInicioRequisicao = 0;
  let filaInicioRequisicao = Promise.resolve();

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

  function distanciaMetros(lat1, lon1, lat2, lon2) {
    const toRad = grau => Number(grau) * Math.PI / 180;
    const a1 = Number(lat1), o1 = Number(lon1), a2 = Number(lat2), o2 = Number(lon2);
    if (![a1, o1, a2, o2].every(Number.isFinite)) return Infinity;
    const dLat = toRad(a2 - a1);
    const dLon = toRad(o2 - o1);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
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

  async function respeitarIntervalo(gapOverride) {
    const gap = Math.max(0, Number(gapOverride ?? config().geocodingRequestGapMs ?? 0));
    const tarefa = filaInicioRequisicao.then(async () => {
      const agora = Date.now();
      const espera = Math.max(0, ultimoInicioRequisicao + gap - agora);
      if (espera) await esperar(espera);
      ultimoInicioRequisicao = Date.now();
    });
    filaInicioRequisicao = tarefa.catch(() => {});
    await tarefa;
  }

  async function consultarWorker(parada, opcoes) {
    const endpoint = endpointAtual();
    if (!endpoint) {
      const erro = new Error('Endpoint de geocodificação não configurado.');
      erro.code = 'ENDPOINT_NAO_CONFIGURADO';
      throw erro;
    }

    await respeitarIntervalo(opcoes?.gapMs);

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

  async function geocodificarUma(parada, execucaoId, opcoes) {
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
      const resposta = await consultarWorker(parada, { gapMs: opcoes?.gapMs });
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

  function medianaNumeros(valores) {
    const nums = (Array.isArray(valores) ? valores : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!nums.length) return null;
    const meio = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[meio] : (nums[meio - 1] + nums[meio]) / 2;
  }

  function selecionarCoordenadasParaValidacaoRapida(paradas, opcoes) {
    const lista = Array.isArray(paradas) ? paradas : [];
    const maximo = Math.max(4, Number(opcoes?.maximo || 14));
    const candidatas = lista.filter(p => {
      if (!coordenadasValidas(p?.latitude, p?.longitude)) return false;
      if (String(p?.fonteCoordenada || '') !== 'xlsx') return false;
      if (['entregue', 'concluida', 'nao_entregue'].includes(String(p?.statusEntrega || ''))) return false;
      const consulta = limparEnderecoParaConsulta(p?.enderecoOriginal || '');
      if (!consulta) return false;
      return !p?.validacaoCoordenadaStatus || String(p?.validacaoCoordenadaEndereco || '') !== consulta;
    });
    if (candidatas.length <= maximo) return candidatas.map(p => String(p.id));

    const latMed = medianaNumeros(candidatas.map(p => p.latitude));
    const lonMed = medianaNumeros(candidatas.map(p => p.longitude));
    const porCoord = new Map();
    const porCep = new Map();
    const porBairro = new Map();

    const pushGrupo = (mapa, chave, parada) => {
      const k = normalizarTexto(chave || '');
      if (!k) return;
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(parada);
    };

    candidatas.forEach(p => {
      const ck = `${Number(p.latitude).toFixed(5)},${Number(p.longitude).toFixed(5)}`;
      if (!porCoord.has(ck)) porCoord.set(ck, []);
      porCoord.get(ck).push(p);
      pushGrupo(porCep, p.cep, p);
      pushGrupo(porBairro, p.bairro, p);
    });

    const score = new Map(candidatas.map(p => [String(p.id), 0]));
    const somar = (p, n) => score.set(String(p.id), Number(score.get(String(p.id)) || 0) + n);

    porCoord.forEach(grupo => {
      if (grupo.length < 2) return;
      const enderecos = new Set(grupo.map(p => normalizarTexto(p.enderecoOriginal)));
      if (enderecos.size > 1) grupo.forEach(p => somar(p, 120));
    });

    if (Number.isFinite(latMed) && Number.isFinite(lonMed)) {
      candidatas.forEach(p => {
        const d = distanciaMetros(p.latitude, p.longitude, latMed, lonMed);
        if (d > 20000) somar(p, 100);
        else if (d > 10000) somar(p, 60);
      });
    }

    const pontuarGrupo = (grupos, minItens, limite, peso) => {
      grupos.forEach(grupo => {
        if (grupo.length < minItens) return;
        const glat = medianaNumeros(grupo.map(p => p.latitude));
        const glon = medianaNumeros(grupo.map(p => p.longitude));
        if (!Number.isFinite(glat) || !Number.isFinite(glon)) return;
        grupo.forEach(p => {
          const d = distanciaMetros(p.latitude, p.longitude, glat, glon);
          if (d > limite) somar(p, peso);
        });
      });
    };
    pontuarGrupo(porCep, 2, 1800, 70);
    pontuarGrupo(porBairro, 3, 5000, 45);

    const escolhidas = [];
    const ids = new Set();
    const adicionar = p => {
      const id = String(p?.id || '');
      if (!id || ids.has(id) || escolhidas.length >= maximo) return;
      ids.add(id);
      escolhidas.push(id);
    };

    candidatas
      .slice()
      .sort((a, b) => Number(score.get(String(b.id)) || 0) - Number(score.get(String(a.id)) || 0))
      .filter(p => Number(score.get(String(p.id)) || 0) > 0)
      .forEach(adicionar);

    // Completa a checagem rápida com uma amostra distribuída pela planilha.
    // Assim não validamos 100+ endereços antes de liberar o motorista, mas
    // também não olhamos apenas o começo da lista.
    const restantes = candidatas.filter(p => !ids.has(String(p.id)));
    const vagas = Math.max(0, maximo - escolhidas.length);
    if (vagas && restantes.length) {
      for (let i = 0; i < vagas; i++) {
        const indice = vagas === 1 ? Math.floor(restantes.length / 2) : Math.round(i * (restantes.length - 1) / Math.max(1, vagas - 1));
        adicionar(restantes[indice]);
      }
    }
    return escolhidas;
  }

  async function validarCoordenadasImportadas(paradas, opcoes) {
    const lista = Array.isArray(paradas) ? paradas : [];
    const limiteMetros = Math.max(50, Number(opcoes?.limiteMetros || 120));
    const somenteXlsx = opcoes?.somenteXlsx !== false;
    const forcar = opcoes?.forcar === true;
    const idsPermitidos = Array.isArray(opcoes?.ids) && opcoes.ids.length
      ? new Set(opcoes.ids.map(v => String(v)))
      : null;
    const maximo = Number.isFinite(Number(opcoes?.maximo)) ? Math.max(1, Number(opcoes.maximo)) : Infinity;
    const concorrencia = Math.max(1, Math.min(6, Number(opcoes?.concorrencia || 1)));
    const gapMs = Math.max(0, Number(opcoes?.gapMs ?? config().geocodingRequestGapMs ?? 0));

    let candidatas = lista.filter(p => {
      if (!coordenadasValidas(p?.latitude, p?.longitude)) return false;
      if (somenteXlsx && String(p?.fonteCoordenada || '') !== 'xlsx') return false;
      if (idsPermitidos && !idsPermitidos.has(String(p?.id || ''))) return false;
      const consulta = limparEnderecoParaConsulta(p?.enderecoOriginal || '');
      if (!consulta) return false;
      if (!forcar && String(p?.validacaoCoordenadaEndereco || '') === consulta && p?.validacaoCoordenadaStatus) return false;
      return true;
    });
    if (Number.isFinite(maximo)) candidatas = candidatas.slice(0, maximo);

    const resumoValidacao = {
      total: candidatas.length,
      processadas: 0,
      confirmadas: 0,
      corrigidas: 0,
      naoConfirmadas: 0,
      erros: 0,
      limiteMetros
    };
    if (!candidatas.length) return resumoValidacao;

    const cache = global.PacoteEMatoGeoCache;
    let cursor = 0;

    async function processarParada(parada) {
      const consulta = limparEnderecoParaConsulta(parada.enderecoOriginal);
      parada.enderecoConsulta = consulta;
      try {
        let validacao = null;
        const registro = cache ? await cache.obter(provider, consulta) : null;
        if (registro?.payload) validacao = registro.payload;
        if (!validacao) {
          const resposta = await consultarWorker({ enderecoConsulta: consulta }, { gapMs });
          validacao = avaliarResultados(parada, resposta);
          if (cache && ['ok', 'nao_encontrado', 'ambiguo'].includes(validacao.status)) {
            const ttl = validacao.status === 'ok' ? Number(config().geocodingCacheTtlMs) : Number(config().geocodingNegativeCacheTtlMs);
            await cache.salvar(provider, consulta, validacao, ttl);
          }
        }

        parada.validacaoCoordenadaEndereco = consulta;
        parada.validacaoCoordenadaEm = Date.now();
        parada.validacaoCoordenadaStatus = String(validacao?.status || 'erro');

        if (validacao?.status === 'ok' && validacao.resultado && coordenadasValidas(validacao.resultado.lat, validacao.resultado.lon)) {
          const distancia = distanciaMetros(parada.latitude, parada.longitude, validacao.resultado.lat, validacao.resultado.lon);
          parada.validacaoCoordenadaDistanciaMetros = Math.round(distancia);
          if (distancia > limiteMetros) {
            parada.coordenadaPlanilhaOriginal = parada.coordenadaPlanilhaOriginal || {
              latitude: Number(parada.latitude),
              longitude: Number(parada.longitude)
            };
            parada.latitude = Number(validacao.resultado.lat);
            parada.longitude = Number(validacao.resultado.lon);
            parada.statusGeocodificacao = 'ok';
            parada.fonteCoordenada = 'geocodificacao-correcao-xlsx';
            parada.confiabilidade = validacao.resultado.confidence;
            parada.confiabilidadeRua = validacao.resultado.streetConfidence;
            parada.precisaoGeocodificacao = 'logradouro_numero_validado';
            parada.enderecoGeocodificado = validacao.resultado.formatted || '';
            parada.geocodificacao = validacao.resultado;
            parada.geocodificadoEm = Date.now();
            resumoValidacao.corrigidas++;
          } else {
            resumoValidacao.confirmadas++;
          }
        } else {
          resumoValidacao.naoConfirmadas++;
        }
      } catch (erro) {
        parada.validacaoCoordenadaEndereco = consulta;
        parada.validacaoCoordenadaEm = Date.now();
        parada.validacaoCoordenadaStatus = 'erro';
        parada.validacaoCoordenadaErro = String(erro?.message || erro || 'Erro desconhecido');
        resumoValidacao.erros++;
      }
      resumoValidacao.processadas++;
      emitir('pemato:geo:coordinate-validation-progress', { ...resumoValidacao, paradaId: parada.id });
    }

    async function workerValidacao() {
      while (true) {
        const atual = cursor++;
        if (atual >= candidatas.length) return;
        await processarParada(candidatas[atual]);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concorrencia, candidatas.length) }, () => workerValidacao()));
    return resumoValidacao;
  }

  async function geocodificarParadas(paradas, opcoes) {
    const lista = Array.isArray(paradas) ? paradas : [];
    const minhaExecucao = ++execucaoAtual;
    const concorrencia = Math.max(1, Math.min(5, Number(opcoes?.concorrencia || 3)));
    const gapMs = Math.max(0, Number(opcoes?.gapMs ?? 220));
    let cursor = 0;
    let processadas = 0;
    let falhaGlobal = null;

    async function workerGeo() {
      while (minhaExecucao === execucaoAtual && !falhaGlobal) {
        const i = cursor++;
        if (i >= lista.length) return;
        const parada = lista[i];
        if (parada.statusGeocodificacao === 'ok' && coordenadasValidas(parada.latitude, parada.longitude)) {
          processadas++;
          emitir('pemato:geo:progress', { ...resumo(lista), processadas });
          continue;
        }

        const status = await geocodificarUma(parada, minhaExecucao, { gapMs });
        processadas++;
        const atual = resumo(lista);
        if (global.appState?.roteirizacao) global.appState.roteirizacao.geocodificacaoResumo = atual;
        emitir('pemato:geo:progress', { ...atual, processadas });

        if (status === 'nao_configurado' || (status === 'erro' && parada.erroGeocodificacaoCodigo)) {
          falhaGlobal = {
            status,
            erro: parada.erroGeocodificacao || '',
            codigo: parada.erroGeocodificacaoCodigo || ''
          };
          return;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concorrencia, Math.max(1, lista.length)) }, () => workerGeo()));

    if (falhaGlobal) {
      lista.forEach(p => {
        if (p.statusGeocodificacao === 'pendente') {
          p.statusGeocodificacao = falhaGlobal.status === 'nao_configurado' ? 'nao_configurado' : 'erro';
          p.erroGeocodificacao = falhaGlobal.erro;
          p.erroGeocodificacaoCodigo = falhaGlobal.codigo;
        }
      });
    }

    const final = resumo(lista);
    if (global.appState?.roteirizacao) global.appState.roteirizacao.geocodificacaoResumo = final;
    if (minhaExecucao === execucaoAtual) emitir('pemato:geo:complete', final);
    return final;
  }

  async function geocodificarParada(parada) {
    const minhaExecucao = ++execucaoAtual;
    await geocodificarUma(parada, minhaExecucao, { gapMs: 180 });
    return parada;
  }


  async function consultarSugestoesEndereco(endereco) {
    const texto = String(endereco || '').trim();
    if (texto.length < 4) return [];
    const dados = await consultarWorker({ enderecoConsulta: texto });
    return (Array.isArray(dados?.results) ? dados.results : [])
      .filter(r => coordenadasValidas(r?.lat, r?.lon))
      .slice(0, 5)
      .map(r => ({
        lat: Number(r.lat), lon: Number(r.lon),
        formatted: String(r.formatted || '').trim(),
        street: String(r.street || r.address_line1 || '').trim(),
        housenumber: String(r.housenumber || '').trim(),
        suburb: String(r.suburb || r.district || r.city_district || '').trim(),
        city: String(r.city || r.county || '').trim(),
        state: String(r.state || '').trim(),
        postcode: String(r.postcode || '').trim(),
        resultType: String(r.result_type || ''),
        confidence: Number(r.rank?.confidence ?? 0)
      }));
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
    consultarSugestoesEndereco,
    selecionarCoordenadasParaValidacaoRapida,
    validarCoordenadasImportadas,
    distanciaMetros,
    resumo,
    cancelar,
    configurarEndpoint,
    endpointAtual
  });
})(window);
