# MB REFERENCIAS 4.13 — Fotos das amostras em pilha

## O que mudou

- Os cartões da tela **Amostras** mostram a foto principal na frente e as fotos 2 e 3 parcialmente sobrepostas atrás dela.
- O indicador `2 fotos` ou `3 fotos` aparece somente quando há imagens adicionais salvas para aquela OC.
- Clicar na foto principal abre a foto principal; clicar na parte visível de uma foto de trás abre aquela foto.
- As fotos extras são consultadas sob demanda quando o cartão entra na área visível da tela, evitando carregar todas as galerias ao abrir a página.
- Depois de salvar uma galeria, o documento da própria OC recebe uma nova marca de atualização para que o cartão recarregue as fotos extras.
- A estrutura do Firestore e as regras existentes para `production_samples/{sampleId}/gallery/photo_2` e `photo_3` são mantidas.

## Atualização

1. Faça backup do projeto atual.
2. Substitua os arquivos pelo conteúdo deste pacote.
3. Execute `npm install` e `npm run build`.
4. Publique no GitHub Pages.

Não é necessário publicar novas regras do Firestore para esta alteração.

## Testes recomendados

1. Abra uma OC com 2 fotos: a segunda deve aparecer parcialmente atrás da principal.
2. Abra uma OC com 3 fotos: as duas fotos adicionais devem aparecer em camadas atrás da principal.
3. Clique na parte visível de cada camada para abrir a foto correspondente.
4. Adicione/remova fotos, salve e confirme que o cartão atualiza a pilha.
5. Abra Amostras em celular e notebook e confirme que as camadas permanecem dentro do cartão.
