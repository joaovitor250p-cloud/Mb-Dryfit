# RELATÓRIO — Atualização operacional 09/10/2026

Base: `Pacote-Em-Mato-ETAPA-4-REFINO-DESENHO-FLUXO-COMPLETO.zip`.

## Implementado
- Associação de colunas é exibida em toda importação XLSX/CSV, com AT ID, Sequence, Stop, SPX TN, endereço, bairro, cidade, CEP, latitude e longitude disponíveis.
- SPX TN/códigos de pacote são impressos explicitamente na exportação PDF.
- Pacotes múltiplos: no mapa continuam como paradas individuais e recebem indicador Nx pelo logradouro+número; na Bipagem são agrupados em uma única parada física, ignorando apartamento/loja/bloco/sala/complemento para o agrupamento.
- Menu de 3 pontos foi tornado reutilizável na navegação e recebeu acesso direto ao Refinar.
- Depois de uma rota calculada, os botões Importar/Otimizar do rodapé são ocultados e o CTA principal passa a ser Iniciar rota.
- Refinar abre na área visível do modal, sem exigir rolar toda a lista.
- Atalho de Configurações e previsão de término foram adicionados ao mapa.
- Resumo simplificado para duração estimada + previsão de término.
- Waze e Google Maps priorizam esquemas de aplicativo (`waze://` e `google.navigation:`) e usam fallback web apenas quando o app não assumir o link; o estado é persistido antes da saída.
- Cadastro/edição ganhou campo único de busca de endereço com sugestão geocodificada; os detalhes avançados continuam disponíveis sem poluir o fluxo principal.
- Marcadores passam a mostrar também Nx quando há múltiplos do mesmo endereço-base.

## Limitações de teste
- Deep links Waze/Google Maps exigem Android/iOS físico com os aplicativos instalados para validação completa.
- GPS, voz, retorno de segundo plano e comportamento do PWA sob encerramento pelo sistema operacional também exigem teste físico.
- Chamadas reais ao Worker publicado não foram executadas neste ambiente se a rede externa não estiver disponível.
