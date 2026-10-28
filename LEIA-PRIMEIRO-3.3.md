# MB REFERENCIAS 3.3 — Chegou na loja + excluir cartões

Esta atualização foi preparada sobre a versão **3.2** (a versão com as 175 fotos já funcionando). Não recria o Firebase nem mexe nos 194 cadastros atuais.

## Passo a passo — sem VS Code e sem Node no computador

1. **Faça cópias de segurança ANTES de publicar**: dentro do sistema, abra Catálogo de Modelos → Backup (agora inclui as fotos gravadas manualmente); e Cortes → Backup das OCs. Salve os dois JSON. São arquivos de arquivo/recuperação técnica; a importação normal da tela não restaura automaticamente fotos nem OCs.
2. Extraia este ZIP no Windows. Envie o **conteúdo** da pasta extraída para a raiz do repositório `joaovitor250p-cloud/Mb-Dryfit` no GitHub. Inclua as pastas `src`, `.github` e os arquivos da raiz. **Não envie ZIP fechado como único arquivo no repositório**.
3. Veja a aba GitHub Actions e confirme que os passos **build** e **deploy** ficaram verdes. Se der vermelho, o site antigo permanece no ar; abra o log antes de tentar alterações adicionais.
4. Atualize `https://joaovitor250p-cloud.github.io/Mb-Dryfit/` com `Ctrl+Shift+R`.
5. Em Cortes → Prontos, teste uma OC em **Chegou na loja**. Ela deve aparecer na aba **Chegou na loja** com o mesmo número de OC. Se houver `permission-denied`, veja **Regras do Firestore** abaixo.
6. Para exclusão, clique em **Selecionar cartões** no Catálogo ou em Cortes, marque somente os itens de teste, clique em **Excluir selecionados**, confira a quantidade e digite `EXCLUIR` para confirmar. Excluir modelos não exclui OCs. Excluir OCs as remove de Cortes e de Amostras, mas não do Catálogo de Modelos.

## Regras do Firestore (passo separado do GitHub)

A publicação do site **não** publica `firestore.rules` automaticamente. O arquivo `firestore.rules` deste ZIP é a versão completa de referência, que mantém as regras legadas que você enviou. Antes de substituir as regras publicadas, faça uma cópia delas e compare com esse arquivo; se houver personalizações, preserve-as.

Para o status `store` (Chegou na loja), a seção `/production_samples/{sampleId}` precisa permitir atualizações de status feitas por administrador/editor, com a função `validStatusOnlyUpdate()`. A operação do site grava `status: 'store'` e registra o histórico separadamente.

**Segurança:** as regras legadas têm `allow get: if true` em `/usuarios/{whatsapp}`. Esta é uma exposição pública preexistente que precisa de migração específica, para não quebrar um aplicativo antigo. Não amplie essa permissão para outras coleções.

## O que foi implementado

- **Chegou na loja**: nome exibido na interface, filtros, cartões e Excel, mantendo internamente o valor `store` para compatibilidade com cortes já cadastrados. A ação grava `status`, `updatedAt` e `updatedBy` no documento existente, sem criar outra OC. Confirma a leitura do servidor e registra um evento de auditoria em etapa posterior; se a auditoria falhar, a mudança de status não é desfeita.
- **Selecionar cartões** em Catálogo de Modelos e Cortes, com seleção por checkbox, selecionar/desmarcar os visíveis, limpar, contador e exclusão em lote. Exige confirmação e digitação de `EXCLUIR`. Cada lote excluído gera eventos no histórico do Firestore.
- **Backup mais completo**: Catálogo → Backup JSON inclui URLs/fotos individuais armazenadas no Firestore. Cortes → Backup das OCs exporta dados e fotos específicas das OCs. **A importação normal não restaura esses arquivos integralmente automaticamente**; mantenha-os guardados para eventual restauração técnica.
- A coleção de fotos públicas de 175 correspondências foi mantida inalterada.

## Testes que ainda exigem o Firebase real

Não foi possível testar a conta Firebase nem confirmar a execução de `npm run build` neste ambiente: a instalação das dependências no npm não completou (em modo offline faltavam pacotes e a tentativa de acesso ao registro excedeu o tempo). A análise sintática dos arquivos TS/TSX foi feita com o parser TypeScript disponível e o ZIP foi validado. O **GitHub Actions** será o teste do build completo.

Se `Chegou na loja` falhar, a mensagem diferenciada do sistema dirá se a falha veio de `production_samples` (status) ou de `audit_log` (histórico). Envie o erro completo para que o diagnóstico não seja por tentativa e erro.
