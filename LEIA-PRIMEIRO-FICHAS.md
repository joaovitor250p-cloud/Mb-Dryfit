# Fichas de Produção — regras corrigidas

1. Faça backup das regras atuais no Firebase Console.
2. No projeto Firebase correto, abra Firestore Database > Regras.
3. Substitua o conteúdo por `firestore.rules` e clique em Publicar.
4. Verifique se o usuário administrador tem `role: admin` em `user_roles/{uid}`.
5. Recarregue o site e teste criação e distribuição.

As permissões novas são `sheets` e `sheet_distribution`. Apenas administradores e editores autorizados para `sheet_distribution` podem distribuir fichas.

**Atenção:** esta atualização não publica regras automaticamente. Confirme o projeto antes de publicar.
