# Pacote É Mato — V26 — otimização, previsão e seleção de paradas múltiplas

## Problemas observados

1. Uma rota com 101 paradas aparecia com cerca de 20,0 km no Pacote É Mato enquanto o planejador de referência apresentava cerca de 18,7 km.
2. Mesmo configurando 3 minutos por parada nos dois sistemas, a previsão de término do Pacote É Mato ficava muito mais tarde.
3. Em endereços com mais de uma parada/pacote, selecionar pela lista uma parada posterior (ex.: 82) mantinha no mapa o número da primeira parada física do grupo (ex.: 81).

## Causas encontradas

### Previsão inflada

O frontend enviava `traffic: approximated` tanto para o Route Planner quanto para o Routing API. Em uma rota urbana de São Paulo, essa modalidade pode elevar bastante o tempo de viagem estimado. O tempo de atendimento configurado era somado ao tempo rodoviário, fazendo o término ficar muito distante quando o tráfego aproximado vinha alto.

### Duas fontes de métricas

A ordem era decidida pelo Route Planner, mas depois distância e duração exibidas eram substituídas pelos valores de uma segunda chamada ao Routing API, usada para obter geometria e instruções. Para rotas grandes essa segunda chamada é segmentada. Assim a sequência era de um cálculo, enquanto a distância/tempo mostrados podiam vir de outro cálculo.

### Marcador de endereço múltiplo

O mapa agrupava corretamente paradas no mesmo ponto físico, porém sempre usava a primeira parada ativa do grupo como representante visual. Por isso, ao selecionar a parada 82 de um endereço compartilhado com a 81, o marcador continuava escrito 81.

## Correções V26

- O planejamento e o cálculo rodoviário passam a solicitar `traffic: free_flow` para produzir uma estimativa operacional estável, sem inflar a previsão com congestionamento histórico/aproximado.
- Após a otimização, distância, tempo de direção e tempo total mostrados no planejamento usam como fonte autoritativa o próprio Route Planner que escolheu a ordem.
- A chamada `/route` continua existindo para geometria e instruções detalhadas, mas suas métricas ficam registradas separadamente e não substituem silenciosamente as métricas do otimizador.
- `total_time` do Route Planner é usado como tempo total quando disponível. A diferença `total_time - time` representa o atendimento considerado pelo planejador, respeitando os 3 minutos configurados por parada.
- Em grupos físicos com múltiplas paradas, a parada selecionada na lista passa a ser o representante visual do marcador. Selecionar 82 troca o rótulo do grupo para 82; selecionar 81 volta para 81. As coordenadas não são alteradas.
- A mesma regra foi aplicada ao mapa de planejamento e ao mapa de navegação.

## Arquivos alterados

- `js/roteirizacao/servico-rota.js`
- `js/roteirizacao/roteirizacao.js`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `index.html` (cache V26)

## Testes executados

- `node --check` nos JavaScripts alterados e em todos os JavaScripts do projeto.
- Verificação de que `servico-rota.js` não envia mais `traffic: approximated` nas chamadas de planejamento/rota.
- Verificação do cálculo de atendimento com exemplo de 101 paradas x 180 s = 18.180 s (303 min).
- Simulação lógica de grupo físico contendo paradas 81 e 82: com 82 selecionada, o representante escolhido é 82; sem seleção, o representante continua sendo 81.
- Verificação de IDs HTML duplicados.
- Verificação da integridade do ZIP final.

## Testes que dependem do aparelho/serviço real

- Distância final real retornada pelo Route Planner para o XLSX do usuário.
- Comparação da nova sequência/duração contra rota/rota.
- Comportamento visual ao tocar nas paradas 81, 82, 83 etc. no aparelho.
- Reotimização com GPS real e serviço publicado.

A V26 não tenta reproduzir artificialmente o número de outro provedor. O objetivo é garantir que a ordem e as métricas exibidas pelo Pacote É Mato sejam internamente consistentes e venham do mesmo otimizador.
