# Correção de filtros — MB REFERÊNCIAS 4.9

## Causa confirmada no código publicado

A branch `main` tinha uma implementação antiga da pesquisa: no Catálogo, a busca verificava o texto literal no nome/REF, então `bermuda` não encontrava modelos cujo nome começa por `BERM`. Além disso, `src/CutOrders.tsx` na branch consultada não tinha o seletor por tipo de peça, embora ele tivesse sido mencionado na correção anterior.

Um build bem-sucedido só prova que o código compilou; não garante que a lógica dos filtros esteja presente ou correta.

## Comportamento esperado

- `BERM` e `BERMUDA` são reconhecidos como bermudas.
- `CAM`, `CAMISA` e `CAMISETA` são reconhecidos como camisas/camisetas; o filtro “Somente Camisetas” mantém a distinção.
- A busca `bermuda` encontra modelos chamados `BERM ...`.
- A busca `camisa` encontra modelos chamados `CAM ...` e `CAMISETA ...`.
- A busca pode ser combinada com outros termos, por exemplo `bermuda nike`.
- Ordem de Corte possui filtro por tipo de peça junto dos filtros de oficina, produção e pagamento.

## Limite dos testes

A lógica de classificação e pesquisa deve ser testada com os nomes do CSV e da planilha de OCs. A validação completa de produção depende de publicar os arquivos e conferir a interface com o Firebase real.
