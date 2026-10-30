# MB REFERENCIAS — análise de desempenho e alterações 4.11

## Diagnóstico do projeto

1. **Catálogo no celular:** a grade do catálogo foi ajustada para duas colunas sem forçar Amostras e Cortes a usar o mesmo layout compacto.
2. **Modelos:** as fotos continuam no campo `imageData` dos documentos `models`. Enquanto isso permanecer assim, a consulta da coleção de modelos traz as fotos junto com os dados do catálogo. A migração para Firebase Storage pode reduzir esse tráfego, mas precisa ser feita separadamente com backup.
3. **Amostras:** antes, as fotos adicionais estavam no campo `extraImages` do documento principal, que é recebido no snapshot de todas as OCs. A versão 4.11 mantém a foto principal no documento e move as fotos 2/3 para uma subcoleção por OC, carregada somente quando a pessoa abre aquela amostra.
4. **Fotos inesperadas:** a versão 4.11 não lê a antiga subcoleção `production_samples/{id}/photos` nem exibe o campo legado `extraImages`. Assim, fotos antigas de origem incerta não aparecem automaticamente. Os dados legados não são apagados.
5. **Gastos:** notas fiscais ficam em `expenses/{id}/attachments/receipt`; a lista de gastos não baixa imagens e só consulta a nota quando o cartão é expandido.
6. **Telas que não precisam do catálogo:** o snapshot de `models` é encerrado em Gastos, Informações, Oficinas e Ordem de Corte.
7. **Listas e imagens:** imagens de cartões usam carregamento tardio e decodificação assíncrona; contadores e seleções derivados usam memoização onde apropriado.

## Alterações da versão 4.11

- Câmera e Galeria adicionadas ao cadastro/edição de modelos.
- Câmera e Galeria adicionadas também à janela de edição rápida da foto principal no Catálogo.
- A foto do modelo é compactada antes do salvamento e só é gravada após a confirmação.
- Até três fotos por amostra: `imageData` no documento principal e `gallery/photo_2` + `gallery/photo_3` na subcoleção daquela OC.
- O formulário consulta apenas os dois IDs conhecidos da OC aberta; não executa consulta geral da galeria.
- Ao excluir uma OC, o app remove os IDs conhecidos das galerias nova e antiga sem ler imagens de outras OCs.
- A nota fiscal continua isolada em uma subcoleção, consultada apenas ao abrir os detalhes do gasto.
- O card compacto de quantidade de amostras usa o snapshot existente, sem uma consulta extra.
- As regras Firestore permitem os novos caminhos sem abrir leitura geral e mantêm o bloqueio padrão.

## O que ainda pode causar lentidão

- O catálogo ainda carrega `imageData` de todos os modelos observados. Para um catálogo muito grande, o próximo passo recomendado é migrar imagens para Firebase Storage e manter URLs/metadados no Firestore.
- A lista de Amostras/Cortes ainda carrega a foto principal de cada OC porque ela é usada como miniatura. As fotos 2 e 3 não são baixadas até abrir a OC.
- A consulta de produção continua observando todos os documentos de `production_samples`. Se o volume crescer muito, poderá ser necessário paginar ou filtrar por status/data no Firestore, depois de validar índices e regras.

## Validação necessária no ambiente real

1. Instalar dependências e executar `npm run build`.
2. Publicar o arquivo completo `firestore.rules` no projeto Firebase.
3. Testar câmera e galeria no celular com administrador e editor.
4. Criar amostra com três fotos, fechar e reabrir a mesma OC, remover a principal e salvar.
5. Confirmar que nenhuma foto de outra OC ou da antiga subcoleção aparece.
6. Salvar nota fiscal, abrir detalhes, ampliar, editar os dados do gasto e confirmar que a nota continua anexada.
7. Testar acesso somente leitura com perfil visualizador.

O ambiente desta execução não conseguiu concluir `npm install` dentro do tempo disponível e não possui credenciais do Firebase de produção. Portanto, o build final e as permissões reais ainda precisam ser confirmados antes da publicação.
