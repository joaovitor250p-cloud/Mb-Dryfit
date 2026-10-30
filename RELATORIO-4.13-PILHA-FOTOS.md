# MB REFERENCIAS 4.13 — Pilha de fotos nas Amostras

## Alteração solicitada
Na listagem de Amostras, mostrar as fotos adicionais visualmente atrás da foto principal, em vez de exibir somente a primeira foto.

## Implementação
- A foto principal permanece na frente.
- A segunda e a terceira fotos aparecem como cartões sobrepostos atrás da principal.
- O selo `2 fotos` ou `3 fotos` aparece quando existem imagens adicionais.
- A parte visível das fotos de trás pode ser clicada para abrir aquela foto.
- As fotos adicionais são consultadas sob demanda quando o cartão entra na área visível, somente na tela Amostras.
- Após salvar a galeria, o documento da própria OC recebe uma nova atualização para que o cartão recarregue as fotos adicionais.
- Não foram alteradas as regras do Firestore nem a estrutura dos documentos da galeria.

## Compatibilidade
Usa a estrutura já existente:
- `production_samples/{sampleId}.imageData` para a foto principal;
- `production_samples/{sampleId}/gallery/photo_2` para a segunda;
- `production_samples/{sampleId}/gallery/photo_3` para a terceira.

## Validação
- 20 arquivos TypeScript/TSX transpilados sem erros de sintaxe.
- Build completo não executado: as dependências do projeto não estão instaladas neste ambiente.

## Teste após publicar
1. Abra uma amostra com duas fotos: a foto 2 deve aparecer parcialmente atrás da principal.
2. Abra uma amostra com três fotos: as fotos 2 e 3 devem aparecer em camadas atrás da principal.
3. Clique nas partes visíveis das fotos traseiras para abrir cada imagem.
4. Adicione/remova fotos, salve e confira a atualização da pilha.
5. Confira no celular e no notebook.
