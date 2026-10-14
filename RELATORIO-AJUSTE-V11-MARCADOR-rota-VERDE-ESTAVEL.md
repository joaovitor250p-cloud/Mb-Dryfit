# Ajuste V11 — marcador verde estável

Base: V8.

- Removido o sistema HTML da V10.
- Marcadores voltaram a ser símbolos nativos do MapLibre.
- O número e o multiplicador são desenhados dentro da própria imagem do marcador, garantindo centralização.
- Parada simples mostra apenas o número.
- Parada múltipla mostra número + quantidade (ex.: 38 3x).
- Marcador normal: branco, borda verde e número verde.
- Marcador selecionado/atual: verde preenchido, borda branca e número branco.
- Colisão é gerenciada pelo MapLibre; paradas iniciais têm prioridade.
- A fonte de paradas na navegação não é mais reescrita a cada atualização do GPS quando nada mudou, reduzindo tremulação.
- O sistema da V9/V10 foi descartado.
