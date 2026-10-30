# MB REFERENCIAS 5.0 — instalação

## O que mudou

- Navegação mobile substituída por barra inferior fixa com áreas principais e menu Mais.
- Navegação desktop organizada em menu lateral.
- Transições entre áreas com animação curta.
- Gestos horizontais no conteúdo para trocar de área, sem capturar campos, botões, tabelas ou a galeria.
- Galeria de fotos com miniaturas, setas, contador, swipe com um dedo e zoom por pinça.
- Zoom no notebook por pinça no touchpad (Ctrl/Cmd + roda), roda do mouse, duplo clique e botões +/−.
- Layout responsivo revisto para catálogo, amostras, cortes, financeiro e telas auxiliares.
- Preservados os componentes de negócio, autenticação, dados, permissões e regras atuais.

## Atualização

1. Faça uma cópia local do repositório atual.
2. Extraia este ZIP.
3. Copie o conteúdo da pasta `Mb-Dryfit-main` para a raiz do repositório, substituindo os arquivos correspondentes.
4. Preserve as configurações e variáveis de ambiente já utilizadas no GitHub.
5. Execute `npm install`.
6. Execute `npm run build`.
7. Se o build terminar sem erros, envie as alterações para a branch `main`.
8. Confira a execução do GitHub Actions antes de considerar a publicação concluída.

## Firebase / regras

Não é necessário publicar regras novas para esta atualização visual. Não apague nem recrie coleções. A autenticação e os dados continuam usando a integração já existente internamente.

## Como testar os gestos

### Celular
- Abra uma foto de amostra com 2 ou 3 imagens. Arraste horizontalmente com um dedo para avançar e voltar.
- Faça pinça com dois dedos para ampliar/reduzir; arraste com a imagem ampliada para movê-la.
- Na página de Modelos ou Amostras, deslize horizontalmente sobre uma área livre do conteúdo para trocar de área. A rolagem vertical continua normal.
- Use a barra inferior para abrir Modelos, Amostras, Cortes, OCs e Mais.

### Notebook / PC
- Abra uma foto: use Ctrl + roda do touchpad/mouse para zoom, duplo clique ou botões +/−.
- Em notebook touchscreen, use pinça com dois dedos.
- Use o gesto horizontal do touchpad sobre a área livre do conteúdo para trocar de seção.
- No desktop, use o menu lateral para navegação direta.

## Observação

A galeria com fotos secundárias é a galeria das Amostras, que mantém a primeira imagem como principal e as demais na pilha/galeria da própria OC. O catálogo de modelos mantém a regra atual de uma foto principal por modelo.
