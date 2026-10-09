# Ajuste V8 — marcadores e linha da rota

- Marcadores agora usam camadas estáticas separadas para simples, múltiplos e selecionado/atual, evitando incompatibilidade do MapLibre com expressão dinâmica de `icon-image`.
- Número centralizado dentro do balão verde/branco.
- Marcadores normais respeitam colisão do mapa para não se sobrepor; o atual fica sempre visível.
- Múltiplos exibem `número + Nx`; simples exibem somente o número.
- Geometria visual da rota remove coordenadas duplicadas e separa saltos anormais acima de 1,8 km, evitando linhas diagonais corrompidas no mapa.
- Cache dos arquivos atualizado para V8.
