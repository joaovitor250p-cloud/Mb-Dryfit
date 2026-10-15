# V38 — marcador da próxima entrega estável

## Alterações

1. Removido integralmente o recurso de postos de combustível: interface, estado, scripts, estilos e endpoint `/fuel` do Worker.
2. Separado o conceito de cartão exibido do conceito de próxima parada ativa.
3. O marcador verde agora usa exclusivamente a próxima parada pendente (`proxima()` / `rota.proximaParadaId`).
4. Deslizar para cartões anteriores ou seguintes não transfere mais a cor verde para a parada visualizada.
5. Quando uma entrega é concluída, a parada concluída mantém o check e a próxima pendente recebe o verde automaticamente.

## Exemplo esperado

Se a parada 12 for entregue, ela recebe ✓ e a parada 13 fica verde. Se o motorista deslizar para visualizar 14, 15 ou voltar para 12, a 13 continua verde no mapa até ser tratada.
