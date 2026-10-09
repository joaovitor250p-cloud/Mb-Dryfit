# Pacote É Mato — V9 Marcadores HTML + Espiral

- Base: V8.
- Marcadores de parada migrados de layers `symbol` para `maplibregl.Marker` com HTML/CSS.
- Pílula de alto contraste: fundo `#0f172a`, borda branca e número centralizado.
- Multiplicador (`3x`) aparece somente quando há mais de um pacote.
- Dispersão por ângulo áureo/espiral para coordenadas iguais ou muito próximas, combinando deslocamento geográfico e offset visual.
- Z-index inverso pela ordem da rota; toque/hover eleva o marcador.
- Aplicado no planejador e também na tela de navegação.
- Após otimização normal, a rota é persistida e o app segue automaticamente para Navegação; refinamento continua abrindo a revisão.
- Cache bust atualizado para `v9`.
