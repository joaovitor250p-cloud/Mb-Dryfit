(function iniciarFluxoImportacao(global) {
  'use strict';

  const $ = id => document.getElementById(id);
  let rota = null;
  let erros = [];

  function normalizar(v) {
    return String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function coordValida(p) {
    if (p?.latitude === null || p?.latitude === undefined || String(p.latitude).trim() === '') return false;
    if (p?.longitude === null || p?.longitude === undefined || String(p.longitude).trim() === '') return false;
    const lat = Number(p.latitude);
    const lon = Number(p.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }

  function perfilDaRota(r) {
    if (r?.perfilImportacao) return String(r.perfilImportacao);
    return (r?.paradas || []).some(p => p?.fonte?.perfil === 'spx') ? 'spx' : 'generico';
  }

  function garantir() {
    if ($('routeImportFlow')) return;

    const wrap = document.createElement('div');
    wrap.id = 'routeImportFlow';
    wrap.className = 'route-import-flow';
    wrap.innerHTML = `
      <div class="route-import-flow-shell">
        <section id="routeImportFlowLoading" class="route-import-loading">
          <div class="route-import-loading-card">
            <img class="route-import-logo" src="icon-192.png" alt="Pacote É Mato">
            <div class="route-import-kicker">Importação de rota</div>
            <h2 id="routeImportFlowTitle">Processando planilha</h2>
            <p id="routeImportFlowStage">Lendo o arquivo e identificando as paradas.</p>
            <div class="route-import-indeterminate" aria-hidden="true"><span></span></div>
            <p id="routeImportFlowFile"></p>
          </div>
        </section>

        <section id="routeImportFlowReview" class="route-import-review">
          <div class="route-import-review-head">
            <div>
              <div class="route-import-kicker">Conferência da importação</div>
              <h2>Revise as paradas antes de continuar</h2>
              <p>Nenhuma rota ativa é substituída até você confirmar.</p>
            </div>
          </div>

          <div id="routeImportProfileNote" class="route-import-profile-note" style="display:none"></div>

          <div class="route-import-review-summary">
            <div><strong id="routeImportReviewTotal">0</strong><span>Paradas</span></div>
            <div><strong id="routeImportReviewLocated">0</strong><span>Localizadas</span></div>
            <div><strong id="routeImportReviewWarnings">0</strong><span>A revisar</span></div>
            <div><strong id="routeImportReviewPackages">0</strong><span>Pacotes</span></div>
          </div>

          <div class="route-import-review-actions">
            <button id="routeImportReviewAdd" class="pemato-secondary" type="button">Adicionar endereço</button>
            <button id="routeImportReviewRetry" class="pemato-secondary" type="button">Escolher outra planilha</button>
          </div>

          <div id="routeImportSkipped" class="route-import-skipped" style="display:none"></div>
          <div id="routeImportReviewList" class="route-import-review-list"></div>

          <div class="route-import-review-footer">
            <button id="routeImportReviewCancel" class="pemato-secondary" type="button">Cancelar</button>
            <button id="routeImportReviewConfirm" class="pemato-primary" type="button">Continuar para o mapa</button>
          </div>
        </section>

        <section id="routeImportFlowError" class="route-import-error">
          <div class="route-import-error-card">
            <img class="route-import-logo" src="icon-192.png" alt="Pacote É Mato">
            <div class="route-import-kicker">Importação de rota</div>
            <h2>Não foi possível processar a planilha</h2>
            <p id="routeImportFlowErrorText"></p>
            <div class="route-import-error-actions">
              <button id="routeImportErrorRetry" class="pemato-primary" type="button">Tentar novamente</button>
              <button id="routeImportErrorClose" class="pemato-secondary" type="button">Voltar</button>
            </div>
          </div>
        </section>
      </div>`;

    document.body.appendChild(wrap);

    $('routeImportReviewAdd')?.addEventListener('click', () => global.dispatchEvent(new CustomEvent('pemato:import:adicionar')));
    $('routeImportReviewRetry')?.addEventListener('click', () => global.dispatchEvent(new CustomEvent('pemato:import:tentar-outro')));
    $('routeImportReviewCancel')?.addEventListener('click', () => global.dispatchEvent(new CustomEvent('pemato:import:cancelar')));
    $('routeImportReviewConfirm')?.addEventListener('click', () => global.dispatchEvent(new CustomEvent('pemato:import:confirmar')));
    $('routeImportErrorRetry')?.addEventListener('click', () => global.dispatchEvent(new CustomEvent('pemato:import:tentar-outro')));
    $('routeImportErrorClose')?.addEventListener('click', fechar);
    $('routeImportReviewList')?.addEventListener('click', event => {
      const btn = event.target.closest('[data-import-edit]');
      if (btn) global.dispatchEvent(new CustomEvent('pemato:import:editar', { detail: { id: btn.dataset.importEdit } }));
    });
  }

  function tela(nome) {
    ['Loading', 'Review', 'Error'].forEach(k => {
      const el = $(`routeImportFlow${k}`);
      if (!el) return;
      el.style.display = k.toLowerCase() === nome ? (k === 'Review' ? 'flex' : 'grid') : 'none';
    });
  }

  function iniciar(nomeArquivo, mensagem) {
    garantir();
    $('routeImportFlow')?.classList.add('is-open');
    tela('loading');
    if ($('routeImportFlowFile')) $('routeImportFlowFile').textContent = nomeArquivo || '';
    atualizarEtapa(mensagem || 'Lendo o arquivo e identificando as paradas.');
  }

  function atualizarEtapa(msg, titulo) {
    if (titulo && $('routeImportFlowTitle')) $('routeImportFlowTitle').textContent = titulo;
    if ($('routeImportFlowStage')) $('routeImportFlowStage').textContent = String(msg || 'Processando...');
  }

  function problemasDaRota(r) {
    const paradas = Array.isArray(r?.paradas) ? r.paradas : [];
    const cont = new Map();
    paradas.forEach(p => {
      const k = normalizar(p.enderecoOriginal);
      if (k) cont.set(k, (cont.get(k) || 0) + 1);
    });

    return paradas.map(p => {
      const problemas = [];
      if (!String(p.logradouro || p.enderecoOriginal || '').trim()) problemas.push('Endereço ausente');
      if (!String(p.numero || '').trim()) problemas.push('Número não identificado');
      if (!String(p.cidade || '').trim()) problemas.push('Cidade ausente');
      const k = normalizar(p.enderecoOriginal);
      if (k && (cont.get(k) || 0) > 1) problemas.push('Endereço duplicado');
      if (p.statusGeocodificacao === 'ambiguo') problemas.push('Localização ambígua');
      if (p.statusGeocodificacao === 'nao_encontrado') problemas.push('Endereço não localizado');
      return problemas;
    });
  }

  function badge(texto, classe) {
    const el = document.createElement('span');
    el.className = `route-import-badge${classe ? ` ${classe}` : ''}`;
    el.textContent = texto;
    return el;
  }

  function mostrarConferencia(r, errosEntrada) {
    garantir();
    rota = r;
    erros = Array.isArray(errosEntrada) ? errosEntrada : [];
    $('routeImportFlow')?.classList.add('is-open');
    tela('review');

    const paradas = Array.isArray(r?.paradas) ? r.paradas : [];
    const problemas = problemasDaRota(r);
    const pacotes = paradas.reduce((soma, p) => soma + (p.pacotes?.length || 0), 0);
    const warnings = problemas.filter(lista => lista.length).length + erros.length;
    const localizadas = paradas.filter(coordValida).length;
    const perfil = perfilDaRota(r);
    const coordsXlsx = paradas.filter(p => coordValida(p) && p.fonteCoordenada === 'xlsx').length;

    if ($('routeImportReviewTotal')) $('routeImportReviewTotal').textContent = String(paradas.length);
    if ($('routeImportReviewLocated')) $('routeImportReviewLocated').textContent = String(localizadas);
    if ($('routeImportReviewWarnings')) $('routeImportReviewWarnings').textContent = String(warnings);
    if ($('routeImportReviewPackages')) $('routeImportReviewPackages').textContent = String(pacotes);

    const perfilNote = $('routeImportProfileNote');
    if (perfilNote) {
      if (perfil === 'spx') {
        perfilNote.style.display = 'block';
        perfilNote.textContent = `Formato SPX reconhecido automaticamente. SPX TN foi preservado como código de pacote e ${coordsXlsx} de ${paradas.length} parada(s) já possuem Latitude/Longitude válidas da própria planilha.`;
      } else if (coordsXlsx) {
        perfilNote.style.display = 'block';
        perfilNote.textContent = `${coordsXlsx} parada(s) já possuem coordenadas válidas fornecidas pela planilha. Elas serão usadas diretamente no mapa.`;
      } else {
        perfilNote.style.display = 'none';
        perfilNote.textContent = '';
      }
    }

    const skipped = $('routeImportSkipped');
    if (skipped) {
      if (erros.length) {
        skipped.style.display = 'block';
        skipped.textContent = `${erros.length} linha(s) não viraram parada. ${erros.slice(0, 3).map(e => `Linha ${e.linha}: ${e.motivo}`).join(' · ')}${erros.length > 3 ? ' · Revise as demais linhas no arquivo.' : ''}`;
      } else {
        skipped.style.display = 'none';
        skipped.textContent = '';
      }
    }

    const list = $('routeImportReviewList');
    if (!list) return;
    list.replaceChildren();

    paradas.forEach((p, index) => {
      const item = document.createElement('article');
      item.className = 'route-import-review-item';

      const numero = document.createElement('div');
      numero.className = 'route-import-review-number';
      numero.textContent = String(index + 1).padStart(2, '0');

      const copy = document.createElement('div');
      copy.className = 'route-import-review-copy';

      const strong = document.createElement('strong');
      strong.textContent = p.enderecoFonte || p.enderecoOriginal || 'Endereço incompleto';

      const meta = document.createElement('span');
      meta.textContent = [p.bairro, p.cidade, p.estado, p.cep].filter(Boolean).join(' · ');

      const small = document.createElement('small');
      const codigos = (p.pacotes || []).slice(0, 3).join(', ');
      small.textContent = [
        `${p.pacotes?.length || 0} pacote(s)`,
        codigos,
        p.observacao || ''
      ].filter(Boolean).join(' · ');

      const badges = document.createElement('div');
      badges.className = 'route-import-badges';
      if (coordValida(p)) {
        badges.appendChild(badge(p.fonteCoordenada === 'xlsx' ? 'Coordenada do XLSX' : 'Coordenada válida'));
      }
      if (p.spxTn) badges.appendChild(badge('SPX TN reconhecido', 'info'));
      problemas[index].forEach(txt => badges.appendChild(badge(txt, 'warn')));

      copy.append(strong);
      if (meta.textContent) copy.append(meta);
      copy.append(small, badges);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pemato-secondary';
      btn.dataset.importEdit = p.id;
      btn.textContent = 'Corrigir';

      item.append(numero, copy, btn);
      list.appendChild(item);
    });
  }

  function mostrarErro(msg, nomeArquivo) {
    garantir();
    $('routeImportFlow')?.classList.add('is-open');
    tela('error');
    if ($('routeImportFlowErrorText')) $('routeImportFlowErrorText').textContent = String(msg || 'Falha desconhecida.');
    if (nomeArquivo && $('routeImportFlowFile')) $('routeImportFlowFile').textContent = nomeArquivo;
  }

  function fechar() {
    garantir();
    $('routeImportFlow')?.classList.remove('is-open');
  }

  global.PacoteEMatoFluxoImportacao = Object.freeze({
    iniciar,
    atualizarEtapa,
    mostrarConferencia,
    mostrarErro,
    fechar,
    atualizar: () => rota && mostrarConferencia(rota, erros),
    coordValida
  });
})(window);
