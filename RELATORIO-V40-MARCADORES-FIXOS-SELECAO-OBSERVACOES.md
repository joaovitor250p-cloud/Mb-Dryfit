# Pacote É Mato V40 — Marcadores fixos, seleção verde e observações

## Correções

- O marcador verde na navegação agora representa a parada que está selecionada/visível no card.
- Tocar em um balão atualiza imediatamente o card e deixa esse balão verde.
- Deslizar entre os cards também transfere o verde para a parada visualizada.
- Ao concluir uma parada, o card avança e a próxima parada passa a verde; paradas pendentes anteriores ficam brancas.
- Marcadores não usam mais deslocamento visual dinâmico (`icon-offset`), permanecendo presos às coordenadas reais.
- O bloco “Observação do cliente” usa o campo de observação da planilha e também reúne complemento, apartamento, bloco, sala e loja.
- Quando informações como `ap 104`, `tocar campainha`, `interfone` ou `portaria` vierem misturadas no endereço, elas são extraídas para o bloco de observação.
- O visual dos ícones/marcadores foi preservado; a alteração é de estado/posição, não de desenho.
