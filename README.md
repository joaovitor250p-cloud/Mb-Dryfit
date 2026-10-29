# MB REFERENCIAS 4.0

Catálogo, Amostras e Cortes com Firebase Authentication/Firestore, GitHub Pages e controle administrativo de contas.

**Comece por [LEIA-PRIMEIRO-4.0.md](LEIA-PRIMEIRO-4.0.md).** O GitHub Pages sozinho não publica a Cloud Function de gestão de contas. Não altere regras compartilhadas sem backup.

- `src/SampleWorkflow.tsx`: botão "Voltar para andamento" em Cortes → Prontos.
- `src/AccountsAdmin.tsx`: painel de administração de contas.
- `functions/index.js`: criação, edição de permissões, desativação, redefinição de senha e exclusão executadas no servidor.
- `firestore.rules`: autorização das telas e proteção de escrita em `user_roles` (somente Admin SDK).
- `src/styles.css`: ajustes de layout responsivo.
- O HTML independente Ordem de Corte V4 acompanha outro download.
