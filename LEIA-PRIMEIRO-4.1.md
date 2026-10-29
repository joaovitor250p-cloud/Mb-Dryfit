# MB REFERENCIAS 4.1 — CONTAS COM APROVAÇÃO GRATUITA (SPARK)

## O que mudou

O projeto NÃO utiliza Cloud Functions nem exige o plano Blaze. A pessoa abre o site, escolhe **Criar minha conta**, informa e-mail e senha e **confirma o e-mail**. Em seguida, clica **Já confirmei meu e-mail** para enviar uma solicitação. O administrador abre **Contas**, vê os pedidos e escolhe **Consulta** ou **Editor**, com acesso específico a **Catálogo / Amostras / Cortes**. Sem aprovação, ninguém ganha acesso aos modelos ou OCs (desde que as regras novas estejam publicadas corretamente).

- Administrador já existente continua administrador. **O sistema não cria automaticamente o primeiro admin** e não deixa usuários promoverem a si mesmos.
- A área Contas permite **aprovar / recusar pedidos**, **salvar acessos**, **bloquear / reativar acesso** e **enviar e-mail de recuperação de senha**.
- Bloquear acesso **não apaga o cadastro no Firebase Authentication**. Exclusão definitiva de um login e alteração direta de senha de terceiros são feitas pelo Console do Firebase por alguém com permissões no projeto, não pelo app.
- Dados de modelos, fotos e OCs não foram migrados nem alterados no banco. O botão **Voltar para andamento** continua na área Cortes → Prontos.
- A prévia independente da **Ordem de Corte V4 (HTML)** ainda não é parte deste aplicativo, nem grava no Firebase.

## Antes de publicar — MUITO IMPORTANTE

1. Faça backup JSON de modelos e OCs no site que funciona.
2. Abra **Firebase → Firestore Database → Regras** e **copie integralmente as regras ATIVAS** para um arquivo local. Esta instância pode compartilhar coleções com outro sistema; **não apague nem substitua regras legadas sem comparar**.
3. Confira em **Firebase → Authentication → Sign-in method** que **E-mail/senha** está habilitado. Não habilite cobrança nem o plano Blaze.
4. Confira em **Firestore → Dados → user_roles → {SEU_UID}** que seu perfil já tem `role: "admin"` e que `disabled` não é `true`. Se não existir um admin válido, **ninguém poderá aprovar cadastros** depois da publicação.
5. Confira em **Authentication → Users** que seu e-mail de administrador está cadastrado.

## 1 — Publicar regras com segurança

O arquivo `firestore.rules` no ZIP é uma REFERÊNCIA COMPLETA, construída com base nas regras conhecidas na versão 4.0 (incluindo algumas regras legadas). Ele pode **não ser idêntico ao que está hoje ativo**. NÃO cole tudo sem comparar.

Em **Firestore Database → Regras**, preserve todas as regras de outros serviços e, dentro do bloco `match /databases/{database}/documents { ... }`:

- mantenha as funções existentes `signedIn`, `authorized`, `isAdmin`, `canEdit`, `canView`, `canWrite` e as regras de `models`, `production_samples`, `audit_log`;
- adicione as três funções `validSections`, `validGrant`, `validRoleUpdate` do arquivo de referência;
- substitua apenas o bloco `match /user_roles/{uid}` antigo pelo bloco novo do ZIP;
- adicione o bloco `match /access_requests/{uid}` do ZIP;
- certifique-se de que não existem regras adicionais que permitam a qualquer usuário escrever em `user_roles` ou ler os dados protegidos;
- publique as regras somente depois de verificar que seu `admin` existente continuará autorizado.

**Por que isso é necessário?** A versão 4.0 bloqueava todas as gravações de `user_roles` pelo navegador, porque dependia de função paga. Na versão 4.1, a regra libera escrita **apenas para um administrador autenticado e aprovado**, com validação estrita. A pessoa recém-cadastrada só pode criar a própria solicitação, com e-mail verificado e status `pending`.

## 2 — Publicar o site no GitHub

1. Extraia o ZIP completo.
2. Envie **os arquivos internos** para a raiz do repositório `joaovitor250p-cloud/Mb-Dryfit`.
3. Clique em **Commit changes**.
4. Abra **Actions** e confirme que a compilação e publicação ficaram verdes.
5. Atualize o site com `Ctrl+Shift+R` (ou abra em guia anônima).
6. O código da função paga da versão 4.0 (`functions/`) **não é usado** nesta versão. Se ele estiver no repositório, não é necessário fazer deploy dele. Apenas enviar o ZIP pelo GitHub não remove pastas antigas que já estejam lá.

## 3 — Teste completo sem arriscar dados reais

1. Deixe sua conta admin existente conectada em uma janela.
2. Abra uma guia anônima e clique em **Criar minha conta**. Use **outro e-mail sob seu controle**, nunca o e-mail do administrador.
3. Abra o e-mail de confirmação, confirme e volte ao site. Clique em **Já confirmei meu e-mail**. O app envia o pedido ao Firestore.
4. No administrador, abra **Contas**. Deve aparecer uma solicitação pendente.
5. Escolha **Consulta**, marque somente **Catálogo** e clique em **Aprovar acesso**.
6. Na guia anônima, a conta aprovada poderá ver apenas o Catálogo e não terá botões de edição.
7. Volte ao administrador, adicione **Amostras** ou escolha Editor e clique **Salvar acessos**; veja o acesso atualizar.
8. Teste **Bloquear** e confirme que a conta perde acesso aos dados; depois **Reativar**.
9. Teste **Esqueceu sua senha?** na tela inicial. Nenhuma senha é exibida ao administrador.

## Problemas frequentes

- **permission-denied ao pedir aprovação:** regras `access_requests` não publicadas, usuário não confirmou e-mail ou token ainda não atualizado. Clique **Já confirmei meu e-mail** de novo; o app atualiza a autenticação antes do pedido.
- **Nenhuma conta pendente:** o funcionário apenas criou login, mas não confirmou o e-mail e clicou para enviar o pedido.
- **Admin não consegue aprovar:** seu perfil admin não existe/está desativado nas regras ativas, ou você publicou `user_roles` antigo que proíbe gravações.
- **Aprovação salva mas usuário não vê telas:** cheque os campos `role`, `permissions`, `disabled` no documento `user_roles/{uid}` criado. Não se cria outro documento com e-mail como ID; o ID é o UID.
- **Erro no build:** verifique os logs do GitHub Actions; esta entrega passou na verificação de sintaxe, mas o `npm run build` completo não foi executado localmente, porque o registro npm estava indisponível.

## Custos e privacidade

O Firebase Spark oferece autenticação por e-mail/senha e Firestore até os limites publicados pelo Firebase. Não exige cartão de crédito para essas funcionalidades. **As cotas gratuitas ainda se aplicam**, portanto não afirmar uso ilimitado. Uma regra legada do projeto permite `get` público em `/usuarios/{whatsapp}`; ela foi preservada na referência porque pertence a outro sistema e precisa de revisão separada, não faz parte do controle MB REFERENCIAS.

## O que foi e não foi implantado

- **Feito:** arquivos React, painel de aprovações, cadastro, recuperação de senha, Firestore rules de referência, documentação.
- **Não feito:** atualização efetiva de regras no Firebase, contas no Firebase Authentication, alteração de dados reais, publicação no GitHub, build real na infraestrutura do usuário.
