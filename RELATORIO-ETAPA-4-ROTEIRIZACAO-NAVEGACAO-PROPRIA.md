# Relatório — ETAPA 4 | Roteirização e Navegação Própria

## Base utilizada

Base obrigatória: `Pacote-Em-Mato-ETAPA-4-UI-ROTA-CORRIGIDA.zip`.

Nenhuma versão intermediária foi usada como base. O Worker Cloudflare existente não foi publicado nem alterado.

## 1. Auditoria do projeto

### Responsabilidades encontradas

- `js/importacao/xlsx.js`: leitura XLSX/XLS/CSV, detecção de cabeçalho, mapeamento e criação de paradas.
- `js/mapa/geocodificacao.js`: geocodificação, validação de confiança e coordenadas, cache e estados de erro.
- `js/mapa/mapa.js`: MapLibre, paradas, ponto inicial, motorista, seleção mapa/lista e linha da rota.
- `js/roteirizacao/servico-rota.js`: cliente seguro para otimização e geometria rodoviária.
- `js/roteirizacao/roteirizacao.js`: fluxo de planejamento, otimização, métricas, persistência da Rota Ativa.
- `js/mapa/localizacao-atual.js`: localização one-shot na Roteirização, sem confundir com ponto inicial.
- `js/navegacao/navegacao.js`: navegação interna, GPS ativo, progresso, voz, recálculo e fluxo de entrega.
- `js/core/rota-store.js`: fonte persistente da Rota Ativa e estados das paradas.
- `js/bipagem/rota-ativa-bridge.js`: adaptação da Rota Ativa para o módulo legado de Bipagem.
- `cloudflare/geocodificacao-worker.js`: `/geocode`, `/optimize`, `/route`, `/health`.

### Worker auditado

O Worker existente já implementa quatro rotas:

- `POST /geocode`: Geoapify Forward Geocoding.
- `POST /optimize`: Geoapify Route Planner.
- `POST /route`: Geoapify Routing API com `lang=pt-BR` e `details=instruction_details`.
- `GET /health`: informa se o Worker e o provedor estão configurados.

O frontend não contém a chave Geoapify. O Worker usa `env.GEOAPIFY_API_KEY`.

## 2. Causa do erro `Cannot read properties of undefined (reading 'lng')`

Na base, `renderizarPartida()` criava o marcador de partida nesta ordem:

```text
new Marker(...)
  -> addTo(mapa)
  -> setLngLat(...)
```

Ao anexar um `Marker` ainda sem `_lngLat`, o fluxo interno do MapLibre pode tentar ler `.lng` da posição inexistente.

O erro foi reproduzido em teste controlado com comportamento equivalente ao update interno do Marker:

```text
BASE_LNG_REPRODUCED Cannot read properties of undefined (reading 'lng')
```

A versão nova não usa HTML Marker para o ponto inicial: usa GeoJSON, e só cria uma feature quando `lat/lon` são válidos.

## 3. Causa dos marcadores aparentarem mover/atrasar

A base usava um HTML `Marker` por parada. O próprio MapLibre posiciona esses elementos através de CSS `transform`. Ao mesmo tempo, a classe `.pemato-stop-marker` da base tinha:

```css
transition: transform .16s ease
```

Durante pan/zoom, alterações de `transform` usadas pelo motor do mapa eram animadas pelo CSS da interface. Isso produz atraso visual e a sensação de que os marcadores acompanham a tela ou mudam de posição.

### Correção

As paradas agora são uma `GeoJSONSource` com camadas nativas:

- círculo da parada;
- anel da selecionada;
- número da ordem em camada `symbol`.

Não há um elemento DOM independente por parada. A geometria permanece `[longitude, latitude]` e o MapLibre projeta os pontos diretamente no mapa.

A fonte é atualizada apenas quando os dados/estados mudam; mover ou ampliar o mapa não recalcula coordenadas nem recria marcadores.

## 4. Marcadores

Estados implementados:

- pendente: cinza/azulado;
- parcial: âmbar;
- concluída/entregue: verde;
- não entregue: vermelho;
- selecionada: anel branco discreto.

O tamanho varia suavemente por zoom e é menor que os elementos HTML anteriores.

Paradas com coordenadas `null`, `undefined`, vazias, `NaN` ou fora dos limites geográficos não entram na fonte GeoJSON.

## 5. Controles do mapa

Grupo vertical:

1. Minha localização.
2. Enquadrar rota.
3. Aproximar.
4. Afastar.

A ação de enquadrar apenas altera a câmera do mapa; ela não modifica o ponto inicial.

## 6. Otimização real

`Otimizar rota` permanece visível na área principal. `Importar XLSX` permanece visível e também continua no menu de três pontos.

Fluxo implementado:

1. validar ponto inicial;
2. validar coordenadas de todas as paradas pendentes;
3. enviar ponto inicial, veículo, duração por parada, retorno ao início e paradas para `/optimize`;
4. validar se todas as paradas retornaram e se existem não atribuídas;
5. aplicar a ordem retornada;
6. chamar `/route` com a nova ordem;
7. aceitar somente geometria `LineString` ou `MultiLineString` válida;
8. armazenar distância, duração de direção, legs e instruções;
9. somar o tempo de serviço exatamente uma vez ao tempo de direção;
10. calcular previsão de término;
11. salvar a Rota Ativa.

Nenhum fallback de distância em linha reta é usado como suposta otimização.

Se o Worker não estiver configurado, a operação falha com `WORKER_NAO_CONFIGURADO` e a rota original permanece preservada.

## 7. Linha da rota

A camada planejada usa somente a geometria rodoviária devolvida por `/route`.

Aceita:

- `LineString`;
- `MultiLineString`.

Na navegação, a linha planejada é verde e o progresso percorrido é uma camada azul separada. O GPS não altera as coordenadas das paradas.

## 8. Métricas

Painel compacto da Roteirização:

- paradas;
- concluídas;
- pendentes;
- distância;
- direção;
- atendimento;
- total;
- término.

Sem cálculo rodoviário válido, distância/tempo/término ficam em `Aguardando cálculo`.

Quando existe rota real:

```text
tempo total = tempo de direção retornado por /route + (paradas pendentes × tempo de serviço)
```

`totalTime` do Route Planner é armazenado separadamente para diagnóstico e não é somado novamente ao total exibido.

## 9. Navegação própria

A navegação interna foi reorganizada para uso operacional:

- mapa predominante;
- linha planejada;
- progresso percorrido em camada separada;
- ponto GPS do motorista;
- próxima parada;
- quantidade de pacotes;
- próxima manobra;
- distância até a manobra;
- rua da manobra quando fornecida;
- distância/ETA até próxima parada;
- voz ativável/desativável;
- botão para retomar acompanhamento do GPS;
- recálculo manual;
- Waze e Google Maps preservados como alternativas;
- Entregue e Não entregue.

### GPS

Usa `watchPosition()` somente enquanto o módulo de navegação está ativo. Ao sair da tela, o watcher é interrompido.

O motorista pode mover o mapa manualmente; nesse caso o acompanhamento automático é desativado até tocar no botão de seguir posição.

### Voz

As instruções são as etapas reais retornadas pela Routing API. A navegação usa `from_index/to_index` sobre a geometria para associar a posição GPS à manobra seguinte.

Limiar de anúncios:

- aproximadamente 400 m;
- aproximadamente 120 m;
- aproximadamente 35 m;
- aproximação da parada;
- chegada à parada.

Uma chave por instrução/limiar impede repetição contínua.

### Desvio de rota

Depois de atualizações consecutivas significativamente afastadas da geometria, o sistema marca `foraDaRota`. Quando `/route` está configurado, pode recalcular o caminho da posição atual pelas paradas pendentes, mantendo a ordem; se falhar, a interface informa a falha e não cria instruções fictícias.

## 10. Fluxo Entregue / Não entregue

### Entregue

- status `entregue`;
- timestamp `entregueEm`;
- atualização dos contadores;
- persistência da Rota Ativa;
- avanço para a próxima parada pendente.

### Não entregue

- status `nao_entregue`;
- motivo;
- observação;
- timestamp `naoEntregueEm`;
- persistência;
- avanço para a próxima pendente.

Cliques repetidos numa parada já tratada são ignorados.

Quando não há mais paradas pendentes, a rota passa para `aguardando_finalizacao` e abre um resumo. Somente o botão Finalizar conclui e limpa a Rota Ativa; os dados salvos permanecem disponíveis para histórico.

Bipar um pacote não é tratado por este módulo como sinônimo de entrega.

## 11. Preservação do núcleo

Arquivos comparados por SHA-256 e mantidos byte a byte iguais à base:

- `js/app.js`
- `js/bipagem/rota-ativa-bridge.js`
- `js/suporte.js`
- `cloudflare/geocodificacao-worker.js`
- `cloudflare/wrangler.toml`
- `manifest.json`
- `politica-privacidade.html`

Portanto, o Worker não foi modificado e o núcleo legado de login/Firebase, PDF, agrupamento, scanner e Bipagem não foi reescrito.

## 12. Arquivos criados

- `js/mapa/localizacao-atual.js`
- `RELATORIO-ETAPA-4-ROTEIRIZACAO-NAVEGACAO-PROPRIA.md`

## 13. Arquivos modificados

- `README.md`
- `index.html`
- `css/navegacao.css`
- `css/roteirizacao.css`
- `js/state.js`
- `js/core/rota-store.js`
- `js/mapa/config.js`
- `js/mapa/mapa.js`
- `js/roteirizacao/servico-rota.js`
- `js/roteirizacao/roteirizacao.js`
- `js/navegacao/navegacao.js`
- `js/ui/app-shell.js`

Nenhum arquivo do Worker foi modificado.

## 14. Testes executados

### Testes reais locais, sem mock do dado principal

1. **XLSX real com 60 paradas** produzido como arquivo `.xlsx` e lido pelo importador real:
   - cabeçalho depois de linhas introdutórias;
   - 60 paradas;
   - números, cidade, UF, complementos, pacotes e observações.
   - Resultado: `XLSX60_REAL_OK true`.

2. XLSX vazio e planilha sem coluna reconhecida:
   - vazio gera erro legível;
   - formato desconhecido exige mapeamento em vez de fingir importação.
   - Resultado: `XLSX_ERROR_TEST_OK true`.

3. Verificação sintática de todos os JavaScripts do projeto e Worker: aprovada.

4. HTML:
   - 347 IDs;
   - zero IDs duplicados;
   - zero referências locais ausentes.

5. Integridade SHA-256 do núcleo citado acima: aprovada.

### Testes unitários / ambiente controlado

- reprodução do erro `.lng` da base: `BASE_LNG_REPRODUCED`;
- fonte GeoJSON com 80 paradas + 1 coordenada inválida: 80 features válidas, sem duplicação;
- pan/zoom não altera coordenadas das 80 paradas;
- seleção mapa → lista e lista → mapa;
- `MultiLineString` aceito e mantido;
- controles Minha localização / enquadrar / zoom + / zoom -;
- localização automática: permissão concedida é reutilizada durante a janela de frescor; permissão negada não dispara GPS;
- geocodificação sem Worker: lista preservada, coordenadas permanecem nulas, status `nao_configurado`;
- normalização de Rota Ativa preserva `nao_entregue`, timestamps e estado `aguardando_finalizacao`;
- ponte Rota Ativa → Bipagem: 2 grupos, 3 pacotes e ordem otimizada preservados.

### Testes com mocks explicitamente identificados

1. Cliente de roteirização com mock de `/health`, `/optimize` e `/route`:
   - modo moto -> `motorcycle`;
   - retorno ao início enviado;
   - tempo de parada enviado;
   - ordem `B,A` aplicada;
   - geometria `LineString` validada;
   - instrução com índices extraída.

2. Worker com mock do provedor Geoapify:
   - `/optimize` monta Route Planner corretamente;
   - `/route` solicita `lang=pt-BR` e `details=instruction_details`;
   - resposta sanitizada preserva geometria e instruções.

3. Navegação com GPS e voz simulados:
   - anúncio de manobra por distância;
   - Entregue;
   - Não entregue com motivo/observação;
   - avanço para próxima parada;
   - tela de conclusão sem finalizar automaticamente;
   - perda/permissão negada do GPS;
   - baixa precisão indicada;
   - detecção de fora da rota;
   - voz muda impede novos anúncios;
   - linha planejada e progresso mantidos em fontes diferentes.

### Testes de integração real NÃO executados

Não foi possível executar uma chamada real à Geoapify/Worker porque o ZIP-base não contém uma URL de Worker de roteirização configurada nem uma credencial de produção, e a instrução desta etapa proíbe publicar/alterar o Worker.

Também não foi possível validar em campo:

- GPS de um celular Android durante deslocamento real;
- áudio de navegação em ambiente veicular;
- comportamento com tela bloqueada/segundo plano;
- recálculo real após desvio em vias públicas;
- tiles externos do mapa no navegador de teste deste ambiente (a rede do container não resolveu o host externo).

Esses itens não são declarados como aprovados em produção.

## 15. Limitações web/PWA

- `watchPosition()` pode ser suspenso quando o navegador coloca a página em segundo plano.
- áudio por `speechSynthesis` depende das vozes e políticas do aparelho/navegador.
- alguns dispositivos exigem interação do usuário antes de liberar áudio.
- Android/iOS podem limitar GPS e execução contínua em background.
- esta PWA não deve ser descrita como equivalente a um navegador GPS nativo quando a tela está bloqueada ou o navegador suspenso.

## 16. Como testar a versão publicada

1. publicar toda a pasta mantendo a estrutura;
2. entrar normalmente pela autenticação existente;
3. abrir Roteirização;
4. importar uma XLSX real;
5. geocodificar as paradas com o Worker já autorizado, se houver;
6. verificar os marcadores durante pan e zoom;
7. conferir que Importar XLSX aparece na área principal e no menu de ações;
8. definir ponto inicial, veículo e tempo de serviço;
9. clicar em Otimizar rota;
10. conferir a ordem e se todas as paradas foram atribuídas;
11. conferir a linha sobre as ruas, distância e duração;
12. iniciar Navegação Pacote É Mato;
13. manter a página em primeiro plano durante o teste de campo;
14. confirmar voz, manobras, Entregue/Não entregue e avanço automático;
15. verificar a Rota Ativa na Bipagem e o histórico após a operação.

Se o Worker não estiver configurado, o aplicativo deve informar a dependência em vez de simular geocodificação, otimização ou rota rodoviária.
