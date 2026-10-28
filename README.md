# MB REFERENCIAS — CSV PRIMEIRO, FOTOS DEPOIS

**Atualização da versão anterior. Não apague seu banco nem seus 194 modelos.**

- **Importar CSV**: use o menu Catálogo → Importar CSV ou Importar planilha. Aceita CSV, XLS/XLSX e JSON; mostra prévia, não duplica nomes e permite atualizar somente quando você escolher. Se já cadastrou modelos, não precisa importar de novo.
- **Fotos dos modelos**: procure por nome ou REF, adicione, substitua ou remova uma foto principal. Também aceita CSV/XLS/XLSX com as colunas `Nome do modelo`, `REF` (opcional) e `URL da imagem`. A prévia usa correspondência exata de nome e não substitui fotos existentes. A importação das URLs depende de o servidor permitir acesso entre domínios (CORS).
- **Amostras**: somente consulta das OCs em andamento, com foto, OC, nome, REF e costureiro. Não há controles de produção nessa página. Novas OCs são criadas em **Cortes**.
- **Cortes**: toda nova amostra entra como **Em andamento**. Aqui ficam os botões **Pronto**, **Reabrir**, **Editar** e **Excluir**, além das duas listas Em andamento e Prontos.
- **Foto opcional nas amostras**: você pode cadastrar OC e costureiro e completar a foto do modelo depois; a miniatura será mostrada automaticamente em ambas as telas.
- **Fonte MeuComercio**: no momento `https://meucomercio.com.br/mbdryfit` informa que não há produtos publicados. **Não foi possível importar fotos automaticamente**. Use fotos próprias agora; quando o catálogo estiver público, será possível rever a correspondência por nomes. Não associe imagens apenas por REF porque modelos diferentes podem compartilhar uma referência.
- **Segurança**: antes de enviar o novo código ao GitHub, publique a nova versão completa de `firestore.rules` em Firebase → Firestore Database → Regras. Ela também permite fotos compactadas de modelos e amostras sem foto.
- **Armazenamento**: uma miniatura comprimida por modelo é salva diretamente no Firestore (máximo 90.000 caracteres) para não exigir Cloud Storage/Blaze. Fotos em alta resolução exigem outro armazenamento; evite milhares de imagens desse tipo no Firestore.
- Não instale Node.js ou VS Code no seu computador; o GitHub Actions já compila o site na nuvem, no repositório Mb-Dryfit.
- Nenhum dado real foi alterado no Firebase nesta preparação. Testar build, autenticação, edição e sincronização no seu ambiente após publicar.

---

## NOVO: AMOSTRAS E CORTES

O menu contém agora **Amostras** e **Cortes**. Ao cadastrar uma amostra, inclua foto da peça, OC, nome do modelo, referência e costureiro. Ela aparece em **Amostras** e em **Cortes → Em andamento**. Ao tocar em **Pronto**, desaparece das pendências e aparece em **Cortes → Prontos**. É possível reabrir uma peça, corrigir os dados e exportar a planilha de cortes. Todos os aparelhos recebem as mudanças por Firestore Realtime.

**MUITO IMPORTANTE:** substitua as regras do Firestore pelas do arquivo `firestore.rules` atualizado antes de usar a nova área. As regras antigas não permitem acessar a coleção `production_samples`.

**Fotos no plano gratuito:** para não exigir o plano pago Blaze, este primeiro módulo otimiza a fotografia no navegador e grava uma versão reduzida diretamente no Firestore. A imagem é apenas de consulta, não é a foto original em alta resolução. Não use para milhares de fotos grandes: isso aumenta o tráfego do Firestore. Se quiser fotos originais/volumes grandes, a migração indicada é Cloud Storage for Firebase, que requer o plano Blaze (faturamento por uso).

**Permissões:** administradores e editores podem criar/alterar/marcar Pronto; usuários Consulta apenas visualizam. A produção não modifica o cadastro principal de modelos, e registros com a mesma REF em OCs diferentes são permitidos.

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

## Publicação desta versão no repositório existente — sem terminal

1. **Faça backup do Firestore:** pelo painel atual, clique em **Backup** (JSON) e guarde uma cópia fora do GitHub.
2. Em **Firebase Console → Firestore Database → Regras**, substitua as regras atuais pelo conteúdo integral do arquivo `firestore.rules` deste pacote e publique. Não misture trechos das versões.
3. Extraia o ZIP e envie os arquivos internos ao repositório `joaovitor250p-cloud/Mb-Dryfit` (substituindo os de mesmo caminho), preservando `.github/workflows/deploy.yml`. **Não envie seu CSV privado ao repositório público**.
4. Veja a execução de **Publicar MB REFERENCIAS** na aba Actions; confira se `build` e `deploy` ficaram verdes.
5. Entre no site com seu login atual. Verifique o menu **Fotos dos modelos**; experimente uma foto pequena em um modelo de teste. Importe seu CSV apenas se houver modelos novos ou correções.
6. Cadastre uma OC em **Amostras** e confira se aparece em **Cortes → Em andamento**. Marque **Pronto** somente em **Cortes**.

O endereço permanece `https://joaovitor250p-cloud.github.io/Mb-Dryfit/`. Os seis Repository secrets do Firebase permanecem os mesmos, e os dados já guardados no banco não são apagados ao publicar o novo front-end.

**Verificação local desta entrega:** integridade do ZIP e análise sintática TS/TSX; compilação de produção não executada porque o ambiente não conseguiu baixar dependências do registro npm. Não se afirma que as ações com o Firestore real tenham sido testadas.


## Importação de fotos do catálogo externo

Na aba **Fotos dos modelos**, o botão **Buscar fotos do catálogo** abre o catálogo MB DRYFIT e o seletor para importar um arquivo de correspondências. Prepare uma planilha CSV/XLS/XLSX com estas colunas: `Nome do modelo`, `REF` (opcional) e `URL da imagem`. A correspondência automática é feita somente pelo nome exato normalizado; a REF é auxiliar e não é usada sozinha para associar modelos. Isso evita misturar modelos diferentes que compartilham uma referência.

O navegador tenta baixar cada imagem indicada e pode falhar se o site bloquear requisições externas por CORS, exigir autenticação ou usar URLs temporárias. Nesses casos, baixe as imagens autorizadas e adicione-as manualmente. Não existe raspagem automática garantida do MeuComercio nesta versão e não se deve considerar fotos importadas sem conferir o relatório. A importação não substitui fotos já cadastradas.

## Limitações de validação desta entrega

O ZIP foi atualizado a partir do código recebido. Não foi possível concluir `npm install` dentro do ambiente de preparação, então a compilação TypeScript/Vite não foi confirmada aqui. Login, regras e sincronização do Firestore precisam ser testados no projeto Firebase real após a publicação. Nenhum dado foi gravado ou removido no Firebase durante a preparação.
