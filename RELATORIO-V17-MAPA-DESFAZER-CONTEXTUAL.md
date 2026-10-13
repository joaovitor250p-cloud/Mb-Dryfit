# Pacote É Mato — V17 — Mapa base e Desfazer contextual

## Objetivo
Corrigir a tela branca persistente do mapa e devolver a função Desfazer no comportamento solicitado: a rota avança automaticamente após Entregue/Não entregue, mas o botão Desfazer aparece somente quando o motorista volta ao card de uma parada já finalizada.

## Mapa
A V16 ainda dependia de um estilo vetorial remoto como base principal. Na V17 o carregamento principal foi alterado para um estilo raster fornecido diretamente ao MapLibre, sem depender do download prévio de um JSON de estilo vetorial nem de fontes para exibir as ruas.

- base principal: CARTO Light raster em múltiplos hosts;
- base de contingência: OpenStreetMap raster;
- fade do raster desativado para reduzir tela vazia durante troca/carregamento;
- mapa de planejamento e mapa de navegação usam a mesma estratégia;
- camadas textuais que exigem `glyphs` não são criadas em estilo raster puro;
- removidos `contain: paint`, `isolation: isolate` e `transform-style: preserve-3d` do canvas/contêiner, pois são desnecessários e podem causar problemas de composição em WebView móvel;
- a rota, paradas e estados continuam sendo camadas do MapLibre sobre a base geográfica.

## Desfazer
- Entregue/Não entregue continua salvando e avançando automaticamente para a próxima parada pendente.
- Nenhuma barra de Desfazer acompanha a próxima entrega.
- Ao navegar de volta para um card já Entregue ou Não entregue, aparece um botão dentro daquele card:
  - `Desfazer entrega`; ou
  - `Desfazer não entrega`.
- Ao desfazer, somente aquela parada retorna para `pendente`, os timestamps/motivo de finalização são limpos e a rota ativa é persistida novamente.

## Arquivos alterados
- `js/mapa/config.js`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `css/mapa.css`
- `css/theme-v15.css`
- `index.html`

## Testes executados
- `node --check` em todos os arquivos JavaScript: aprovado.
- validação estrutural do `mapStyle`: aprovado; base principal raster com quatro hosts e fallback OSM raster.
- verificação de que planejamento e navegação usam `mapStyle`: aprovado.
- verificação de que existe apenas um `navUndoStatusBtn`: aprovado.
- verificação do handler de Desfazer e do binding do botão: aprovado.
- verificação de exibição condicional somente para parada finalizada: aprovado.
- verificação de que o avanço automático após finalização continua presente: aprovado.
- verificação de remoção do `transform-style: preserve-3d`: aprovado.
- cache-bust atualizado para `v17`: aprovado.

## Validação ainda necessária no aparelho
O ambiente de montagem não possui acesso DNS aos provedores públicos de tiles, então o carregamento visual real de CARTO/OSM não pôde ser confirmado aqui. É necessário validar no navegador/celular conectado à internet. A mudança foi feita justamente para eliminar a dependência do estilo vetorial que vinha produzindo a tela branca e para ter uma segunda base independente de contingência.
