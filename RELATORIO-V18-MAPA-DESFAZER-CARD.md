# Pacote É Mato — V18

## Motivo da versão
O print enviado na V17 mostrou que a interface da navegação carregava, mas a base cartográfica continuava vazia/cinza. Isso confirmou que o problema estava na base de mapa introduzida nas versões recentes, e não no card/painel.

## Correção do mapa
- Restaurada a base vetorial `https://tiles.openfreemap.org/styles/liberty`, a mesma configuração usada na V14.
- O mapa principal e o mapa da navegação voltaram a abrir usando `mapStyleUrl` diretamente.
- O mapa raster OSM continua disponível somente como contingência.
- Erro isolado de tile/fonte não cobre um mapa já funcional.
- Na navegação, a contingência só é tentada se o estilo principal não ficar pronto.
- Mantidos `resize()`/`triggerRepaint()` e a reconstrução do mapa ao retornar de outro aplicativo.
- Cache-busting atualizado para `v18`.

## Desfazer contextual
O comportamento esperado foi mantido e conferido no código:
1. Ao marcar `Entregue` ou `Não entregue`, a navegação avança automaticamente para a próxima parada pendente.
2. O botão `Desfazer` não aparece na nova parada pendente.
3. Se o usuário voltar/selecionar o card da parada finalizada, aparece `Desfazer entrega` ou `Desfazer não entrega`.
4. Ao desfazer, somente aquela parada volta para `Pendente` e a alteração é persistida.

## Arquivos principais alterados
- `js/mapa/config.js`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `index.html`
- `README.md`

## Testes executados neste ambiente
- `node --check` em `js/mapa/config.js`: aprovado.
- `node --check` em `js/mapa/mapa.js`: aprovado.
- `node --check` em `js/navegacao/navegacao.js`: aprovado.
- Verificação de que `mapStyleUrl` voltou a apontar para OpenFreeMap: aprovado.
- Verificação de que o mapa de planejamento e de navegação usam `cfg().mapStyleUrl`: aprovado.
- Verificação estática do fluxo Entregue/Não entregue -> próxima pendente: aprovado.
- Verificação estática do botão Desfazer apenas para status finalizado: aprovado.
- Cache-busting `v18`: aprovado.

## Validação que ainda depende do celular/navegador
- carregamento visual real dos tiles OpenFreeMap na rede do aparelho;
- retorno real do Waze/Maps após vários minutos;
- renderização após alternar app/segundo plano;
- GPS em movimento e navegação em primeira pessoa.

Não foram declarados como aprovados testes que dependem do aparelho real.
