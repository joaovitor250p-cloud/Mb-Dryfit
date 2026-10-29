# MB REFERÊNCIAS 4.8 — Correção dos filtros

## Problema encontrado
O arquivo `src/lib/modelTypes.ts` continha caracteres de controle no lugar das fronteiras de palavra usadas pelas expressões regulares. Por isso, os nomes abreviados do catálogo, como `BERM` e `CAM`, não eram reconhecidos como bermudas e camisas; o filtro por tipo acabava sem resultados.

## Correções
- Refeito o reconhecimento dos prefixos `BERM`, `BERMUDA`, `CAM`, `CAMISA`, `CAMISETA`, `REGATA`, `CONJ`, `CALÇA` e `JAQUETA` usando o primeiro termo normalizado do nome.
- A busca textual agora entende `bermuda` para modelos cadastrados como `BERM` e `camisa` para modelos cadastrados como `CAM`.
- Mantidos filtros do Catálogo, Amostras e Cortes.
- Adicionado filtro por tipo de peça em Ordem de Corte, além dos filtros de oficina, produção e pagamento.
- Nenhum dado do Firebase ou registro existente foi modificado; a correção é apenas no código de filtragem.

## Testes
- 12 testes de classificação e busca passaram, incluindo `BERM`, `BERMUDA`, `CAM`, `CAMISETA`, `bermuda dry` e `camisa uv`.
- A compilação completa não pôde ser confirmada neste ambiente porque as dependências npm não estavam instaladas e `npm install` excedeu o tempo limite. Execute `npm install` e `npm run build` no ambiente do projeto antes de publicar.
