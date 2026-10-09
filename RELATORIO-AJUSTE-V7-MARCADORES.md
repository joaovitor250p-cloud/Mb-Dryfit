# Ajuste V7 – Marcadores do mapa

- Ícone e número passam a ser renderizados na mesma camada do MapLibre.
- O número fica centralizado dentro do corpo do marcador.
- Paradas simples usam marcador compacto branco com contorno verde.
- Paradas múltiplas usam versão mais larga e exibem `parada + quantidade x`.
- A parada atual/selecionada usa preenchimento verde.
- Colisão é tratada pelo MapLibre como uma única peça, evitando números sem fundo e sobreposição visual.
- Cache dos JS/CSS atualizado para v7.
