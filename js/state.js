(function iniciarEstadoCentral(global) {
  'use strict';

  const LEGACY_KEYS = [
    'mapaRotas',
    'stopCorrespondente',
    'nomeExibicao',
    'todosPacotes',
    'pacotesBipados',
    'chaveStorageAtual',
    'enderecoSelecionadoGps',
    'filtroAtualModal',
    'rotaInicioEm',
    'resumoFinalJaExibido'
  ];

  const state = global.appState && typeof global.appState === 'object'
    ? global.appState
    : {};

  function valorInicial(chave) {
    switch (chave) {
      case 'mapaRotas':
      case 'stopCorrespondente':
      case 'nomeExibicao':
        return {};
      case 'todosPacotes':
      case 'pacotesBipados':
        return new Set();
      case 'chaveStorageAtual':
        return null;
      case 'enderecoSelecionadoGps':
        return '';
      case 'filtroAtualModal':
        return 'todos';
      case 'rotaInicioEm':
        return 0;
      case 'resumoFinalJaExibido':
        return false;
      default:
        return undefined;
    }
  }

  LEGACY_KEYS.forEach((chave) => {
    if (!(chave in state)) state[chave] = valorInicial(chave);
  });

  if (!state.roteirizacao || typeof state.roteirizacao !== 'object') state.roteirizacao = {};

  const roteirizacaoPadrao = {
    rotaAtivaId: null,
    origem: null,
    nome: '',
    pontoInicial: null,
    pontoFinal: null,
    retornarAoInicio: false,
    veiculo: 'carro',
    modoRoteamento: 'drive',
    preferenciaRota: 'short',
    tempoParadaSegundos: 180,
    paradas: [],
    ordem: [],
    paradasTravadas: [],
    paradaSelecionadaId: null,
    proximaParadaId: null,
    geometria: null,
    instrucoes: [],
    pernas: [],
    distanciaTotalMetros: null,
    duracaoDirecaoSegundos: null,
    duracaoParadasSegundos: null,
    duracaoTotalSegundos: null,
    horarioTerminoEstimado: null,
    calculadoEm: null,
    rotaOtimizada: false,
    mapaDisponivel: null,
    geocodificacaoResumo: null,
    localizacaoAtual: null,
    localizacaoAtualStatus: 'desconhecida',
    localizacaoAtualAtualizadaEm: null,
    alteradoEm: null,
    sujo: false
  };

  Object.keys(roteirizacaoPadrao).forEach((chave) => {
    if (!(chave in state.roteirizacao)) {
      const valor = roteirizacaoPadrao[chave];
      state.roteirizacao[chave] = Array.isArray(valor) ? valor.slice() : valor;
    }
  });

  if (!state.navegacao || typeof state.navegacao !== 'object') state.navegacao = {};
  const navegacaoPadrao = {
    ativa: false,
    provider: 'pacote_emato',
    paradaAtualId: null,
    proximaParadaId: null,
    indiceAtual: 0,
    iniciadaEm: null,
    ultimaPosicao: null,
    ultimaAtualizacaoEm: null,
    distanciaAteProximaMetros: null,
    etaAteProximaSegundos: null,
    recalculando: false,
    vozAtiva: true,
    seguirPosicao: true,
    foraDaRota: false,
    ultimaInstrucaoId: null,
    conclusaoPendente: false,
    paradaExibidaId: null
  };
  Object.keys(navegacaoPadrao).forEach((chave) => {
    if (!(chave in state.navegacao)) state.navegacao[chave] = navegacaoPadrao[chave];
  });

  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  if (!state.ui.moduloAtual || state.ui.moduloAtual === 'inicio') state.ui.moduloAtual = 'roteirizacao';
  if (!['expanded','intermediate','collapsed'].includes(state.ui.painelRoteirizacao)) state.ui.painelRoteirizacao = 'collapsed';
  if (typeof state.ui.buscaParadas !== 'string') state.ui.buscaParadas = '';

  function resetarRotaLegada() {
    state.mapaRotas = {};
    state.stopCorrespondente = {};
    state.nomeExibicao = {};
    state.todosPacotes = new Set();
    state.pacotesBipados = new Set();
    state.chaveStorageAtual = null;
    state.enderecoSelecionadoGps = '';
    state.filtroAtualModal = 'todos';
    state.rotaInicioEm = 0;
    state.resumoFinalJaExibido = false;
    return state;
  }

  function resetarRoteirizacao() {
    Object.keys(roteirizacaoPadrao).forEach((chave) => {
      const valor = roteirizacaoPadrao[chave];
      state.roteirizacao[chave] = Array.isArray(valor) ? valor.slice() : valor;
    });
    Object.keys(navegacaoPadrao).forEach((chave) => {
      state.navegacao[chave] = navegacaoPadrao[chave];
    });
    return state;
  }

  function snapshotLegado() {
    return {
      mapaRotas: state.mapaRotas,
      stopCorrespondente: state.stopCorrespondente,
      nomeExibicao: state.nomeExibicao,
      todosPacotes: Array.from(state.todosPacotes || []),
      pacotesBipados: Array.from(state.pacotesBipados || []),
      chaveStorageAtual: state.chaveStorageAtual,
      enderecoSelecionadoGps: state.enderecoSelecionadoGps,
      filtroAtualModal: state.filtroAtualModal,
      rotaInicioEm: state.rotaInicioEm,
      resumoFinalJaExibido: state.resumoFinalJaExibido
    };
  }

  function restaurarLegado(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return state;
    state.mapaRotas = snapshot.mapaRotas || {};
    state.stopCorrespondente = snapshot.stopCorrespondente || {};
    state.nomeExibicao = snapshot.nomeExibicao || {};
    state.todosPacotes = new Set(snapshot.todosPacotes || []);
    state.pacotesBipados = new Set(snapshot.pacotesBipados || []);
    state.chaveStorageAtual = snapshot.chaveStorageAtual ?? null;
    state.enderecoSelecionadoGps = snapshot.enderecoSelecionadoGps || '';
    state.filtroAtualModal = snapshot.filtroAtualModal || 'todos';
    state.rotaInicioEm = Number(snapshot.rotaInicioEm || 0);
    state.resumoFinalJaExibido = snapshot.resumoFinalJaExibido === true;
    return state;
  }

  LEGACY_KEYS.forEach((chave) => {
    const descritorExistente = Object.getOwnPropertyDescriptor(global, chave);
    if (descritorExistente && descritorExistente.configurable === false) {
      throw new Error(`Pacote É Mato: não foi possível vincular o estado global "${chave}".`);
    }
    Object.defineProperty(global, chave, {
      configurable: true,
      enumerable: true,
      get() { return state[chave]; },
      set(valor) { state[chave] = valor; }
    });
  });

  global.appState = state;
  global.PacoteEMatoState = Object.freeze({
    getState() { return state; },
    resetarRotaLegada,
    resetarRoteirizacao,
    snapshotLegado,
    restaurarLegado
  });
})(window);
