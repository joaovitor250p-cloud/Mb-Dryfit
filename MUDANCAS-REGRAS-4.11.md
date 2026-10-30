# Regras Firestore — conciliação 4.11

- `firestore.rules.original-recebidas.txt` é a cópia exata das regras enviadas para análise. É apenas backup/referência; não publique esse arquivo.
- `firestore.rules` é o arquivo completo preparado para a versão 4.11 e referenciado por `firebase.json`.

## Ajustes incorporados

1. Preservadas as regras de autenticação, perfis, permissões, modelos, amostras, cortes, ordens, gastos, informações e auditoria.
2. Preservada a área `workshops`, que já é usada pelo código atual e precisa constar nas permissões.
3. Mantida compatibilidade de edição com o campo legado `extraImages`; as regras não permitem criar esse campo em novos documentos nem adicioná-lo a documentos que não o tinham.
4. Adicionada a subcoleção `production_samples/{sampleId}/gallery/{photoId}`:
   - `get` permitido somente para `photo_2` e `photo_3` e para quem pode visualizar Amostras;
   - `list` bloqueado;
   - `create/update` limitados a administrador/editor com permissão de Amostras;
   - validação de tipo, tamanho, usuário e timestamp;
   - `delete` limitado aos dois IDs conhecidos e à permissão de escrita em Amostras.
5. Mantida a limpeza controlada dos IDs conhecidos da antiga subcoleção `photos`, sem liberar leitura ou gravação nela.
6. Adicionada a subcoleção `expenses/{expenseId}/attachments/receipt`:
   - `get` permitido a quem pode visualizar Gastos;
   - `list` bloqueado;
   - gravação e exclusão limitadas a quem pode editar Gastos;
   - validação do formato da imagem, tamanho, usuário e timestamp.
7. Mantido o bloqueio padrão `allow read, write: if false` para caminhos sem regra explícita.

Antes de publicar, compare com qualquer regra personalizada que exista no Console Firebase do projeto real. O arquivo completo não consegue incorporar regras privadas que não foram enviadas nesta conversa.
