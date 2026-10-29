# MB REFERENCIAS 4.1 — versão Spark gratuita

Aplicativo React/TypeScript/Vite + Firebase Authentication + Cloud Firestore, para GitHub Pages.

**Comece por `LEIA-PRIMEIRO-4.1.md`.** Ela contém a ordem correta de ativação das regras e publicação do site, sem Cloud Functions nem plano Blaze.

Nesta versão: cadastro do próprio funcionário (e-mail + senha + verificação de e-mail); solicitação de acesso ao administrador; aprovação/recusa; permissão por tela (Catálogo, Amostras, Cortes); perfil Consulta/Editor; bloqueio/reativação; recuperação de senha por e-mail. O administrador atual deve estar cadastrado em `user_roles/{UID}` antes da publicação das regras.

**Atenção:** `firestore.rules` foi preparada com base nas regras fornecidas anteriormente e contém regras legadas de outro sistema. Faça backup e compare com as regras ativas antes de publicá-las. O GitHub Actions publica somente o site, não as regras.

O projeto também preserva o catálogo, suas fotos, Amostras e Cortes da versão 4.0. A prévia em HTML da Ordem de Corte continua separada.
