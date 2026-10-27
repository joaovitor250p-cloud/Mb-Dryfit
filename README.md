# MB REFERENCIAS — Firebase + GitHub Pages

Sistema web com login, catálogo compartilhado, pesquisa por nome e REF, cadastro, edição, exclusão, importação e exportação para Excel/CSV/JSON, histórico e perfis. **Nenhum Node.js nem VS Code é necessário no computador do proprietário**: o GitHub Actions compila o site na nuvem.

## Antes de começar

- Projeto Firebase: `mb-referencias` (você já criou).
- Aplicativo Web registrado no Firebase, com os campos públicos de `firebaseConfig`.
- **Authentication > Sign-in method > Email/Password** ativado.
- **Firestore Database** criado em modo de produção.
- Repositório: `joaovitor250p-cloud/Mb-Dryfit` (cuidado: trocar a versão publicada **substitui o site atual nesse endereço**).

## 1. Publicar as regras do banco — pelo navegador

1. Abra https://console.firebase.google.com/ e selecione `MB-REFERENCIAS`.
2. Entre em **Firestore Database > Regras**.
3. Abra o arquivo `firestore.rules` incluído neste ZIP, copie seu conteúdo e cole no editor de regras.
4. Clique em **Publicar**. Não deixe as regras padrão de teste nem permita acesso indiscriminado.

Essas regras protegem modelos e papéis no banco. Usuário sem registro em `user_roles` não lê o catálogo. Administrador pode autorizar perfis; editor altera modelos; consulta só lê e exporta.

## 2. Criar seu primeiro usuário administrador — pelo navegador

1. Firebase **Authentication > Users > Add user**. Crie o login com seu e-mail e uma senha forte.
2. Copie o **UID** que aparece na lista de usuários.
3. Firebase **Firestore Database > Dados > Iniciar coleção**.
4. ID da coleção: `user_roles`.
5. ID do documento: **exatamente o UID** copiado do Authentication.
6. Adicione os campos:
   - `role` → **string** → `admin`
   - `email` → **string** → seu e-mail
7. Salve.

Crie primeiro o registro pelo Console (operações administrativas de Console não seguem as regras comuns do navegador). Não abra inscrição pública no site. Os demais usuários podem ser criados do mesmo jeito em Authentication e autorizados pelo painel, informando o UID. Se a coleção `models` ainda não existe, ela será criada na primeira importação realizada pelo administrador.

## 3. Autorizar seu domínio GitHub Pages

1. Firebase **Authentication > Settings > Authorized domains**.
2. Adicione **somente** `joaovitor250p-cloud.github.io`, sem `https://` e sem `/Mb-Dryfit/`.

## 4. Configurar GitHub Actions sem instalar nada

Acesse:
https://github.com/joaovitor250p-cloud/Mb-Dryfit/settings/secrets/actions

Em **New repository secret**, crie estas seis entradas (uma de cada vez), copiando os valores do bloco **Configuração do SDK > Config** que o Firebase mostra para seu aplicativo Web:

| Nome do secret no GitHub | Valor do Firebase |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

Os dados do SDK Web são identificadores públicos (NÃO são `serviceAccount`, secret key ou senha); as **regras Firestore** controlam o acesso ao conteúdo. Usar secrets evita digitá-los nos arquivos-fonte, mas no site compilado eles ficam necessariamente visíveis aos navegadores. Não inclua credenciais de administrador.

## 5. Enviar o site para o GitHub pelo navegador

1. **Faça uma cópia** do repositório atual antes de sobrescrever, porque a implantação em `/Mb-Dryfit/` substituirá seu site anterior.
2. Extraia este ZIP no computador (não envie o arquivo ZIP fechado).
3. Abra `https://github.com/joaovitor250p-cloud/Mb-Dryfit` > **Add file > Upload files**.
4. Envie todos os arquivos e pastas deste projeto **para a raiz**, inclusive `.github/workflows/deploy.yml` e `firestore.rules`.
5. Como o repositório já tem outros arquivos, **limpe os arquivos antigos que não fazem parte do site** com cuidado, sem remover o workflow.
6. Faça **Commit changes** na branch `main`.
7. Abra **Settings > Pages > Build and deployment > Source: GitHub Actions**.
8. Abra **Actions** e aguarde o workflow *Deploy MB REFERENCIAS to GitHub Pages* concluir.
9. Abra `https://joaovitor250p-cloud.github.io/Mb-Dryfit/`.

Não há necessidade de instalar Node.js ou rodar npm no seu computador. **O GitHub Actions usa Node.js em seus próprios servidores para compilar React.**

## 6. Importar os 194 modelos (sem expor a lista publicamente)

A planilha de dados iniciais é entregue **separadamente**. Ela não está dentro deste ZIP e não precisa entrar em repositório público.

1. Entre no site como administrador.
2. Clique em **Importar planilha**.
3. Escolha o arquivo CSV `MB_REFERENCIAS_194_MODELOS_IMPORTAR.csv` entregue separadamente.
4. Confira a prévia e clique em **Confirmar importação**.
5. O Firestore guardará os modelos e mostrará os dados para todos os logins autorizados.

O modelo `BERM DRY NIKE SIMB BAS R.L` traz a `REF.10359`. A dupla `REF.10277 / REF.10278` permanece para conferência e não é dividida artificialmente.

## 7. Convidar outra pessoa

1. Em Firebase Authentication > Users, crie o login dessa pessoa.
2. Copie seu UID.
3. Entre no site como admin > Usuários.
4. Informe o UID, e-mail e escolha **Editor** ou **Consulta**.
5. Clique em **Autorizar usuário**. O usuário poderá fazer login e os dados serão compartilhados.

## Limitações importantes

- O histórico usa registros gravados pelo cliente em transações agrupadas; as regras impedem sua edição/exclusão, mas **não constituem uma trilha de auditoria antifraude**. Para uma auditoria inviolável, é necessário backend confiável (por exemplo Cloud Functions).
- A importação aceita modelos novos e atualizações, mas edições simultâneas durante uma importação devem ser evitadas.
- Firestore e Firebase Auth exigem conectividade. No modo offline não é possível contar com sincronização instantânea.
- O site compartilha o catálogo apenas com usuários autorizados; a chave Web do Firebase **não** protege dados por si só.
- A exportação Excel gera quatro abas e colunas ajustadas. Estilos de cabeçalho avançados do Excel não são garantidos pela biblioteca utilizada.
- **Não foi feito teste com seu Firestore real nem login real**. É necessário validar no endereço publicado após configurar os serviços.

## Estrutura

`src/` React e Firebase SDK; `firestore.rules` regras a colar no Console; `.github/workflows/deploy.yml` compila e publica no GitHub; `.env.example` nomes de configuração (sem segredos). O projeto não depende mais do Supabase.
