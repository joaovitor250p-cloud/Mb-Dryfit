# MB REFERÊNCIAS 5.3.1 — Identificação de pedidos atrasados

## Regra aplicada

Uma Ordem de Corte recebe o selo **Atrasado** quando todas as condições abaixo forem verdadeiras:

1. O status de produção não é `ENTREGUE`.
2. Existe uma data de prazo (`due`) válida no formato DD/MM/AAAA.
3. A data final do prazo é anterior à data local atual do navegador.

Se o prazo vencer hoje, o pedido ainda não é considerado atrasado durante esse dia. Ele passa a ser considerado atrasado no dia seguinte, caso ainda não tenha sido entregue.

## O que aparece na tela

- O status visual passa a exibir **Atrasado** para as OCs vencidas e ainda não entregues.
- A data original do prazo continua na coluna **Prazo de 10 dias**.
- O resumo mostra a quantidade de pedidos atrasados.
- O filtro de produção ganhou a opção **Atrasados**.
- O pedido continua com seu status original no Firestore (por exemplo, `EM ANDAMENTO`); a identificação é calculada em tempo de exibição.

## Preservação dos dados

- Não altera nem apaga `due`, `sent`, `entry` ou qualquer outra data.
- Não muda automaticamente o status armazenado.
- Não altera pedidos entregues, mesmo que tenham sido entregues depois do prazo.
- Não cria gravações ou migrações no Firebase.
- Nenhuma publicação foi realizada.

## Validação

- Análise sintática do TSX realizada com o compilador TypeScript global.
- Testes lógicos realizados para prazo vencido, prazo de hoje, prazo futuro, data inválida e pedido entregue.
- Build Vite/TypeScript completo não pôde ser executado porque a instalação de dependências npm expirou neste ambiente.
