# Pacote É Mato — V19 — Traçado visual e previsão de término

## Motivo
A V18 apresentava dois pontos visíveis no teste real:

1. Ao afastar o mapa, o traçado verde ficava visualmente serrilhado/ruidoso.
2. A previsão de término ficava muito acima da referência do Circuit.

## Diagnóstico da previsão
O aplicativo carregava por padrão `180 segundos` (3 minutos) de atendimento em **cada parada**.
Em uma rota de 30 paradas isso adicionava automaticamente 5.400 segundos, ou **90 minutos**, mesmo quando o usuário nunca havia configurado esse tempo.

A duração rodoviária retornada pelo serviço já era próxima da referência. Por isso a V19:

- muda o padrão para 0 min por parada;
- considera tempo de atendimento somente depois que o usuário editar explicitamente esse campo nas Configurações;
- migra configurações antigas que tinham os 3 min automáticos para 0;
- ao restaurar uma rota ativa, recalcula o horário de término a partir da duração rodoviária atual;
- ao iniciar a rota, ancora novamente a previsão no horário real de início.

Teste de normalização executado com 30 paradas:
- configuração legada: 180 s/parada;
- acréscimo antigo: 5.400 s = 90 min;
- após a migração: 0 s automáticos;
- duração rodoviária simulada: 9.600 s;
- duração total V19: 9.600 s = 160 min.

## Distância
Uma diferença de aproximadamente 0,1 km entre dois motores de rota (ex.: 23,4 km x 23,3 km) é compatível com diferenças de snapping, malha viária e arredondamento. A V19 não adultera a distância para forçar igualdade com outro aplicativo.

## Traçado verde
O dado real da rota não é modificado. A correção é somente na representação visual:

- simplificação Douglas-Peucker dinâmica por nível de zoom;
- tolerância pequena quando o mapa está próximo;
- tolerância maior somente quando a rota inteira é vista de longe;
- GeoJSON source com simplificação visual nativa do MapLibre;
- espessura da linha reduzida progressivamente em zoom distante;
- redesenho da representação visual no `zoomend`.

A distância, ordem das paradas, geometria armazenada e instruções de navegação continuam usando os dados originais do serviço de rota.

## Arquivos alterados
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `js/configuracoes/configuracoes.js`
- `js/core/rota-store.js`
- `js/state.js`
- `js/roteirizacao/roteirizacao.js`
- `js/bipagem/operacoes-pacotes.js`
- `index.html`
- `README.md`

## Testes executados
- `node --check` em todos os JavaScripts do projeto: aprovado.
- `node --check` no Worker Cloudflare: aprovado.
- Normalização de rota legada com 30 paradas e 3 min automáticos: aprovado; migrou para 0 min automáticos.
- Recalculo da duração da simulação: 160 min de direção permaneceu 160 min, sem os 90 min extras.
- Auditoria estática do source da rota: `tolerance`, `buffer`, `maxzoom` e `lineMetrics` aplicados apenas à representação geográfica.
- Auditoria de cache: assets alterados para V19.

## Testes que ainda dependem do aparelho
- aparência exata da linha verde no mesmo celular e nos mesmos níveis de zoom dos prints;
- comparação de término com uma rota real calculada pelo Circuit no mesmo instante;
- comportamento visual durante pan/zoom contínuo no WebView/PWA;
- tráfego real retornado pelo provedor de roteamento.
