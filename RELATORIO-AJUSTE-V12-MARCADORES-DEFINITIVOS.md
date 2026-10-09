# Pacote É Mato — V12 — marcadores definitivos

Base utilizada: V11, preservando importação XLSX, agrupamento/bipagem, otimização, geocodificação, navegação, Waze/Google Maps, estados de entrega, persistência, histórico, Firebase/login e demais módulos.

## Arquivos alterados
- `js/mapa/marcadores.js` — novo módulo compartilhado para desenho dos marcadores.
- `js/mapa/mapa.js` — ciclo de vida dos marcadores no planejamento, clustering e seleção.
- `js/navegacao/navegacao.js` — mesma implementação na navegação, sem recriar marcadores como elementos HTML.
- `css/mapa.css` — isolamento do canvas/contêiner do mapa para impedir que símbolos atravessem painéis.
- `index.html` — inclusão do módulo compartilhado e cache-busting V12.

## Correções aplicadas
- Marcador em cápsula horizontal inspirado na referência enviada: fundo `#0f172a`, borda branca fina, número centralizado e multiplicador menor somente quando `quantidade > 1`.
- Parada selecionada usa verde `#059669`, sem crescimento exagerado.
- Estados concluído, parcial e não entregue preservam número/multiplicador, com variação discreta de fundo.
- Marcadores continuam sendo símbolos geográficos nativos do MapLibre; não há `position: fixed`, `maplibregl.Marker` HTML nem deslocamento permanente de latitude/longitude.
- Uma única fonte GeoJSON é atualizada com `setData`; camadas são criadas uma vez e reutilizadas.
- Identificador permanente da parada continua sendo usado na feature; ordem e multiplicador são propriedades independentes.
- Agrupamento visual (`cluster`) foi habilitado para zoom distante. Tocar no agrupamento aproxima o mapa; as coordenadas reais não são alteradas.
- Planejamento: cluster até zoom 14. Navegação: cluster até zoom 13, para priorizar a visualização dos números durante a rota.
- Marcadores de paradas simples/múltiplas e selecionadas usam o mesmo módulo compartilhado, evitando divergência entre planejamento e navegação.
- Clique/toque em marcador na navegação passa a selecionar o cartão correspondente sem criar outro marcador nem alterar status/coordenada.
- O contêiner do mapa mantém `overflow: hidden`/`contain: paint`, impedindo que símbolos escapem visualmente para o painel inferior.
- Mantido o ajuste automático do mapa para a região real das paradas após importação/geocodificação.
- Mantida a proteção visual do traçado contra saltos anormais já existente na base.

## Testes executados neste ambiente
1. `node --check` em todos os arquivos JavaScript do projeto: aprovado.
2. Teste unitário do módulo de marcadores com 30 paradas: 30 IDs únicos, sem duplicar imagens em rerender, `1x` não é desenhado, `2x` e `3x` são desenhados corretamente.
3. Teste de tamanho: marcadores simples respeitaram 28–40 px; múltiplos 42–56 px; parada `123` e `123 3x` permaneceram dentro dos limites.
4. Teste de integração simulado do mapa de planejamento com 30 paradas: uma feature por parada, clustering ativo, nenhuma camada duplicada após seleção/rerender, reordenação atualizou os números sem duplicar features; `2x` e `3x` preservados.
5. Teste de integração simulado da navegação com 30 paradas: 30 features, clustering ativo, multiplicadores corretos, sem duplicação de camadas e apenas um update inicial da fonte no cenário testado.
6. Auditoria estática: nenhum uso de `new maplibregl.Marker`/marcador HTML permanece nos módulos do projeto.

## Validação que ainda depende de navegador/celular real
O ambiente de teste não dispõe do MapLibre 5.24 carregado em um navegador com acesso ao CDN/mapa base, portanto ainda precisam de validação visual em aparelho real: pan/zoom com tiles reais, painel sendo arrastado, retorno do Waze/Google Maps, toque em clusters e aparência em densidades de tela específicas. Esses itens não foram declarados como aprovados aqui.
