# Pacote É Mato — Histórico de Desenvolvimento

Este arquivo consolida os relatórios técnicos das versões anteriores para manter o projeto organizado e reduzir a quantidade de arquivos no GitHub.

---

## RELATORIO-AJUSTE-V11-MARCADOR-rota-VERDE-ESTAVEL.md

# Ajuste V11 — marcador verde estável

Base: V8.

- Removido o sistema HTML da V10.
- Marcadores voltaram a ser símbolos nativos do MapLibre.
- O número e o multiplicador são desenhados dentro da própria imagem do marcador, garantindo centralização.
- Parada simples mostra apenas o número.
- Parada múltipla mostra número + quantidade (ex.: 38 3x).
- Marcador normal: branco, borda verde e número verde.
- Marcador selecionado/atual: verde preenchido, borda branca e número branco.
- Colisão é gerenciada pelo MapLibre; paradas iniciais têm prioridade.
- A fonte de paradas na navegação não é mais reescrita a cada atualização do GPS quando nada mudou, reduzindo tremulação.
- O sistema da V9/V10 foi descartado.

---

## RELATORIO-AJUSTE-V12-MARCADORES-DEFINITIVOS.md

# Pacote É Mato — V12 — marcadores definitivos

Base utilizada: V11, preservando importação XLSX, agrupamento/bipagem, otimização, geocodificação, navegação, Waze/Google Maps, estados de entrega, persistência, histórico, Firebase/login e demais módulos.

## Arquivos alterados
- `js/mapa/marcadores.js` — novo módulo compartilhado para desenho dos marcadores.
- `js/mapa/mapa.js` — ciclo de vida dos marcadores no planejamento, clustering e seleção.
- `js/navegacao/navegacao.js` — mesma implementação na navegação, sem recriar marcadores como elementos HTML.
- `css/mapa.css` — isolamento do canvas/contêiner do mapa para impedir que símbolos atravessem painéis.
- `index.html` — inclusão do módulo compartilhado e cache-busting V12.

## Correções aplicadas
- Marcador em cápsula horizontal inspirado na referência enviada: fundo `#0f172a`, borda branca fina, número centralizado e multiplicador menor somente quando `quantidade > 1`.
- Parada selecionada usa verde `#059669`, sem crescimento exagerado.
- Estados concluído, parcial e não entregue preservam número/multiplicador, com variação discreta de fundo.
- Marcadores continuam sendo símbolos geográficos nativos do MapLibre; não há `position: fixed`, `maplibregl.Marker` HTML nem deslocamento permanente de latitude/longitude.
- Uma única fonte GeoJSON é atualizada com `setData`; camadas são criadas uma vez e reutilizadas.
- Identificador permanente da parada continua sendo usado na feature; ordem e multiplicador são propriedades independentes.
- Agrupamento visual (`cluster`) foi habilitado para zoom distante. Tocar no agrupamento aproxima o mapa; as coordenadas reais não são alteradas.
- Planejamento: cluster até zoom 14. Navegação: cluster até zoom 13, para priorizar a visualização dos números durante a rota.
- Marcadores de paradas simples/múltiplas e selecionadas usam o mesmo módulo compartilhado, evitando divergência entre planejamento e navegação.
- Clique/toque em marcador na navegação passa a selecionar o cartão correspondente sem criar outro marcador nem alterar status/coordenada.
- O contêiner do mapa mantém `overflow: hidden`/`contain: paint`, impedindo que símbolos escapem visualmente para o painel inferior.
- Mantido o ajuste automático do mapa para a região real das paradas após importação/geocodificação.
- Mantida a proteção visual do traçado contra saltos anormais já existente na base.

## Testes executados neste ambiente
1. `node --check` em todos os arquivos JavaScript do projeto: aprovado.
2. Teste unitário do módulo de marcadores com 30 paradas: 30 IDs únicos, sem duplicar imagens em rerender, `1x` não é desenhado, `2x` e `3x` são desenhados corretamente.
3. Teste de tamanho: marcadores simples respeitaram 28–40 px; múltiplos 42–56 px; parada `123` e `123 3x` permaneceram dentro dos limites.
4. Teste de integração simulado do mapa de planejamento com 30 paradas: uma feature por parada, clustering ativo, nenhuma camada duplicada após seleção/rerender, reordenação atualizou os números sem duplicar features; `2x` e `3x` preservados.
5. Teste de integração simulado da navegação com 30 paradas: 30 features, clustering ativo, multiplicadores corretos, sem duplicação de camadas e apenas um update inicial da fonte no cenário testado.
6. Auditoria estática: nenhum uso de `new maplibregl.Marker`/marcador HTML permanece nos módulos do projeto.

## Validação que ainda depende de navegador/celular real
O ambiente de teste não dispõe do MapLibre 5.24 carregado em um navegador com acesso ao CDN/mapa base, portanto ainda precisam de validação visual em aparelho real: pan/zoom com tiles reais, painel sendo arrastado, retorno do Waze/Google Maps, toque em clusters e aparência em densidades de tela específicas. Esses itens não foram declarados como aprovados aqui.

---

## RELATORIO-AJUSTE-V7-MARCADORES.md

# Ajuste V7 – Marcadores do mapa

- Ícone e número passam a ser renderizados na mesma camada do MapLibre.
- O número fica centralizado dentro do corpo do marcador.
- Paradas simples usam marcador compacto branco com contorno verde.
- Paradas múltiplas usam versão mais larga e exibem `parada + quantidade x`.
- A parada atual/selecionada usa preenchimento verde.
- Colisão é tratada pelo MapLibre como uma única peça, evitando números sem fundo e sobreposição visual.
- Cache dos JS/CSS atualizado para v7.

---

## RELATORIO-AJUSTE-V8-MARCADORES-ROTA.md

# Ajuste V8 — marcadores e linha da rota

- Marcadores agora usam camadas estáticas separadas para simples, múltiplos e selecionado/atual, evitando incompatibilidade do MapLibre com expressão dinâmica de `icon-image`.
- Número centralizado dentro do balão verde/branco.
- Marcadores normais respeitam colisão do mapa para não se sobrepor; o atual fica sempre visível.
- Múltiplos exibem `número + Nx`; simples exibem somente o número.
- Geometria visual da rota remove coordenadas duplicadas e separa saltos anormais acima de 1,8 km, evitando linhas diagonais corrompidas no mapa.
- Cache dos arquivos atualizado para V8.

---

## RELATORIO-AJUSTES-09-10-2026-IMPORTACAO-BALOES-ETA.md

# Pacote É Mato — ajustes solicitados em 09/10/2026

Alterações aplicadas:

- Corrigido o modal **Importar outra planilha**, separando título e descrição de cada opção e eliminando sobreposição de texto.
- Mantido o balão escuro arredondado das paradas. Parada simples mostra apenas o número; parada com múltiplos pacotes mostra `número + quantidade x` (ex.: `38 3x`). A quantidade agora vem dos pacotes da própria parada.
- Simplificada a importação de XLSX: removida a etapa visual de associação manual de colunas. O reconhecimento de colunas continua automático e permanece apenas a seleção das informações que o motorista deseja ver, junto da pré-visualização.
- Removida a tela pesada de **Conferência da importação**. Após a seleção das informações, a rota é importada diretamente e o mapa é preparado.
- Reposicionado o cartão **Previsão de término** para não ficar sobre os controles de mapa/voz.
- Preservadas as rotinas existentes de rota, mapa, bipagem, GPS, voz, histórico e persistência.

---

## RELATORIO-AJUSTES-09-10-2026-V2-MAPA-MARCADORES-ETA.md

# Ajustes V2 — mapa, marcadores e ETA

- Removido o botão de engrenagem do mapa de planejamento; o menu principal de três traços permanece como acesso às opções.
- Removido o botão quadrado de enquadrar rota; mantidos localização atual e zoom.
- Marcadores de parada agora representam um ponto físico por balão.
- Parada com 1 pacote mostra somente o número da parada.
- Parada com múltiplos pacotes mostra número + quantidade (ex.: `38 3x`).
- Pacotes separados que pertencem ao mesmo ponto físico são somados visualmente em um único balão.
- Marcadores de pontos muito próximos recebem deslocamento visual para reduzir sobreposição.
- ETA da navegação foi reduzido para um cartão compacto mostrando somente o horário.
- O cartão grande de “Previsão de término” deixa de ocupar o mapa durante a navegação.

---

## RELATORIO-ATUALIZACAO-ESTADO-NAVEGACAO.md

# Pacote É Mato — atualização incremental da Etapa 4

## Base
Pacote-Em-Mato-ETAPA-4-SPX-OTIMIZACAO-NAVEGACAO-REFINADA.zip. Projeto existente preservado; nenhum deploy executado.

## Mudanças implementadas
- `js/navegacao/navegacao.js`: camada GeoJSON para **todas** as paradas com numeração persistente durante a navegação, cores para pendente/entregue/não entregue, sem duplicar o marcador da próxima parada; cartões anterior/próxima por toque e swipe, parada selecionada por ID, salvamento de seleção antes de abrir Waze/Google Maps, nota da entrega persistida, validação de motivo no ato de confirmar não entrega, retomada de GPS/mapa ao retornar à aba quando permitido.
- `index.html` e `css/navegacao.css`: três botões Navegar/Não entregue/Entregue, número da parada antes do endereço e controles anterior/próxima.
- `js/ui/app-shell.js`: guarda a seção atual no armazenamento local/de sessão, não reinicia módulo quando selecionado novamente, evita reinicialização em focus/visibilitychange e recupera seção em nova abertura quando o login existente permitir.
- `js/roteirizacao/roteirizacao.js` e `css/roteirizacao.css`: painel inferior em três alturas, preferência de altura em sessionStorage, inversão de ordem com restauração caso cálculo rodoviário falhe.
- `README.md`: documentação de retomada.

## Preservação
`js/app.js`, Firebase, login, importador XLSX SPX, PDF, bipagem, Worker e credenciais não foram alterados. A rota continua usando o RotaStore/IndexedDB existente. Nenhum serviço foi publicado.

## Verificações executadas
- `node --check` em todos os arquivos JS do projeto: aprovado.
- Integridade e referências de arquivos locais do ZIP: verificar no empacotamento.
- Tentativa de teste Chromium via HTTP local: **não executável** neste ambiente, bloqueio `ERR_BLOCKED_BY_ADMINISTRATOR` ao abrir localhost. Não há aprovação de teste visual nem de integração real com Geoapify.

## Pendências não implementadas / limites
- Desenhar polígonos para reorganização de grupos no mapa e desfazer operações **não foi implementado**; exige fluxo cartográfico e recálculo rodoviário integrado com testes.
- Não há garantia de continuidade de GPS/voz com tela bloqueada; depende de Android/PWA.
- Restauração após encerramento do processo depende da sessão Firebase e armazenamento mantidos; precisa de teste físico Android.
- Não foi possível confirmar funcionamento em campo de Waze/Google Maps nem geocodificação/otimização online.
- Imagem “519” e a segunda imagem não foram identificadas inequivocamente no projeto; não foram alteradas.

## Publicação
Extraia o ZIP, publique o conteúdo da pasta `Pacote-Em-Mato/` no mesmo repositório, preservando os subdiretórios. O ZIP não deve ser enviado como único arquivo ao GitHub Pages. Nenhuma configuração de Worker/Firebase foi alterada.

---

## RELATORIO-ATUALIZACAO-MAPA-IMPORTACAO-MULTIPLAS-ROTAS.md

# Pacote É Mato — atualização de mapa, importação e múltiplas rotas

Base utilizada: `Pacote-Em-Mato-ETAPA-4-REFINO-DESENHO-FLUXO-COMPLETO.zip`.

## Implementado nesta atualização

- Marcadores de paradas no mapa passaram a usar formato de balão/etiqueta com ponta.
- Paradas do mesmo **logradouro + número** exibem a multiplicidade (`2x`, `3x`, etc.). Paradas simples exibem somente o número.
- Apartamento, casa, bloco, sala, loja e complemento não alteram a chave usada para identificar múltiplos.
- No mapa/roteirização os pacotes continuam como paradas separadas. Na Bipagem, paradas com o mesmo logradouro + número são agrupadas em uma única parada física, mantendo todos os códigos dos pacotes.
- Para múltiplos no mesmo ponto foi adicionado fan-out visual dos balões sem alterar as coordenadas armazenadas da parada.
- A etapa de associação de colunas da planilha agora é sempre apresentada após a leitura, com pré-seleção automática quando o padrão é reconhecido.
- Campos destacados: AT ID, Sequence, Stop, SPX TN, Destination Address, Bairro, City, Zipcode/Postal code, Latitude e Longitude.
- Foi adicionada uma segunda seleção de quais informações da planilha devem aparecer ao chegar na parada.
- SPX TN permanece como código de pacote e agora é escrito explicitamente no PDF exportado.
- Ao importar uma nova planilha com uma rota já carregada, o usuário escolhe entre **Adicionar ao mesmo mapa** ou **Nova rota**.
- O menu de ações ganhou **Nova rota** e **Remover todas as rotas**. Remover do mapa não apaga o histórico já salvo.
- O menu de três pontos da navegação foi ampliado com as ações da rota (importar planilha, nova rota, adicionar parada, usar rota da Bipagem, validar endereços, otimizar, refinar, Bipagem, exportar PDF, Configurações, recalcular e sair).
- Depois que existe geometria calculada, os botões grandes Importar/Otimizar da base do painel são ocultados e o CTA principal passa a ser **Iniciar rota**.
- O painel Refinar, no mobile, abre sobre a tela e não exige rolar a página para baixo.
- A barra do modo desenho foi trazida para a frente no mobile, mantendo seleção por contorno, toque individual e desfazer.
- O resumo de tempo foi simplificado para duração restante e previsão de término.
- A previsão de término foi adicionada ao mapa de roteirização e ao mapa da navegação em cartões próprios, fora do banner de instrução de manobra.
- Foi adicionado atalho de Configurações no canto superior esquerdo do mapa de roteirização.
- Os controles do mapa foram reposicionados para reduzir sobreposição em telas pequenas.
- Waze e Google Maps agora priorizam esquemas nativos em Android/iOS (`waze://`, `google.navigation:`, `comgooglemaps://`) em vez de navegar o PWA para uma página web. Em desktop permanece fallback web.
- O estado da parada continua sendo persistido antes de abrir navegação externa.
- O indicador do motorista na navegação interna foi alterado para uma seta própria do Pacote É Mato e a navegação continua em 2D.
- O editor de parada ganhou um campo principal único para endereço + complemento/observação em uma linha. Os campos avançados antigos permanecem internamente para compatibilidade, mas ficam escondidos na experiência principal.
- A busca de endereço desse campo apresenta uma confirmação quando o serviço de geocodificação está disponível.

## Testes executados

1. `node --check` executado em todos os arquivos JavaScript do projeto: aprovado.
2. Validação estrutural do `index.html`: 410 IDs únicos, sem IDs duplicados.
3. Verificação de scripts e CSS locais referenciados pelo HTML: nenhum arquivo local faltando.
4. Importador testado com os dois XLSX reais fornecidos:
   - 07/10/2026: 10 paradas, 10 códigos de pacote, 10 coordenadas válidas, perfil SPX reconhecido.
   - 08/10/2026: 30 paradas, 30 códigos de pacote, 30 coordenadas válidas, perfil SPX reconhecido.
   - Cabeçalhos detectados nos dois: AT ID, Sequence, Stop, SPX TN, Destination Address, Bairro, City, Zipcode/Postal code, Latitude, Longitude.
5. Regra de Bipagem múltipla testada com exemplo sintético:
   - Rua Um, 229, Apto 33
   - Rua Um, 229, Apto 93
   - Rua Um, 229, Loja 2
   - Rua Um, 400
   Resultado: 2 paradas físicas na Bipagem; os três pacotes do número 229 foram agrupados juntos e o número 400 permaneceu separado.
6. Hash do Cloudflare Worker comparado com a base: arquivo do Worker permaneceu inalterado.

## Testes que ainda precisam de aparelho físico

Não foi declarado como aprovado o que não pôde ser executado no ambiente local:

- abertura real do Waze instalado no Android/iPhone;
- abertura real do Google Maps instalado;
- retorno pelo seletor de aplicativos recentes;
- GPS durante deslocamento real;
- voz durante navegação em campo;
- comportamento após o sistema operacional matar o PWA por falta de memória;
- avaliação visual final do fan-out dos balões com grande quantidade de paradas em um aparelho real.

Nenhum serviço externo foi publicado ou alterado nesta atualização.

---

## RELATORIO-CORRECAO-MAPLIBRE-V6.md

# Correção V6 — MapLibre / marcadores

- Removidas expressões dinâmicas de `icon-allow-overlap`, `icon-ignore-placement`, `text-allow-overlap` e `text-ignore-placement`, pois essas propriedades exigem booleanos na versão MapLibre utilizada.
- Mantidos os marcadores verdes e a lógica de parada simples/múltipla.
- Adicionado cache-busting `?v=20261009-v6` em CSS e JS locais para impedir que o celular/PWA reutilize a versão anterior em cache.

---

## RELATORIO-ETAPA-4-ROTEIRIZACAO-NAVEGACAO-PROPRIA.md

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

---

## RELATORIO-ETAPA-4-UI-ROTA-CORRIGIDA.md

# Relatório — ETAPA 4 UI ROTA CORRIGIDA

## Base utilizada

A correção foi feita sobre `Pacote-Em-Mato-ETAPA-4-FINAL-CORRIGIDA.zip`. O projeto não foi reconstruído do zero.

## Diagnóstico

### 1. Excesso de controles antes do mapa

A Roteirização possuía barra de preferências, duas fileiras de comandos, mensagem de importação e oito métricas antes da área principal. No celular isso empurrava o mapa para baixo e o deixava com aparência de painel técnico.

**Correção:** o mapa passou a ocupar toda a tela mobile; as paradas ficam em um bottom sheet e as ferramentas secundárias ficam em um menu de ações.

### 2. Mapa pequeno / pouco útil

O contêiner do mapa ficava dentro de um workspace com altura limitada após todos os componentes superiores. Em celulares, o sistema alternava mapa/lista como blocos separados em vez de manter o mapa como contexto principal.

**Correção:** no celular, `#mapaRoteirizacao` ocupa 100% do viewport da Roteirização. A lista sobrepõe o mapa como painel inferior recolhível. No desktop, o mapa permanece dominante à direita e a lista à esquerda.

### 3. Tela clara sem ruas quando o estilo não responde

O estilo principal é OpenFreeMap Liberty. A versão anterior exibia fallback apenas como mensagem após timeout, podendo deixar o usuário vendo uma área clara durante falha de carregamento do estilo.

**Correção:** o mapa tenta Liberty primeiro e possui fallback raster OSM sem chave. Se ambos falharem, mostra uma mensagem clara em vez de fingir que existe um mapa carregado.

### 4. Importação

O fluxo de importação já possuía correções da versão-base: leitor XLSX nativo, detecção de cabeçalho e mapeamento de colunas. Nesta revisão foram validados o botão, o file chooser, a leitura real do XLSX, a criação da rota e o mapeamento manual.

Quando não existe serviço externo, a importação agora termina de forma útil: cria as paradas e abre a lista para revisão. Ela não manda o usuário configurar Cloudflare nesta etapa.

### 5. Coordenadas inválidas

A base recebida já continha validações para impedir `null` de virar `0`. Esta revisão manteve essas validações e acrescentou proteção da geometria antes de desenhar a linha da rota.

Nenhuma coordenada é inventada.

## Interface implementada

### Mobile

- mapa ocupa todo o viewport;
- menu lateral aparece como botão flutuante circular;
- painel inferior recolhido: resumo da rota;
- painel inferior expandido: busca + lista de paradas;
- arraste/click no puxador abre e recolhe o painel;
- menu de ações abre como bottom sheet;
- ações dependentes de serviço externo são ocultadas quando o serviço não existe;
- ação principal muda conforme o estado da rota;
- parada selecionada aparece em ficha sobre o mapa sem misturar scanner/bipagem.

### Desktop

- painel de paradas com cerca de 370 px;
- mapa ocupa o restante da largura;
- lista permanece rolável;
- menu de ações centralizado;
- mapa e lista usam a mesma parada selecionada.

## Configurações

A interface para configurar/testar Cloudflare Worker foi removida desta revisão, conforme solicitado.

Continuam em Configurações:

- navegação preferida;
- veículo;
- tempo por parada;
- retorno ao início;
- ponto de partida;
- tema;
- voz.

Sem serviço externo, a validação de ponto de partida por endereço fica indisponível; a localização atual via GPS continua disponível quando o navegador/dispositivo autoriza.

Os arquivos `cloudflare/geocodificacao-worker.js` e `cloudflare/wrangler.toml` não foram modificados.

## Arquivos modificados

- `index.html`
- `README.md`
- `css/roteirizacao.css`
- `css/mapa.css`
- `js/ui/app-shell.js`
- `js/roteirizacao/roteirizacao.js`
- `js/mapa/config.js`
- `js/mapa/mapa.js`
- `js/configuracoes/configuracoes.js`

## Arquivos preservados byte a byte

- `js/app.js`
- `js/bipagem/rota-ativa-bridge.js`
- `js/suporte.js`
- `manifest.json`
- `politica-privacidade.html`
- `cloudflare/geocodificacao-worker.js`
- `cloudflare/wrangler.toml`

## Testes executados

### Sintaxe / estrutura

- todos os JS de `js/`: `node --check` aprovado;
- Worker: `node --check` aprovado, sem modificação;
- 325 IDs HTML inspecionados: nenhum duplicado;
- referências locais de scripts/CSS: nenhuma ausente;
- IDs essenciais da Roteirização: presentes.

### XLSX real

Planilha criada com:

- linha de título antes do cabeçalho;
- endereço;
- número;
- cidade;
- UF;
- complemento;
- pacote;
- observação.

Resultado:

- engine: `xlsx-nativo`;
- 2 linhas válidas -> 2 paradas;
- números incorporados aos endereços;
- códigos de pacote preservados.

### File chooser + evento de importação no navegador

Teste via Playwright usando Chromium e o HTML real da Roteirização com dependências de armazenamento/mapa isoladas:

- botão de importação abriu um `FileChooser` real;
- seleção do XLSX disparou o `change` do input;
- foram renderizados 2 cards de parada;
- métrica de paradas passou para 2;
- rota salva continha as mesmas 2 paradas/pacotes;
- painel inferior abriu automaticamente para revisão.

### Mapeamento de colunas

CSV com colunas genéricas (`Coluna A`, `Coluna B` etc.):

- nenhuma rota foi substituída antes da confirmação;
- modal de mapeamento abriu;
- associação manual Logradouro/Número/Cidade/Pacote funcionou;
- após confirmar: 1 parada criada com endereço e pacote corretos.

### Mapa/lista

- viewport mobile simulado em 412 × 915;
- workspace do mapa: 412 × 915;
- painel recolhido: 118 px de altura;
- painel expandido: aproximadamente 65% da tela;
- desktop 1365 × 768: lista 370 px / mapa 957 px;
- seleção na lista atualizou `appState.roteirizacao.paradaSelecionadaId` e chamou centralização;
- seleção originada do mapa marcou o mesmo card da lista;
- `latitude:null/longitude:null` retorna `false` na validação de coordenadas.

### Menu de ações / ausência do Worker

Com serviço externo ausente:

- Validar endereços oculto;
- Otimizar rota oculto;
- nota explicativa exibida;
- nenhuma otimização fictícia é executada;
- interface de URL/teste do Worker não existe em Configurações.

### Regressão do núcleo

SHA-256 comparado com o ZIP-base:

- `js/app.js`: preservado;
- `js/bipagem/rota-ativa-bridge.js`: preservado;
- `js/suporte.js`: preservado;
- `manifest.json`: preservado;
- `politica-privacidade.html`: preservado;
- Worker Cloudflare: preservado;
- `wrangler.toml`: preservado.

## Limitações reais de teste

O Chromium do ambiente bloqueia navegação para `localhost`/`file://` por política administrativa. Para contornar somente os testes de layout/eventos, foi utilizado `page.set_content()` do Playwright com o HTML/CSS/JS reais envolvidos na Roteirização.

Por isso não foi possível testar neste ambiente:

- tiles reais do OpenFreeMap renderizados pela rede dentro do navegador;
- GPS físico de um Android;
- câmera física/scanner;
- login Firebase contra a conta de produção;
- geocodificação real;
- otimização real por ruas;
- Cloudflare Worker;
- navegação em trânsito real.

A URL oficial do estilo OpenFreeMap Liberty continua configurada no projeto. O mapa-base externo depende de conexão de internet no dispositivo do usuário.

## Publicação

Nenhuma configuração manual de Cloudflare é necessária para publicar esta revisão de UI.

Para publicar:

1. extrair o ZIP;
2. abrir `Pacote-Em-Mato/`;
3. enviar a pasta/estrutura completa para o repositório;
4. preservar os diretórios e caminhos relativos.

Geocodificação e otimização real por ruas devem permanecer para uma etapa futura, quando o serviço externo for deliberadamente configurado.

---

## RELATORIO-FLUXO-IMPORTACAO-ENTREGA.md

# Pacote É Mato — Relatório da atualização do fluxo de importação e entrega

Base utilizada: `Pacote-Em-Mato-ETAPA-4-ROTEIRIZACAO-NAVEGACAO-PROPRIA.zip`.

## Resumo

Esta atualização foi feita de forma incremental. O núcleo legado de login/Firebase, PDF, agrupamento físico, câmera, scanner e Bipagem não foi reescrito. O Cloudflare Worker também não foi alterado nem publicado.

O principal fluxo novo é:

```text
XLSX
→ processamento
→ conferência das paradas
→ correção/adicionar endereço
→ confirmar rota candidata
→ mapa
→ geocodificação/otimização/rota real (quando o Worker estiver configurado)
→ navegação
→ Entregue / Não entregue
```

A Rota Ativa anterior não é substituída apenas por escolher um arquivo.

## 1. Fluxo de importação XLSX com conferência

A importação agora possui estados separados:

1. **Processamento** — tela com a logo original `icon-192.png`, nome do arquivo e etapa real em execução. O indicador é indeterminado; nenhuma porcentagem fictícia é mostrada.
2. **Conferência** — a planilha foi lida, mas a Rota Ativa ainda não foi substituída. A tela mostra total de paradas, localizadas, itens a revisar e pacotes, além da lista de endereços.
3. **Erro** — mensagem clara e ação para tentar outra planilha, preservando a Rota Ativa anterior.

A conferência identifica, sem apagar silenciosamente:

- número ausente;
- cidade ausente;
- endereços duplicados;
- linhas rejeitadas pelo importador;
- endereços classificados como ambíguos/não localizados;
- coordenadas válidas existentes na própria planilha.

Na conferência é possível **corrigir uma parada** com o editor existente ou **adicionar endereço**. Somente **Continuar para o mapa** promove a rota candidata para Rota Ativa.

## 2. Logo original

Foi reutilizado `icon-192.png`, já existente no projeto. A tela de processamento usa `object-fit: contain`, sem borda, sombra ou moldura CSS na imagem. O arquivo original não foi substituído nem distorcido.

## 3. Coordenadas opcionais no XLSX

O importador passou a reconhecer opcionalmente:

- `Latitude`, `Lat`, `Coord Lat`, `Coordenada Latitude`;
- `Longitude`, `Lon`, `Lng`, `Long`, `Coord Lon`, `Coordenada Longitude`.

Somente o par completo e numericamente válido é aceito. Coordenada incompleta ou inválida gera aviso e a parada permanece sem coordenadas; nunca é convertida para `(0,0)`.

## 4. Entregas

A navegação agora possui um campo **Nota da entrega**. Ao marcar `Entregue`, a nota é persistida em `observacaoEntrega` na mesma Rota Ativa.

`Não entregue` exige motivo antes de alterar o estado da parada. Motivo vazio não altera o estado em memória nem persiste resultado parcial. Motivo, observação e horário continuam sendo salvos na estrutura existente.

## 5. Serviço seguro de rotas

O Worker não foi alterado nem publicado. A área **Configurações → Serviço de rotas** usa suporte que já existia em `js/configuracoes/configuracoes.js` para armazenar somente a URL pública do Worker e testar `/health`.

A chave `GEOAPIFY_API_KEY` não é colocada no frontend.

### Endpoints auditados no Worker existente

- `GET /health`;
- `POST /geocode`;
- `POST /optimize`;
- `POST /route`.

O frontend continua preparado para usar:

- `/geocode` para geocodificação;
- `/optimize` para a ordem otimizada;
- `/route` para geometria rodoviária, distância, duração e instruções;
- `/health` para verificar disponibilidade.

Sem Worker configurado, o sistema não simula geocodificação, otimização, distância ou geometria.

## 6. Arquivos alterados

### Modificados

- `README.md`;
- `index.html`;
- `css/navegacao.css`;
- `js/core/rota-store.js`;
- `js/importacao/xlsx.js`;
- `js/navegacao/navegacao.js`;
- `js/roteirizacao/roteirizacao.js`.

### Criados

- `css/importacao-fluxo.css`;
- `js/importacao/fluxo-importacao.js`;
- `RELATORIO-FLUXO-IMPORTACAO-ENTREGA.md`.

### Removidos

Nenhum arquivo.

## 7. Preservação por hash

Permaneceram byte a byte iguais ao ZIP-base:

- `js/app.js`;
- `js/bipagem/rota-ativa-bridge.js`;
- `js/suporte.js`;
- `cloudflare/geocodificacao-worker.js`;
- `cloudflare/wrangler.toml`;
- `manifest.json`;
- `politica-privacidade.html`.

## 8. Testes executados

### Testes reais locais

- Todos os **23 JavaScripts** passaram em verificação de sintaxe.
- `index.html` possui **351 IDs**, sem IDs duplicados.
- Todos os novos recursos locais referenciados pelo HTML existem.
- Permanece somente a referência pré-existente ausente `tutorial-pacote-e-mato.mp4`; esse arquivo já não fazia parte do ZIP-base.
- XLSX real com **60 paradas**: 60 paradas lidas corretamente, sem erros de parse.
- XLSX vazio: erro explícito.
- XLSX com cabeçalho não reconhecido: fluxo solicita mapeamento de colunas.
- XLSX real com latitude/longitude válidas: coordenadas foram aceitas com `fonteCoordenada = "xlsx"`.
- Tela de conferência renderizada com 60 paradas.
- Duplicidade, número ausente e cidade ausente foram sinalizados.
- A Rota Ativa não é salva/substituída antes da confirmação; depois de confirmar, a mesma importação salva uma vez e renderiza o mapa/lista.
- Layout do fluxo medido em 390×844 e 1365×768; a logo permaneceu quadrada e dentro do viewport.
- Nota de entrega foi persistida.
- Motivo de não entrega vazio foi rejeitado antes de alterar o estado.
- Não entrega com motivo válido foi persistida.
- Busca por `519` nos arquivos de interface/código não encontrou alvo correspondente.

### Regressão dos módulos de mapa/navegação

Executados novamente contra esta versão:

- **80 paradas** na camada de mapa: coordenadas permaneceram estáveis após pan/zoom; sem duplicação; coordenadas inválidas foram ignoradas; seleção mapa↔lista permaneceu sincronizada.
- Controles do mapa: localização, enquadrar rota, zoom + e zoom -.
- Rota ativa → Bipagem: 2 grupos / 3 pacotes preservados e ordem respeitada.
- Localização: permissão concedida usa somente uma chamada quando há posição recente; permissão negada não força GPS.
- Linha de navegação: rota planejada e progresso permaneceram separados.
- Normalização do `RotaStore` passou no teste de regressão.

### Testes controlados / mocks

Estes testes validam o processamento do frontend, **não** uma chamada real à Geoapify:

- Sem Worker configurado: retorno `WORKER_NAO_CONFIGURADO`, sem falso sucesso.
- `/health`, `/optimize` e `/route` com respostas controladas: modo `motorcycle`, retorno ao início, duração por parada, ordem otimizada, `LineString`, distância e instrução de manobra foram processados corretamente.
- Navegação controlada: orientação de voz, Entregue, Não entregue, avanço de parada e tela de conclusão.

## 9. Imagens “519” e segunda imagem mencionada

Foi feita busca por arquivo, identificador e texto `519` no ZIP-base e nos arquivos de interface/código desta versão. **Nenhum arquivo ou componente chamado/identificado como 519 existe neste projeto**. No ZIP há somente os arquivos de imagem `icon-192.png` e `icon-512.png`.

Para evitar alterar o arquivo errado, nenhuma imagem desconhecida foi modificada. A logo utilizada no novo carregamento teve borda/sombra CSS explicitamente removidas. Se “imagem 519” pertencer a outro arquivo não incluído no ZIP, ele precisará ser fornecido ou identificado posteriormente.

## 10. Limitações reais

Não foi executada integração externa real com Geoapify porque este ambiente não possui uma URL de Worker publicada/configurada nem o secret de produção. Também não foi realizado teste de GPS/voz em deslocamento real num telefone.

A navegação web/PWA continua sujeita às limitações do navegador em segundo plano: GPS, JavaScript e `speechSynthesis` podem ser suspensos quando a página perde foco ou a tela é bloqueada.

## 11. Passos manuais indispensáveis

### Publicar o frontend

Subir a pasta `Pacote-Em-Mato/` completa para o repositório/hospedagem, preservando as subpastas.

### Futuramente ativar Geoapify no Worker

Na pasta `cloudflare/`:

```bash
npx wrangler login
npx wrangler secret put GEOAPIFY_API_KEY --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

Depois, no Pacote É Mato:

1. abrir **Configurações**;
2. informar a URL pública do Worker em **Serviço de rotas**;
3. clicar em **Testar conexão**.

Nenhuma regra permissiva do Firebase é necessária para esta atualização.

---

## RELATORIO-IMPLEMENTACAO-REFINO-DESENHO.md

# Relatório — Refinamento por desenho, fluxo de entrega e persistência

Data da revisão: 09/10/2026

## Escopo desta entrega

A alteração foi feita sobre o ZIP atual do Pacote É Mato, preservando a estrutura do projeto. Nenhum deploy em produção foi realizado e nenhum serviço externo foi alterado.

### 1. Refinar rota

O painel de refinamento foi alterado para conter:

- Otimizar automaticamente.
- Inverter ordem das paradas pendentes.
- Desenhar no mapa.
- Desfazer última alteração.

A ferramenta de desenho é funcional. O motorista pode:

- desenhar um polígono livre ao redor de várias paradas;
- tocar individualmente em marcadores para adicionar/remover uma parada da seleção;
- alternar temporariamente para modo de movimentação do mapa;
- limpar a seleção;
- colocar o grupo selecionado antes das demais paradas pendentes;
- colocar o grupo no fim das paradas pendentes;
- definir uma única parada selecionada como a próxima;
- desfazer a última alteração de ordem.

A seleção usa as coordenadas reais projetadas pelo mapa. Marcadores concluídos ou não entregues não entram na seleção de reorganização. A alteração de ordem trabalha com IDs permanentes, não com o número visual do marcador.

Depois de uma alteração manual, o percurso é recalculado pelo serviço de rota existente. Se o recálculo falhar, a ordem e o histórico de refinamento anteriores são restaurados.

### 2. Informações da parada

A exibição voltou a preservar informações operacionais como:

- complemento;
- apartamento;
- bloco;
- sala;
- loja;
- observação.

O texto original de `Destination Address` também continua preservado integralmente. Assim, detalhes que já vêm embutidos no endereço não são descartados.

### 3. Entregue / Não entregue / Navegar

O cartão da navegação usa:

`Navegar | Não entregue | Entregue`

- Não entregue agora funciona com um toque e não exige motivo.
- Entregue continua registrando o horário e avançando para a próxima pendente.
- Os dois botões de seta do cartão foram removidos.
- O gesto horizontal continua disponível apenas para consultar outra parada e não altera o resultado da entrega.
- Antes de abrir navegação externa, a nota atualmente digitada é copiada para a parada e persistida.

O botão Navegar lê a preferência salva em Configurações:

- Pacote É Mato: navegação interna.
- Waze: abre diretamente o destino no Waze.
- Google Maps: abre diretamente o destino no Google Maps.

Não existe um seletor adicional ao tocar em Navegar.

### 4. Retorno do segundo plano

Foi centralizada a persistência operacional para evitar que uma retomada seja tratada como nova inicialização.

São preservados, na medida suportada pelo navegador/PWA:

- módulo atual;
- estado do painel inferior;
- parada selecionada;
- próxima parada;
- rota ativa;
- resultados já registrados;
- nota de entrega;
- preferência de navegação;
- busca da lista;
- estado relevante da navegação.

Eventos de `visibilitychange`, `pageshow` e `focus` não recarregam a página nem reinicializam a rota. O retorno dispara uma retomada da navegação, com proteção contra execução duplicada em sequência.

A Rota Ativa permanece no armazenamento existente. O `rota-store` também mantém uma cópia local de contingência da rota ativa para recuperação se o processo for recriado e o armazenamento IndexedDB não estiver imediatamente disponível.

### 5. Marcadores durante a navegação

A navegação mantém uma camada com todas as paradas numeradas. A numeração permanece visível para:

- pendentes;
- parada atual;
- entregues;
- não entregues.

Os estados usam aparências diferentes, mas o número continua representando a posição atual na sequência. O ID permanente da parada continua separado dessa numeração.

### 6. Bipagem e menu

O menu lateral foi simplificado. Foram retirados dele os acessos operacionais duplicados de Início, Roteirização e Bipagem e a antiga opção de zerar bipagens.

O menu `⋮` da Roteirização contém Bipagem. Ao abrir:

- Bipar rota atual: usa a mesma rota ativa e códigos de pacote.
- Importar PDF: abre o fluxo legado de PDF para sistema compatível.

Termos de uso, Política de privacidade e Licenças foram agrupados em Configurações > Legal.

### 7. Histórico reutilizável

A tela de Histórico ganhou ação para abrir uma rota existente no mapa. A rota não é duplicada. Quando outra rota já está ativa, há confirmação antes de trocar qual rota será aberta; a rota anterior continua salva no Histórico.

## Testes automatizados executados

Os testes abaixo foram executados contra os arquivos desta entrega em ambiente Node/VM.

### Refinamento de ordem

Resultado:

```text
invert E,B,C,D,A
draw-start C,B,A,D,E
undo E,B,C,D,A
draw-end E,B,A,D,C
draw-single-next A,B,E,D,C
rollback E,B,A,D,C
PASS routing refine tests
```

Validou:

- inversão apenas das posições pendentes;
- entregues e não entregues preservados;
- grupo desenhado para o início;
- grupo enviado ao fim;
- uma parada definida como próxima;
- desfazer;
- rollback quando o recálculo de rota falha.

### Lasso e seleção individual

Resultado:

```text
lasso A,B
tap-add A,B,C
tap-remove A,C
PASS lasso + individual selection tests
```

Uma parada já entregue dentro da área desenhada foi corretamente ignorada pela seleção de reorganização.

### Navegação externa e entrega

Resultado resumido:

```text
Waze: URL de destino gerada
ordem de operação: save > session > open
Google Maps: URL de directions gerada
PASS navigation flow tests
```

O teste também confirmou:

- nota digitada salva antes de abrir outro aplicativo;
- parada selecionada recuperada;
- Não entregue sem motivo obrigatório;
- avanço para próxima pendente;
- detalhe de loja preservado no cartão.

### Importação dos XLSX reais

Foram usados os dois XLSX fornecidos nesta conversa.

```text
07-10-2026: perfil=spx, paradas=10, coordenadas=10, códigos=10, erros=0
08-10-2026: perfil=spx, paradas=30, coordenadas=30, códigos=30, erros=0
PASS real XLSX import tests
```

O teste utilizou o parser XLSX nativo do próprio projeto.

### Recuperação da rota ativa

Foi simulado um novo contexto JavaScript sem IndexedDB disponível, mantendo apenas a contingência local da rota ativa.

Foram recuperados:

- ID da rota;
- parada selecionada;
- próxima parada;
- status entregue;
- nota salva.

Resultado: `PASS route store fallback recovery`.

### Recuperação da sessão operacional

Novo contexto restaurou:

- módulo Navegação;
- painel intermediário;
- busca;
- parada selecionada;
- próxima parada;
- preferência Waze;
- navegação ativa.

O retorno ao primeiro plano disparou evento de retomada e não uma inicialização completa.

Resultado: `PASS operational session restore/resume`.

### Histórico

Uma rota histórica existente foi ativada e aberta na Roteirização sem criar cópia.

Resultado: `PASS history reopen test`.

### Marcadores numerados

A fonte de marcadores de navegação continha simultaneamente paradas entregue, pendente e não entregue, todas com sua numeração.

Resultado: `PASS navigation numbered markers test`.

### Auditoria estática

- todos os arquivos JavaScript em `js/` passam em `node --check`;
- os IDs do `index.html` são únicos;
- referências locais de scripts, CSS e imagens usadas pelo `index.html` existem;
- os botões antigos de seta da navegação não estão presentes no HTML;
- o botão direto de inversão fora do painel Refinar não está presente;
- o código do Cloudflare Worker e sua configuração não foram alterados nesta rodada.

## Testes que NÃO foram declarados como executados

O ambiente de desenvolvimento bloqueou a abertura do aplicativo local em Chromium/headless. Portanto não foi declarado como aprovado um teste visual completo em navegador real.

Também dependem de teste em celular físico/publicação de teste:

- handoff real para o aplicativo Waze e retorno pelo seletor de apps;
- handoff real para o aplicativo Google Maps e retorno;
- comportamento após o Android encerrar o processo em segundo plano;
- GPS em deslocamento real;
- voz/TTS em deslocamento;
- sensação dos gestos de desenho, swipe e painel em hardware real;
- funcionamento com tela bloqueada, que depende das limitações do navegador/PWA.

O código foi preparado para esses fluxos, mas eles não foram apresentados como testes físicos concluídos.

## Serviços externos e credenciais

- Nenhum deploy foi executado.
- Nenhuma configuração de produção foi alterada.
- Nenhuma chave secreta foi adicionada ao frontend.
- O Worker de rotas existente permanece como dependência para geocodificação, otimização e percurso real pelas ruas.

## Passo manual recomendado

Publicar esta versão somente em um ambiente de teste ou branch de homologação e executar no Android, nesta ordem:

1. importar o XLSX de 30 paradas;
2. otimizar;
3. testar Inverter;
4. desenhar um grupo e depois selecionar uma parada individualmente;
5. desfazer;
6. iniciar a rota;
7. abrir Waze e retornar;
8. registrar Não entregue em um toque;
9. abrir Google Maps e retornar;
10. enviar o PWA para segundo plano e recuperar;
11. reabrir uma rota pelo Histórico.

Essa validação física é a etapa restante que o ambiente atual não consegue reproduzir com fidelidade.

---

## RELATORIO-SPX-OTIMIZACAO-NAVEGACAO.md

# Relatório — SPX, otimização e navegação refinada

## Base

Esta atualização foi feita sobre o projeto cumulativo mais recente do Pacote É Mato. Não houve reconstrução do aplicativo do zero.

## 1. Planilhas reais usadas para validação

Foram utilizados os dois XLSX fornecidos pelo usuário:

- `07-10-2026 JOAO VITOR CAVALCANTE BEZERRA.xlsx`: 10 entregas.
- `08-10-2026 JOAO VITOR CAVALCANTE BEZERRA.xlsx`: 30 entregas.

O formato detectado foi:

`AT ID | Sequence | Stop | SPX TN | Destination Address | Bairro | City | Zipcode/Postal code | Latitude | Longitude`

### Comportamento implementado

- Detecta o perfil SPX automaticamente.
- `SPX TN` vira código de pacote e permanece disponível para a Bipagem.
- `AT ID`, `Sequence` e `Stop` são preservados como metadados de origem.
- `Destination Address` é mantido sem destruir complementos.
- Bairro, cidade e CEP são preservados.
- Latitude/Longitude válidas são usadas diretamente; não são geocodificadas novamente.
- O número do imóvel é inferido com segurança a partir do endereço completo quando não existe coluna separada.
- Os campos originais de cada linha são preservados em `fonte.camposOriginais`.
- Coordenadas ausentes ou inválidas não são convertidas para zero.

Resultados dos testes reais de importação:

- arquivo de 10: perfil SPX, 10 paradas, 10 coordenadas válidas, 10 códigos de pacote, 0 erro de leitura;
- arquivo de 30: perfil SPX, 30 paradas, 30 coordenadas válidas, 30 códigos de pacote, 0 erro de leitura.

## 2. Conferência da importação

A tela de conferência agora identifica explicitamente quando o formato SPX foi reconhecido e informa quantas coordenadas vieram da própria planilha.

Cada parada mostra endereço original, bairro/cidade/CEP, código de pacote e alertas de revisão. Endereço incompleto, duplicidade ou coordenada inválida não é removido silenciosamente.

Quando todas as paradas já têm coordenadas válidas no XLSX, o aplicativo não faz geocodificação desnecessária; segue direto para conferência do mapa e otimização.

## 3. Qualidade da otimização

O frontend passou a usar `short` como preferência padrão de rota urbana. O payload de `/optimize` envia:

- ponto inicial real;
- veículo (`drive`, `motorcycle` ou `light_truck`);
- duração configurada por parada;
- retorno ao início quando habilitado;
- todas as coordenadas válidas;
- `type: short` por padrão.

Depois da ordem retornada, `/route` calcula a geometria rodoviária completa na mesma ordem. Não existe fallback silencioso para distância em linha reta.

A tela de revisão permite refinar entre:

- Menor distância;
- Equilibrada;
- Menos manobras, quando compatível.

Para moto, `less_maneuvers` cai para `balanced` porque essa combinação pode não ser compatível com o provedor.

## 4. Tela de revisão da rota

Depois de otimizar, o sistema não joga o motorista diretamente em uma tela operacional. Abre uma revisão com:

- ponto de partida;
- paradas numeradas na ordem retornada;
- distância;
- tempo de direção;
- tempo de atendimento;
- tempo total;
- término estimado;
- Refinar;
- Confirmar rota.

Isso separa planejamento de execução.

## 5. Navegação própria

A navegação foi mantida 2D:

- `pitch: 0`;
- `maxPitch: 0`;
- rotação por gesto desabilitada;
- camadas `fill-extrusion` removidas quando presentes;
- a posição GPS do motorista é uma fonte separada das paradas;
- o mapa pode usar bearing/heading sem perspectiva inclinada.

As ações primárias são Entregue e Não entregue. Motivo e observação de Não entregue são opcionais nesta versão, e a rota avança automaticamente para a próxima parada pendente.

O recálculo mostra estado visual `Recalculando...` e nunca inventa percurso se `/route` falhar.

## 6. Bipagem depois da otimização

O menu de três pontos da Roteirização possui `Abrir Bipagem` quando existe rota calculada. A ação salva a mesma Rota Ativa e abre o módulo de Bipagem pela ponte existente. Não é criada uma segunda rota nem é necessário gerar PDF intermediário.

`js/bipagem/rota-ativa-bridge.js` não foi refatorado para esta funcionalidade.

## 7. Configurações

As preferências utilizam autosave:

- navegação;
- veículo;
- tempo médio de parada;
- retorno ao início;
- ponto de partida;
- URL do Worker.

O botão antigo de salvar permanece oculto apenas por compatibilidade.

## 8. Correção do travamento de rolagem

O menu de ações da Roteirização aplicava `body.style.overflow = 'hidden'` ao abrir, mas não restaurava o overflow ao fechar enquanto o usuário ainda estivesse no módulo de Roteirização.

Agora o fechamento restaura `body` e `html`, e a troca de módulo também limpa modais/backdrops e classes conhecidas de bloqueio de scroll. Isso ataca a causa do travamento observado ao voltar do mapa para Início.

## 9. Worker separado

O projeto foi alinhado ao Worker separado já criado pelo usuário:

`pacote-emato-rotas`

URL atual:

`https://pacote-emato-rotas.joaovitor250p.workers.dev`

O código local do Worker possui:

- `/health`;
- `/geocode`;
- `/optimize`;
- `/route`.

`/health` pode ser testado diretamente sem Origin; as rotas operacionais continuam protegidas pela origem autorizada.

Nenhuma chave Geoapify foi colocada no frontend. `GEOAPIFY_API_KEY` continua sendo Secret do Cloudflare.

O Worker principal de Firebase/pagamentos (`holy-frog-272c`) não faz parte desta pasta e não foi modificado.

## 10. Testes executados

### Reais com arquivos fornecidos

- leitura do XLSX de 10 entregas;
- leitura do XLSX de 30 entregas;
- detecção automática das 10 colunas SPX;
- preservação dos códigos BR de `SPX TN`;
- 100% das coordenadas válidas dos dois arquivos reconhecidas;
- inferência do número do imóvel, inclusive `Rua Emboaçava 237, Pet`;
- nenhum pacote dos dois arquivos ficou sem código.

### Estruturais / execução local

- `node --check` em todos os JavaScripts do projeto;
- verificação de IDs do HTML: sem IDs duplicados;
- verificação de referências locais do HTML: nenhum arquivo referenciado ausente;
- layout da revisão em 412×915 e 1365×768 via Chromium/Playwright usando o HTML/CSS reais;
- teste de desbloqueio de scroll ao trocar/limpar módulo;
- teste do Worker local: `/health` sem Origin retorna 200, rota operacional sem Origin retorna 403;
- procura por segredo Geoapify no projeto público: nenhum valor da chave encontrado.

### Com respostas controladas (mock)

- payload `/optimize` usa `type: short`;
- payload carrega veículo, ponto inicial e duração por parada;
- ordem retornada é aplicada à Rota Ativa;
- `/route` recebe a sequência otimizada;
- geometria LineString válida é aceita;
- `less_maneuvers` com moto faz fallback para `balanced`.

### Limitação de integração desta sessão

O ambiente de execução do assistente não resolve o domínio `workers.dev`, portanto não foi possível executar daqui um POST real ao `/optimize` ou `/route` publicado. O usuário confirmou manualmente nesta conversa que `/health` do Worker público respondeu:

`{"ok":true,"service":"pacote-emato-routing","providerConfigured":true}`

Assim, a integração externa real deve ser validada no GitHub Pages com os dois XLSX fornecidos após a publicação desta versão do frontend.

## 11. Arquivos principais alterados nesta entrega

- `README.md`
- `index.html`
- `css/importacao-fluxo.css`
- `css/navegacao.css`
- `css/roteirizacao.css`
- `js/configuracoes/configuracoes.js`
- `js/core/rota-store.js`
- `js/importacao/fluxo-importacao.js`
- `js/importacao/xlsx.js`
- `js/mapa/config.js`
- `js/navegacao/navegacao.js`
- `js/roteirizacao/roteirizacao.js`
- `js/roteirizacao/servico-rota.js`
- `js/state.js`
- `js/ui/app-shell.js`
- `cloudflare/geocodificacao-worker.js`
- `cloudflare/wrangler.toml`

## 12. Núcleo legado preservado

Nesta entrega não foi necessário reescrever `js/app.js`, `js/suporte.js` ou `js/bipagem/rota-ativa-bridge.js`. Portanto a lógica antiga de login/Firebase, PDF, agrupamento físico do PDF, scanner/câmera e Bipagem permanece separada da evolução da Roteirização.

---

## RELATORIO-V13-OPERACOES-PACOTES-MARCADORES.md

# Pacote É Mato — V13 — Adicionar/Remover pacotes por bipagem + marcadores

Data da entrega: 10/10/2026
Base utilizada: V12 — Marcadores Definitivos.

## 1. O que foi implementado

### Adicionar à rota

Foi adicionada a ação **Adicionar à rota** ao menu de ações da Roteirização.

Fluxo implementado:

1. O usuário escolhe uma planilha XLSX/CSV.
2. A planilha é lida pela importação existente, com associação manual de colunas somente quando o reconhecimento automático não for suficiente.
3. Os dados ficam em uma área temporária e **não alteram a Rota Ativa**.
4. O aplicativo abre a Bipagem existente em modo de seleção.
5. Somente códigos realmente bipados são selecionados.
6. Código repetido, código já existente na rota ou código não encontrado não é adicionado.
7. A tela de conferência mostra totais, códigos, endereços, quantidade selecionada por endereço e alertas.
8. Antes de confirmar é possível remover itens da seleção ou cancelar toda a operação.
9. Na confirmação, apenas os pacotes selecionados entram na rota.
10. Se não houver rota ativa, é criada uma nova rota com os pacotes confirmados.

O agrupamento usa a chave física compartilhada da operação, priorizando logradouro + número e mantendo a lógica de agrupamento do projeto. Se já existir uma parada pendente compatível, o novo pacote é acrescentado nela. Uma parada já finalizada não é reaberta: o novo pacote cria uma nova parada pendente no mesmo ponto físico para preservar o histórico anterior.

Depois da confirmação existem três formas de organização:

- **Manter a ordem atual e acrescentar as novas paradas**: a sequência antiga é preservada e as novas paradas entram no final como grupo de adição.
- **Otimizar somente as novas paradas**: usa o endpoint real `/optimize` somente para o grupo novo, preserva a ordem antiga e depois exige recálculo real do trajeto completo.
- **Otimizar a rota inteira**: usa o endpoint real `/optimize` em todas as paradas e depois recalcula o trajeto real.

Se uma otimização solicitada falhar, a rota anterior não é substituída.

### Remover da rota

Foi adicionada a ação **Remover da rota**.

Fluxo implementado:

1. O usuário importa a planilha de referência.
2. A planilha fica temporária e não altera a rota.
3. O usuário bipa apenas os pacotes que realmente sairão da rota.
4. O código precisa existir tanto na planilha da operação quanto na Rota Ativa.
5. Código inexistente na rota, repetido ou protegido por histórico/status é bloqueado.
6. A tela de conferência mostra os códigos, endereços e quantos pacotes permanecerão na parada física.
7. Somente após confirmação os códigos selecionados são removidos.
8. A remoção é por pacote, nunca indiscriminadamente por endereço.
9. Se ainda houver pacotes na parada, a parada permanece.
10. Se nenhum pacote permanecer e a parada não for histórica/finalizada, a parada é removida.

Pacotes de paradas entregues/concluídas/não entregues, ou já registrados como bipados/tratados, não são removidos silenciosamente.

## 2. Segurança da alteração da rota

As operações são feitas em uma cópia da Rota Ativa. A rota persistida só é trocada depois da confirmação e de todas as etapas obrigatórias terem sido concluídas.

- Cancelar descarta o estado temporário.
- Falha de otimização solicitada preserva a rota anterior.
- Falha de persistência não encerra a operação como concluída.
- A parada selecionada é preservada se continuar existindo.
- Se a parada selecionada deixar de existir, é escolhida uma parada previsível da sequência restante.
- `proximaParadaId` é preservado quando válido e corrigido somente quando necessário.
- A rota em andamento exibe aviso de que o trajeto poderá precisar de recálculo.
- Quando há alteração sem recálculo real disponível, `precisaRecalculo=true` impede iniciar/retomar a navegação como se a geometria antiga ainda fosse confiável.

O histórico resumido das operações confirmadas fica em `historicoOperacoesPacotes` na própria rota, limitado pela normalização persistente da Rota Store.

## 3. Scanner e entrada manual

O modo de operação reutiliza o caminho de leitura da Bipagem existente. `processarCodigo` delega para o módulo de operações somente enquanto uma operação temporária estiver ativa.

Isso mantém o scanner/câmera e a entrada manual existentes sem fazer a Bipagem normal modificar a Rota Ativa durante a seleção temporária.

Os sons e a fala existentes são reutilizados quando disponíveis.

## 4. Marcadores do mapa

A arquitetura nativa do MapLibre da V12 foi preservada. Não foram reintroduzidos marcadores HTML soltos, `position: fixed` ou deslocamentos permanentes de coordenadas.

O marcador individual continua sendo uma cápsula compacta gerada por `js/mapa/marcadores.js`:

- fundo pendente `#0f172a`;
- borda branca fina;
- número sequencial em destaque;
- multiplicador menor somente quando a quantidade real for maior que 1;
- `1x` não é mostrado;
- tamanhos limitados para um, dois e três dígitos;
- destaque da parada selecionada sem escala exagerada.

Planejamento e Navegação usam a mesma fonte operacional para o total de pacotes físicos e para a sequência atual.

O agrupamento de zoom distante foi reduzido para um indicador discreto (raio visual de 10,5 px, cluster radius 26 e cluster máximo até zoom 12), evitando as antigas bolhas grandes. Ao ampliar, os marcadores individuais reaparecem.

As coordenadas das paradas não são alteradas para evitar colisão visual.

## 5. Quantidade de pacotes no cartão

O cartão da navegação e os cartões da Roteirização passaram a usar a mesma função operacional de contagem física usada pelos marcadores quando disponível.

Exemplos:

- marcador `8` -> cartão `1 pacote`;
- marcador `8 2x` -> cartão `2 pacotes`;
- marcador `8 3x` -> cartão `3 pacotes`.

A contagem é recalculada após adição e remoção e também ao restaurar a rota normalizada.

## 6. Arquivos alterados em relação à V12

### Novos

- `js/bipagem/operacoes-pacotes.js` — fluxo temporário de adicionar/remover, bipagem, conferência, mutação segura, otimização e persistência.
- `css/operacoes-pacotes.css` — banner do modo de bipagem e tela de conferência responsiva.
- `RELATORIO-V13-OPERACOES-PACOTES-MARCADORES.md` — este relatório.

### Alterados

- `index.html` — ações Adicionar/Remover, novo CSS/JS e versionamento de cache V13.
- `js/app.js` — interceptação da leitura do scanner somente quando uma operação temporária está ativa.
- `js/roteirizacao/roteirizacao.js` — importação reutilizável com mapeamento, contagem física, sequência atual, aviso/controle de recálculo e integração das operações.
- `js/mapa/mapa.js` — sequência atual, contagem operacional e cluster discreto.
- `js/navegacao/navegacao.js` — contagem real no cartão, bloqueio de rota que precisa recálculo, marcadores/cluster consistentes.
- `js/core/rota-store.js` — persistência de `precisaRecalculo` e `historicoOperacoesPacotes`.
- `js/ui/app-shell.js` — impede entrada na Navegação enquanto a rota estiver marcada para recálculo.
- `README.md` — documentação resumida da V13.

`js/mapa/marcadores.js` da V12 foi preservado porque já contém a cápsula MapLibre nativa aprovada como base visual; a correção V13 foi aplicada à fonte dos dados, ciclo de renderização e clustering que o alimentam.

## 7. Testes executados neste ambiente

Os testes abaixo foram realmente executados. Eles são testes de código/estrutura e não equivalem a validação visual em um celular real.

### Sintaxe JavaScript

- Todos os arquivos `.js` em `js/` foram verificados com `node --check`.
- Resultado: **PASS**, sem erro de sintaxe.

### Mutação real da rota — 30 paradas

Foi executado o módulo real `PacoteEMatoOperacoesPacotes._teste.executarMutacaoTeste` sobre uma rota de 30 paradas.

Cenário de adição:

- três pacotes selecionados;
- um pacote entrou em uma parada física já existente;
- dois pacotes formaram uma nova parada física;
- um quarto pacote da planilha, não bipado, não entrou na rota;
- IDs da ordem permaneceram únicos;
- parada selecionada anterior foi preservada.

Cenário de remoção:

- remoção de um pacote de uma parada com três deixou a parada com dois;
- remoção do único pacote de uma parada pendente removeu apenas aquela parada;
- parada selecionada foi preservada quando continuou válida;
- tentativa de remover pacote de parada entregue foi bloqueada.

Resultado: **PASS**.

### Importação CSV — 30 pacotes

Foi executado o importador existente com arquivo simulado de 30 linhas contendo código, endereço e coordenadas válidas.

Resultado: **PASS** — 30 pacotes/paradas processados no teste.

### Marcadores

Foi executado o módulo real de marcadores com canvas/mapa simulados:

- marcador simples `1`;
- marcador múltiplo `38 3x`;
- parada de três dígitos `123 3x`;
- multiplicador somente para `>1`;
- largura múltipla maior que simples, mas limitada ao máximo definido;
- variantes normal e selecionada geradas.

Resultado: **PASS**.

### Persistência/normalização

Foi executada a normalização da Rota Store verificando:

- quantidade derivada do array real de pacotes;
- metadados do grupo de adição preservados;
- histórico de operações preservado;
- flag `precisaRecalculo` preservada.

Resultado: **PASS**.

### Estrutura HTML e marcador

- IDs duplicados em `index.html`: **0**.
- Botões `routingAddPackagesBtn` e `routingRemovePackagesBtn`: presentes.
- Auditoria estática não encontrou `new maplibregl.Marker`, `.marker-parada-pill` HTML nem marcador `position: fixed` no sistema de mapa.
- Planejamento e Navegação usam cluster discreto com `clusterRadius: 26`, `clusterMaxZoom: 12` e círculo de 10,5 px.

Resultado: **PASS**.

## 8. Testes que ainda precisam de validação manual

Não foram declarados como aprovados porque este ambiente não executa a experiência completa de um navegador/celular com câmera, GPS e serviços externos reais.

Ainda devem ser conferidos no aparelho/publicação:

1. Câmera e leitura de código de barras real no modo Adicionar.
2. Câmera e leitura real no modo Remover.
3. Entrada manual real no mesmo fluxo.
4. XLSX reais com cabeçalhos diferentes e modal de associação de colunas.
5. Endpoint real `/optimize` nas três opções de organização.
6. Endpoint real `/route` após adição/remoção.
7. Persistência Firebase/IndexedDB no ambiente publicado e recuperação após fechar/reabrir o PWA.
8. MapLibre em celular: zoom, pan, clusters, seleção e 30+ paradas reais.
9. Painel inferior recolhido/expandido sem marcador atravessar a interface.
10. Retorno do Waze e Google Maps após uma operação confirmada.
11. Aparência em desktop e diferentes densidades de tela.
12. Rotas reais com endereços idênticos/coordenadas idênticas, confirmando o comportamento do cluster/lista de seleção.

## 9. Arquivos importantes preservados

Não foram removidos os módulos existentes de login/Firebase, PDF, importação XLSX, scanner/câmera, bipagem normal, histórico, geocodificação, otimização, Waze/Google Maps, configurações ou permissões.

A implementação foi integrada à arquitetura existente e não cria um aplicativo separado.

---

## RELATORIO-V14-AJUSTES-NAVEGACAO-BIPAGEM-MAPA.md

# Pacote É Mato — V14

Base: V13 — Adicionar/Remover Pacotes + Marcadores.

## Alterações implementadas

### Marcadores em zoom distante
- Desativado o clustering nos mapas de planejamento e navegação.
- Removidas as camadas visuais de círculos/contadores de cluster da renderização.
- As paradas individuais permanecem visíveis em zoom distante.
- Marcadores próximos usam somente deslocamento visual em pixels (`icon-offset`) dentro da camada MapLibre; as coordenadas geográficas originais não são alteradas.
- O tamanho dos marcadores reduz progressivamente quando o mapa está mais afastado.

### Bipagem de Adicionar/Remover rota
- Adicionado debounce de leitura de 2,2 s para impedir que a câmera processe o mesmo código repetidamente.
- Adicionada trava curta de processamento para impedir rajadas `bip-bip-bip` do mesmo frame/código.
- Adicionado som próprio para operações de pacotes, separado do beep da Bipagem normal.
- Adicionar e Remover usam sequências sonoras distintas.
- O modo de operação recebe identificação visual própria e não usa o feedback sonoro padrão de bipagem de parada.

### Menus de pacotes
- Removida a opção redundante `Usar rota da Bipagem` do menu de ações.
- `Adicionar à rota` e `Remover da rota` foram agrupados em `Pacotes da rota`, abrindo um seletor com as duas opções, no mesmo conceito visual do seletor de Bipagem.
- O menu de navegação também possui `Pacotes da rota` com as duas opções.

### Busca / adição rápida de endereço
- O campo de busca continua filtrando endereço/pacote.
- Ao digitar um endereço, aparece `+ Adicionar endereço`.
- Enter também abre a criação de parada com o texto digitado pré-preenchido.
- Número e complemento/apartamento podem ser informados na mesma linha e continuam usando o editor já existente.

### Painel da navegação
- O painel inferior agora possui alça para expandir/recolher no celular.
- Ao puxar para cima, mostra a lista das paradas e endereços da rota.
- A lista permite selecionar uma parada sem criar marcadores novos.

### Entregue / Não entregue / Desfazer
- O cartão mostra status `Pendente`, `Entregue` ou `Não entregue`.
- Após registrar Entregue/Não entregue, o cartão permanece na parada para permitir conferência.
- São exibidos `Desfazer status` e `Próxima pendente`.
- Desfazer restaura a parada para `pendente`, persiste a alteração e recalcula quando o serviço real estiver disponível.
- Na última parada, `Revisar paradas` fecha o resumo final e abre a lista para permitir correção antes de finalizar.

### Localização / direção
- O GPS passa a ser iniciado também quando Waze/Google Maps é a navegação preferida, para o mapa interno saber onde o motorista está.
- O botão de localização solicita uma posição atual se ainda não houver coordenada e centraliza o mapa.
- O símbolo do motorista usa heading do GPS e, quando o heading não é fornecido, estima a direção pelo deslocamento entre duas posições válidas.

### Retorno de Waze / outros aplicativos
- Adicionado tratamento de `visibilitychange`, `pageshow`, `focus` e evento interno de resume.
- Após ficar em segundo plano, o mapa de navegação é reconstruído quando necessário, redimensionado e redesenhado.
- A rota ativa é recarregada do RotaStore.
- GPS é reiniciado ao retornar.
- O fallback branco do mapa é ocultado durante a reconstrução.

### Linha da rota
- Removida a regra que quebrava a geometria visual quando havia distância superior a 1,8 km entre pontos consecutivos.
- A geometria retornada pelo serviço agora é preservada; somente coordenadas inválidas ou duplicadas consecutivas são removidas.
- A camada de progresso passou a usar verde escuro para manter a identidade visual da rota.

## Arquivos alterados
- `index.html`
- `css/roteirizacao.css`
- `css/navegacao.css`
- `css/operacoes-pacotes.css`
- `js/bipagem/operacoes-pacotes.js`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `js/roteirizacao/roteirizacao.js`
- `js/ui/app-shell.js`

## Testes executados no ambiente
- `node --check` em todos os arquivos JavaScript: aprovado.
- Auditoria de IDs do HTML: nenhum ID duplicado.
- Verificação estática: clustering desativado em planejamento e navegação.
- Verificação estática: marcadores configurados para continuar visíveis em zoom distante.
- Verificação estática: opção `Usar rota da Bipagem` removida dos menus.
- Verificação estática: seletores `Pacotes da rota` presentes em planejamento e navegação.
- Verificação estática: adição rápida de endereço presente.
- Teste de mutação com rota sintética de 30 paradas:
  - adição de dois pacotes selecionados: aprovado;
  - um pacote no mesmo ponto físico foi agregado sem criar parada extra: aprovado;
  - um pacote em novo endereço gerou nova parada: aprovado;
  - remoção individual do pacote adicionado: aprovado;
  - parada sem pacotes restantes foi removida: aprovado.

## Testes que ainda exigem aparelho/navegador real
- câmera física e ritmo real de leitura de código;
- percepção dos novos sons no Android/iPhone;
- retorno real do Waze/Google Maps após vários minutos em segundo plano;
- GPS/heading real durante deslocamento;
- gesto de puxar o painel em diferentes tamanhos de celular;
- visual dos marcadores em mapas reais com 30–100 paradas em diferentes zooms;
- serviço real de roteamento/geocodificação e recálculo após desfazer status.

Não foram declarados como aprovados testes que dependem dessas condições reais.

---

## RELATORIO-V15-NAVEGACAO-BUSCA-BIPAGEM-SEPARADA.md

# Pacote É Mato — V15

Data da implementação: 13/10/2026.
Base utilizada: V14.

## Objetivo

Esta versão reorganiza a navegação, separa definitivamente a bipagem de Adicionar/Remover pacotes da bipagem normal, simplifica a interface, cria busca de endereços com sugestões e melhora o comportamento visual do mapa sem alterar a arquitetura principal da rota, Firebase, histórico, XLSX, roteirização ou persistência.

## Alterações principais

### Navegação
- Removido o gesto/handle vertical do cartão de navegação.
- Adicionado botão X no cartão para voltar à tela de roteirização/lista de endereços.
- Removidos da tela operacional de navegação o cartão de ETA e o bloco de estatísticas com KM/ETA/restantes.
- Ao marcar Entregue ou Não entregue, a seleção avança automaticamente para a próxima parada pendente.
- Removido o botão “Próxima pendente”.
- Mantida opção de desfazer; após avanço automático, uma barra compacta mostra o último status e permite desfazer.
- Menu dos três pontos reorganizado por grupos: Rota, Pacotes, Ferramentas e Sessão.

### Posição do motorista e voz
- Navegação Pacote É Mato: seta direcional com heading do GPS.
- Waze/Google Maps: ponto verde simples, sem seta direcional.
- TTS do Pacote É Mato é bloqueado quando Waze ou Google Maps são o provedor selecionado.
- Adicionado controle de repetição de voz por chave/instrução e intervalo mínimo entre falas.
- Navegação própria usa câmera mais próxima: zoom aproximadamente 17.35, pitch de 48 graus e bearing acompanhando o deslocamento.

### Mapa
- MapLibre configurado com antialias, sem fade de tiles e sem cópias do mundo.
- Mapa principal e de navegação receberam limites de zoom mais previsíveis.
- Removidos filtros CSS que poderiam degradar a renderização do canvas.
- Fallback raster passa a ser acionado mais tarde, dando mais tempo ao mapa vetorial principal.
- A geometria visual do mapa principal não é mais quebrada automaticamente quando há distância maior entre dois vértices; apenas coordenadas inválidas e duplicadas são descartadas.
- Não há criação de layers de cluster/bolhas grandes para as paradas.

### Identidade visual
- Criado `css/theme-v15.css`.
- Fluxos operacionais usam base branca, texto preto e destaque verde.
- Marcadores normais passaram a usar fundo branco, texto preto e borda verde.
- Marcador selecionado permanece verde com texto branco para destaque discreto.
- Removido azul dos indicadores próprios de localização do Pacote É Mato.

### Bipagem separada para Adicionar/Remover
- Criado módulo de tela próprio `moduloOperacoesPacotes`.
- A operação usa reader próprio `pkgOpReader`, cartão de resultado próprio e campo manual próprio.
- O scanner físico continua reutilizando o núcleo de câmera já existente, mas escolhe o reader conforme o modo ativo.
- O fluxo de Adicionar/Remover não reutiliza mais visualmente a tela da Bipagem normal.
- O processamento continua interceptando o código antes da bipagem normal, impedindo sons/contagens do fluxo comum.
- Debounce e trava contra leituras repetidas foram preservados.
- “Rota anterior” e “Resumo da rota atual” permanecem apenas no DOM para compatibilidade com código legado, mas ficam ocultos permanentemente na interface V15.

### Busca inteligente para adicionar parada
- Campo “Buscar pacote ou digitar um novo endereço” agora consulta o serviço de geocodificação enquanto o usuário digita.
- São exibidas até cinco sugestões.
- Cada sugestão apresenta rua/número e, na linha inferior, cidade/estado/CEP disponíveis.
- Ao selecionar uma sugestão, o editor da parada é aberto com o endereço preenchido.
- A latitude/longitude retornada pelo serviço é preservada como coordenada confirmada da sugestão; não é calculada por posição de tela.
- Número, apartamento, bloco, sala e complemento continuam editáveis no editor existente.
- O Worker incluído no projeto foi ampliado para retornar também suburb/district/city_district quando o provedor disponibilizar esses campos.

## Arquivos alterados

- `index.html`: novo módulo de operações, X da navegação, menu reorganizado, remoção visual de ETA/estatísticas, área de sugestões de endereço e cache bust V15.
- `css/theme-v15.css`: novo tema e ajustes visuais V15.
- `js/ui/app-shell.js`: suporte ao módulo `operacoes-pacotes` e recuperação segura da UI.
- `js/bipagem/operacoes-pacotes.js`: operação em tela própria e resultados separados da bipagem normal.
- `js/app.js`: scanner seleciona reader normal ou reader de operações conforme o modo.
- `js/mapa/geocodificacao.js`: API `consultarSugestoesEndereco`.
- `cloudflare/geocodificacao-worker.js`: campos adicionais para enriquecer sugestões futuras.
- `js/roteirizacao/roteirizacao.js`: autocomplete de endereços e preservação da coordenada escolhida.
- `js/navegacao/navegacao.js`: voz, câmera, posição do motorista, avanço automático, desfazer e menu.
- `js/mapa/mapa.js`: qualidade/estabilidade do mapa, cor do motorista e geometria da rota.
- `js/mapa/marcadores.js`: paleta branca/preta/verde dos marcadores.

## Testes executados neste ambiente

1. `node --check` em todos os JavaScripts de `js/` e `cloudflare/`: aprovado.
2. Auditoria de IDs do `index.html`: 432 IDs únicos e nenhuma duplicação.
3. Teste unitário do núcleo de operações com uma rota sintética de 30 paradas:
   - adicionados 2 pacotes selecionados;
   - um deles agrupado em parada existente;
   - criada somente uma nova parada para novo endereço;
   - remoção individual devolveu a parada existente para 1 pacote;
   - resultado aprovado.
4. Teste da API de sugestões de endereço com `fetch` mockado:
   - retornou Rua do Pará, 234;
   - preservou latitude/longitude;
   - preservou cidade/estado/CEP;
   - aprovado.
5. Verificação estrutural automatizada:
   - módulo separado de operações presente;
   - reader separado presente;
   - reader normal preservado;
   - ETA da navegação removido do HTML;
   - bloco de stats da navegação removido;
   - botão Próxima pendente removido;
   - X de retorno presente;
   - sugestões de endereço presentes;
   - nenhuma camada de cluster grande é criada nos mapas;
   - layer de ponto externo e seta interna configurados;
   - voz condicionada à navegação própria;
   - avanço automático após status configurado;
   - tema V15 carregado.
6. Comparação de arquivos com a base V14: nenhum arquivo original foi removido; apenas `theme-v15.css` foi acrescentado.

## Testes que ainda dependem de aparelho/navegador real

- Qualidade visual do mapa sob diferentes redes e GPUs Android/iOS.
- Retorno real de Waze/Google Maps após o app ficar em segundo plano por vários minutos.
- Heading da seta durante deslocamento real do veículo.
- Câmera física/flash e leitura contínua de códigos no novo reader de operações.
- Comportamento de TTS durante uma rota real com várias manobras consecutivas.
- Sugestões reais do endpoint publicado do Worker e precisão dos resultados do provedor.
- Gestos e dimensões finais em diferentes tamanhos de celular.

Nenhum desses itens foi declarado como aprovado sem execução em aparelho real.

---

## RELATORIO-V16-MAPA-MENU-STATUS.md

# Pacote É Mato — V16

Base utilizada: V15.

## Correções desta versão

### 1. Mapa branco
- O mapa de navegação não coloca mais uma camada branca sobre o mapa por causa de qualquer erro isolado de tile, sprite ou rede.
- O aviso de indisponibilidade só aparece quando o mapa realmente não consegue inicializar.
- Tanto o mapa de planejamento quanto o de navegação passam a trocar automaticamente para o estilo raster de contingência quando a base vetorial falha repetidamente na inicialização.
- O fallback é acionado mais cedo e o mapa é redimensionado/repintado ao ficar pronto.
- Foram retiradas da criação do mapa opções experimentais adicionadas na V15 (`antialias`, `renderWorldCopies: false` e `fadeDuration: 0`), voltando a uma configuração mais conservadora.
- A área do mapa usa fundo neutro cinza-claro durante carregamento, em vez de parecer uma tela branca do aplicativo.

### 2. Entregue / Não entregue sem “Desfazer”
- A barra “Desfazer” da última parada foi removida.
- O botão “Desfazer status” também foi removido da navegação.
- Ao marcar Entregue ou Não entregue, o fluxo continua avançando diretamente para a próxima parada pendente.
- O status permanece gravado e visível quando a parada concluída é consultada, mas não gera controles de desfazer nas paradas seguintes.

### 3. Menu dos três pontos
- O menu dos três pontos da navegação agora utiliza o mesmo componente visual do menu dos três pontos da tela de rotas/roteirização.
- Foram reutilizadas as classes `routing-actions-backdrop`, `routing-actions-menu`, `routing-actions-head`, `routing-action-list` e `routing-action-row`.
- As ações agora aparecem em linhas com ícone, título e descrição, no mesmo padrão da tela de rotas.
- IDs e eventos das ações foram preservados para não quebrar a lógica existente.

## Arquivos alterados
- `index.html`
- `js/navegacao/navegacao.js`
- `js/mapa/mapa.js`
- `css/theme-v15.css` (arquivo preservado; recebeu os ajustes V16)
- `README.md`

## Testes executados no ambiente
- `node --check` em todos os JavaScripts do projeto.
- Verificação de IDs duplicados no `index.html`.
- Verificação de ausência dos elementos de interface `navUndoStatusBtn`, `navLastUndoBtn`, `navLastStatusBar` e `navStatusActions`.
- Verificação de que o menu da navegação usa as mesmas classes estruturais do menu da roteirização.
- Verificação estrutural do fallback de mapa nos dois módulos.
- Validação do ZIP após geração.

## Validação que ainda depende do aparelho
- Carregamento real dos tiles na rede do celular.
- Troca real para o mapa raster caso o provedor vetorial falhe.
- Retorno de Waze/Google Maps em Android/iOS.
- Aparência final do menu e do mapa em diferentes aparelhos/GPU.

---

## RELATORIO-V17-MAPA-DESFAZER-CONTEXTUAL.md

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

---

## RELATORIO-V18-MAPA-DESFAZER-CARD.md

# Pacote É Mato — V18

## Motivo da versão
O print enviado na V17 mostrou que a interface da navegação carregava, mas a base cartográfica continuava vazia/cinza. Isso confirmou que o problema estava na base de mapa introduzida nas versões recentes, e não no card/painel.

## Correção do mapa
- Restaurada a base vetorial `https://tiles.openfreemap.org/styles/liberty`, a mesma configuração usada na V14.
- O mapa principal e o mapa da navegação voltaram a abrir usando `mapStyleUrl` diretamente.
- O mapa raster OSM continua disponível somente como contingência.
- Erro isolado de tile/fonte não cobre um mapa já funcional.
- Na navegação, a contingência só é tentada se o estilo principal não ficar pronto.
- Mantidos `resize()`/`triggerRepaint()` e a reconstrução do mapa ao retornar de outro aplicativo.
- Cache-busting atualizado para `v18`.

## Desfazer contextual
O comportamento esperado foi mantido e conferido no código:
1. Ao marcar `Entregue` ou `Não entregue`, a navegação avança automaticamente para a próxima parada pendente.
2. O botão `Desfazer` não aparece na nova parada pendente.
3. Se o usuário voltar/selecionar o card da parada finalizada, aparece `Desfazer entrega` ou `Desfazer não entrega`.
4. Ao desfazer, somente aquela parada volta para `Pendente` e a alteração é persistida.

## Arquivos principais alterados
- `js/mapa/config.js`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `index.html`
- `README.md`

## Testes executados neste ambiente
- `node --check` em `js/mapa/config.js`: aprovado.
- `node --check` em `js/mapa/mapa.js`: aprovado.
- `node --check` em `js/navegacao/navegacao.js`: aprovado.
- Verificação de que `mapStyleUrl` voltou a apontar para OpenFreeMap: aprovado.
- Verificação de que o mapa de planejamento e de navegação usam `cfg().mapStyleUrl`: aprovado.
- Verificação estática do fluxo Entregue/Não entregue -> próxima pendente: aprovado.
- Verificação estática do botão Desfazer apenas para status finalizado: aprovado.
- Cache-busting `v18`: aprovado.

## Validação que ainda depende do celular/navegador
- carregamento visual real dos tiles OpenFreeMap na rede do aparelho;
- retorno real do Waze/Maps após vários minutos;
- renderização após alternar app/segundo plano;
- GPS em movimento e navegação em primeira pessoa.

Não foram declarados como aprovados testes que dependem do aparelho real.

---

## RELATORIO-V19-TRACADO-ETA.md

# Pacote É Mato — V19 — Traçado visual e previsão de término

## Motivo
A V18 apresentava dois pontos visíveis no teste real:

1. Ao afastar o mapa, o traçado verde ficava visualmente serrilhado/ruidoso.
2. A previsão de término ficava muito acima da referência do rota.

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
- comparação de término com uma rota real calculada pelo rota no mesmo instante;
- comportamento visual durante pan/zoom contínuo no WebView/PWA;
- tráfego real retornado pelo provedor de roteamento.

---

## RELATORIO-V20-CORRECAO-PROFUNDA-MAPA.md

# Pacote É Mato — V20 — correção profunda do traçado do mapa

## Causa encontrada

O mapa-base não foi trocado. O problema principal estava no processamento da geometria da rota pelo frontend:

1. a geometria vinda do roteador pode ser `MultiLineString`, isto é, vários trechos/legs;
2. cada trecho era simplificado separadamente por um algoritmo próprio;
3. a tolerância dessa simplificação mudava conforme o zoom;
4. ao terminar cada zoom, a geometria era recriada novamente;
5. o `GeoJSONSource` do MapLibre ainda aplicava uma segunda simplificação (`tolerance: 0.8`).

A combinação fazia a linha mudar de forma quando o usuário afastava/aproximava o mapa e deixava mais visíveis pequenas quebras entre legs.

## Correção

- removida a simplificação Douglas-Peucker dependente do zoom;
- removido o redesenho da geometria no `zoomend`;
- a rota agora usa a mesma geometria estável em todos os zooms;
- apenas coordenadas inválidas e duplicatas submétricas são descartadas;
- legs consecutivos são unidos somente quando seus extremos estão realmente próximos (até 8 m);
- a simplificação interna do MapLibre foi reduzida para `tolerance: 0.2`;
- buffer aumentado para 128 e maxzoom do source para 20;
- a mesma correção foi aplicada ao mapa de planejamento e à navegação.

## Elemento removido

Foi removido do HTML o `routingEtaCard`. No mobile ele era filho de um topbar ancorado à direita e, mesmo posicionado por `left`, podia escapar do contêiner e aparecer cortado na lateral direita — exatamente o elemento indicado no print.

O horário de término continua no painel inferior da rota; apenas o cartão flutuante foi removido.

---

## RELATORIO-V21-CORRECAO-E-LIMPEZA-TECNICA.md

# Pacote É Mato — V21 — correção do pós-entrega e limpeza técnica

## Bug corrigido

Na V20, `js/navegacao/navegacao.js` passou a chamar `distanciaMetros(...)` dentro da normalização visual da geometria, mas essa função não existia nesse módulo. O erro aparecia principalmente após Entregue/Não entregue, quando a rota era persistida/recalculada e redesenhada.

A V21 remove essa referência inválida e reutiliza `haversine(...)`, que já era a função oficial de distância dentro do módulo de navegação.

## Limpeza executada

A varredura foi conservadora: somente código comprovadamente morto, vazio ou duplicado foi removido.

- removidas variáveis `mapaCriadoEm` e `errosMapaIniciais`, nunca lidas;
- removidos nomes/funções antigos de cluster nos mapas de planejamento e navegação; o clustering já estava desativado;
- removidos `SOURCE_NEXT`, `LAYER_NEXT` e `LAYER_NEXT_TEXT` da navegação, pois o source era sempre alimentado com coleção vazia e o destaque da próxima parada já é feito pelo marcador numerado;
- removida a função no-op `garantirImagemBalao()` do mapa de planejamento;
- removida a função/exportação `irParaProximaPendente`, que ficou sem interface e sem consumidores depois do avanço automático;
- centralizadas em `js/mapa/marcadores.js` as rotinas repetidas de quantidade de pacotes e chave física do marcador, reutilizadas agora por `mapa.js` e `navegacao.js`;
- mantidos os parsers/fluxos de compatibilidade do `app.js`: há trechos parecidos, mas eles atendem caminhos de importação diferentes e removê-los sem uma suíte de PDFs reais seria uma mudança de risco.

## Testes executados

- `node --check` em todos os arquivos JavaScript do projeto: aprovado;
- verificação TypeScript `checkJs` focada em `navegacao.js`: nenhuma referência bare/indefinida (`TS2304`) após a correção;
- busca global por `distanciaMetros`: nenhuma referência restante;
- busca global pelos antigos artefatos de cluster removidos: nenhuma referência restante;
- validação de IDs duplicados no HTML: nenhum ID duplicado;
- validação de `<script src>` e stylesheets duplicados: nenhum carregamento duplicado;
- teste dos helpers compartilhados de marcador com endereço/número e múltiplos pacotes: aprovado;
- ZIP validado após criação.

## Preservado

Não foram reescritos login, Firebase, importação, bipagem, operações de adicionar/remover pacotes, persistência, geocodificação, serviço de rota, Waze/Maps, histórico ou estados de entrega.

O Desfazer continua contextual no card de uma parada já finalizada.

## Validação que ainda depende do celular

- marcar várias paradas como Entregue/Não entregue numa rota real;
- confirmar que o recálculo não exibe mais o erro;
- retorno de Waze/Maps;
- comportamento visual do MapLibre/WebView no aparelho.

## Limpeza adicional da interface/código legado

Durante a varredura também foram encontrados três blocos CSS gravados com caracteres literais `\\n` em vez de quebras de linha reais. Esses trechos vinham de patches antigos e não eram CSS válido. Eles foram normalizados/removidos de forma conservadora:

- `css/navegacao.css`: removidas regras antigas do painel arrastável/lista interna que já não existe; mantidas apenas regras atuais de status/localização/seletor de pacotes;
- `css/operacoes-pacotes.css`: bloco do modo separado de Adicionar/Remover foi regravado em CSS válido;
- `css/roteirizacao.css`: bloco de busca de endereço e seletor de pacotes foi regravado em CSS válido.

Também foram removidas referências JavaScript a elementos que já não existem no HTML:

- `navStopsOverviewList` / `navStopsOverviewMeta`;
- `routingFitMapBtn`.

Depois da limpeza, `mapa.js` e `navegacao.js` não possuem mais referências `$('<id>')` para IDs inexistentes no `index.html`.

---

## RELATORIO-V22-COORDENADAS-ROTA-502.md

# Pacote É Mato — V22 — Coordenadas + rota grande + erro 502

## Diagnóstico

Foram encontrados dois problemas independentes no fluxo de rotas grandes:

1. **Coordenadas XLSX eram aceitas apenas por serem numericamente válidas.**
   Se a planilha trouxesse latitude/longitude válidas, mas associadas ao ponto errado, a parada era marcada como `ok` e a geocodificação não conferia se a rua/número correspondiam àquela coordenada.

2. **A geometria de toda a rota era enviada em uma única requisição ao endpoint `/route`.**
   Em uma rota com 101 paradas, isso significa ponto inicial + cerca de 101 waypoints em uma única chamada. Falhas do provedor eram mascaradas pelo Worker como HTTP 502.

Além disso, a ordem otimizada era aplicada na rota em memória antes da geometria terminar. Portanto, uma falha no segundo estágio podia deixar a interface com ordem nova, mas distância/geometria ausentes.

## Correções

### 1. Auditoria endereço x coordenada XLSX

Arquivo: `js/mapa/geocodificacao.js`

Foi adicionada `validarCoordenadasImportadas()`.

- Só trabalha com coordenadas já existentes e provenientes da planilha.
- Geocodifica o endereço usando o serviço já existente.
- Exige a mesma validação rígida já utilizada pelo projeto: número do imóvel compatível, rua compatível e confiança mínima.
- Compara a coordenada XLSX com a coordenada validada do endereço.
- Se a divergência for maior que 120 m e a geocodificação for de alta confiança, substitui a coordenada usada pela rota.
- A coordenada original da planilha é preservada em `coordenadaPlanilhaOriginal`.
- O resultado da auditoria é persistido para não repetir a conferência a cada otimização.
- Se o endereço for editado depois, a validação volta a ser necessária.
- Se a geocodificação for ambígua ou falhar, nenhuma coordenada é inventada.

Arquivo: `js/roteirizacao/roteirizacao.js`

Antes de otimizar uma rota com coordenadas XLSX ainda não conferidas, o aplicativo agora executa a auditoria acima e salva eventuais correções antes de enviar os pontos ao otimizador.

### 2. Geometria de rotas grandes dividida em blocos

Arquivo: `js/roteirizacao/servico-rota.js`

A função `calcularRotaPelasRuas()` não envia mais todos os waypoints em uma única chamada.

- Limite padrão: 24 pontos por bloco.
- O último ponto de um bloco também é o primeiro do bloco seguinte, garantindo continuidade.
- Cada trecho é calculado pelas ruas pelo mesmo serviço real.
- As geometrias, pernas, distância, tempo e waypoints são unidos novamente na ordem correta.
- Não existe fallback em linha reta.
- Requisições transitórias 5xx recebem uma segunda tentativa curta.
- O erro agora informa qual trecho falhou quando o provedor não consegue calcular um bloco.

Para 101 paradas + ponto inicial, o teste sintético resultou em 5 chamadas: `24, 24, 24, 24, 10` pontos.

### 3. Otimização transacional

Arquivo: `js/roteirizacao/roteirizacao.js`

A nova sequência e a nova geometria são montadas em uma cópia da rota. `rotaAtual` só é substituída depois que todos os cálculos terminam com sucesso.

Se o serviço falhar, a rota anterior não fica parcialmente alterada.

### 4. Mensagens de erro melhores

Arquivo: `js/roteirizacao/servico-rota.js`

Foram adicionadas mensagens específicas para `optimizer_error` e `route_error`, substituindo em vários casos a mensagem genérica `Falha no serviço de rota (502)`.

### 5. Cache bust

`index.html` passou de `v21` para `v22` nos CSS/JS para impedir o celular de reutilizar os scripts anteriores.

## Testes executados

- `node --check` em todos os JavaScripts do projeto: **OK**.
- `node --check` no Worker Cloudflare incluído no projeto: **OK**.
- IDs duplicados no `index.html`: **0**.
- Simulação de geometria com **102 pontos** (ponto inicial + 101 pontos):
  - chamadas geradas: `24, 24, 24, 24, 10`;
  - nenhum bloco excedeu 24 pontos;
  - 101 pernas foram recompostas na ordem correta;
  - soma de distância preservada no teste.
- Simulação de coordenada XLSX errada:
  - coordenada importada colocada artificialmente a 1.508 m do endereço validado;
  - auditoria detectou divergência;
  - coordenada corrigida;
  - coordenada original preservada.
- ZIP: verificar após empacotamento.

## Validação ainda necessária no aparelho

- Reimportar a planilha real de 101 paradas e confirmar se a parada da Avenida Vila Ema é corrigida pela validação de endereço.
- Otimizar a rota real de 101 paradas e confirmar o comportamento do serviço publicado.
- Comparar distância/horário final com a referência usada pelo motorista.

Sem a planilha real usada no print, não é possível afirmar que a parada 50 específica foi corrigida em dados reais; a correção implementada elimina a causa estrutural que permitia uma coordenada XLSX incompatível com o endereço passar como válida.

---

## RELATORIO-V23-CORRECAO-IMPORTACAO-FEATURECOLLECTION.md

# Pacote É Mato — V23 — Correção da importação `featureCollection is not defined`

## Problema identificado
A limpeza técnica da V21 removeu por engano a função utilitária local `featureCollection()` do módulo `js/mapa/mapa.js`, mas o restante do módulo continuou utilizando essa função em vários pontos.

Isso só aparecia em tempo de execução quando o mapa/roteirização tentava montar GeoJSON durante a importação, resultando no erro:

`featureCollection is not defined`

Como consequência, a tela de importação abortava com “Não foi possível processar a planilha”.

## Correção
- Restaurada `featureCollection(features)` dentro do próprio módulo do mapa.
- A função sempre retorna um GeoJSON válido do tipo `FeatureCollection`.
- Não houve mudança nas regras de importação, agrupamento, geocodificação, validação de coordenadas, otimização ou bipagem.
- Mantidas as correções genéricas da V22 para qualquer XLSX/CSV compatível.
- Cache dos assets atualizado de `v22` para `v23`.

## Auditoria adicional
Foi comparado o conjunto de funções removidas entre a base anterior à limpeza e a V22. `featureCollection()` era a única função removida que ainda permanecia referenciada no código atual do mesmo módulo.

## Testes executados
- `node --check` em todos os arquivos JavaScript do projeto.
- Verificação de que `featureCollection()` está declarada antes dos seus 7 usos em `mapa.js`.
- Auditoria automática de funções removidas ainda referenciadas: nenhuma pendência após a correção.
- Verificação de cache `v23` no `index.html`.
- Teste de integridade do ZIP.

## Validação manual pendente
Ainda é necessário testar no celular a importação de XLSX/CSV real, pois câmera/WebView, rede, geocodificação e serviços externos não podem ser reproduzidos integralmente no ambiente de empacotamento.

---

## RELATORIO-V24-IMPORTACAO-RAPIDA-NUMERACAO.md

# V24 — Importação rápida e numeração somente após otimização

## Alterações

- A importação XLSX/CSV não dispara mais geocodificação em massa imediatamente após carregar o arquivo.
- Paradas sem coordenadas ficam pendentes e são geocodificadas somente quando o usuário toca em **Otimizar rota**.
- Coordenadas fornecidas pelo XLSX continuam preservadas na importação e são validadas contra o endereço somente na otimização.
- Antes da otimização, os marcadores do mapa aparecem como pontos compactos sem número.
- A lista de paradas e o card flutuante também não exibem número de sequência antes da otimização.
- Após uma otimização concluída com sucesso, a numeração oficial passa a aparecer no mapa, na lista e no card.
- Se a rota for alterada e precisar ser otimizada novamente, a numeração volta a ficar oculta até a próxima otimização concluída.

## Motivo da lentidão

A versão anterior podia iniciar dezenas de consultas de geocodificação logo após a importação quando a planilha não trazia coordenadas. Como o geocodificador trabalha de forma controlada e sequencial, uma planilha grande podia permanecer em processamento por muito tempo. A V24 separa claramente as etapas: **importar primeiro; localizar/validar/otimizar depois**.

## Arquivos alterados

- `js/roteirizacao/roteirizacao.js`
- `js/mapa/mapa.js`
- `js/mapa/marcadores.js`
- `css/roteirizacao.css`
- `index.html`

## Fluxo novo

1. Importar XLSX/CSV.
2. Mostrar imediatamente as paradas já carregadas.
3. Sem numeração oficial nessa etapa.
4. Ao tocar em **Otimizar rota**, localizar apenas as paradas sem coordenadas.
5. Validar coordenadas importadas quando necessário.
6. Calcular a sequência pela rede viária.
7. Somente após sucesso, exibir 1, 2, 3... nos marcadores/lista/cards.

---

## RELATORIO-V25-OTIMIZACAO-RAPIDA-VALIDACAO.md

# Pacote É Mato — V25 — Otimização rápida da validação de posições

## Problema identificado

A etapa "Conferindo posições da planilha" estava validando todas as coordenadas XLSX antes de calcular a rota. Em uma rota com 101 paradas, isso significava até 101 consultas de geocodificação antes do motorista conseguir continuar. Além disso, a implementação fazia o processamento de forma essencialmente sequencial e respeitava um intervalo padrão de 400 ms entre inícios de requisição.

Esse comportamento priorizava auditoria máxima, mas era inadequado para uso em rua.

## Mudança de estratégia

A V25 separa duas necessidades:

1. **Otimizar rápido** — antes da otimização, o app faz uma checagem rápida e genérica das coordenadas mais suspeitas e de uma amostra distribuída por toda a planilha.
2. **Auditoria completa** — continua disponível pela ação **"Validar endereços e posições"** no menu, para quando o motorista quiser conferir todas as coordenadas do XLSX.

Nenhum endereço específico, cidade específica ou planilha específica foi codificado.

## Checagem rápida

Para rotas grandes, são priorizados no máximo 14 pontos por otimização.

A seleção prioriza automaticamente:

- coordenadas exatamente repetidas em endereços diferentes;
- pontos muito afastados do centro robusto da rota;
- outliers dentro do mesmo CEP;
- outliers dentro do mesmo bairro;
- e completa as vagas com uma amostra distribuída do início ao fim da planilha.

Assim, uma rota com 101 paradas não precisa mais esperar 101 consultas antes de iniciar o cálculo.

## Paralelismo controlado

A validação rápida usa até 4 tarefas concorrentes, com início de requisições espaçado para evitar rajadas excessivas no serviço.

A geocodificação de paradas que realmente estão sem coordenadas também passou a usar um pool controlado de até 3 tarefas, em vez de aguardar cada endereço terminar antes de iniciar o próximo.

Foi adicionada uma fila de início de requisições para que o controle de intervalo continue correto mesmo quando há concorrência.

## Auditoria completa

A opção de menu anteriormente chamada "Validar endereços" agora aparece como:

**Validar endereços e posições**

Ela continua fazendo a validação completa, incluindo:

- localizar paradas sem coordenadas;
- conferir as coordenadas provenientes do XLSX com o endereço;
- corrigir pontos deslocados quando a confirmação do endereço for confiável.

Portanto, a correção continua genérica para qualquer XLSX; apenas deixou de bloquear a otimização com uma varredura completa de 100+ pontos.

## Feedback de progresso

Durante a checagem rápida, o overlay passa a mostrar progresso como:

`Conferindo 6/14 ponto(s) antes de calcular a rota.`

Na auditoria manual, o status também mostra o andamento das localizações e conferências.

## Testes executados

- `node --check` em todos os arquivos JavaScript: aprovado.
- Simulação com 101 paradas XLSX: a seleção rápida ficou limitada a 14 pontos.
- Na simulação, uma coordenada duplicada em endereço diferente foi automaticamente priorizada.
- A amostra rápida incluiu pontos distribuídos do começo ao fim da lista, incluindo a região central da rota.
- Teste com serviço simulado: 14 validações, concorrência 4 e espaçamento de requisição configurado concluíram em aproximadamente 2,8 s com latência simulada de 30 ms por resposta.
- Cache-busting atualizado para `v25`.

## Validação ainda necessária no aparelho

O tempo real depende da rede móvel, latência do Worker e resposta do provedor de geocodificação. O ganho precisa ser medido em uma rota real de 100+ paradas no celular.

---

## RELATORIO-V26-OTIMIZACAO-ETA-SELECAO-MULTIPLA.md

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

---

## RELATORIO-V27-STATUS-VISUAL-ROTA.md

# Pacote É Mato — V27 — status visual da rota

## Objetivo
Adicionar feedback visual persistente para Entregue e Não entregue no mapa, inspirado no comportamento de apps de roteirização, sem alterar coordenadas nem criar marcadores duplicados.

## Implementação
- Marcador entregue: verde escuro, texto branco e símbolo ✓.
- Marcador não entregue: vermelho, texto branco e símbolo ×.
- Parada pendente: mantém o padrão branco/verde.
- Selecionar uma parada finalizada preserva sua cor de status.
- Trecho até parada entregue: verde escuro.
- Trecho até parada não entregue: vermelho.
- A linha futura continua verde padrão.
- A rota base usada para o histórico visual é persistida em `visualStatusBase`, evitando que o recálculo após cada entrega apague o caminho já tratado.
- Desfazer entrega/não entrega atualiza marcador e linha novamente para Pendente.

## Arquivos alterados
- `js/mapa/marcadores.js`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `js/roteirizacao/roteirizacao.js`
- `js/core/rota-store.js`
- `js/state.js`
- `index.html`
- `README.md`

## Testes executados
- `node --check` em todos os JavaScripts.
- Teste sintético com rota contendo parada entregue e não entregue: dois segmentos de status gerados corretamente.
- Teste de nomes de ícones: parada selecionada entregue e selecionada não entregue usam assets distintos.
- Verificação de cache V27 no `index.html`.
- Verificação de integridade do ZIP.

## Validação manual pendente
- Aparência em aparelho Android/iOS durante navegação real.
- Cor dos trechos após vários recálculos por GPS.
- Comportamento com várias paradas no mesmo endereço físico.

---

## RELATORIO-V28-LINHA-ROTA-LIMPA.md

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

---

## RELATORIO-V29-NAVEGACAO.md

# V29 — controles, retorno ao mapa e término previsto

- Cabeçalho do cartão em grade: número da parada à esquerda; X e três pontos à direita; status em linha própria, sem sobreposição.
- Status Pendente com fonte maior (1,1 rem).
- Não entregue com fundo vermelho e texto branco, inclusive após aplicação do tema.
- Símbolo original do aplicativo e horário de término previsto no canto direito, abaixo do cartão de instruções. A posição acompanha a altura das instruções e os controles ficam abaixo do horário.
- Navegação inicia na primeira parada pendente com coordenadas válidas; usa outra parada ou a geometria como alternativa antes do centro padrão.
- Retorno ao primeiro plano reutiliza o mapa existente e a rota em memória. Reconstrução apenas quando não há mapa, o canvas foi removido ou houve perda do contexto gráfico. Ao retornar, centraliza na rota sem aguardar GPS.
- Horário usa a previsão calculada pela rota, atualizada quando o trajeto é recalculado ou o status muda; não representa trânsito em tempo real.
- Referências de CSS e JavaScript atualizadas para evitar reutilização de arquivos antigos em cache.

## Verificação
Sintaxe JavaScript validada. Teste automatizado com mapa simulado verificou seleção da próxima parada, formatação do horário, reutilização do mapa e recentralização na rota. A validação visual em navegador e o teste de GPS/retorno em aparelho real continuam necessários: o ambiente de verificação não possui Chromium instalado. Velocidade de tiles depende da conexão e do servidor de mapas.

## Instalação
Substitua os arquivos da versão anterior pelo conteúdo desta pasta no mesmo local de hospedagem. Não limpe os dados do navegador, pois contêm rotas e progresso. Recarregue o aplicativo para receber a versão atualizada.

---

## RELATORIO-V30-VISUAL-CONSTRUCOES.md

# V30 — término compacto, controles e construções

- Cartão de término com símbolo de 24 px, horário de 16 px e espaçamento menor, mantendo posição abaixo das instruções.
- X e três pontos substituídos por SVG de 16 px, centralizados em círculos de 34 px. Rótulos de acessibilidade e ações preservados.
- Construções em 2D: preenchimento claro e contornos cinza, visíveis a partir do zoom 14 e com mais contraste no zoom 16.
- Aplicação nos mapas de roteirização e navegação, usando a fonte de construções do estilo vetorial carregado, sem serviço adicional.
- A representação em 3D é substituída pelos contornos em 2D. Ruas, rótulos e rota são preservados.
- Cobertura depende dos dados da base atual. Não há promessa de cobertura igual à do Google/Spoke. O mapa raster de contingência mantém o desenho fornecido pelo seu servidor.

Verificações: sintaxe dos três arquivos JavaScript, testes simulados de construções, repetição de carregamento, troca de estilo, fallback raster e regressão do retorno à rota. Ícones e versão de cache verificados. Não foi possível validar em navegador ou com tiles reais neste ambiente; conferir no celular após atualizar a hospedagem.

Instalação: substituir a pasta do app na hospedagem e recarregar. Não apagar os dados locais do navegador, que guardam rotas e progresso.

---

## RELATORIO-V31-OTIMIZACAO-NAVEGACAO.md

# V31 — comparação viária e câmera de navegação

## Otimização

A distância e o tempo exibidos agora são os do percurso completo que fornece o desenho e as instruções. Não se usa a distância do planejador para substituir a de um trajeto diferente.

São comparados: sequência atual recalculada; sequência do planejador com preferência curta; sequência com preferência equilibrada (e a preferência atual, quando diferente). Para até 60 paradas pendentes, até dois ajustes locais adicionais são avaliados perto de um trecho de maior distância. Cada candidato é calculado integralmente pelas ruas, nos sentidos correspondentes, incluindo destino fixo ou retorno ao início. Não há inversão presumida de distâncias nem atalhos desenhados entre paradas.

Na preferência short, vence a menor distância confirmada e o tempo desempata. Nas demais preferências, a comparação prioriza o tempo calculado e desempata pela distância. Mais curta nem sempre significa mais rápida; o objetivo registrado no resumo permite conferir essa decisão. Uma sequência atual válida participa da comparação para evitar piora do objetivo escolhido.

O perfil de roteamento deriva do veículo selecionado. Mãos únicas e restrições são as representadas na rede do provedor para esse perfil; esta atualização não verifica mudanças de sinalização em tempo real. O tempo continua usando fluxo livre mais atendimento por parada, sem trânsito ao vivo. Não se promete mínimo global ou resultado melhor que Spoke em toda rota.

Coordenadas inválidas, IDs repetidos e métricas inválidas não são aceitos. Se nenhuma alternativa completa puder ser calculada, a rota anterior permanece. Falhas opcionais e resultados dos candidatos ficam em resumoOtimizacao.comparacao. A comparação faz mais chamadas ao serviço e pode demorar mais e consumir mais créditos, especialmente nas rotas grandes segmentadas. O limite de refinamento evita buscas ilimitadas.

## Navegação

Câmera a 58 graus no modo interno, com direção do deslocamento (ou da via quando o GPS não fornece heading), zoom próximo e posição do veículo calculada para ficar acima do painel de entrega. Heading null não é mais convertido em norte.

Arrastar, aplicar zoom, girar ou inclinar manualmente pausa o acompanhamento. Atualizações programáticas não acionam esse estado. Recentralizar aparece somente no modo de exploração; ao tocar, retoma a câmera e desaparece. O retorno do app preserva a exploração manual quando o mapa existente está saudável. Recalcular durante a navegação também mantém o destino final configurado.

## Validação e instalação

Testes simulados: candidato de 18 km contra atual de 20 km; rejeição de alternativa pior; não usar 5 km informados pelo planejador quando o percurso tem 18 km; destino final e perfil; métricas inválidas; falhas sem mutação da rota original; heading ausente; posição visível; pausa por gesto e retorno do acompanhamento. Sintaxe JavaScript e regressão das construções 2D verificadas.

Não foram feitas chamadas de otimização com endereços reais nem validação no aparelho. O teste de campo deve comparar a mesma lista, partida, destino, veículo e horário entre os aplicativos. O navegador de testes não está instalado neste ambiente.

Substitua os arquivos da hospedagem, mantendo os dados locais, e recarregue. Estas mudanças usam os endpoints já existentes e não exigem atualização do Worker.

---

## RELATORIO-V32-PARADAS-MENU-VEICULOS.md

# V32 — paradas independentes, menu e veículos

## Entregas no mesmo local
Cada parada com ID próprio tem seu marcador, número, pacotes e status. Paradas com coordenadas iguais não são mais representadas por um único balão. Os símbolos recebem afastamento visual, sem alterar as coordenadas usadas na rota. Entregar ou não entregar afeta somente o ID selecionado. O deslize do cartão destaca o marcador correspondente e pausa o acompanhamento para que o GPS não tire a seleção de vista. Notas da parada anterior são preservadas no deslize.

Uma parada que já contém vários pacotes continua sendo uma parada; não são inventados novos endereços ou divididos registros sem identidade própria. Entregas já registradas anteriormente não são desfeitas automaticamente.

## Menu
Novo cabeçalho com símbolo, ícones, textos auxiliares, destaque da página atual, botão de fechar e área de suporte. Ordem: Minha rota, Configurações, Histórico. Tutorial em vídeo, convite inicial e disparo automático removidos.

## Troca de navegação e configurações
Trocar apenas Pacote É Mato/Waze/Google Maps não altera a geometria, ponto inicial, sequência, status ou seleção da rota. Ao sair da navegação, a seleção é salva antes da troca de tela. Configurações relevantes carregam a versão mais recente da rota, evitando sobrescrever entregas com uma cópia antiga. Aplicações são serializadas e a troca de tela aguarda sua conclusão.

Os aplicativos externos recebem o destino selecionado e calculam seu próprio trecho. Não é possível impor a eles a geometria exata do Pacote É Mato ou reconhecer automaticamente uma entrega realizada externamente. A ordem e o progresso ficam preservados no Pacote É Mato.

## Veículos
Carro → drive; moto → motorcycle; caminhão leve → light_truck; caminhão → truck. O perfil é usado tanto no planejador quanto no cálculo dos percursos. Ao mudar o veículo, o app compara rotas para as paradas restantes. Se o cálculo falhar, mantém os status e exige recalcular antes de navegar com o novo perfil.

O antigo perfil Caminhão era light_truck. Rotas antigas desse tipo são sinalizadas para recálculo antes de usar o perfil truck. Os perfis do provedor têm limites padrão: leve até 3,5 t/3,2 m; caminhão até 22 t/4,1 m. Não são parâmetros personalizados para todo tipo de carga ou dimensões.
Fonte: https://apidocs.geoapify.com/docs/routing/

## Verificação
Testes simulados verificaram dois IDs no mesmo ponto, marcadores separados, seleção por deslize, entrega isolada, troca de mapa sem gravação na rota, alteração de veículo com progresso recente e disparo de recálculo. Regressões de câmera, otimização e construções 2D e sintaxe JavaScript verificadas.
Não houve teste visual em navegador, rota real ou GPS no aparelho neste ambiente. A comparação escolhe a melhor alternativa avaliada para o perfil, sem garantia de mínimo global.

## Instalação
Substituir os arquivos na hospedagem e recarregar, sem apagar dados locais. Endpoints atuais são compatíveis; não é necessário republicar o Worker.

---

## RELATORIO-V38-MARCADOR-ATIVO-ESTAVEL.md

# V38 — marcador da próxima entrega estável

## Alterações

1. Removido integralmente o recurso de postos de combustível: interface, estado, scripts, estilos e endpoint `/fuel` do Worker.
2. Separado o conceito de cartão exibido do conceito de próxima parada ativa.
3. O marcador verde agora usa exclusivamente a próxima parada pendente (`proxima()` / `rota.proximaParadaId`).
4. Deslizar para cartões anteriores ou seguintes não transfere mais a cor verde para a parada visualizada.
5. Quando uma entrega é concluída, a parada concluída mantém o check e a próxima pendente recebe o verde automaticamente.

## Exemplo esperado

Se a parada 12 for entregue, ela recebe ✓ e a parada 13 fica verde. Se o motorista deslizar para visualizar 14, 15 ou voltar para 12, a 13 continua verde no mapa até ser tratada.

---

## RELATORIO-V39-CORRIDA-OBS-DIALOGOS.md

# Pacote É Mato — V39

## Alterações

- Marcador verde agora representa o ponto de continuidade da corrida.
- Ao concluir uma parada fora de ordem, a próxima parada posterior a ela vira a ativa verde; pendências anteriores permanecem brancas.
- Deslizar/consultar outros cartões não move o destaque verde.
- Card de navegação ganhou bloco dedicado de Observação do cliente com a logo do Pacote É Mato.
- Observação do cliente não é mais duplicada no texto genérico de complemento.
- Confirmações nativas do navegador foram substituídas por diálogo visual próprio do Pacote É Mato nas ações existentes de rota, histórico, navegação e administração.
- Sistema de combustível permanece completamente removido.

---

## RELATORIO-V40-MARCADORES-FIXOS-SELECAO-OBSERVACOES.md

# Pacote É Mato V40 — Marcadores fixos, seleção verde e observações

## Correções

- O marcador verde na navegação agora representa a parada que está selecionada/visível no card.
- Tocar em um balão atualiza imediatamente o card e deixa esse balão verde.
- Deslizar entre os cards também transfere o verde para a parada visualizada.
- Ao concluir uma parada, o card avança e a próxima parada passa a verde; paradas pendentes anteriores ficam brancas.
- Marcadores não usam mais deslocamento visual dinâmico (`icon-offset`), permanecendo presos às coordenadas reais.
- O bloco “Observação do cliente” usa o campo de observação da planilha e também reúne complemento, apartamento, bloco, sala e loja.
- Quando informações como `ap 104`, `tocar campainha`, `interfone` ou `portaria` vierem misturadas no endereço, elas são extraídas para o bloco de observação.
- O visual dos ícones/marcadores foi preservado; a alteração é de estado/posição, não de desenho.

---

## RELATORIO-V41-CONTINUIDADE-VERDE-OBSERVACOES-SPX.md

# Pacote É Mato V41 — continuidade verde e observações SPX

## Marcador verde na navegação
- O marcador verde representa exclusivamente a continuação da corrida (`proximaParadaId`).
- Abrir ou deslizar para outro card não muda o marcador verde.
- Exemplo: 28 concluída -> 29 verde; ao consultar a 5, a 29 continua verde e a 5 permanece branca se pendente.
- Ao concluir uma parada fora de ordem, a continuação passa para a próxima parada pendente após a parada tratada.

## Observações da planilha SPX
A planilha operacional não possui coluna própria de observação. O complemento vem dentro de `Destination Address`. A V41 copia o trecho após `logradouro, número,` para `observacao`, preservando o endereço original.

Exemplos:
- `Rua Coronel Joviniano Brandão, 462, Pode jogar na garagem` -> `Pode jogar na garagem`
- `Rua Antônio Chiarizzi, 145, T3 ROMA APTO 402` -> `T3 ROMA APTO 402`
- `Pç do Cent de Vl Prudente, 143, ap 104` -> `ap 104`

## Marcadores
- Sem deslocamento dinâmico (`markerOffset` permanece `[0,0]`).
- Consultar cards não altera a posição física dos balões.

---

## RELATORIO-V42-IMPORTACAO-CARD-TRACADO-FORA-DE-ORDEM.md

# V42 — Importação, card e traçado fora de ordem

- “Nova rota” aparece antes de “Adicionar ao mesmo mapa”.
- As duas opções usam o mesmo estilo principal.
- Toda importação posiciona seleção e continuidade na primeira parada da ordem.
- Card de navegação recebe animação leve em swipe, seleção no mapa e avanço após status.
- Trechos associados a paradas tratadas passam a cinza mesmo quando a entrega é concluída fora da ordem.
- A próxima continuidade verde continua baseada em `proximaParadaId`.

---

## RELATORIO-V43-FLUIDEZ-INICIO-1-TEMA-BRANCO-VERDE.md

# V43 — Fluidez, início na parada 1 e identidade branco/verde

- Corrige a seleção após otimização: toda nova rota começa na primeira parada da nova ordem calculada.
- Limpa seleção externa antiga para impedir abertura em paradas como 6/15 após nova importação.
- Swipe dos cards foi aliviado: sem reconstrução dos marcadores a cada card, persistência com debounce e animação via Web Animations.
- Movimento do mapa ao navegar pelos cards foi encurtado e interrompe animação anterior antes de iniciar a próxima.
- Repaginação visual global baseada em branco e verde, com preto apenas para texto/contraste.
- Diálogos próprios agora usam superfície branca e ações verdes, melhorando legibilidade.
- Botões Nova rota e Adicionar ao mesmo mapa permanecem na ordem solicitada e com o mesmo tratamento verde.

---

## RELATORIO-V44-UI-LIMPA-SEM-COMBUSTIVEL.md

# V44 — limpeza visual, remoção de combustível e ações padronizadas

## Ajustes principais
- Removido o botão/atalho de **Combustível** do menu lateral.
- Tema fixado em **Branco + Verde** para padronizar toda a interface.
- Botão **Não entregue** ajustado para vermelho.
- Botão do menu (três riscos) sem o fundo branco atrás no módulo principal de roteirização.
- Botões de **três pontinhos / ações** padronizados para o mesmo estilo.
- A ação **Refinar rota** saiu do rodapé da revisão e foi movida para o menu de **3 pontinhos**.
- Melhorias visuais nos cards e menus para combinar com a sidebar.

---

## RELATORIO-V45-REFINO-UI-ORDEM.md

# V45 — refinamento, ordem invertida e acabamento visual

- Corrigida a seleção inicial após refinar/inverter antes de iniciar a rota: a primeira parada da nova ordem passa a ser a primeira operacional.
- Adicionado botão X próprio dentro do painel de refinamento.
- Ações destrutivas do menu deixam de usar grandes blocos vermelhos e seguem o padrão branco/verde.
- “Não entregue” permanece vermelho por significado operacional.
- Configurações, revisão/refino e menus de ações receberam novo acabamento visual.
- Menu superior passa a usar hambúrguer limpo e transparente em todas as telas.

---

## RELATORIO-V46-MULTIPLAS-REFINO-LIMPO.md

# V46 — múltiplas, menu enxuto e refinamento isolado

- Restaurado agrupamento de paradas no mesmo endereço físico com contador no balão.
- O número do balão múltiplo acompanha a parada consultada; a continuidade verde segue a corrida.
- Removidos dos menus: Validar endereços e posições, Organizar paradas e Sair da navegação.
- Refinar rota recebeu rolagem própria para não movimentar a lista de endereços ao fundo.
- Mantido Recalcular rota como ação secundária da navegação.

---

## RELATORIO-V47-DUPLO-VERDE-ATIVA-SELECIONADA.md

# V47 — parada ativa + parada selecionada em verde

- A parada ativa da corrida permanece verde até ser tratada.
- Ao tocar ou navegar pelos cards para outra parada, a parada consultada também fica verde.
- O destaque de consulta não altera `proximaParadaId` e não muda a continuidade da corrida.
- Ao selecionar outra parada, o verde de consulta acompanha a nova seleção; o verde operacional continua na parada ativa.
- Paradas pendentes não selecionadas permanecem brancas.
- A atualização após swipe usa a source de marcadores com ícones cacheados para preservar fluidez.

---

## RELATORIO-V48-BIPAGEM-EM-DESTAQUE.md

# V48 — Bipagem em destaque

- Bipagem ganhou acesso direto no menu lateral.
- Adicionado atalho de Bipagem na tela principal da rota.
- Bipagem agora possui três áreas próprias: Bipar pacotes, Histórico e Configurações.
- Histórico de Bipagem usa somente os registros da conferência por bipagem/PDF.
- Configurações da Bipagem ficam dentro da própria Bipagem (som/vibração e fala da parada).
- Abertura direta pelo menu não exige rota ativa; o usuário pode importar PDF normalmente.

---

## RELATORIO-V49-REFINO-SEPARADO-INICIAR-ROTA.md

# V49 — Refinar separado e botão Iniciar rota corrigido

- O painel **Refinar rota** agora é independente da tela de revisão e mostra somente as ações de refinamento.
- Adicionado X para fechar apenas o refinamento.
- Inverter ordem, otimização automática, desenho e desfazer retornam ao painel de refinamento, sem exibir a lista completa de endereços.
- Área inferior da roteirização ganhou margem/padding seguro para impedir que **Iniciar rota** fique cortado pela barra do aparelho.
- Mantida a regra de ordem: após inverter antes de iniciar, a primeira parada da nova ordem é a primeira operacional.

---

## RELATORIO-V50-PDF-UNIVERSAL-BIPAGEM.md

# V50 - leitor universal de PDF na Bipagem

- Adicionado leitor que associa códigos BR a endereços por linha/proximidade visual.
- Não exige mais numeração na coluna `#`, permitindo PDFs do Spoke como o arquivo de teste.
- Compatibilidade ampliada para exports textuais do Circuit e layouts semelhantes.
- Leitura estrita e leitor legado permanecem como contingência.
- Tela Paradas & Endereços agora mostra contagem explícita de paradas e pacotes, além de múltiplas.
- PDFs puramente escaneados (imagem sem camada de texto) continuam exigindo OCR/export textual.

---

## RELATORIO-V51-PDF-ROBUSTO-CONTAGEM-FISICA.md

# V51 — PDF robusto, contagem física e refinamento corrigido

- Adicionada leitura direta das linhas visuais do PDF.js para Spoke/Circuit, sem depender da coluna `#`.
- Códigos BR são associados ao endereço da mesma linha visual antes dos leitores de contingência.
- Corrigido bug do Refinar que podia abrir apenas o fundo desfocado com o painel interno oculto.
- Removido o card `Abrir Bipagem` da tela principal da rota; Bipagem continua no menu lateral.
- Contagem de paradas na roteirização/revisão passa a usar endereços físicos únicos; entregas permanecem informadas separadamente.
- Todos os assets locais do `index.html` receberam cache-bust V51 para evitar JavaScript antigo no celular.

---

## RELATORIO-V52-CONFIG-LIMPA-GPS-AUTOMATICO.md

# V52 — Configurações limpas e GPS automático

- Removido da tela de Configurações o bloco **Ponto de partida**.
- Removido da tela de Configurações o bloco técnico **Serviço de rotas**.
- O Worker continua configurado internamente em `js/mapa/config.js`; o motorista não precisa editar a URL.
- A otimização passa a atualizar automaticamente a origem pela localização GPS atual.
- Preferências antigas de ponto inicial não são mais usadas como configuração global.
- Se a leitura de GPS falhar durante uma rota já carregada, uma origem válida existente pode ser usada como contingência.

---

## RELATORIO-V53-ADMIN-SEPARADO-SEGURO.md

# V53 — Painel do Dono separado e gateway de segurança

- Desativado o acesso antigo por 5 toques na logo.
- Criado painel independente em `/admin/` com Dashboard, Clientes, Pagamentos, Comunicados e Segurança.
- Criado Cloudflare Worker `admin-gateway-worker.js` com e-mail + PIN mantidos em secrets, sessão HMAC de 30 minutos, CORS por origem exata, rate limit, limite de corpo, whitelist de endpoints e cabeçalhos de segurança.
- Nenhum segredo administrativo é colocado no HTML/JS do painel.
- O painel usa o backend administrativo atual por meio do gateway.
- Limitação: o código-fonte do Worker administrativo atual (`holy-frog-272c...`) não acompanha o projeto. Para isolamento total, esse Worker deve ser alterado para aceitar `/admin/*` somente com o segredo compartilhado do gateway.

---

## RELATORIO-V54-ADMIN-CONFIG-INTEGRADO.md

# Pacote É Mato V54 — Admin config integrado

- `admin/config.js` já aponta diretamente para `https://holy-frog-272c.joaovitor250p.workers.dev`.
- Nenhum PIN, e-mail autorizado ou segredo fica no front-end.
- O Worker completo seguro foi incluído também em `cloudflare/WORKER-HOLY-FROG-SEGURO-COMPLETO.txt` para cópia manual no Cloudflare.
- Cache do painel administrativo atualizado para V54.

