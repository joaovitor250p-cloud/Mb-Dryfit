# Pacote É Mato

Aplicativo web/PWA de logística com Roteirização, Navegação, Bipagem e Histórico compartilhando uma única Rota Ativa.


## V21 — correção do pós-entrega + limpeza técnica

- Corrigido o erro `distanciaMetros is not defined` que interrompia o redesenho/recalculo da rota depois de marcar uma parada como Entregue ou Não entregue.
- O tratamento da geometria na navegação agora reutiliza a função de distância já existente no módulo, evitando duas implementações concorrentes.
- Removidos restos de clustering desativado, source/layers de “próxima parada” que ficavam permanentemente vazios, variáveis sem uso e uma função de navegação já removida da interface.
- A lógica repetida de chave física e quantidade de pacotes dos marcadores foi centralizada em `js/mapa/marcadores.js`, usada pelo planejamento e pela navegação.
- O Desfazer permanece contextual: após Entregue/Não entregue o app avança; ao voltar ao card finalizado, é possível desfazer somente aquela parada.

## Fluxo operacional atual

```text
Importar XLSX
    ↓
Carregamento e conferência
    ↓
Mapa / planejamento
    ↓
Otimizar rota
    ↓
Refinar, se necessário
  • otimizar automaticamente
  • inverter pendentes
  • desenhar no mapa ou tocar nas paradas uma a uma
  • desfazer última alteração
    ↓
Confirmar rota
    ↓
Navegar
  • Pacote É Mato
  • Waze
  • Google Maps
    ↓
Não entregue / Entregue
    ↓
Próxima parada pendente
    ↓
Histórico reutilizável
```

A Rota Ativa anterior não é substituída apenas por selecionar um arquivo. A nova rota só se torna ativa no fluxo de conferência/planejamento.

## Planilhas SPX

A importação reconhece automaticamente o formato operacional usado nos arquivos reais de teste:

```text
AT ID
Sequence
Stop
SPX TN
Destination Address
Bairro
City
Zipcode/Postal code
Latitude
Longitude
```

Regras principais:

- `SPX TN` é preservado como código do pacote/bipagem.
- `Destination Address` é mantido integralmente, incluindo apartamento, bloco, sala, loja ou outras informações presentes no texto.
- Campos separados de complemento, apartamento, bloco, sala, loja e observação também são preservados quando existem na origem.
- Bairro, cidade e CEP permanecem separados.
- Latitude/Longitude válidas do próprio XLSX são usadas diretamente no mapa.
- O número do imóvel pode ser identificado quando está embutido em `Destination Address`.
- `Sequence` e `Stop` são preservados como dados de origem; a ordem operacional é mantida por IDs permanentes das paradas.
- Coordenadas inválidas nunca são substituídas por coordenadas inventadas.
- Arquivos com formato diferente continuam podendo usar associação manual de colunas.

## Refinamento da rota

O painel **Refinar** mantém somente as formas operacionais desejadas:

1. **Otimizar automaticamente** — solicita nova sequência ao serviço de roteirização real.
2. **Inverter ordem** — inverte apenas as posições das paradas ainda pendentes; entregues e não entregues preservam seus registros e IDs.
3. **Desenhar no mapa** — o motorista pode contornar um grupo de marcadores ou tocar nas paradas uma a uma. O grupo selecionado pode ser colocado antes das demais pendentes, no fim das pendentes ou, quando houver uma única parada selecionada, tornar-se a próxima parada.
4. **Desfazer última alteração** — restaura a ordem anterior e recalcula o percurso.

O desenho usa a posição geográfica real dos marcadores. Ele não move coordenadas. Depois de uma alteração manual, `/route` é usado novamente para recalcular o trajeto pelas ruas. Se o recálculo falhar, a ordem anterior é restaurada.

## Navegação e registro de entrega

O cartão da parada usa três ações principais:

```text
Navegar | Não entregue | Entregue
```

- **Navegar** obedece diretamente à opção salva em Configurações; não abre um segundo seletor.
- **Pacote É Mato** mantém a navegação interna.
- **Waze** e **Google Maps** recebem a parada selecionada depois que o estado da rota é persistido.
- Ao voltar de um navegador externo, a parada selecionada continua disponível para registro no Pacote É Mato.
- **Não entregue** é uma ação de um toque, como **Entregue**; não exige motivo para avançar.
- O gesto horizontal no cartão permite consultar paradas sem registrar resultado. Os botões de seta do cartão foram removidos.
- Todos os marcadores permanecem numerados durante a rota. Pendente, atual, entregue e não entregue têm aparência distinta sem perder o número sequencial.
- A navegação própria permanece em mapa 2D.

GPS, voz e execução contínua com tela bloqueada/segundo plano continuam sujeitos às limitações do navegador/PWA e do sistema operacional.

## Retorno do segundo plano e recuperação

O aplicativo diferencia inicialização de retomada:

- `visibilitychange`, `pageshow` e `focus` não disparam recarga completa da aplicação.
- seção atual, painel, parada selecionada, próxima parada e preferências operacionais são persistidos.
- antes de abrir Waze/Google Maps, a rota, a parada selecionada e a nota digitada são salvas.
- a Rota Ativa continua usando o armazenamento existente; existe uma cópia local de contingência da rota ativa para recuperação quando o processo for recriado e o armazenamento principal estiver temporariamente indisponível.

A recuperação após o sistema operacional encerrar o processo depende de o navegador/PWA preservar o armazenamento local e de a sessão de autenticação ainda ser válida.

## Bipagem

O acesso operacional à Bipagem fica no menu `⋮` da Roteirização. Ele oferece:

- **Bipar rota atual** — usa a mesma Rota Ativa, sequência e códigos de pacote.
- **Importar PDF** — abre o fluxo legado de PDF para arquivos de sistemas compatíveis.

A Bipagem não fica duplicada no menu lateral.

## Histórico

As rotas continuam no Histórico. Uma rota histórica pode ser aberta novamente no mapa sem criar uma cópia da rota. Se já houver outra rota ativa, o aplicativo pede confirmação antes de trocar qual rota está aberta, mantendo a anterior salva no Histórico.

## Configurações e menu

- Navegação preferida, veículo, tempo de parada, retorno ao início, ponto inicial e Worker usam salvamento automático.
- Termos de uso, Política de privacidade e Licenças ficam em **Configurações > Legal**.
- O menu lateral foi simplificado para Histórico, Configurações, tutorial, suporte e desconexão.
- A antiga opção de zerar bipagens não faz parte do menu operacional.

## Serviço seguro de rotas

O projeto continua preparado para os endpoints existentes:

```text
GET  /health
POST /geocode
POST /optimize
POST /route
```

A chave `GEOAPIFY_API_KEY` deve permanecer somente como Secret no Cloudflare Worker. Não coloque chaves secretas em HTML, JavaScript público ou no ZIP de publicação.

Nenhum serviço externo é publicado ou alterado automaticamente por estes arquivos.

## Preservação do núcleo

Login/Firebase, usuários, permissões, importação, scanner, câmera, Bipagem, histórico, sons, vibração, voz e demais módulos existentes permanecem integrados ao projeto.

Consulte `RELATORIO-IMPLEMENTACAO-REFINO-DESENHO.md` para os testes realmente executados, limitações de ambiente e detalhes desta entrega.

## Atualização V12 — marcadores do mapa
A V12 unifica o desenho dos marcadores de planejamento e navegação em `js/mapa/marcadores.js`, usa símbolos nativos do MapLibre, clustering em zoom distante e cápsulas compactas com número sequencial + multiplicador somente para paradas múltiplas. Consulte `RELATORIO-AJUSTE-V12-MARCADORES-DEFINITIVOS.md`.

## Atualização V13 — Adicionar e remover pacotes por bipagem

O menu de ações da Roteirização agora possui **Adicionar à rota** e **Remover da rota**.

### Adicionar à rota

1. Abra `⋮` na rota e toque em **Adicionar à rota**.
2. Selecione o XLSX/CSV de origem.
3. Bipe somente os pacotes que realmente deseja receber.
4. Toque em **Conferir seleção** e revise códigos/endereço/quantidade.
5. Escolha entre manter a ordem atual, otimizar somente as novas paradas ou otimizar toda a rota.
6. Confirme. Pacotes não bipados não entram na rota.

### Remover da rota

1. Abra `⋮` e toque em **Remover da rota**.
2. Selecione o XLSX/CSV de referência.
3. Bipe somente os pacotes que sairão da sua responsabilidade.
4. Revise quantos pacotes permanecerão em cada parada.
5. Confirme. Somente os códigos selecionados e elegíveis são removidos.

Se uma parada ainda tiver pacotes, ela continua na rota. Se ficar sem pacotes e não for uma parada histórica/finalizada, ela é removida. Operações canceladas não alteram a Rota Ativa.

A V13 mantém os marcadores nativos do MapLibre da V12, reduz o agrupamento de zoom distante para um indicador discreto e sincroniza multiplicador, cartão e lista com a quantidade real de pacotes. Consulte `RELATORIO-V13-OPERACOES-PACOTES-MARCADORES.md` para arquivos alterados e testes realmente executados.

## Atualização V14 — navegação, bipagem de operações e mapa

A V14 separa o feedback de bipagem de Adicionar/Remover rota da bipagem comum, elimina os clusters circulares em zoom distante, adiciona recuperação robusta do mapa ao retornar de Waze/Google Maps, painel expansível na navegação, status reversível de entrega e adição rápida de endereço pelo campo de busca. Consulte `RELATORIO-V14-AJUSTES-NAVEGACAO-BIPAGEM-MAPA.md`.

## Atualização V15 — 13/10/2026

A V15 separa a bipagem de Adicionar/Remover pacotes da bipagem normal, simplifica a navegação, adiciona busca de endereço com sugestões, aplica identidade branca/preta/verde, diferencia seta da navegação própria e ponto de localização para Waze/Google Maps, bloqueia TTS em navegação externa e avança automaticamente após Entregue/Não entregue.

Consulte `RELATORIO-V15-NAVEGACAO-BUSCA-BIPAGEM-SEPARADA.md` para detalhes e testes executados.

## V17 — mapa raster robusto + Desfazer contextual
A V17 troca a base visual principal por raster direto no MapLibre com fallback OSM e remove propriedades CSS de composição que podiam produzir canvas branco em WebView. O Desfazer voltou apenas no card de uma parada já finalizada; Entregue/Não entregue continua avançando automaticamente para a próxima pendente.

## V18 — restauração do mapa funcional + Desfazer no próprio card
A V18 restaura a mesma base vetorial OpenFreeMap usada na V14, que foi a última base visual conhecida como funcional no aparelho, mantendo OSM apenas como contingência. O fallback não é mais acionado por um erro isolado de tile/fonte. O fluxo de status permanece: Entregue/Não entregue avança automaticamente para a próxima pendente, e o botão Desfazer aparece somente quando o usuário volta ao card de uma parada já finalizada.


## V19 — suavização visual da rota e previsão de término

- O traçado verde usa simplificação apenas visual, dependente do zoom, sem alterar as coordenadas ou a rota salva.
- As linhas ficam mais finas em zoom distante para evitar aparência serrilhada/quebrada.
- O tempo padrão por parada deixou de ser 3 min automáticos. O valor padrão agora é 0 min e só é somado quando o usuário configurar explicitamente.
- Configurações antigas com os 3 min padrão são migradas para 0 min, evitando cerca de 90 min extras em uma rota de 30 paradas.
- Ao restaurar/iniciar uma rota, a previsão de término é recalculada com base no tempo rodoviário restante e no tempo de parada explicitamente configurado.


## V20 — estabilidade do mapa
A V20 mantém o provedor de mapa existente e corrige o traçado da rota no frontend: a geometria não é mais simplificada/recriada a cada zoom, legs contíguos são unidos com tolerância geográfica pequena e o cartão flutuante lateral de ETA foi removido.

## V22 — coordenadas XLSX e rotas grandes

A V22 adiciona validação endereço x coordenada para pontos importados da planilha, cálculo segmentado da geometria de rotas grandes, retry controlado em falhas transitórias e otimização transacional para impedir estado parcial após erro do serviço. Consulte `RELATORIO-V22-COORDENADAS-ROTA-502.md`.

## V23 — Correção da importação
Corrigido o erro de execução `featureCollection is not defined` que impedia o processamento da planilha. A função GeoJSON removida acidentalmente numa limpeza anterior foi restaurada, sem alterar as regras de importação ou de rota.

## Atualização V24 — importação rápida e numeração após otimização

- A importação não executa geocodificação em massa automaticamente.
- Endereços sem coordenadas são localizados somente ao tocar em **Otimizar rota**.
- Coordenadas XLSX são validadas somente na etapa de otimização.
- Antes da otimização, mapa/lista/card não exibem números de sequência.
- Após otimização concluída, a numeração oficial aparece normalmente.
