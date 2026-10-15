# Pacote É Mato V41 — continuidade verde e observações SPX

## Marcador verde na navegação
- O marcador verde representa exclusivamente a continuação da corrida (`proximaParadaId`).
- Abrir ou deslizar para outro card não muda o marcador verde.
- Exemplo: 28 concluída -> 29 verde; ao consultar a 5, a 29 continua verde e a 5 permanece branca se pendente.
- Ao concluir uma parada fora de ordem, a continuação passa para a próxima parada pendente após a parada tratada.

## Observações da planilha SPX
A planilha operacional não possui coluna própria de observação. O complemento vem dentro de `Destination Address`. A V41 copia o trecho após `logradouro, número,` para `observacao`, preservando o endereço original.

Exemplos:
- `Rua Coronel Joviniano Brandão, 462, Pode jogar na garagem` -> `Pode jogar na garagem`
- `Rua Antônio Chiarizzi, 145, T3 ROMA APTO 402` -> `T3 ROMA APTO 402`
- `Pç do Cent de Vl Prudente, 143, ap 104` -> `ap 104`

## Marcadores
- Sem deslocamento dinâmico (`markerOffset` permanece `[0,0]`).
- Consultar cards não altera a posição física dos balões.
