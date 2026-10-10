(function iniciarOperacoesPacotes(global) {
  'use strict';

  const $ = id => document.getElementById(id);
  let estado = null;
  let processando = false;
  let operacaoLeituraEmCurso = false;
  let ultimoCodigoOperacao = '';
  let ultimoCodigoOperacaoEm = 0;
  let ultimoSomOperacaoEm = 0;

  function clone(v) {
    if (v == null) return v;
    if (typeof structuredClone === 'function') { try { return structuredClone(v); } catch (_) {} }
    return JSON.parse(JSON.stringify(v));
  }

  function notificar(msg) {
    if (typeof global.notificar === 'function') global.notificar(msg);
    else console.log(msg);
  }

  function tocarSomOperacao(tipo) {
    const agora = Date.now();
    if (agora - ultimoSomOperacaoEm < 320) return;
    ultimoSomOperacaoEm = agora;
    try {
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;
      global.__pematoPkgAudioCtx = global.__pematoPkgAudioCtx || new AudioCtx();
      const ctx = global.__pematoPkgAudioCtx;
      if (ctx.state === 'suspended') ctx.resume?.();
      const notas = tipo === 'erro' ? [260, 190] : (estado?.modo === 'remover' ? [720, 520] : [620, 880]);
      notas.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tipo === 'erro' ? 'square' : 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * .09);
        gain.gain.setValueAtTime(tipo === 'erro' ? .09 : .075, ctx.currentTime + i * .09);
        gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + i * .09 + .075);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * .09);
        osc.stop(ctx.currentTime + i * .09 + .08);
      });
      if (navigator.vibrate) navigator.vibrate(tipo === 'erro' ? [45,35,45] : 45);
    } catch (_) {}
  }

  function leituraRepetida(codigoBruto) {
    const chave = String(codigoBruto || '').trim().toUpperCase();
    const agora = Date.now();
    if (operacaoLeituraEmCurso) return true;
    if (chave && chave === ultimoCodigoOperacao && agora - ultimoCodigoOperacaoEm < 2200) return true;
    ultimoCodigoOperacao = chave;
    ultimoCodigoOperacaoEm = agora;
    operacaoLeituraEmCurso = true;
    setTimeout(() => { operacaoLeituraEmCurso = false; }, 650);
    return false;
  }

  function coordenadaValida(lat, lon) {
    const a = Number(lat), o = Number(lon);
    return Number.isFinite(a) && a >= -90 && a <= 90 && Number.isFinite(o) && o >= -180 && o <= 180;
  }

  function normalizarTexto(v) {
    return String(v || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function chaveFisica(parada) {
    if (!parada) return '';
    const bruto = String(parada.enderecoOriginal || parada.enderecoFonte || parada.logradouro || '').trim();
    const numero = String(parada.numero || (bruto.match(/,\s*(\d+[A-Za-z]?)/) || bruto.match(/\b(\d+[A-Za-z]?)\b/) || [,''])[1] || '').trim().toLowerCase();
    let rua = normalizarTexto(parada.logradouro || parada.enderecoFonte || bruto);
    if (numero) rua = rua.replace(new RegExp(`\\b${numero.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b.*$`, 'i'), '').trim();
    rua = rua.replace(/\b(ap|apto|apartamento|bloco|torre|sala|loja|suite|casa|fundos|frente)\b.*$/i, '').trim();
    if (rua && numero) return `end:${rua}|${numero}`;
    if (typeof global.criarChaveParadaCorreta === 'function') {
      try {
        const chaveLegada = String(global.criarChaveParadaCorreta(bruto) || '').trim();
        if (chaveLegada && !chaveLegada.endsWith('_')) return `legacy:${chaveLegada}`;
      } catch (_) {}
    }
    return `id:${String(parada.id || bruto)}`;
  }

  function pacotesDaRota(rota) {
    const map = new Map();
    (rota?.paradas || []).forEach(parada => {
      (parada.pacotes || []).forEach(codigo => {
        const c = String(codigo || '').trim();
        if (c) map.set(c, parada);
      });
    });
    return map;
  }

  function paradaFinalizada(parada) {
    return ['entregue', 'concluida', 'nao_entregue'].includes(String(parada?.statusEntrega || ''));
  }

  function codigoProtegido(parada, codigo) {
    if (!parada) return false;
    if (paradaFinalizada(parada)) return true;
    return Array.isArray(parada.pacotesBipados) && parada.pacotesBipados.includes(codigo);
  }

  function quantidadePacotesFisicos(rota, parada) {
    if (!rota || !parada) return 0;
    const chave = chaveFisica(parada);
    const grupo = (rota.paradas || []).filter(p => chaveFisica(p) === chave);
    const ativas = grupo.filter(p => !paradaFinalizada(p));
    const fonte = ativas.length ? ativas : grupo;
    const unicos = new Set();
    fonte.forEach(p => (p.pacotes || []).forEach(c => unicos.add(String(c))));
    return unicos.size;
  }

  function garantirUI() {
    if (!$('pkgOpFileInput')) {
      const input = document.createElement('input');
      input.id = 'pkgOpFileInput';
      input.type = 'file';
      input.accept = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener('change', async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) await carregarPlanilha(file);
      });
    }

    if (!$('pkgOpBanner')) {
      const banner = document.createElement('section');
      banner.id = 'pkgOpBanner';
      banner.className = 'pkg-op-banner';
      banner.style.display = 'none';
      banner.innerHTML = `
        <div class="pkg-op-banner-head">
          <div><span id="pkgOpModeLabel" class="pkg-op-kicker">OPERAÇÃO DE PACOTES</span><strong id="pkgOpBannerTitle">Adicionar à rota</strong></div>
          <button id="pkgOpCancelBtn" type="button" aria-label="Cancelar">×</button>
        </div>
        <div id="pkgOpFileLabel" class="pkg-op-file"></div>
        <div class="pkg-op-stats">
          <div><strong id="pkgOpTotal">0</strong><span>na planilha</span></div>
          <div><strong id="pkgOpSelected">0</strong><span>bipados</span></div>
          <div><strong id="pkgOpPending">0</strong><span>faltam</span></div>
        </div>
        <div id="pkgOpAlert" class="pkg-op-alert" style="display:none"></div>
        <div class="pkg-op-banner-actions">
          <button id="pkgOpReviewBtn" class="pemato-primary" type="button">Conferir seleção</button>
          <button id="pkgOpChangeFileBtn" class="pemato-secondary" type="button">Trocar planilha</button>
        </div>`;
      const modulo = $('moduloBipagem');
      modulo?.insertBefore(banner, modulo.firstChild);
      $('pkgOpCancelBtn')?.addEventListener('click', cancelar);
      $('pkgOpReviewBtn')?.addEventListener('click', abrirConferencia);
      $('pkgOpChangeFileBtn')?.addEventListener('click', () => $('pkgOpFileInput')?.click());
    }

    if (!$('pkgOpReviewBackdrop')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'pkgOpReviewBackdrop';
      backdrop.className = 'modal-backdrop pkg-op-review-backdrop';
      backdrop.style.display = 'none';
      backdrop.innerHTML = `
        <section class="pkg-op-review-card" role="dialog" aria-modal="true" aria-labelledby="pkgOpReviewTitle">
          <div class="pkg-op-review-head">
            <div><div class="module-kicker">Conferência</div><h2 id="pkgOpReviewTitle">Pacotes selecionados</h2></div>
            <button id="pkgOpReviewClose" type="button" aria-label="Fechar">×</button>
          </div>
          <div id="pkgOpReviewSummary" class="pkg-op-review-summary"></div>
          <div id="pkgOpReviewWarning" class="pkg-op-review-warning" style="display:none"></div>
          <div id="pkgOpReviewList" class="pkg-op-review-list"></div>
          <div id="pkgOpAddOptions" class="pkg-op-add-options" style="display:none">
            <label for="pkgOpOrderChoice">Como organizar depois de adicionar?</label>
            <select id="pkgOpOrderChoice" class="pemato-field">
              <option value="manter">Manter a ordem atual e acrescentar as novas paradas</option>
              <option value="novas">Otimizar somente as novas paradas</option>
              <option value="todas">Otimizar a rota inteira</option>
            </select>
            <small>As opções de otimização usam somente o serviço real configurado no Pacote É Mato.</small>
          </div>
          <div class="pkg-op-review-actions">
            <button id="pkgOpReviewBack" class="pemato-secondary" type="button">Voltar à bipagem</button>
            <button id="pkgOpConfirmBtn" class="pemato-primary" type="button">Confirmar operação</button>
          </div>
        </section>`;
      document.body.appendChild(backdrop);
      $('pkgOpReviewClose')?.addEventListener('click', fecharConferencia);
      $('pkgOpReviewBack')?.addEventListener('click', fecharConferencia);
      $('pkgOpReviewBackdrop')?.addEventListener('click', e => { if (e.target === backdrop) fecharConferencia(); });
      $('pkgOpConfirmBtn')?.addEventListener('click', confirmarOperacao);
    }
  }

  function exibirBanner() {
    garantirUI();
    const banner = $('pkgOpBanner');
    if (!banner || !estado) return;
    banner.style.display = 'block';
    document.body.classList.add('pemato-package-operation');
    $('pkgOpModeLabel').textContent = estado.modo === 'adicionar' ? 'ADICIONAR À ROTA' : 'REMOVER DA ROTA';
    $('pkgOpBannerTitle').textContent = estado.modo === 'adicionar' ? 'Bipe somente os pacotes que vai receber' : 'Bipe somente os pacotes que vão sair da sua rota';
    $('pkgOpFileLabel').textContent = estado.arquivo?.name || '';
    atualizarBanner();
  }

  function atualizarBanner() {
    if (!estado) return;
    const total = estado.indicePlanilha.size;
    const selecionados = estado.selecionados.size;
    $('pkgOpTotal') && ($('pkgOpTotal').textContent = String(total));
    $('pkgOpSelected') && ($('pkgOpSelected').textContent = String(selecionados));
    $('pkgOpPending') && ($('pkgOpPending').textContent = String(Math.max(0, total - selecionados)));
    const alert = $('pkgOpAlert');
    if (alert) {
      const partes = [];
      if (estado.invalidos.length) partes.push(`${estado.invalidos.length} leitura(s) não encontrada(s)`);
      if (estado.duplicados.length) partes.push(`${estado.duplicados.length} leitura(s) repetida(s)`);
      if (estado.bloqueados.length) partes.push(`${estado.bloqueados.length} pacote(s) não permitido(s)`);
      alert.textContent = partes.join(' · ');
      alert.style.display = partes.length ? 'block' : 'none';
    }
  }

  function prepararIndice(resultado) {
    const indice = new Map();
    (resultado?.paradas || []).forEach(parada => {
      (parada.pacotes || []).forEach(codigo => {
        const c = String(codigo || '').trim();
        if (c && !indice.has(c)) indice.set(c, parada);
      });
    });
    return indice;
  }

  async function iniciar(modo) {
    if (processando) return;
    garantirUI();
    const valor = modo === 'remover' ? 'remover' : 'adicionar';
    ultimoCodigoOperacao = ''; ultimoCodigoOperacaoEm = 0; operacaoLeituraEmCurso = false;
    const rota = await global.PacoteEMatoRotaStore?.obterRotaAtiva?.();
    estado = {
      modo: valor,
      rotaBase: rota ? clone(rota) : null,
      arquivo: null,
      resultado: null,
      indicePlanilha: new Map(),
      indiceRota: pacotesDaRota(rota),
      selecionados: new Set(),
      invalidos: [],
      duplicados: [],
      bloqueados: [],
      iniciadoEm: Date.now()
    };
    const menu = $('routingActionsBackdrop');
    if (menu) menu.style.display = 'none';
    $('pkgOpFileInput')?.click();
  }

  async function carregarPlanilha(file) {
    if (!estado || !file) return;
    processando = true;
    try {
      if (!global.PacoteEMatoImportacaoXLSX) throw new Error('Módulo de planilhas não carregado.');
      notificar('Lendo planilha para seleção por bipagem...');
      const resultado = global.PacoteEMatoRoteirizacao?.lerPlanilhaComMapeamento
        ? await global.PacoteEMatoRoteirizacao.lerPlanilhaComMapeamento(file)
        : await global.PacoteEMatoImportacaoXLSX.lerArquivo(file);
      const indice = prepararIndice(resultado);
      if (!indice.size) throw new Error('A planilha não possui códigos de pacote reconhecidos.');
      estado.arquivo = file;
      estado.resultado = resultado;
      estado.indicePlanilha = indice;
      estado.selecionados.clear();
      estado.invalidos = [];
      estado.duplicados = [];
      estado.bloqueados = [];
      estado.indiceRota = pacotesDaRota(estado.rotaBase);

      await global.PacoteEMatoAppShell?.abrirModulo?.('bipagem', { usarRotaAtiva: false });
      if ($('areaExecucao')) $('areaExecucao').style.display = 'block';
      if ($('elSecaoUpload')) $('elSecaoUpload').style.display = 'none';
      if ($('activeRouteBipagemCard')) $('activeRouteBipagemCard').style.display = 'none';
      exibirBanner();
      try { await global.iniciarScanner?.(); } catch (_) {}
      notificar(`${indice.size} pacote(s) disponíveis. Bipe somente os desejados.`);
    } catch (erro) {
      console.error('Pacote É Mato: falha ao preparar operação de pacotes.', erro);
      notificar(erro?.message || 'Não foi possível ler a planilha.');
      if (estado && !estado.arquivo) estado = null;
    } finally {
      processando = false;
    }
  }

  function identificarCodigo(codigoBruto) {
    if (!estado) return '';
    let limpo = '';
    try { limpo = typeof global.extrairCodigoChave === 'function' ? String(global.extrairCodigoChave(codigoBruto) || '') : ''; } catch (_) {}
    if (!limpo) {
      const m = String(codigoBruto || '').toUpperCase().match(/BR[A-Z0-9]{8,25}/);
      limpo = m?.[0] || String(codigoBruto || '').trim().toUpperCase();
    }
    for (const c of estado.indicePlanilha.keys()) {
      const up = String(c).toUpperCase();
      if (up === limpo || String(codigoBruto || '').toUpperCase().includes(up) || (limpo && up.includes(limpo))) return c;
    }
    return '';
  }

  function mostrarResultadoScanner(ok, codigo, parada, mensagem) {
    const card = $('cardResult');
    if (!card) return;
    const resStop = $('resStop'), resEndereco = $('resEndereco'), resPacote = $('resPacote'), aviso = $('boxAviso');
    card.style.display = 'block';
    card.classList.toggle('error-state', !ok);
    if (resStop) resStop.textContent = ok ? (estado?.modo === 'adicionar' ? 'ADICIONAR' : 'REMOVER') : 'NÃO LOCALIZADO';
    if (resEndereco) resEndereco.textContent = parada?.enderecoOriginal || mensagem || 'Confira o código.';
    if (resPacote) resPacote.textContent = codigo ? `Pacote: ${codigo}` : '';
    if (aviso) { aviso.textContent = mensagem || ''; aviso.style.display = mensagem ? 'block' : 'none'; }
    if ($('inputManual')) $('inputManual').value = '';
  }

  function processarCodigoOperacao(codigoBruto) {
    if (!estado || !estado.arquivo) return false;
    if (!codigoBruto || leituraRepetida(codigoBruto)) return true;
    const codigo = identificarCodigo(codigoBruto);
    if (!codigo) {
      estado.invalidos.push(String(codigoBruto || ''));
      tocarSomOperacao('erro')
      mostrarResultadoScanner(false, String(codigoBruto || ''), null, 'O código não foi encontrado na planilha desta operação.');
      atualizarBanner();
      return true;
    }
    if (estado.selecionados.has(codigo)) {
      estado.duplicados.push(codigo);
      tocarSomOperacao('erro')
      mostrarResultadoScanner(false, codigo, estado.indicePlanilha.get(codigo), 'Esse pacote já foi bipado nesta operação.');
      atualizarBanner();
      return true;
    }

    const paradaRota = estado.indiceRota.get(codigo);
    if (estado.modo === 'remover') {
      if (!paradaRota) {
        estado.bloqueados.push({ codigo, motivo: 'nao_pertence_rota' });
        tocarSomOperacao('erro')
        mostrarResultadoScanner(false, codigo, estado.indicePlanilha.get(codigo), 'Esse pacote não pertence à rota ativa e não será removido.');
        atualizarBanner();
        return true;
      }
      if (codigoProtegido(paradaRota, codigo)) {
        estado.bloqueados.push({ codigo, motivo: 'status_protegido' });
        tocarSomOperacao('erro')
        mostrarResultadoScanner(false, codigo, paradaRota, 'Pacote já tratado/entregue. A remoção foi bloqueada para preservar o histórico.');
        atualizarBanner();
        return true;
      }
    } else if (paradaRota) {
      estado.bloqueados.push({ codigo, motivo: 'ja_na_rota' });
      tocarSomOperacao('erro')
      mostrarResultadoScanner(false, codigo, paradaRota, 'Esse pacote já existe na sua rota e não será duplicado.');
      atualizarBanner();
      return true;
    }

    estado.selecionados.add(codigo);
    const origem = estado.indicePlanilha.get(codigo);
    tocarSomOperacao('sucesso')
    mostrarResultadoScanner(true, codigo, origem, estado.modo === 'adicionar' ? 'Selecionado para adicionar à rota.' : 'Selecionado para remover da rota.');
    atualizarBanner();
    return true;
  }

  function dadosConferencia() {
    const selecionados = [...(estado?.selecionados || [])];
    const porEndereco = new Map();
    selecionados.forEach(codigo => {
      const parada = estado.modo === 'remover' ? estado.indiceRota.get(codigo) : estado.indicePlanilha.get(codigo);
      const key = chaveFisica(parada);
      porEndereco.set(key, (porEndereco.get(key) || 0) + 1);
    });
    const itens = selecionados.map(codigo => {
      const origem = estado.indicePlanilha.get(codigo);
      const atual = estado.indiceRota.get(codigo);
      const paradaBase = estado.modo === 'remover' ? atual : origem;
      const quantidadeEndereco = porEndereco.get(chaveFisica(paradaBase)) || 1;
      let restante = null;
      if (estado.modo === 'remover' && atual) restante = Math.max(0, quantidadePacotesFisicos(estado.rotaBase, atual) - quantidadeEndereco);
      return { codigo, origem, atual, restante, quantidadeEndereco };
    });
    return { selecionados, itens };
  }

  function abrirConferencia() {
    if (!estado) return;
    garantirUI();
    const { selecionados, itens } = dadosConferencia();
    const total = estado.indicePlanilha.size;
    const encontradosRota = estado.modo === 'remover' ? [...estado.indicePlanilha.keys()].filter(c => estado.indiceRota.has(c)).length : 0;
    $('pkgOpReviewTitle').textContent = estado.modo === 'adicionar' ? 'Conferir pacotes para adicionar' : 'Conferir pacotes para remover';
    $('pkgOpReviewSummary').innerHTML = estado.modo === 'adicionar'
      ? `<div><strong>${total}</strong><span>na planilha</span></div><div><strong>${selecionados.length}</strong><span>bipados</span></div><div><strong>${Math.max(0,total-selecionados.length)}</strong><span>não bipados</span></div>`
      : `<div><strong>${encontradosRota}</strong><span>presentes na rota</span></div><div><strong>${selecionados.length}</strong><span>para remover</span></div><div><strong>${estado.bloqueados.length}</strong><span>não permitidos</span></div>`;

    const list = $('pkgOpReviewList');
    list.replaceChildren();
    if (!itens.length) {
      const empty = document.createElement('div'); empty.className = 'pkg-op-empty'; empty.textContent = 'Nenhum pacote foi bipado ainda.'; list.appendChild(empty);
    } else {
      itens.forEach(item => {
        const row = document.createElement('article'); row.className = 'pkg-op-item';
        const address = item.origem?.enderecoOriginal || item.atual?.enderecoOriginal || 'Endereço não informado';
        const detalheEndereco = estado.modo === 'adicionar'
          ? `${item.quantidadeEndereco} pacote(s) selecionado(s) neste endereço`
          : `${item.restante} pacote(s) permanecerão nesta parada física`;
        row.innerHTML = `<div><strong>${item.codigo}</strong><span>${address}</span><small>${detalheEndereco}</small></div><button type="button" data-pkg-remove="${item.codigo}">×</button>`;
        row.querySelector('button')?.addEventListener('click', () => { estado.selecionados.delete(item.codigo); atualizarBanner(); abrirConferencia(); });
        list.appendChild(row);
      });
    }

    const warning = $('pkgOpReviewWarning');
    const rotaEmAndamento = !!(estado.rotaBase?.iniciadoEm || global.appState?.navegacao?.ativa);
    const avisos = [];
    if (rotaEmAndamento) avisos.push('A rota está em andamento. A alteração será salva somente após sua confirmação e o trajeto poderá precisar ser recalculado.');
    if (estado.invalidos.length) avisos.push(`${estado.invalidos.length} leitura(s) não foram encontradas na planilha.`);
    if (estado.duplicados.length) avisos.push(`${estado.duplicados.length} leitura(s) repetidas foram ignoradas.`);
    if (estado.bloqueados.length) avisos.push(`${estado.bloqueados.length} pacote(s) foram bloqueados por não pertencerem à rota, já existirem nela ou possuírem status protegido.`);
    warning.textContent = avisos.join(' ');
    warning.style.display = avisos.length ? 'block' : 'none';
    $('pkgOpAddOptions').style.display = estado.modo === 'adicionar' ? 'grid' : 'none';
    $('pkgOpConfirmBtn').disabled = !selecionados.length;
    $('pkgOpConfirmBtn').textContent = estado.modo === 'adicionar' ? 'Confirmar adição' : 'Confirmar remoção';
    $('pkgOpReviewBackdrop').style.display = 'flex';
  }

  function fecharConferencia() {
    if ($('pkgOpReviewBackdrop')) $('pkgOpReviewBackdrop').style.display = 'none';
  }

  function novaRotaBase() {
    const cfg = global.PacoteEMatoConfiguracoes?.obter?.() || {};
    return global.PacoteEMatoRotaStore.criarRota({
      nome: estado?.arquivo?.name?.replace(/\.(xlsx|xls|csv)$/i,'') || 'Nova rota',
      origem: 'operacao-pacotes', status: 'planejamento',
      veiculo: cfg.veiculo || 'carro',
      modoRoteamento: global.PacoteEMatoRotaStore.modoPorVeiculo(cfg.veiculo || 'carro'),
      tempoParadaSegundos: Number(cfg.tempoParadaSegundos || 180),
      pontoInicial: cfg.pontoInicial || null,
      retornarAoInicio: cfg.retornarAoInicio === true,
      paradas: [], ordem: []
    });
  }

  function fonteSelecionadaPorChave() {
    const grupos = new Map();
    for (const codigo of estado.selecionados) {
      const origem = estado.indicePlanilha.get(codigo);
      if (!origem) continue;
      const key = chaveFisica(origem);
      if (!grupos.has(key)) grupos.set(key, { origem, pacotes: [] });
      grupos.get(key).pacotes.push(codigo);
    }
    return grupos;
  }

  function adicionarSelecionados(rota) {
    const mutada = clone(rota || novaRotaBase());
    const ordemAntiga = [...(mutada.ordem || [])];
    const porChave = new Map();
    (mutada.paradas || []).forEach(p => {
      const key = chaveFisica(p);
      if (!porChave.has(key)) porChave.set(key, []);
      porChave.get(key).push(p);
    });
    const novosIds = [];
    const adicionados = [];
    const grupos = fonteSelecionadaPorChave();

    for (const [key, grupo] of grupos.entries()) {
      const candidatos = (porChave.get(key) || []).filter(p => !paradaFinalizada(p));
      let destino = candidatos[0] || null;
      if (!destino) {
        const origem = grupo.origem;
        destino = clone(origem);
        destino.id = `pkgop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
        destino.pacotes = [];
        destino.pacotesBipados = [];
        destino.quantidadePacotes = 0;
        destino.quantidadeBipada = 0;
        destino.statusEntrega = 'pendente';
        destino.entregueEm = null;
        destino.naoEntregueEm = null;
        destino.statusAtualizadoEm = null;
        destino.origem = 'adicao-bipagem';
        destino.rotaGrupoId = `adicao-${estado.iniciadoEm || Date.now()}`;
        destino.rotaGrupoNome = 'Pacotes adicionados por bipagem';
        destino.rotaGrupoTipo = 'adicao-bipagem';
        destino.ordemOriginal = (mutada.ordem || []).length + 1;
        destino.ordemOtimizada = null;
        destino.criadoEm = Date.now();
        destino.alteradoEm = Date.now();
        mutada.paradas.push(destino);
        mutada.ordem.push(destino.id);
        novosIds.push(destino.id);
        if (!porChave.has(key)) porChave.set(key, []);
        porChave.get(key).push(destino);
      }
      for (const codigo of grupo.pacotes) {
        if (!destino.pacotes.includes(codigo)) { destino.pacotes.push(codigo); adicionados.push(codigo); }
      }
      destino.quantidadePacotes = destino.pacotes.length;
      destino.alteradoEm = Date.now();
      if (!coordenadaValida(destino.latitude, destino.longitude) && coordenadaValida(grupo.origem.latitude, grupo.origem.longitude)) {
        destino.latitude = Number(grupo.origem.latitude); destino.longitude = Number(grupo.origem.longitude);
        destino.statusGeocodificacao = grupo.origem.statusGeocodificacao || 'ok'; destino.fonteCoordenada = grupo.origem.fonteCoordenada || 'xlsx';
      }
    }
    mutada.ordem = [...ordemAntiga.filter(id => mutada.paradas.some(p => String(p.id) === String(id))), ...mutada.ordem.filter(id => !ordemAntiga.includes(id))];
    mutada.historicoOperacoesPacotes = Array.isArray(mutada.historicoOperacoesPacotes) ? mutada.historicoOperacoesPacotes : [];
    mutada.historicoOperacoesPacotes.push({ tipo:'adicionar', em:Date.now(), arquivo:estado.arquivo?.name || '', pacotes:adicionados.slice(), novosIds:novosIds.slice() });
    return { rota: mutada, novosIds, adicionados };
  }

  function removerSelecionados(rota) {
    const mutada = clone(rota);
    if (!mutada) throw new Error('Não existe rota ativa para remover pacotes.');
    const selecionados = new Set(estado.selecionados);
    const ordemAntes = [...mutada.ordem];
    const selecionadaAntes = mutada.paradaSelecionadaId;
    const removidos = [];
    const idsRemovidos = [];

    mutada.paradas.forEach(p => {
      const antes = [...(p.pacotes || [])];
      p.pacotes = antes.filter(c => {
        if (!selecionados.has(c)) return true;
        if (codigoProtegido(p, c)) return true;
        removidos.push(c); return false;
      });
      p.pacotesBipados = (p.pacotesBipados || []).filter(c => p.pacotes.includes(c));
      p.quantidadePacotes = p.pacotes.length;
      p.quantidadeBipada = p.pacotesBipados.length;
      if (p.pacotes.length !== antes.length) p.alteradoEm = Date.now();
    });

    mutada.paradas = mutada.paradas.filter(p => {
      if (p.pacotes.length || paradaFinalizada(p)) return true;
      idsRemovidos.push(String(p.id)); return false;
    });
    const idsValidos = new Set(mutada.paradas.map(p => String(p.id)));
    mutada.ordem = ordemAntes.map(String).filter(id => idsValidos.has(id));
    if (selecionadaAntes && idsValidos.has(String(selecionadaAntes))) mutada.paradaSelecionadaId = String(selecionadaAntes);
    else {
      const indiceRemovido = Math.max(0, ordemAntes.findIndex(id => idsRemovidos.includes(String(id))));
      mutada.paradaSelecionadaId = mutada.ordem[indiceRemovido] || mutada.ordem[Math.max(0, indiceRemovido - 1)] || mutada.ordem[0] || null;
    }
    if (!mutada.proximaParadaId || !idsValidos.has(String(mutada.proximaParadaId))) {
      mutada.proximaParadaId = mutada.ordem.find(id => {
        const p = mutada.paradas.find(x => String(x.id) === String(id));
        return p && !paradaFinalizada(p);
      }) || null;
    }
    mutada.historicoOperacoesPacotes = Array.isArray(mutada.historicoOperacoesPacotes) ? mutada.historicoOperacoesPacotes : [];
    mutada.historicoOperacoesPacotes.push({ tipo:'remover', em:Date.now(), arquivo:estado.arquivo?.name || '', pacotes:removidos.slice(), paradasRemovidas:idsRemovidos.slice() });
    return { rota: mutada, removidos, idsRemovidos };
  }

  function limparCalculoSeNecessario(rota) {
    rota.rotaOtimizada = false;
    rota.precisaRecalculo = true;
    rota.confirmadaEm = null;
    rota.alteradoEm = Date.now();
    return rota;
  }

  async function recalcularTrajetoNaOrdem(rota) {
    if (!rota?.paradas?.length) {
      rota.geometria = null; rota.instrucoes = []; rota.pernas = []; rota.distanciaTotalMetros = 0; rota.duracaoDirecaoSegundos = 0; rota.duracaoTotalSegundos = 0; rota.horarioTerminoEstimado = null; rota.precisaRecalculo = false; return true;
    }
    if (!global.PacoteEMatoServicoRota?.endpoint?.('route')) return false;
    const pendentesSemCoord = (rota.paradas || []).filter(p => !paradaFinalizada(p) && !coordenadaValida(p.latitude,p.longitude));
    if (pendentesSemCoord.length || !rota.pontoInicial || !coordenadaValida(rota.pontoInicial.lat, rota.pontoInicial.lon)) return false;
    const resposta = await global.PacoteEMatoServicoRota.calcularRotaPelasRuas(rota);
    const feature = resposta.feature;
    rota.geometria = feature.geometry;
    rota.distanciaTotalMetros = Number(feature.properties?.distance || 0);
    rota.duracaoDirecaoSegundos = Number(feature.properties?.time || 0);
    rota.pernas = Array.isArray(feature.properties?.legs) ? feature.properties.legs : [];
    rota.instrucoes = global.PacoteEMatoServicoRota.extrairInstrucoes(feature);
    const pendentes = rota.paradas.filter(p => !paradaFinalizada(p)).length;
    rota.duracaoParadasSegundos = pendentes * Number(rota.tempoParadaSegundos || 0);
    rota.duracaoTotalSegundos = rota.duracaoDirecaoSegundos + rota.duracaoParadasSegundos;
    rota.horarioTerminoEstimado = Date.now() + rota.duracaoTotalSegundos * 1000;
    rota.precisaRecalculo = false;
    return true;
  }

  async function otimizarNovas(rota, novosIds) {
    if (!novosIds.length) return recalcularTrajetoNaOrdem(rota);
    if (!global.PacoteEMatoServicoRota?.endpoint?.('optimize')) throw new Error('Serviço real de otimização não configurado.');
    const novosSet = new Set(novosIds.map(String));
    const ordemAntiga = rota.ordem.filter(id => !novosSet.has(String(id)));
    const novas = rota.paradas.filter(p => novosSet.has(String(p.id)));
    const ultimoAntigo = [...ordemAntiga].reverse().map(id => rota.paradas.find(p => String(p.id) === String(id))).find(p => p && coordenadaValida(p.latitude,p.longitude));
    const temp = clone(rota);
    temp.paradas = clone(novas);
    temp.ordem = novas.map(p => p.id);
    if (ultimoAntigo) temp.pontoInicial = { tipo:'coordenada', descricao:ultimoAntigo.enderecoOriginal || 'Última parada existente', lat:Number(ultimoAntigo.latitude), lon:Number(ultimoAntigo.longitude), status:'ok' };
    const opt = await global.PacoteEMatoServicoRota.otimizar(temp);
    const idsNovosOrdenados = (opt.orderIds || []).map(String);
    if (idsNovosOrdenados.length !== novas.length) throw new Error('A otimização das novas paradas não retornou todas as paradas.');
    rota.ordem = [...ordemAntiga, ...idsNovosOrdenados];
    rota.ordem.forEach((id, i) => { const p = rota.paradas.find(x => String(x.id) === String(id)); if (p) p.ordemOtimizada = i + 1; });
    const recalculou = await recalcularTrajetoNaOrdem(rota);
    if (!recalculou) throw new Error('A sequência das novas paradas foi calculada, mas o trajeto completo não pôde ser recalculado. A rota anterior será preservada.');
    rota.rotaOtimizada = true;
    rota.otimizadoEm = Date.now();
    return true;
  }

  async function otimizarTudo(rota) {
    if (!global.PacoteEMatoServicoRota?.endpoint?.('optimize')) throw new Error('Serviço real de otimização não configurado.');
    const opt = await global.PacoteEMatoServicoRota.otimizar(rota);
    const ordered = global.PacoteEMatoServicoRota.ordenarParadas(rota, opt.orderIds || []);
    rota.ordem = ordered.map(p => p.id);
    const recalculou = await recalcularTrajetoNaOrdem(rota);
    if (!recalculou) throw new Error('A nova ordem foi calculada, mas o trajeto completo não pôde ser recalculado. A rota anterior será preservada.');
    rota.rotaOtimizada = true;
    rota.otimizadoEm = Date.now();
    return true;
  }

  async function finalizarComSucesso(rota, mensagem) {
    await global.PacoteEMatoRotaStore.salvarRota(rota, { ativa:true });
    fecharConferencia();
    try { await global.finalizarCameraHardware?.(); } catch (_) {}
    const banner = $('pkgOpBanner'); if (banner) banner.style.display = 'none';
    document.body.classList.remove('pemato-package-operation');
    estado = null;
    await global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');
    setTimeout(() => global.PacoteEMatoMapa?.renderizar?.({ fit:true }), 120);
    global.PacoteEMatoHistorico?.renderizar?.();
    global.PacoteEMatoAppShell?.atualizarInicio?.();
    notificar(mensagem);
  }

  async function confirmarOperacao() {
    if (!estado || !estado.selecionados.size || processando) return;
    processando = true;
    const btn = $('pkgOpConfirmBtn');
    const textoOriginal = btn?.textContent || '';
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      if (estado.modo === 'adicionar') {
        const escolha = $('pkgOpOrderChoice')?.value || 'manter';
        const resultado = adicionarSelecionados(estado.rotaBase);
        const rotaMutada = resultado.rota;
        if (escolha === 'novas') await otimizarNovas(rotaMutada, resultado.novosIds);
        else if (escolha === 'todas') await otimizarTudo(rotaMutada);
        else {
          limparCalculoSeNecessario(rotaMutada);
          let recalculou = false;
          try { recalculou = await recalcularTrajetoNaOrdem(rotaMutada); } catch (_) { recalculou = false; }
          if (!recalculou) rotaMutada.precisaRecalculo = true;
        }
        const avisoRecalculo = rotaMutada.precisaRecalculo ? ' O trajeto atual foi preservado, mas precisa ser recalculado antes de confiar na sequência de navegação.' : '';
        await finalizarComSucesso(rotaMutada, `${resultado.adicionados.length} pacote(s) adicionados à rota.${avisoRecalculo}`);
      } else {
        const resultado = removerSelecionados(estado.rotaBase);
        if (!resultado.removidos.length) throw new Error('Nenhum pacote elegível foi removido.');
        limparCalculoSeNecessario(resultado.rota);
        let recalculou = false;
        try { recalculou = await recalcularTrajetoNaOrdem(resultado.rota); } catch (_) { recalculou = false; }
        if (!recalculou) resultado.rota.precisaRecalculo = true;
        const avisoRecalculo = resultado.rota.precisaRecalculo ? ' O trajeto atual foi preservado, mas precisa ser recalculado.' : '';
        await finalizarComSucesso(resultado.rota, `${resultado.removidos.length} pacote(s) removidos da rota.${avisoRecalculo}`);
      }
    } catch (erro) {
      console.error('Pacote É Mato: operação de pacotes falhou.', erro);
      notificar(`${erro?.message || 'Não foi possível concluir a operação.'} A rota anterior foi preservada.`);
      if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
    } finally {
      processando = false;
    }
  }

  async function cancelar() {
    if (!estado) return;
    const confirmar = global.confirm?.('Cancelar esta operação? A rota atual não será modificada.');
    if (confirmar === false) return;
    fecharConferencia();
    try { await global.finalizarCameraHardware?.(); } catch (_) {}
    if ($('pkgOpBanner')) $('pkgOpBanner').style.display = 'none';
    document.body.classList.remove('pemato-package-operation');
    estado = null;
    await global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');
    notificar('Operação cancelada. A rota foi preservada.');
  }

  function executarMutacaoTeste({ modo, rotaBase, paradasPlanilha, selecionados }) {
    const anterior = estado;
    const indicePlanilha = new Map();
    (paradasPlanilha || []).forEach(parada => (parada.pacotes || []).forEach(codigo => indicePlanilha.set(String(codigo), parada)));
    estado = {
      modo: modo === 'remover' ? 'remover' : 'adicionar',
      rotaBase: clone(rotaBase || null),
      arquivo: { name: 'teste.xlsx' },
      resultado: { paradas: clone(paradasPlanilha || []) },
      indicePlanilha,
      indiceRota: pacotesDaRota(rotaBase || null),
      selecionados: new Set((selecionados || []).map(String)),
      invalidos: [], duplicados: [], bloqueados: []
    };
    try {
      return estado.modo === 'adicionar' ? adicionarSelecionados(estado.rotaBase) : removerSelecionados(estado.rotaBase);
    } finally { estado = anterior; }
  }

  function estaAtiva() { return !!estado?.arquivo; }

  function bind() {
    garantirUI();
    $('routingAddPackagesBtn')?.addEventListener('click', () => iniciar('adicionar'));
    $('routingRemovePackagesBtn')?.addEventListener('click', () => iniciar('remover'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();

  global.PacoteEMatoOperacoesPacotes = Object.freeze({
    iniciar,
    cancelar,
    estaAtiva,
    processarCodigoOperacao,
    chaveFisica,
    quantidadePacotesFisicos,
    _teste: Object.freeze({ identificarCodigo, adicionarSelecionados, removerSelecionados, recalcularTrajetoNaOrdem, executarMutacaoTeste, chaveFisica })
  });
})(window);
