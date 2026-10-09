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
