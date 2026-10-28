# MB REFERENCIAS — revisão do código e da importação de fotos

Data: 28/10/2026. Revisão feita sobre `MB-REFERENCIAS-3.0-CORRIGIDO-BUILD.zip`, sem modificar o Firebase ou o repositório de produção.

## Arquivos modificados

- `src/ModelPhotos.tsx`: importação de fotografias por CSV/XLS/XLSX no Catálogo de Modelos; prévia com imagem e opção de confirmar; comparação pelo nome normalizado E conferência da REF; identificação de duplicatas e referências divergentes; teste de carregamento da URL no navegador antes de gravar; preservação das imagens existentes e uso de transações no Firestore para impedir a substituição de fotos alteradas por outro usuário; opção manual de foto.
- `src/App.tsx`: Fotos agora é uma seção interna de Catálogo de Modelos, e não uma aba separada de produção. Permanecem login, busca, importação de modelos e controle de permissões.
- `src/SampleWorkflow.tsx`: em Amostras, não exibe estados nem controles de produção; em Cortes, preserva os três estados (Em andamento, Pronto, Foi pra loja), filtros e pesquisa. Novas OCs usam ID determinístico e transação que impede a mesma OC de ser criada duas vezes simultaneamente no padrão novo. Registros antigos continuam com seus IDs e são verificados antes de cadastrar uma OC. Edição preserva a OC; marcação de status, edição, criação e exclusão passam a gravar evento em `audit_log` por operação agrupada.
- `src/styles.css`: estilos da navegação interna Catálogo / Fotos.
- `README.md`: instruções de instalação e de importação das fotografias.

## Conferência do CSV e do relatório de fotos

- CSV: 175 linhas, 175 nomes diferentes, 175 URLs diferentes, todas HTTPS em `storage.googleapis.com`.
- Relatório XLSX: 194 modelos; 175 correspondências declaradas e 19 sem correspondência.
- Conferência cruzada: os 175 trios (nome, REF, URL) do CSV coincidem exatamente com os 175 registros confirmados na planilha.
- Exemplo: `BERM DRY NIKE SIMB BAS R.L`, `REF.10359` existe no CSV.
- **Não foi possível validar via rede a resposta HTTP, conteúdo real, CORS ou disponibilidade dos 175 endereços:** o ambiente de execução não tem resolução DNS externa. O aplicativo testa a carga das imagens no navegador do usuário antes de associá-las.
- **Não foram importadas imagens para o Firebase durante esta revisão**. Os links permanecem num arquivo separado que deverá ser carregado manualmente pelo administrador no Catálogo.

## Verificações e resultados reais

| Teste | Resultado |
|---|---|
| Análise de sintaxe TS/TSX com TypeScript instalado globalmente, de todos os 8 arquivos de código | Aprovada: 0 erros de sintaxe |
| Verificação estática auxiliar com declarações de bibliotecas simuladas | Sem erros adicionais de código nas partes analisadas; simulações NÃO substituem as bibliotecas reais |
| Conferência de 175 linhas do CSV vs. relatório | Aprovada: 175/175 trios idênticos |
| Validação da quantidade e formato HTTPS das URLs do CSV | Aprovada: 175/175 URLs HTTPS |
| `npm install --no-audit --no-fund --prefer-offline` | Não concluiu; o ambiente não resolve `registry.npmjs.org` |
| `npm run build` com dependências reais | **Não aprovado/não concluído:** dependências indisponíveis; erro TS2307 (módulos não encontrados) |
| Execução real de login, importação, status e regras no Firebase do usuário | Não realizada: sem credenciais/sessão no banco do usuário |
| Teste real das URLs em navegadores do usuário | Não realizado aqui; será checado durante a prévia/importação |

## Segurança de publicação

1. Faça backup dos modelos do site antes de substituir arquivos.
2. Importe as fotos **dentro do Catálogo de Modelos**, não na função genérica Importar Modelos.
3. Não envie `fotos-modelos-MB-REFERENCIAS.csv` para um repositório público, porque revela nomes, referências e URLs privadas do seu negócio.
4. As fotos importadas por URL NÃO são cópias armazenadas no Firebase; dependem da permanência dos arquivos na origem. O banco guarda apenas o endereço e os dados do modelo.
5. `firestore.rules` está presente para conferência: **não publique automaticamente sem comparar com as regras reais de produção**. Para aceitar imagens por HTTPS e status `store`, as regras em produção precisam admitir esses valores. Não substituir por regras abertas.
6. O GitHub Actions preservado utiliza `npm install` seguido de `npm run build`, e só publica `dist` se o build tiver sucesso. Uma execução verde é a validação real que falta.
7. A proteção contra OCs duplicadas funciona integralmente entre novos registros de ID determinístico. Documentos antigos com ID automático são verificados por pesquisa e pelo snapshot; durante uma migração com muitos clientes escrevendo simultaneamente pode ser necessária consolidação administrativa posterior.
8. A auditoria no Firestore é operacional e protegida contra edição/exclusão por clientes comuns, mas não é uma auditoria antifraude controlada por backend.
