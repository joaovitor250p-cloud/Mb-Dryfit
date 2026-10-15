# V47 — parada ativa + parada selecionada em verde

- A parada ativa da corrida permanece verde até ser tratada.
- Ao tocar ou navegar pelos cards para outra parada, a parada consultada também fica verde.
- O destaque de consulta não altera `proximaParadaId` e não muda a continuidade da corrida.
- Ao selecionar outra parada, o verde de consulta acompanha a nova seleção; o verde operacional continua na parada ativa.
- Paradas pendentes não selecionadas permanecem brancas.
- A atualização após swipe usa a source de marcadores com ícones cacheados para preservar fluidez.
