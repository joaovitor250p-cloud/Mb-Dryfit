# MB REFERENCIAS 5.1 — pacote completo corrigido

## O que foi corrigido

- Visualizador de fotos no notebook: imagem ampliada para ocupar melhor a área disponível, mantendo a proporção original e sem cortar.
- Roda comum do mouse: não altera o zoom nem reposiciona a imagem.
- Zoom por Ctrl + roda no mouse/touchpad, pinça no touchpad, duplo clique e botões de zoom.
- Formulário de edição de Amostras: abre imediatamente, sem esperar a consulta das fotos adicionais.
- Se a leitura das fotos 2 e 3 falhar, nome, REF e costureiro continuam editáveis.
- Quando a galeria não pôde ser lida, o formulário bloqueia alterações nas fotos e salva somente os dados textuais, preservando a foto principal e as fotos secundárias já gravadas.
- Quando a galeria é carregada, a atualização do registro e das fotos secundárias é feita em uma única gravação atômica.
- Janela de edição de Amostras renderizada fora do painel com animação, corrigindo problemas de posição e camadas.
- Bloqueio da rolagem do fundo enquanto o formulário está aberto.

## Como substituir os arquivos no GitHub

1. Baixe e extraia este ZIP.
2. Abra a pasta `Mb-Dryfit-main`.
3. Envie/substitua o conteúdo completo dessa pasta na raiz do repositório GitHub, mantendo a estrutura de pastas.
4. Não apague nem altere os Secrets do GitHub usados pelo Firebase.
5. Aguarde a compilação/publicação automática do próprio GitHub Actions depois que você fizer o envio.

## Importante sobre as fotos adicionais

O arquivo `firestore.rules` deste pacote já contém leitura (`get`) para `photo_2` e `photo_3` quando o usuário tem acesso à área Amostras. Se as regras que estão atualmente no Firebase forem antigas, a leitura das fotos extras pode continuar sendo negada até que você atualize as regras no console do Firebase. Mesmo nesse caso, a versão 5.1 permite salvar os dados da amostra sem substituir ou apagar as imagens existentes.

## Testes realizados neste pacote

- Verificação de sintaxe TypeScript/TSX dos arquivos de aplicação.
- Verificação de JSON do `package.json`, `firebase.json`, `tsconfig.json` e `tsconfig.app.json`.
- Verificação de caminhos dos imports locais.
- Verificação da sintaxe CSS.
- A compilação completa com `npm run build` não pôde ser executada neste ambiente porque a instalação das dependências npm não concluiu (sem acesso ao registry durante a sessão). Execute `npm install` e `npm run build` após baixar o pacote para validar com as dependências do projeto.

## Preservação

Este pacote não contém dados reais do Firebase, não recria coleções, não modifica registros e não altera os Secrets da conta. Nenhum arquivo foi publicado no GitHub por esta execução.
