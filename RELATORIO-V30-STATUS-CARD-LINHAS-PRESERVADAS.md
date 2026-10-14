# Pacote É Mato — V30

## Objetivo

Ajustar somente a posição visual do status `Entregue` / `Não entregue` no card da navegação, preservando o desenho das linhas da rota da V28/V29.

## Alterações

- O badge de status foi deslocado para baixo e recebeu espaço reservado à direita para não ficar sob o botão `X` nem sob o menu de três pontos.
- `Entregue` permanece maior e verde.
- `Não entregue` permanece maior e vermelho.
- O botão `X` mantém a centralização implementada na V29.
- Nenhuma função de desenho da rota foi alterada nesta versão.
- `js/mapa/mapa.js` permanece idêntico à V29.
- As rotinas de desenho/status da rota em `js/navegacao/navegacao.js` não foram alteradas; a única diferença entre V29 e V30 é de cache/relatório/CSS do card.

## Validações executadas

- Sintaxe de todos os JavaScripts com `node --check`.
- Conferência de que `js/mapa/mapa.js` é idêntico à V29.
- Conferência de que não houve alteração nas constantes/camadas de rota da navegação.
- Verificação de chaves CSS balanceadas.
- Cache atualizado para V30.

## Validação manual recomendada

No celular, abrir um card já `Entregue` e outro `Não entregue` e confirmar que o texto fica totalmente abaixo dos controles superiores, sem sobreposição com o `X`.
