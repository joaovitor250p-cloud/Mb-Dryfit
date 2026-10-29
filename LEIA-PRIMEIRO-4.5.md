# MB REFERÊNCIAS 4.5 — Correção do zoom por toque

## O que foi corrigido

- O site já bloqueava combinações de teclado, Ctrl+roda do mouse e eventos de gesto usados pelo Safari, mas isso não cobria todos os navegadores móveis.
- Foi adicionado um listener global de `touchmove` com `passive: false` e captura. Quando há dois ou mais toques, ele cancela o gesto fora do visualizador de fotos.
- Dentro do visualizador (`.photo-lightbox-stage`), o gesto continua liberado para o zoom de dois dedos implementado com Pointer Events.
- O listener é removido ao desmontar o componente, evitando duplicação de eventos.

## Arquivo alterado

- `src/App.tsx`: bloqueio de pinch-zoom do navegador fora do visualizador de imagens.
- `package.json`: versão atualizada para `4.5.0`.

## Como validar no celular

1. Publique o projeto pelo GitHub Actions e espere o build terminar com sucesso.
2. Abra o site no Chrome do celular e atualize a página publicada (se necessário, abra uma aba anônima para evitar cache).
3. Na tela de catálogo, tente aproximar/afastar com dois dedos: a página não deve aumentar. A rolagem normal com um dedo deve continuar funcionando.
4. Abra uma fotografia e faça pinça com dois dedos sobre a imagem: a foto deve aproximar/afastar; quando ampliada, arraste-a com um dedo para mover.

## Limite do teste

O código foi revisado, mas o gesto físico precisa ser confirmado no aparelho real depois da publicação. A instalação das dependências do projeto não terminou neste ambiente, então não afirmo que executei um build completo.
