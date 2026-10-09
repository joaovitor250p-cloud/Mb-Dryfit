# Ajuste V10 — Marcadores inspirados na organização do Spoke

Base utilizada: V8. A V9 foi descartada.

- Marcadores de parada passam a ser elementos HTML MapLibre, evitando o problema de fundo do ícone desaparecer.
- Visual próprio em branco/verde, compacto, com ponta inferior e número centralizado.
- Parada atual: preenchimento verde e texto branco.
- Múltiplos: número + quantidade (ex.: 38 3x); simples: somente número.
- Organização em tela usa posições alternativas em pixels quando os marcadores colidem, sem alterar as coordenadas salvas da rota.
- Ordem baixa recebe prioridade visual e z-index superior.
- A lógica/traçado de rota permanece a da V8.
- Aplicado no mapa de planejamento e no mapa de navegação.
