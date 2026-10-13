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
