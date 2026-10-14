# Pacote É Mato — V28 — Linha da rota limpa por progresso

## Objetivo

A V27 já diferenciava os marcadores de status com ✓ para entregue e × para não entregue, porém a linha da rota também era colorida por cada parada finalizada. Em rotas longas isso gerava muitos trechos verdes/vermelhos sobrepostos e deixava o mapa visualmente confuso.

A V28 mantém os símbolos dos marcadores e muda apenas a leitura visual do traçado.

## Nova regra visual da rota

- **Trecho já concluído/que ficou para trás:** cinza.
- **Próximo trecho ativo:** verde escuro, mais forte e mais espesso.
- **Restante da rota futura:** verde mais leve e discreto.
- **Trecho realmente percorrido pelo GPS:** cinza por cima da rota, para o caminho atrás do motorista não competir com o próximo trecho.
- **Entregue:** marcador continua verde com ✓.
- **Não entregue:** marcador continua vermelho com ×.

O status entregue/não entregue continua sendo mostrado nos marcadores. A linha deixa de ficar vermelha/verde para cada parada individual, reduzindo bastante a poluição visual.

## Como o histórico é calculado

O sistema usa a geometria-base capturada quando a rota foi otimizada para manter o trecho histórico visível mesmo depois de recalcular a rota das paradas restantes.

Somente as paradas finalizadas de forma consecutiva a partir do início da sequência tornam o caminho anterior cinza. Se uma parada futura for marcada manualmente fora de ordem, seu marcador muda de status, mas não é criado um trecho isolado colorido no meio da rota.

## Próximo trecho

O próximo trecho destacado usa preferencialmente a geometria atual recalculada da rota. Isso permite que o destaque acompanhe um recálculo feito a partir da localização real do motorista.

## Arquivos alterados

- `js/mapa/marcadores.js`
  - substituição da segmentação por status individual por segmentação operacional `passado` + `proxima`;
  - histórico contínuo cinza;
  - próximo trecho usando geometria atual quando disponível.
- `js/mapa/mapa.js`
  - rota futura mais discreta;
  - passado cinza;
  - próximo trecho verde forte.
- `js/navegacao/navegacao.js`
  - mesma regra visual no modo de navegação;
  - progresso real do GPS passou a cinza;
  - ordem das camadas alterada para o caminho percorrido ficar visualmente por cima.
- `index.html`
  - cache atualizado para V28.

## Testes executados

- `node --check` em todos os arquivos JavaScript: aprovado.
- Simulação de uma rota com cinco paradas:
  - parada 1 entregue;
  - parada 2 não entregue;
  - parada 3 pendente;
  - resultado: um único trecho `passado` até a parada 2 e um único trecho `proxima` até a parada 3.
- Simulação após recálculo da geometria:
  - histórico permaneceu baseado na rota original;
  - próximo trecho passou a usar a geometria atual recalculada.
- Marcadores de status não foram alterados; ✓ e × permanecem na mesma implementação da V27.

## Validação manual ainda necessária

A aparência final precisa ser validada no celular durante uma rota real, principalmente após várias entregas seguidas, porque a renderização depende do MapLibre/WebView do aparelho e do recálculo real do serviço de rota.
