# MB REFERENCIAS 4.15.2 — gestos e zoom corrigidos

## O que mudou

1. **Fotos:** deslize com um dedo para a esquerda/direita para avançar/voltar na galeria.
2. **Tela touchscreen:** use dois dedos em movimento de pinça para ampliar/reduzir; com a foto ampliada, arraste para reposicionar.
3. **Touchpad do notebook:** use o gesto de pinça para zoom (o navegador envia Ctrl/Cmd + roda) e deslize horizontalmente para trocar fotos.
4. **Abas/áreas:** deslize horizontalmente na área principal para alternar entre as seções liberadas para seu perfil. A animação de transição foi mantida.
5. **Touchpad na página:** deslize horizontalmente para alternar áreas, com proteção contra disparos repetidos durante a inércia do touchpad.

## Publicação

1. Extraia o ZIP.
2. Envie o conteúdo da pasta `Mb-Dryfit-main` para a raiz do repositório, substituindo os arquivos da versão anterior.
3. Faça commit e push na branch `main`.
4. Confira o GitHub Actions.

Não publique regras novas e não apague coleções ou documentos. Esta versão altera apenas interações da interface.

## Como testar

- Abra uma amostra que tenha 2 ou 3 fotos, clique na imagem e deslize com um dedo para os lados.
- Em tela touch, coloque dois dedos sobre a foto e aproxime/afaste.
- No touchpad, faça o gesto de pinça sobre a foto aberta.
- Feche a foto e deslize horizontalmente na tela principal para trocar de área.
- No touchpad, faça um deslize horizontal sobre uma área vazia da tela principal.
- Confirme que rolagem vertical, campos de pesquisa, botões e tabelas continuam funcionando normalmente.
