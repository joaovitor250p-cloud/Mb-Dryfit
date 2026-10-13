# Pacote É Mato — V20 — correção profunda do traçado do mapa

## Causa encontrada

O mapa-base não foi trocado. O problema principal estava no processamento da geometria da rota pelo frontend:

1. a geometria vinda do roteador pode ser `MultiLineString`, isto é, vários trechos/legs;
2. cada trecho era simplificado separadamente por um algoritmo próprio;
3. a tolerância dessa simplificação mudava conforme o zoom;
4. ao terminar cada zoom, a geometria era recriada novamente;
5. o `GeoJSONSource` do MapLibre ainda aplicava uma segunda simplificação (`tolerance: 0.8`).

A combinação fazia a linha mudar de forma quando o usuário afastava/aproximava o mapa e deixava mais visíveis pequenas quebras entre legs.

## Correção

- removida a simplificação Douglas-Peucker dependente do zoom;
- removido o redesenho da geometria no `zoomend`;
- a rota agora usa a mesma geometria estável em todos os zooms;
- apenas coordenadas inválidas e duplicatas submétricas são descartadas;
- legs consecutivos são unidos somente quando seus extremos estão realmente próximos (até 8 m);
- a simplificação interna do MapLibre foi reduzida para `tolerance: 0.2`;
- buffer aumentado para 128 e maxzoom do source para 20;
- a mesma correção foi aplicada ao mapa de planejamento e à navegação.

## Elemento removido

Foi removido do HTML o `routingEtaCard`. No mobile ele era filho de um topbar ancorado à direita e, mesmo posicionado por `left`, podia escapar do contêiner e aparecer cortado na lateral direita — exatamente o elemento indicado no print.

O horário de término continua no painel inferior da rota; apenas o cartão flutuante foi removido.
