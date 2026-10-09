(function iniciarFluxoImportacao(global) {
  'use strict';

  const $ = id => document.getElementById(id);

  function garantir() {
    if ($('routeImportFlow')) return;
    const wrap = document.createElement('div');
    wrap.id = 'routeImportFlow';
    wrap.className = 'route-import-flow route-import-flow--light';
    wrap.innerHTML = `
      <div class="route-import-flow-shell route-import-flow-shell--light">
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
    $('routeImportErrorRetry')?.addEventListener('click', () => global.dispatchEvent(new CustomEvent('pemato:import:tentar-outro')));
    $('routeImportErrorClose')?.addEventListener('click', fechar);
  }

  function tela(nome) {
    const loading = $('routeImportFlowLoading');
    const error = $('routeImportFlowError');
    if (loading) loading.style.display = nome === 'loading' ? 'grid' : 'none';
    if (error) error.style.display = nome === 'error' ? 'grid' : 'none';
  }

  function iniciar(nomeArquivo, mensagem) {
    garantir();
    $('routeImportFlow')?.classList.add('is-open');
    tela('loading');
    if ($('routeImportFlowFile')) $('routeImportFlowFile').textContent = nomeArquivo || '';
    atualizarEtapa(mensagem || 'Lendo o arquivo e identificando as paradas.');
  }

  function atualizarEtapa(msg, titulo) {
    garantir();
    if (titulo && $('routeImportFlowTitle')) $('routeImportFlowTitle').textContent = titulo;
    if ($('routeImportFlowStage')) $('routeImportFlowStage').textContent = String(msg || 'Processando...');
  }

  function mostrarConferencia() {
    // Compatibilidade com versões anteriores: a conferência pesada foi removida.
    fechar();
    global.dispatchEvent(new CustomEvent('pemato:import:confirmar'));
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

  async function concluirOtimizacaoEIrParaRota() {
    fechar();
    if (global.PacoteEMatoRoteirizacao?.abrirNavegacao) {
      return global.PacoteEMatoRoteirizacao.abrirNavegacao();
    }
    return global.PacoteEMatoAppShell?.abrirModulo?.('navegacao');
  }

  global.PacoteEMatoFluxoImportacao = Object.freeze({
    iniciar,
    atualizarEtapa,
    mostrarConferencia,
    mostrarErro,
    fechar,
    concluirOtimizacaoEIrParaRota,
    atualizar: () => {}
  });
})(window);
