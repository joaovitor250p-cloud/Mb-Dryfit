# Pacote É Mato — V23 — Correção da importação `featureCollection is not defined`

## Problema identificado
A limpeza técnica da V21 removeu por engano a função utilitária local `featureCollection()` do módulo `js/mapa/mapa.js`, mas o restante do módulo continuou utilizando essa função em vários pontos.

Isso só aparecia em tempo de execução quando o mapa/roteirização tentava montar GeoJSON durante a importação, resultando no erro:

`featureCollection is not defined`

Como consequência, a tela de importação abortava com “Não foi possível processar a planilha”.

## Correção
- Restaurada `featureCollection(features)` dentro do próprio módulo do mapa.
- A função sempre retorna um GeoJSON válido do tipo `FeatureCollection`.
- Não houve mudança nas regras de importação, agrupamento, geocodificação, validação de coordenadas, otimização ou bipagem.
- Mantidas as correções genéricas da V22 para qualquer XLSX/CSV compatível.
- Cache dos assets atualizado de `v22` para `v23`.

## Auditoria adicional
Foi comparado o conjunto de funções removidas entre a base anterior à limpeza e a V22. `featureCollection()` era a única função removida que ainda permanecia referenciada no código atual do mesmo módulo.

## Testes executados
- `node --check` em todos os arquivos JavaScript do projeto.
- Verificação de que `featureCollection()` está declarada antes dos seus 7 usos em `mapa.js`.
- Auditoria automática de funções removidas ainda referenciadas: nenhuma pendência após a correção.
- Verificação de cache `v23` no `index.html`.
- Teste de integridade do ZIP.

## Validação manual pendente
Ainda é necessário testar no celular a importação de XLSX/CSV real, pois câmera/WebView, rede, geocodificação e serviços externos não podem ser reproduzidos integralmente no ambiente de empacotamento.
