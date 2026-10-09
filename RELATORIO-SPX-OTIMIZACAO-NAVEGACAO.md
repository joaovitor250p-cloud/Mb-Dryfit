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
