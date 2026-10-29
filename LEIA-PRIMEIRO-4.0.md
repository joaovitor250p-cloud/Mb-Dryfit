# MB REFERENCIAS 4.0 — Instruções de publicação

## Foram preparados dois entregáveis diferentes

**MB REFERENCIAS (este ZIP):** correção do botão **Voltar para andamento** nas OCs prontas da tela **Cortes**, layout responsivo e tela **Contas** (criação, exclusão, senha, ativação/desativação e acesso às telas). Fotos, modelos, OCs e importações foram preservados no código.

**Ordem de Corte V4 (HTML separado):** prévia editável com dados históricos da planilha, para notebook/celular. Para começar a editar um campo: 3 cliques; no celular: pressionar por 0,85 segundo. Inclui resumo, pagamentos de sexta-feira, descontos automáticos e paginação leve (120 de início; "Mostrar todas" mantém os 720 disponíveis). NÃO é sincronizada com o Firebase. Para guardar alterações da prévia, use **Backup JSON** ou **Exportar CSV**. O arquivo do navegador pode armazenar mudanças localmente, mas isso não é um backup confiável para equipe.

## Instalação: site

1. Antes de tudo, faça o backup JSON de modelos e OCs do aplicativo atual e salve cópia das regras ativas de Firestore.
2. Extraia este ZIP e envie **os arquivos internos** para a raiz do repositório GitHub `joaovitor250p-cloud/Mb-Dryfit`.
3. Confirme o novo commit e verifique o resultado em **Actions**. **O workflow do GitHub publica apenas o site.**
4. Atualize o navegador com Ctrl+Shift+R.
5. Teste com uma OC de teste: Cortes → Prontos → **Voltar para andamento**; a OC reaparece em andamento e em Amostras.

## Instalação: contas administrativas (obrigatória para que os botões funcionem)

O gerenciamento de usuários **NÃO funciona somente com GitHub Pages**. O código inclui a Cloud Function `manageAccount` em `functions/index.js`, que usa Firebase Admin SDK num servidor seguro. O código do navegador NÃO recebe uma chave de administrador.

**Cloud Functions exige o plano Firebase Blaze (cobrança por uso)**, além de permissões de implantação. Não habilite cobrança sem revisar o orçamento.

O código está configurado para a região `us-central1`. Num ambiente autorizado com **Google Cloud Shell** (sem instalar Node/VS Code no seu PC):

```
git clone https://github.com/joaovitor250p-cloud/Mb-Dryfit.git
cd Mb-Dryfit
npm install -g firebase-tools
firebase login
firebase deploy --only functions:mb-admin --project SEU_ID_DE_PROJETO
```

Depois que a função estiver publicada e testada, **compare as regras novas com as que estão ativas** no Firebase. Este repositório inclui coleções de outro sistema (legadas). NÃO cole regras sem revisar, pois substituir todas as regras pode afetar outros aplicativos que compartilham o Firestore. Para implantar as regras após a revisão:

```
firebase deploy --only firestore:rules --project SEU_ID_DE_PROJETO
```

Confirme o primeiro perfil `admin` existente em `user_roles/{UID}` antes de publicar as regras. Sem administrador pré-existente, ninguém pode criar contas pelo painel. A função exige que o administrador tenha feito login há menos de 15 minutos para ações sensíveis.

## Conta e permissões

Somente o perfil **admin** visualiza o painel **Usuários/Contas**. Nele é possível:
- Criar conta com e-mail e senha inicial de pelo menos 12 caracteres.
- Definir perfil `Consulta`, `Editor` ou `Administrador`.
- Marcar telas permitidas: `Catálogo`, `Amostras`, `Cortes`.
- Salvar permissões, desativar/reativar, redefinir a senha e excluir contas.

**As regras do Firestore reforçam as permissões para leitura e gravação**. Os dados do Catálogo são compartilhados como dependência visual de Cortes e Amostras: uma pessoa autorizada a acessar Cortes/Amostras pode recuperar dados básicos de modelos a partir do Firebase mesmo que o menu Catálogo esteja oculto. Não trate uma permissão de tela como isolamento absoluto desses dados.

`Excluir conta` elimina o usuário de Firebase Authentication e seu documento de permissão; NÃO apaga modelos, OCs ou auditoria. `Desativar` bloqueia acesso a novos tokens e, pelas regras atualizadas, a leitura no Firestore. Uma sessão de autenticação já aberta pode demorar para perceber a desativação, mas o Firestore bloqueia conforme as regras ativas.

O painel não envia senhas por e-mail; informe a senha inicial ao novo usuário por canal seguro. Se a pessoa não souber a senha, ela também pode usar **Esqueceu sua senha?** na página de login.

## Validações e limitações

- Validação sintática de arquivos `.tsx`, `.ts`, JavaScript da Cloud Function e JS da prévia.
- Teste automatizado da prévia no Chromium: 1 clique não abre edição, 3 cliques abrem, 120 linhas iniciais, 720 ao escolher Mostrar todas, tela mobile sem erros de JS.
- Não foi possível compilar todo o aplicativo com `npm run build` neste ambiente, pois as dependências do projeto não estavam disponíveis aqui. O GitHub Actions é o próximo teste de compilação.
- Não houve publicação no GitHub, Firebase Auth, Firestore ou Functions; nenhuma conta ou OC real foi alterada.
- A aba **Ordem de Corte V4** ainda é apenas um HTML independente, não uma nova coleção do Firebase. A área Contas controla as telas atuais do aplicativo, não essa prévia local.
